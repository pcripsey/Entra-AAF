import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp as string} [${level.toUpperCase()}] ${message as string}`;
  })
);

const rotateBaseOptions = {
  dirname: logDir,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
};

export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      ...rotateBaseOptions,
      filename: 'app-%DATE%.log',
    }),
    new DailyRotateFile({
      ...rotateBaseOptions,
      filename: 'error-%DATE%.log',
      level: 'error',
    }),
  ],
});

export function setLogLevel(level: 'info' | 'debug'): void {
  logger.level = level;
}

export function getLogLevel(): string {
  return logger.level;
}
