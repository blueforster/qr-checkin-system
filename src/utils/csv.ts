import { parse } from 'csv-parse';
import { ParticipantRecord } from '../types';

export async function parseCSV(csvContent: string): Promise<{
  records: ParticipantRecord[];
  errors: string[];
}> {
  return new Promise((resolve) => {
    const records: ParticipantRecord[] = [];
    const errors: string[] = [];

    parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }, (err: any, data: any[]) => {
      if (err) {
        errors.push(`CSV parsing error: ${err.message}`);
        resolve({ records, errors });
        return;
      }

      data.forEach((record: any, index: number) => {
        const lineNumber = index + 1;
        
        if (!record.name || !record.email) {
          errors.push(`Line ${lineNumber}: Missing required fields (name, email)`);
          return;
        }

        if (!isValidEmail(record.email)) {
          errors.push(`Line ${lineNumber}: Invalid email format: ${record.email}`);
          return;
        }

        records.push({
          name: record.name.trim(),
          email: record.email.toLowerCase().trim(),
          company: record.company?.trim() || undefined,
          title: record.title?.trim() || undefined,
          ...record
        });
      });

      resolve({ records, errors });
    });
  });
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateCSVHeaders(csvContent: string): string[] {
  const firstLine = csvContent.split('\n')[0];
  if (!firstLine) return ['Empty CSV file'];

  const headers = firstLine.split(',').map(h => h.trim().toLowerCase());
  const required = ['name', 'email'];
  const missing = required.filter(req => !headers.includes(req));

  if (missing.length > 0) {
    return [`Missing required columns: ${missing.join(', ')}`];
  }

  return [];
}

export function detectDuplicates(records: ParticipantRecord[]): string[] {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  records.forEach((record, index) => {
    const email = record.email.toLowerCase();
    if (seen.has(email)) {
      duplicates.push(`Duplicate email at line ${index + 1}: ${email} (first seen at line ${seen.get(email)! + 1})`);
    } else {
      seen.set(email, index);
    }
  });

  return duplicates;
}