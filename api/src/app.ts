import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';
import reviewRouter from '@/routes/review';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';
import transactionsRouter from '@/routes/transactions';
import goalsRouter from '@/routes/goals';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  app.use(reviewRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  app.use(transactionsRouter);
  app.use(goalsRouter);
  return app;
}
