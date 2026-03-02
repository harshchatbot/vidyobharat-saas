import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.mjs';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[config.logLevel] ?? levels.info;
const logfile = path.join(config.outputDir, 'logs', `migration-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

function write(level, message, metadata) {
  if ((levels[level] ?? 999) < threshold) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  const line = JSON.stringify(payload);
  console.log(line);
  fs.appendFileSync(logfile, `${line}\n`);
}

export const logger = {
  debug(message, metadata = {}) { write('debug', message, metadata); },
  info(message, metadata = {}) { write('info', message, metadata); },
  warn(message, metadata = {}) { write('warn', message, metadata); },
  error(message, metadata = {}) { write('error', message, metadata); },
};
