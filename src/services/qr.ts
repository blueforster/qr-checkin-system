import QRCode from 'qrcode';
import { generateToken } from './token';

export async function generateQRCode(eventId: string, email: string, name?: string): Promise<{
  token: string;
  checkinUrl: string;
  qrDataUri: string;
  qrBuffer: Buffer;
}> {
  // 調試日誌
  console.log(`[QR] generateQRCode called with eventId: "${eventId}", email: "${email}", name: "${name}"`);
  
  const token = generateToken(eventId, email, name || email.split('@')[0]);
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  const checkinUrl = `${baseUrl}/checkin?token=${token}`;
  
  console.log(`[QR] Generated checkinUrl: ${checkinUrl}`);

  const qrDataUri = await QRCode.toDataURL(checkinUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    width: 256,
  });

  const qrBuffer = await QRCode.toBuffer(checkinUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    width: 256,
  });

  return {
    token,
    checkinUrl,
    qrDataUri,
    qrBuffer
  };
}