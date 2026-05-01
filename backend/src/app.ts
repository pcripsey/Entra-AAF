import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import { config } from './config';
import { initializeDatabase } from './models/database';
import { initializeKeys } from './utils/jwks';
import { logger } from './utils/logger';
import oidcRoutes from './routes/oidc';
import adminRoutes from './routes/admin';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = config.corsOrigins || [config.baseUrl];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(requestLogger);
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
