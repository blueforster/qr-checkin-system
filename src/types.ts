export interface ParticipantRecord {
  name: string;
  email: string;
  company?: string;
  title?: string;
  [key: string]: any;
}

export interface CheckinRecord extends ParticipantRecord {
  eventId: string;
  timestamp: string;
  nonce: string;
  status: 'checked_in';
  firstCheckinAt?: string;
}

export interface JWTPayload {
  eventId: string;
  email: string;
  nonce: string;
  exp: number;
  iat: number;
}

export interface EmailOptions {
  eventName: string;
  subject: string;
  from: string;
  testMode?: boolean;
  attachPng?: boolean;
}

export interface SendResult {
  email: string;
  success: boolean;
  error?: string;
}

export interface HealthMetrics {
  todayCheckins: number;
  duplicateCheckins: number;
  emailSuccessRate: number;
  uptime: number;
}