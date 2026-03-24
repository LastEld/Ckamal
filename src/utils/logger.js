/**
 * CogniMesh Logger
 * Winston-based logging utility with rotation
 * @module utils/logger
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, context, ...metadata }) => {
    const ctx = context || 'app';
    let msg = `[${timestamp}] [${level.toUpperCase()}] [${ctx}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Console format (colored)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, context }) => {
    const ctx = context || 'app';
    return `[${timestamp}] [${level}] [${ctx}]: ${message}`;
  })
);

// Daily rotate file transport factory
function createFileTransport(level, filename) {
  return new winston.transports.File({
    filename: path.join(LOGS_DIR, filename),
    level,
    format: logFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 14, // 14 days retention
    tailable: true
  });
}

// Create logger instance
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { context: 'bios' },
  transports: [
    // Error logs
    createFileTransport('error', 'error.log'),
    
    // Warning logs
    createFileTransport('warn', 'warn.log'),
    
    // Info logs
    createFileTransport('info', 'info.log'),
    
    // Debug logs
    createFileTransport('debug', 'debug.log'),
    
    // Combined all logs
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'combined.log'),
      format: logFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 7
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'exceptions.log'),
      format: logFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'rejections.log'),
      format: logFormat
    })
  ]
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
} else {
  winstonLogger.add(new winston.transports.Console({
    format: logFormat,
    level: 'warn'
  }));
}

// Helper methods with context
const logger = {
  error: (message, meta = {}) => winstonLogger.error(message, meta),
  warn: (message, meta = {}) => winstonLogger.warn(message, meta),
  info: (message, meta = {}) => winstonLogger.info(message, meta),
  debug: (message, meta = {}) => winstonLogger.debug(message, meta),
  
  // Create child logger with context
  child: (context) => ({
    error: (message, meta = {}) => winstonLogger.error(message, { ...meta, context }),
    warn: (message, meta = {}) => winstonLogger.warn(message, { ...meta, context }),
    info: (message, meta = {}) => winstonLogger.info(message, { ...meta, context }),
    debug: (message, meta = {}) => winstonLogger.debug(message, { ...meta, context })
  }),
  
  // Stream for morgan/express
  stream: {
    write: (message) => {
      winstonLogger.info(message.trim(), { context: 'http' });
    }
  }
};

/**
 * Create a logger with specific context
 * @param {string} context - Context name
 * @returns {object} Logger instance with context
 */
export function createLogger(context) {
  return logger.child(context);
}

export { logger };
export default logger;
