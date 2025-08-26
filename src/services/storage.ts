import { Database } from 'sqlite3';
import { join } from 'path';
import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { CheckinRecord } from '../types';
import pino from 'pino';

const logger = pino({ name: 'storage' });

export class LocalStorage {
  private type: 'sqlite' | 'jsonl' | 'none';
  private db?: Database;
  private jsonlPath?: string;

  constructor() {
    this.type = (process.env.LOCAL_PERSISTENCE as any) || 'sqlite';
    
    if (this.type === 'sqlite') {
      this.initSQLite();
    } else if (this.type === 'jsonl') {
      this.initJSONL();
    }
  }

  private initSQLite(): void {
    try {
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      const dbPath = join(dataDir, 'checkins.sqlite');
      this.db = new Database(dbPath);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS checkins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          eventId TEXT NOT NULL,
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          company TEXT,
          title TEXT,
          nonce TEXT NOT NULL,
          status TEXT NOT NULL,
          UNIQUE(eventId, email)
        )
      `);

      logger.info('SQLite storage initialized');
    } catch (error) {
      logger.error('Failed to initialize SQLite:', error);
      throw error;
    }
  }

  private initJSONL(): void {
    try {
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      this.jsonlPath = join(dataDir, 'checkins.jsonl');
      
      if (!existsSync(this.jsonlPath)) {
        writeFileSync(this.jsonlPath, '');
      }

      logger.info('JSONL storage initialized');
    } catch (error) {
      logger.error('Failed to initialize JSONL:', error);
      throw error;
    }
  }

  async saveCheckin(record: CheckinRecord): Promise<{ isFirstTime: boolean; firstCheckinAt?: string }> {
    if (this.type === 'none') {
      return { isFirstTime: true };
    }

    try {
      if (this.type === 'sqlite' && this.db) {
        return await this.saveSQLite(record);
      } else if (this.type === 'jsonl' && this.jsonlPath) {
        return await this.saveJSONL(record);
      }
      
      return { isFirstTime: true };
    } catch (error) {
      logger.error('Failed to save checkin locally:', error);
      throw error;
    }
  }

  private async saveSQLite(record: CheckinRecord): Promise<{ isFirstTime: boolean; firstCheckinAt?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('SQLite not initialized'));

      this.db.get(
        'SELECT timestamp FROM checkins WHERE eventId = ? AND email = ?',
        [record.eventId, record.email],
        (err, row: any) => {
          if (err) return reject(err);

          if (row) {
            this.db!.run(
              'UPDATE checkins SET timestamp = ?, nonce = ? WHERE eventId = ? AND email = ?',
              [record.timestamp, record.nonce, record.eventId, record.email],
              (err) => {
                if (err) return reject(err);
                resolve({ isFirstTime: false, firstCheckinAt: row.timestamp });
              }
            );
          } else {
            this.db!.run(
              'INSERT INTO checkins (timestamp, eventId, email, name, company, title, nonce, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [record.timestamp, record.eventId, record.email, record.name, record.company, record.title, record.nonce, record.status],
              (err) => {
                if (err) return reject(err);
                resolve({ isFirstTime: true });
              }
            );
          }
        }
      );
    });
  }

  private async saveJSONL(record: CheckinRecord): Promise<{ isFirstTime: boolean; firstCheckinAt?: string }> {
    if (!this.jsonlPath) throw new Error('JSONL not initialized');

    const lines = existsSync(this.jsonlPath) ? readFileSync(this.jsonlPath, 'utf-8').trim().split('\n').filter(Boolean) : [];
    let existingRecord: CheckinRecord | null = null;

    for (const line of lines) {
      try {
        const existing = JSON.parse(line) as CheckinRecord;
        if (existing.eventId === record.eventId && existing.email === record.email) {
          existingRecord = existing;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (existingRecord) {
      const updatedLines = lines.map(line => {
        try {
          const existing = JSON.parse(line) as CheckinRecord;
          if (existing.eventId === record.eventId && existing.email === record.email) {
            return JSON.stringify({ ...record });
          }
          return line;
        } catch (e) {
          return line;
        }
      });

      writeFileSync(this.jsonlPath, updatedLines.join('\n') + '\n');
      return { isFirstTime: false, firstCheckinAt: existingRecord.timestamp };
    } else {
      appendFileSync(this.jsonlPath, JSON.stringify(record) + '\n');
      return { isFirstTime: true };
    }
  }

  async getCheckins(eventId?: string): Promise<CheckinRecord[]> {
    if (this.type === 'none') {
      return [];
    }

    try {
      if (this.type === 'sqlite' && this.db) {
        return await this.getSQLiteCheckins(eventId);
      } else if (this.type === 'jsonl' && this.jsonlPath) {
        return await this.getJSONLCheckins(eventId);
      }
      
      return [];
    } catch (error) {
      logger.error('Failed to get local checkins:', error);
      return [];
    }
  }

  private async getSQLiteCheckins(eventId?: string): Promise<CheckinRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('SQLite not initialized'));

      const query = eventId 
        ? 'SELECT * FROM checkins WHERE eventId = ? ORDER BY timestamp DESC'
        : 'SELECT * FROM checkins ORDER BY timestamp DESC';
      
      const params = eventId ? [eventId] : [];

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) return reject(err);
        
        const records = rows.map(row => ({
          timestamp: row.timestamp,
          eventId: row.eventId,
          email: row.email,
          name: row.name,
          company: row.company || undefined,
          title: row.title || undefined,
          nonce: row.nonce,
          status: row.status as 'checked_in'
        }));

        resolve(records);
      });
    });
  }

  private async getJSONLCheckins(eventId?: string): Promise<CheckinRecord[]> {
    if (!this.jsonlPath || !existsSync(this.jsonlPath)) return [];

    const lines = readFileSync(this.jsonlPath, 'utf-8').trim().split('\n').filter(Boolean);
    const records: CheckinRecord[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as CheckinRecord;
        if (!eventId || record.eventId === eventId) {
          records.push(record);
        }
      } catch (e) {
        continue;
      }
    }

    return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}