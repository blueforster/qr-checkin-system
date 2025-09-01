import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const JWT_TTL_HOURS = parseInt(process.env.JWT_TTL_HOURS || '240');

export function generateToken(eventId: string, email: string): string {
  const nonce = randomBytes(16).toString('hex');
  const payload: Omit<JWTPayload, 'iat'> = {
    eventId,
    email,
    nonce,
    exp: Math.floor(Date.now() / 1000) + (JWT_TTL_HOURS * 3600)
  };

  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
}

export function verifyToken(token: string, expectedEventId?: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
    
    // 如果有指定expectedEventId就檢查，否則使用環境變數或跳過檢查
    if (expectedEventId && decoded.eventId !== expectedEventId) {
      return null;
    } else if (!expectedEventId && process.env.EVENT_ID && decoded.eventId !== process.env.EVENT_ID) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}