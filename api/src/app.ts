import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import reviewRouter from '@/routes/review';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';
import transactionsRouter from '@/routes/transactions';
import goalsRouter from '@/routes/goals';
import forecastRouter from '@/routes/forecast';
import categoriesRouter from '@/routes/categories';
import incomeRouter from '@/routes/income';
import importStatementRouter from '@/routes/importStatement';
import { errorHandler } from '@/lib/errorHandler';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(reviewRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  app.use(transactionsRouter);
  app.use(goalsRouter);
  app.use(forecastRouter);
  app.use(categoriesRouter);
  app.use(incomeRouter);
  app.use(importStatementRouter);
  app.use(errorHandler);
  return app;
}
