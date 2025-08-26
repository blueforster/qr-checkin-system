import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import pino from 'pino';
import adminRoutes from './routes/admin';
import checkinRoutes from './routes/checkin';
import { HealthMetrics } from './types';

dotenv.config();

const logger = pino({ 
  name: 'qr-checkin-server',
  level: process.env.LOG_LEVEL || 'info'
});

const app = express();
const PORT = process.env.PORT || 8080;

const startTime = Date.now();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/admin', adminRoutes);
app.use('/checkin', checkinRoutes);

app.get('/healthz', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/metrics', async (req, res) => {
  try {
    const metrics: HealthMetrics = {
      todayCheckins: 0,
      duplicateCheckins: 0,
      emailSuccessRate: 100,
      uptime: Math.floor((Date.now() - startTime) / 1000)
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scan.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(`QR Checkin Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  logger.info(`Event ID: ${process.env.EVENT_ID || 'not-set'}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;