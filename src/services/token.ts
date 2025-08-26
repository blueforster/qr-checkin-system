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

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
    
    if (decoded.eventId !== process.env.EVENT_ID) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}