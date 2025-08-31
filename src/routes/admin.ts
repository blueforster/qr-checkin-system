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

    const csvContent = req.file.buffer.toString('utf-8');
    
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
      columns: Object.keys(records[0] || {})
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

    const { eventName, subject, from, testMode = false, attachPng = false } = req.body;

    if (!eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: eventName, subject' });
    }

    const options: EmailOptions = {
      eventName,
      subject,
      from: from || `${process.env.FROM_DISPLAY} <${process.env.FROM_EMAIL}>`,
      testMode: Boolean(testMode),
      attachPng: Boolean(attachPng)
    };

    logger.info(`Starting batch email send. Test mode: ${testMode}, Total: ${currentParticipants.length}`);

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
    const { email, eventName, subject, attachPng = false } = req.body;

    if (!email || !eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: email, eventName, subject' });
    }

    const participant = currentParticipants.find(p => p.email === email);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const options: EmailOptions = {
      eventName,
      subject,
      from: `${process.env.FROM_DISPLAY} <${process.env.FROM_EMAIL}>`,
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
    const eventId = process.env.EVENT_ID;
    
    let totalCheckins = 0;
    let todayCheckins = 0;
    
    try {
      const allCheckins = await sheetsService.getCheckins(eventId);
      totalCheckins = allCheckins.length;
      todayCheckins = await sheetsService.getTodayCheckins();
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

    const { eventName, eventDate, eventLocation, subject, from, testMode, attachPng, customTemplate } = req.body;

    if (!eventName || !subject) {
      return res.status(400).json({ error: 'Missing required fields: eventName, subject' });
    }

    // 處理附件檔案
    const attachmentFiles = req.files as Express.Multer.File[] || [];
    const attachments = attachmentFiles.map(file => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype
    }));

    const options: EmailOptions & { customTemplate?: string; attachments?: any[]; eventDate?: string; eventLocation?: string } = {
      eventName,
      eventDate,
      eventLocation,
      subject,
      from: from || `${process.env.FROM_DISPLAY} <${process.env.FROM_EMAIL}>`,
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
  async sendBatch(participants: ParticipantRecord[], options: EmailOptions & { customTemplate?: string; attachments?: any[] }): Promise<any[]> {
    const results: any[] = [];
    const eventId = process.env.EVENT_ID || '';
    
    const participantsToSend = options.testMode ? participants.slice(0, 3) : participants;
    
    for (let i = 0; i < participantsToSend.length; i++) {
      const participant = participantsToSend[i];
      
      try {
        const qrData = await this.generateQRData(eventId, participant.email);
        
        // 使用自定義範本或預設範本
        let html;
        if (options.customTemplate) {
          html = this.renderCustomTemplate(participant, options, qrData, options.customTemplate);
        } else {
          html = this.renderTemplate(participant, options, qrData);
        }
        
        const mailOptions: any = {
          from: `${process.env.FROM_DISPLAY} <${process.env.FROM_EMAIL}>`,
          to: participant.email,
          subject: options.subject.replace('{{eventName}}', options.eventName),
          html: html,
          attachments: []
        };

        // 添加 QR Code 附件
        if (options.attachPng) {
          mailOptions.attachments.push({
            filename: 'qr-code.png',
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
    
    const replacements = {
      '{{name}}': participant.name || '',
      '{{email}}': participant.email || '',
      '{{company}}': participant.company || '',
      '{{title}}': participant.title || '',
      '{{participantDetails}}': participantDetails,
      '{{eventName}}': options.eventName || '',
      '{{eventDate}}': options.eventDate || '請參考活動通知或官網',
      '{{eventLocation}}': options.eventLocation || '請參考活動通知或官網',
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

  private async generateQRData(eventId: string, email: string) {
    // 這裡需要從原本的 Mailer 複製 QR 產生邏輯
    const { generateQRCode } = require('../services/qr');
    return await generateQRCode(eventId, email);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default router;