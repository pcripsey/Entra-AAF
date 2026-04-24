import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp as string} [${level.toUpperCase()}] ${message as string}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});
