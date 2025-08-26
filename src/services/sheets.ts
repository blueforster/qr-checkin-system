import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CheckinRecord } from '../types';
import pino from 'pino';

const logger = pino({ name: 'sheets' });

export class SheetsService {
  private sheets: any;
  private spreadsheetId: string;
  private tabName: string;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID || '';
    this.tabName = process.env.GOOGLE_SHEETS_TAB || 'checkins';

    try {
      let credentials;
      
      // 優先使用環境變數中的 base64 編碼金鑰 (適用於 Zeabur 等雲端部署)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        const credentialsJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
        credentials = JSON.parse(credentialsJson);
      } else {
        // 使用檔案系統中的金鑰檔案 (適用於本地開發)
        const credentialsPath = join(__dirname, '../../creds/service-account.json');
        credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
      }
      
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
    } catch (error) {
      logger.error('Failed to initialize Google Sheets service:', error);
      throw new Error('Google Sheets service initialization failed');
    }
  }

  async ensureHeader(): Promise<void> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tabName}!1:1`,
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.tabName}!1:1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['timestamp', 'eventId', 'email', 'name', 'company', 'title', 'nonce', 'status']]
          },
        });
        logger.info('Headers added to spreadsheet');
      }
    } catch (error) {
      logger.error('Failed to ensure header:', error);
      throw error;
    }
  }

  async upsertCheckin(record: CheckinRecord): Promise<{
    isFirstTime: boolean;
    firstCheckinAt?: string;
  }> {
    try {
      await this.ensureHeader();

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tabName}!A:H`,
      });

      const rows = response.data.values || [];
      let existingRowIndex = -1;
      let firstCheckinAt: string | undefined;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[1] === record.eventId && row[2] === record.email) {
          existingRowIndex = i + 1;
          firstCheckinAt = row[0];
          break;
        }
      }

      const rowData = [
        record.timestamp,
        record.eventId,
        record.email,
        record.name,
        record.company || '',
        record.title || '',
        record.nonce,
        record.status
      ];

      if (existingRowIndex > -1) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.tabName}!A${existingRowIndex}:H${existingRowIndex}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [rowData]
          },
        });

        logger.info(`Updated existing checkin for ${record.email}`);
        return { isFirstTime: false, firstCheckinAt };
      } else {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${this.tabName}!A:H`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [rowData]
          },
        });

        logger.info(`Added new checkin for ${record.email}`);
        return { isFirstTime: true };
      }
    } catch (error) {
      logger.error('Failed to upsert checkin:', error);
      throw error;
    }
  }

  async getCheckins(eventId?: string): Promise<CheckinRecord[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tabName}!A:H`,
      });

      const rows = response.data.values || [];
      const records: CheckinRecord[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 8) {
          const record: CheckinRecord = {
            timestamp: row[0],
            eventId: row[1],
            email: row[2],
            name: row[3],
            company: row[4] || undefined,
            title: row[5] || undefined,
            nonce: row[6],
            status: row[7] as 'checked_in'
          };

          if (!eventId || record.eventId === eventId) {
            records.push(record);
          }
        }
      }

      return records;
    } catch (error) {
      logger.error('Failed to get checkins:', error);
      throw error;
    }
  }

  async getTodayCheckins(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const records = await this.getCheckins(process.env.EVENT_ID);
    return records.filter(r => r.timestamp.startsWith(today)).length;
  }
}