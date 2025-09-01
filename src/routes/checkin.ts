import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { verifyToken } from '../services/token';
import { SheetsService } from '../services/sheets';
import { LocalStorage } from '../services/storage';
import { CheckinRecord } from '../types';
import pino from 'pino';

const logger = pino({ name: 'checkin' });
const router = Router();

const sheetsService = new SheetsService();
const localStorage = new LocalStorage();

function loadTemplate(templateName: string): string {
  try {
    return readFileSync(join(__dirname, '../public', templateName), 'utf-8');
  } catch (error) {
    logger.error(`Failed to load template ${templateName}:`, error);
    return getDefaultTemplate(templateName);
  }
}

function getDefaultTemplate(templateName: string): string {
  if (templateName === 'checkin-success.html') {
    return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>報到成功</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            text-align: center; 
            padding: 40px 20px; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: rgba(255,255,255,0.95);
            color: #333;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
        }
        h1 { 
            font-size: 2.5em; 
            margin-bottom: 10px;
            color: #2c3e50;
        }
        h2 { 
            font-size: 1.8em; 
            color: #27ae60;
            margin-bottom: 20px;
        }
        .success-icon {
            font-size: 4em;
            color: #27ae60;
            margin-bottom: 20px;
        }
        .info {
            font-size: 1.1em;
            margin: 10px 0;
            color: #555;
        }
        .time {
            font-size: 0.9em;
            color: #777;
            margin-top: 20px;
        }
        .repeat-notice {
            background: #fff3cd;
            border: 1px solid #ffeeba;
            color: #856404;
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>{{name}}</h1>
        <h2>{{message}}</h2>
        {{companyInfo}}
        {{repeatInfo}}
        <div class="time">{{timestamp}}</div>
    </div>
</body>
</html>`;
  } else {
    return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>驗證失敗</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            text-align: center; 
            padding: 40px 20px; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: rgba(255,255,255,0.95);
            color: #333;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
        }
        h2 { 
            font-size: 1.8em; 
            color: #e74c3c;
            margin-bottom: 20px;
        }
        .error-icon {
            font-size: 4em;
            color: #e74c3c;
            margin-bottom: 20px;
        }
        .info {
            font-size: 1.1em;
            color: #555;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h2>驗證失敗或 QR 已過期</h2>
        <div class="info">請洽服務台協助</div>
    </div>
</body>
</html>`;
  }
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder, 'g'), value || '');
  }
  
  return rendered;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      logger.warn('Checkin attempt without token');
      const failTemplate = loadTemplate('checkin-fail.html');
      return res.send(failTemplate);
    }

    const payload = verifyToken(token);
    if (!payload) {
      logger.warn('Invalid token in checkin attempt');
      const failTemplate = loadTemplate('checkin-fail.html');
      return res.send(failTemplate);
    }

    const now = new Date();
    const timestamp = now.toLocaleString('zh-TW', { 
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const checkinRecord: CheckinRecord = {
      timestamp,
      eventId: payload.eventId,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      company: undefined,
      title: undefined,
      nonce: payload.nonce,
      status: 'checked_in'
    };

    let result: { isFirstTime: boolean; firstCheckinAt?: string } = { isFirstTime: true };
    
    try {
      result = await sheetsService.upsertCheckin(checkinRecord);
      logger.info(`Checkin recorded in Sheets for ${payload.email}, first time: ${result.isFirstTime}`);
    } catch (error) {
      logger.warn('Failed to record in Sheets, trying local storage:', error);
      try {
        result = await localStorage.saveCheckin(checkinRecord);
        logger.info(`Checkin recorded locally for ${payload.email}, first time: ${result.isFirstTime}`);
      } catch (localError) {
        logger.error('Failed to record checkin locally:', localError);
        const failTemplate = loadTemplate('checkin-fail.html');
        return res.send(failTemplate);
      }
    }

    const successTemplate = loadTemplate('checkin-success.html');
    
    const companyInfo = checkinRecord.company || checkinRecord.title 
      ? `<div class="info">${[checkinRecord.company, checkinRecord.title].filter(Boolean).join(' - ')}</div>`
      : '';

    const message = result.isFirstTime ? '報到成功！' : '已完成報到';
    
    const repeatInfo = !result.isFirstTime 
      ? `<div class="repeat-notice">首次報到時間：${result.firstCheckinAt}<br>本次掃碼：${timestamp}</div>`
      : '';

    const variables = {
      name: payload.name || payload.email.split('@')[0],
      message,
      company: checkinRecord.company || '',
      title: checkinRecord.title || '',
      companyInfo,
      repeatInfo,
      timestamp,
      firstCheckinAt: result.firstCheckinAt || ''
    };

    const renderedTemplate = renderTemplate(successTemplate, variables);
    res.send(renderedTemplate);

  } catch (error) {
    logger.error('Checkin processing error:', error);
    const failTemplate = loadTemplate('checkin-fail.html');
    res.send(failTemplate);
  }
});

export default router;