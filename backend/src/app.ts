import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import rateLimit from 'express-rate-limit';
import cluster from 'node:cluster';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { connectDatabase, initializeDatabase } from './models/database';
import { cleanupExpiredSessions } from './models/session';
import { cleanupExpiredAuthCodes } from './services/tokenService';
import { initializeKeys } from './utils/jwks';
import { logger } from './utils/logger';
import oidcRoutes from './routes/oidc';
import adminRoutes from './routes/admin';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const SQLiteStore = connectSqlite3(session);
const resolvedDbPath = path.resolve(config.dbPath);
const resolvedDbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(resolvedDbDir)) {
  fs.mkdirSync(resolvedDbDir, { recursive: true });
}

const makeLimiter = (windowMs: number, max: number) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  handler: (_req, res, _next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000).toString());
    res.status(options.statusCode).send(options.message);
  },
});

const oidcLimiter = makeLimiter(config.rateLimitWindowMs, config.rateLimitMax);
const adminLimiter = makeLimiter(60 * 1000, 60);
const sessionStore = new SQLiteStore({
  db: path.basename(resolvedDbPath),
  dir: resolvedDbDir,
  table: 'express_sessions',
}) as unknown as session.Store;

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
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: config.cookieSecure,
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
    },
  })
);

app.use('/', oidcLimiter, oidcRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

function startCleanupJob(): void {
  setInterval(() => {
    const removedSessions = cleanupExpiredSessions();
    const removedAuthCodes = cleanupExpiredAuthCodes();
    logger.debug(`Cleanup job removed ${removedSessions} expired sessions and ${removedAuthCodes} expired auth codes.`);
  }, config.cleanupIntervalMs);
}

async function startWorker() {
  connectDatabase();
  await initializeKeys();
  startCleanupJob();
  app.listen(config.port, () => {
    logger.info(`Entra-AAF Bridge worker ${process.pid} running on port ${config.port}`);
    logger.info(`Base URL: ${config.baseUrl}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });
}

function startClustered(): void {
  if (cluster.isPrimary) {
    initializeDatabase();
    const workerCount = os.cpus().length;
    logger.info(`Primary ${process.pid} starting ${workerCount} workers.`);
    for (let i = 0; i < workerCount; i += 1) {
      cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} exited (code=${code}, signal=${signal ?? 'none'}). Restarting.`);
      cluster.fork();
    });
    return;
  }

  startWorker().catch((err: Error) => {
    logger.error(`Failed to start worker ${process.pid}: ${err.message}`);
    process.exit(1);
  });
}

async function startSingleProcess() {
  initializeDatabase();
  await startWorker();
}

const start = config.clusterEnabled ? startClustered : startSingleProcess;

Promise.resolve(start()).catch((err: Error) => {
  logger.error(`Failed to start: ${err.message}`);
  process.exit(1);
});

export default app;
