import { Router, Request, Response } from 'express';
import multer from 'multer';
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

export default router;