import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ParticipantRecord, EmailOptions, SendResult } from '../types';
import { generateQRCode } from './qr';
import pino from 'pino';

const logger = pino({ name: 'mailer' });

interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromDisplay: string;
  fromEmail: string;
  rateLimit: number;
}

export class Mailer {
  private transporter: nodemailer.Transporter;
  private config: MailerConfig;
  private emailTemplate: string;

  constructor() {
    this.config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      fromDisplay: process.env.FROM_DISPLAY || 'Event System',
      fromEmail: process.env.FROM_EMAIL || '',
      rateLimit: parseInt(process.env.RATE_LIMIT_PER_SEC || '3')
    };

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: {
        user: this.config.user,
        pass: this.config.pass,
      },
    });

    try {
      this.emailTemplate = readFileSync(join(__dirname, '../../templates/email.html'), 'utf-8');
    } catch (error) {
      logger.error('Failed to load email template', error);
      throw new Error('Email template not found');
    }
  }

  private renderTemplate(participant: ParticipantRecord, options: EmailOptions, qrData: any): string {
    let html = this.emailTemplate;
    
    const replacements = {
      '{{name}}': participant.name || '',
      '{{email}}': participant.email || '',
      '{{company}}': participant.company || '',
      '{{title}}': participant.title || '',
      '{{eventName}}': options.eventName || '',
      '{{checkinUrl}}': qrData.checkinUrl || '',
      '{{qrDataUri}}': qrData.qrDataUri || '',
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.replace(new RegExp(placeholder, 'g'), value);
    }

    return html;
  }

  async sendBatch(participants: ParticipantRecord[], options: EmailOptions): Promise<SendResult[]> {
    const results: SendResult[] = [];
    const eventId = process.env.EVENT_ID || '';
    
    const participantsToSend = options.testMode ? participants.slice(0, 3) : participants;
    
    for (let i = 0; i < participantsToSend.length; i++) {
      const participant = participantsToSend[i];
      
      try {
        const qrData = await generateQRCode(eventId, participant.email);
        const html = this.renderTemplate(participant, options, qrData);
        
        const mailOptions: nodemailer.SendMailOptions = {
          from: `${this.config.fromDisplay} <${this.config.fromEmail}>`,
          to: participant.email,
          subject: options.subject.replace('{{eventName}}', options.eventName),
          html: html,
        };

        if (options.attachPng) {
          mailOptions.attachments = [{
            filename: 'qr-code.png',
            content: qrData.qrBuffer,
            contentType: 'image/png'
          }];
        }

        await this.transporter.sendMail(mailOptions);
        
        results.push({
          email: participant.email,
          success: true
        });

        logger.info(`Email sent successfully to ${participant.email}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          email: participant.email,
          success: false,
          error: errorMsg
        });

        logger.error(`Failed to send email to ${participant.email}:`, error);
      }

      if (i < participantsToSend.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 / this.config.rateLimit));
      }
    }

    return results;
  }

  async sendOne(participant: ParticipantRecord, options: EmailOptions): Promise<SendResult> {
    const results = await this.sendBatch([participant], options);
    return results[0];
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('SMTP verification failed:', error);
      return false;
    }
  }
}