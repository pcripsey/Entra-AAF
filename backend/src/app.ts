import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import session from 'express-session';
import { config } from './config';
import { initializeDatabase } from './models/database';
import { initializeKeys } from './utils/jwks';
import { logger } from './utils/logger';
import oidcRoutes from './routes/oidc';
import adminRoutes from './routes/admin';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.cookieSecure,
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
    },
  })
);

app.use('/', oidcRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

async function start() {
  initializeDatabase();
  await initializeKeys();
  app.listen(config.port, () => {
    logger.info(`Entra-AAF Bridge running on port ${config.port}`);
    logger.info(`Base URL: ${config.baseUrl}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });
}

start().catch((err: Error) => {
  logger.error(`Failed to start: ${err.message}`);
  process.exit(1);
});

export default app;
