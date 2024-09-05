const isNode = typeof window === 'undefined';

let format, uuidv4;

async function initializeLogger() {
  if (isNode) {
    const dateFns = await import('date-fns');
    const uuid = await import('uuid');
    format = dateFns.default.format;
    uuidv4 = uuid.v4;
  } else {
    // Wait for the date-fns and uuid libraries to be loaded
    await new Promise(resolve => {
      const checkLibraries = () => {
        if (typeof window.dateFns !== 'undefined' && typeof window.uuid !== 'undefined') {
          format = window.dateFns.format;
          uuidv4 = window.uuid.v4;
          resolve();
        } else {
          setTimeout(checkLibraries, 50);
        }
      };
      checkLibraries();
    });
  }
}

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4
};

class Logger {
  constructor() {
    this.logLevel = LOG_LEVELS.INFO;
    this.databaseLogger = null;
    this.consoleLogger = isNode ? console : window.console;
  }

  setLogLevel(level) {
    if (LOG_LEVELS.hasOwnProperty(level)) {
      this.logLevel = LOG_LEVELS[level];
    } else {
      this.warning(`Invalid log level: ${level}. Using default INFO level.`);
    }
  }

  setDatabaseLogger(logFunction) {
    if (typeof logFunction === 'function') {
      this.databaseLogger = async (logEntry) => {
        if (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL' || 
            (logEntry.level === 'INFO' && logEntry.message.startsWith('IMPORTANT:'))) {
          try {
            await logFunction(logEntry.level, JSON.stringify(logEntry));
          } catch (error) {
            this.consoleLogger.error('Error in database logging:', error);
          }
        }
      };
    } else {
      this.error('Invalid logFunction provided to setDatabaseLogger');
    }
  }

  async log(level, message, meta = {}) {
    if (LOG_LEVELS[level] >= this.logLevel) {
      if (!format || !uuidv4) {
        await initializeLogger();
      }
      const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
      const logId = uuidv4();
      const logEntry = {
        id: logId,
        timestamp,
        level,
        message,
        ...this.sanitizeMetadata(meta)
      };

      this.consoleLog(logEntry);
      await this.databaseLog(logEntry);
    }
  }

  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }

  warning(message, meta = {}) {
    this.log('WARNING', message, meta);
  }

  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }

  critical(message, meta = {}) {
    this.log('CRITICAL', message, meta);
  }

  consoleLog(logEntry) {
    const { level, message } = logEntry;
    const consoleMethod = level === 'DEBUG' || level === 'INFO' ? 'log' :
                          level === 'WARNING' ? 'warn' :
                          'error';
    this.consoleLogger[consoleMethod](`[${level}] ${message}`, logEntry);
  }

  async databaseLog(logEntry) {
    if (this.databaseLogger) {
      await this.databaseLogger(logEntry);
    }
  }

  sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }
    return Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [
            key,
            typeof value === 'object' ? JSON.stringify(value) : value
        ])
    );
  }

  sanitizeString(str) {
    return str.replace(/[<>]/g, '');
  }
}

const logger = new Logger();

export default logger;
export const initializeBrowserLogger = initializeLogger;
export { Logger };
export const setDatabaseLogger = logger.setDatabaseLogger.bind(logger);
