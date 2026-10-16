import pino from 'pino';
import { safeError } from './security.js';
export const createLogger = config => pino({
  level: config.LOG_LEVEL,
  redact: { paths: ['token', 'apiKey', 'password', 'authorization', 'headers.authorization', 'config', 'req', 'res'], censor: '[REDACTED]' },
  serializers: { err: error => ({ code: safeError(error) }) },
});
