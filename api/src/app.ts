import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';
import reviewRouter from '@/routes/review';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  app.use(reviewRouter);
  return app;
}
