import QRCode from 'qrcode';
import { generateToken } from './token';

export async function generateQRCode(eventId: string, email: string): Promise<{
  token: string;
  checkinUrl: string;
  qrDataUri: string;
  qrBuffer: Buffer;
}> {
  const token = generateToken(eventId, email);
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  const checkinUrl = `${baseUrl}/checkin?token=${token}`;

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