import { Router, Request, Response } from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Mailer } from '../services/mailer';
import { SheetsService } from '../services/sheets';
import { LocalStorage } from '../services/storage';
import { parseCSV, validateCSVHeaders, detectDuplicates } from '../utils/csv';
import { ParticipantRecord, EmailOptions } from '../types';
import pino from 'pino';

const logger = pino({ name: 'admin' });
const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 支援多檔案上傳的配置
const multiFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024,  // 10MB per file
    files: 10  // 最多 10 個檔案
  }
});

let currentParticipants: ParticipantRecord[] = [];
const mailer = new Mailer();
const sheetsService = new SheetsService();
const localStorage = new LocalStorage();

function requireAuth(req: Request, res: Response, next: any) {
  const adminPass = process.env.ADMIN_PASS || 'change-me';
  const authHeader = req.headers.authorization;
  
  if (!authHeader || authHeader !== `Bearer ${adminPass}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

router.use(requireAuth);

router.post('/upload-csv', upload.single('csvFile'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let csvContent = req.file.buffer.toString('utf-8');
    // 移除 BOM (Byte Order Mark) 如果存在
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    
    const headerErrors = validateCSVHeaders(csvContent);
    if (headerErrors.length > 0) {
      return res.status(400).json({ error: headerErrors[0] });
    }

    const { records, errors } = await parseCSV(csvContent);
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'CSV parsing errors',
        details: errors
      });
    }

    const duplicates = detectDuplicates(records);
    if (duplicates.length > 0) {
      logger.warn('Duplicates detected:', duplicates);
    }

    currentParticipants = records;

    res.json({
      success: true,
      total: records.length,
      preview: records.slice(0, 20),
      duplicates: duplicates,
      columns: records.length > 0 ? Object.keys(records[0]) : []
    });

  } catch (error) {
    logger.error('CSV upload error:', error);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

router.post('/send-batch', async (req: Request, res: Response) => {
  try {
    if (currentParticipants.length === 0) {
      return res.status(400).json({ error: 'No participants loaded. Please upload CSV first.' });
    }

    const { eventId, eventName, eventDate, eventLocation, meetLocation, secondRun, subject, from, testMode = false, attachPng = false } = req.body;

    if (!eventId || !eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: eventId, eventName, subject' });
    }

    const options: EmailOptions & { eventId: string } = {
      eventId,
      eventName,
      eventDate: eventDate || '',
      eventLocation: eventLocation || '',
      meetLocation: meetLocation || '',
      secondRun: secondRun || '',
      subject,
      from: from || 'Event System <noreply@example.com>',
      testMode: Boolean(testMode),
      attachPng: Boolean(attachPng)
    };

    logger.info(`Starting batch email send. Event ID: ${eventId}, Test mode: ${testMode}, Total: ${currentParticipants.length}`);

    const results = await mailer.sendBatch(currentParticipants, options);

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results
    };

    logger.info('Batch email send completed:', {
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed
    });

    res.json({
      success: true,
      message: `Batch email send completed: ${summary.successful}/${summary.total} successful`,
      summary
    });

  } catch (error) {
    logger.error('Batch send error:', error);
    res.status(500).json({ error: 'Failed to send batch emails' });
  }
});

router.post('/resend-one', async (req: Request, res: Response) => {
  try {
    const { eventId, email, eventName, eventDate, eventLocation, meetLocation, secondRun, subject, from, attachPng = false } = req.body;

    if (!eventId || !email || !eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: eventId, email, eventName, subject' });
    }

    const participant = currentParticipants.find(p => p.email === email);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const options: EmailOptions & { eventId: string } = {
      eventId,
      eventName,
      eventDate: eventDate || '',
      eventLocation: eventLocation || '',
      meetLocation: meetLocation || '',
      secondRun: secondRun || '',
      subject,
      from: from || 'Event System <noreply@example.com>',
      attachPng: Boolean(attachPng)
    };

    const result = await mailer.sendOne(participant, options);

    if (result.success) {
      res.json({ success: true, message: `Email sent successfully to ${email}` });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }

  } catch (error) {
    logger.error('Resend email error:', error);
    res.status(500).json({ error: 'Failed to resend email' });
  }
});

router.get('/export-checkins', async (req: Request, res: Response) => {
  try {
    const eventId = req.query.eventId as string || process.env.EVENT_ID;
    
    let checkins;
    try {
      checkins = await sheetsService.getCheckins(eventId);
    } catch (error) {
      logger.warn('Failed to get checkins from Sheets, trying local storage:', error);
      checkins = await localStorage.getCheckins(eventId);
    }

    const csvHeaders = 'timestamp,eventId,email,name,company,title,status\n';
    const csvRows = checkins.map(record => 
      `"${record.timestamp}","${record.eventId}","${record.email}","${record.name}","${record.company || ''}","${record.title || ''}","${record.status}"`
    ).join('\n');

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="checkins-${eventId}-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\ufeff' + csvContent);

  } catch (error) {
    logger.error('Export checkins error:', error);
    res.status(500).json({ error: 'Failed to export checkins' });
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const eventId = req.query.eventId as string || process.env.EVENT_ID;
    
    let totalCheckins = 0;
    let todayCheckins = 0;
    
    try {
      const allCheckins = await sheetsService.getCheckins(eventId);
      totalCheckins = allCheckins.length;
      const today = new Date().toISOString().split('T')[0];
      todayCheckins = allCheckins.filter(r => r.timestamp.startsWith(today)).length;
    } catch (error) {
      logger.warn('Failed to get stats from Sheets, trying local storage:', error);
      const localCheckins = await localStorage.getCheckins(eventId);
      totalCheckins = localCheckins.length;
      
      const today = new Date().toISOString().split('T')[0];
      todayCheckins = localCheckins.filter(r => r.timestamp.startsWith(today)).length;
    }

    res.json({
      eventId,
      totalParticipants: currentParticipants.length,
      totalCheckins,
      todayCheckins,
      checkInRate: currentParticipants.length > 0 ? (totalCheckins / currentParticipants.length * 100).toFixed(1) + '%' : '0%'
    });

  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.post('/verify-smtp', async (req: Request, res: Response) => {
  try {
    const isValid = await mailer.verify();
    res.json({ 
      success: isValid, 
      message: isValid ? 'SMTP configuration is valid' : 'SMTP configuration failed'
    });
  } catch (error) {
    logger.error('SMTP verification error:', error);
    res.status(500).json({ error: 'Failed to verify SMTP configuration' });
  }
});

// 取得預設郵件範本
router.get('/get-default-template', (req: Request, res: Response) => {
  try {
    const templatePath = join(__dirname, '../../templates/email.html');
    const template = readFileSync(templatePath, 'utf-8');
    res.send(template);
  } catch (error) {
    logger.error('Failed to load default template:', error);
    res.status(500).json({ error: 'Failed to load default template' });
  }
});

// 支援自定義範本和多附件的批次寄送
router.post('/send-batch-enhanced', multiFileUpload.any(), async (req: Request, res: Response) => {
  try {
    if (currentParticipants.length === 0) {
      return res.status(400).json({ error: 'No participants loaded. Please upload CSV first.' });
    }

    const { eventId, eventName, eventDate, eventLocation, subject, from, testMode, attachPng, customTemplate } = req.body;

    if (!eventId || !eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: eventId, eventName, subject' });
    }

    // 處理附件檔案
    const attachmentFiles = req.files as Express.Multer.File[] || [];
    const attachments = attachmentFiles.map(file => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype
    }));

    const options: EmailOptions & { eventId: string; customTemplate?: string; attachments?: any[]; eventDate?: string; eventLocation?: string } = {
      eventId,
      eventName,
      eventDate,
      eventLocation,
      subject,
      from: from || 'Event System <noreply@example.com>',
      testMode: testMode === 'true',
      attachPng: attachPng === 'true',
      customTemplate: customTemplate || undefined,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    // 建立增強版的 Mailer 實例
    const enhancedMailer = new EnhancedMailer();
    const results = await enhancedMailer.sendBatch(currentParticipants, options);
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    logger.info(`Batch email completed: ${successCount}/${totalCount} sent successfully`);
    
    res.json({ 
      success: true, 
      successCount, 
      totalCount, 
      results: results.slice(0, 5) // 只返回前5個結果避免響應過大
    });

  } catch (error) {
    logger.error('Enhanced batch email error:', error);
    res.status(500).json({ error: 'Failed to send enhanced batch emails' });
  }
});

// 增強版 Mailer 類別
class EnhancedMailer extends Mailer {
  async sendBatch(participants: ParticipantRecord[], options: EmailOptions & { customTemplate?: string; attachments?: any[]; eventId?: string }): Promise<any[]> {
    const results: any[] = [];
    const eventId = options.eventId || process.env.EVENT_ID || '';
    
    logger.info(`[EnhancedMailer] Using eventId: "${eventId}", from options: "${options.eventId}", from env: "${process.env.EVENT_ID}"`);
    
    if (!eventId) {
      throw new Error('Event ID is required for batch email sending');
    }
    
    const participantsToSend = options.testMode ? participants.slice(0, 3) : participants;
    
    for (let i = 0; i < participantsToSend.length; i++) {
      const participant = participantsToSend[i];
      
      try {
        const qrData = await this.generateQRData(eventId, participant.email, participant.name);
        
        // 調試：檢查 QR 資料
        logger.info(`QR Data for ${participant.email}: hasQrDataUri=${!!qrData.qrDataUri}, length=${qrData.qrDataUri?.length || 0}, prefix=${qrData.qrDataUri?.substring(0, 30) || 'null'}`);
        
        // 使用自定義範本或預設範本
        let html;
        if (options.customTemplate) {
          html = this.renderCustomTemplate(participant, options, qrData, options.customTemplate);
        } else {
          // 調用父類的 renderTemplate 方法
          html = super.renderTemplate(participant, options, qrData);
        }
        
        const mailOptions: any = {
          from: options.from,
          to: participant.email,
          subject: options.subject.replace('{{eventName}}', options.eventName),
          html: html,
          attachments: [
            {
              filename: 'qr-code.png',
              content: qrData.qrBuffer,
              contentType: 'image/png',
              cid: 'qrcode' // 設定 Content-ID，讓 HTML 可以用 cid:qrcode 引用
            }
          ]
        };

        // 如果啟用附件模式，額外添加一個可下載的附件
        if (options.attachPng) {
          mailOptions.attachments.push({
            filename: 'qr-code-download.png',
            content: qrData.qrBuffer,
            contentType: 'image/png'
          });
        }

        // 添加自定義附件
        if (options.attachments) {
          mailOptions.attachments.push(...options.attachments);
        }

        await this.transporter.sendMail(mailOptions);
        
        results.push({
          email: participant.email,
          success: true
        });

        // 發送速率限制
        await this.delay(1000 / (parseInt(process.env.RATE_LIMIT_PER_SEC || '3')));

      } catch (error) {
        logger.error(`Failed to send email to ${participant.email}:`, error);
        results.push({
          email: participant.email,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  private renderCustomTemplate(participant: any, options: any, qrData: any, template: string): string {
    let html = template;
    
    const participantDetails = this.generateParticipantDetails(participant);
    
    // 處理其他資訊區塊
    const secondRunSection = options.secondRun ? 
      `<div style="margin-top: 15px;">
          <p><strong>其他資訊：</strong></p>
          <div style="white-space: pre-line; background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 5px 0;">${options.secondRun}</div>
      </div>` : '';
    
    const replacements = {
      '{{name}}': participant.name || '',
      '{{email}}': participant.email || '',
      '{{company}}': participant.company || '',
      '{{title}}': participant.title || '',
      '{{participantDetails}}': participantDetails,
      '{{eventName}}': options.eventName || '',
      '{{eventDate}}': options.eventDate || '請參考活動通知或官網',
      '{{eventLocation}}': options.eventLocation || '請參考活動通知或官網',
      '{{meetLocation}}': options.meetLocation || '請提前15分鐘抵達會場',
      '{{secondRunSection}}': secondRunSection,
      '{{checkinUrl}}': qrData.checkinUrl || '',
      '{{qrDataUri}}': qrData.qrDataUri || '',
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.replace(new RegExp(placeholder, 'g'), value);
    }

    return html;
  }

  private generateParticipantDetails(participant: any): string {
    let details = '';
    if (participant.company) {
      details += `<p><strong>公司：</strong>${participant.company}</p>`;
    }
    if (participant.title) {
      details += `<p><strong>職稱：</strong>${participant.title}</p>`;
    }
    return details;
  }

  private async generateQRData(eventId: string, email: string, name?: string) {
    // 這裡需要從原本的 Mailer 複製 QR 產生邏輯
    const { generateQRCode } = require('../services/qr');
    return await generateQRCode(eventId, email, name);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 新增：單個QR code預覽API
router.post('/preview-qr', async (req: Request, res: Response) => {
  try {
    const { eventId, email } = req.body;
    
    if (!eventId || !email) {
      return res.status(400).json({ error: '缺少必要參數: eventId, email' });
    }

    const { generateQRCode } = require('../services/qr');
    const qrData = await generateQRCode(eventId, email);
    
    res.json({
      success: true,
      qrDataUri: qrData.qrDataUri,
      checkinUrl: qrData.checkinUrl
    });
  } catch (error) {
    logger.error('QR預覽錯誤:', error);
    res.status(500).json({ error: 'QR code預覽失敗' });
  }
});

// 新增：批次QR code預覽API
router.post('/batch-preview-qr', async (req: Request, res: Response) => {
  try {
    const { eventId, emails } = req.body;
    
    if (!eventId || !emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: '缺少必要參數: eventId, emails' });
    }

    const qrCodes = [];
    const { generateQRCode } = require('../services/qr');
    
    for (const email of emails) {
      try {
        const qrData = await generateQRCode(eventId, email);
        qrCodes.push({
          email,
          qrDataUri: qrData.qrDataUri,
          checkinUrl: qrData.checkinUrl
        });
      } catch (error) {
        logger.error(`生成 ${email} 的QR code失敗:`, error);
        // 繼續處理其他email，不中斷整個批次
      }
    }
    
    res.json({
      success: true,
      qrCodes
    });
  } catch (error) {
    logger.error('批次QR預覽錯誤:', error);
    res.status(500).json({ error: '批次QR code預覽失敗' });
  }
});

export default router;