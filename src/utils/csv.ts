import { parse } from 'csv-parse';
import { ParticipantRecord } from '../types';

export async function parseCSV(csvContent: string): Promise<{
  records: ParticipantRecord[];
  errors: string[];
}> {
  return new Promise((resolve) => {
    const records: ParticipantRecord[] = [];
    const errors: string[] = [];
    let lineNumber = 0;

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      encoding: 'utf8'
    });

    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        lineNumber++;
        
        if (!record.name || !record.email) {
          errors.push(`Line ${lineNumber}: Missing required fields (name, email)`);
          continue;
        }

        if (!isValidEmail(record.email)) {
          errors.push(`Line ${lineNumber}: Invalid email format: ${record.email}`);
          continue;
        }

        records.push({
          name: record.name.trim(),
          email: record.email.toLowerCase().trim(),
          company: record.company?.trim() || undefined,
          title: record.title?.trim() || undefined,
          ...record
        });
      }
    });

    parser.on('error', function(err) {
      errors.push(`CSV parsing error: ${err.message}`);
    });

    parser.on('end', function() {
      resolve({ records, errors });
    });

    parser.write(csvContent);
    parser.end();
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