const pino = require('pino');
// Configuration pour Pino en local
const pinoPrettyConf = {
  transport: {
    target: 'pino-pretty',
    options: {
      singleLine: true,
      colorize: true,
      translateTime: 'SYS:dd-mm-yyyy - HH:MM:ss Z',
    },
  },
};

// Configuration principale pour Pino
const PinoConfig = {
  base: { appName: 'OpenJustice-sder' },
  formatters: {
    level: (label) => ({
      logLevel: label.toUpperCase(),
    }),
  },
  timestamp: () => `,"timestamp":"${new Date(Date.now()).toLocaleString()}"`,
  redact: {
    paths: ['req', 'res', 'headers', 'ip', 'responseTime', 'pid', 'level'],
    censor: '',
    remove: true,
  },
  transport: process.env.NODE_ENV === 'local' ? pinoPrettyConf.transport : undefined,
  autoLogging: false,
};

// Initialisation du logger Pino
const logger = pino(PinoConfig);
// types definition for log details
/**
 * @typedef {Object} DecisionLog
 * @property {Object} decision
 * @property {string} [decision._id]
 * @property {string} decision.sourceId
 * @property {string} decision.sourceName
 * @property {string} [decision.publishStatus]
 * @property {string} [decision.labelStatus]
 * @property {string} [decision.jurisdictionId]
 * @property {string} [decision.jurisdictionName]
 * @property {string} path
 * @property {[('collect'|'extraction'|'normalization'|'other'), string]} operations
 * @property {string} [message]
 */

/**
 * @typedef {Object} TechLog
 * @property {string} path
 * @property {[('collect'|'extraction'|'normalization'|'other'), string]} operations
 * @property {string} [message]
 */

class CustomLog {
  /**
   * @param {DecisionLog | TechLog} data
   */
  static info(data) {
    logger.info(data);
  }

  /**
   * @param {TechLog & {stack?: string}} data
   */
  static error(data) {
    logger.error(data);
  }

  /**
   * @param {DecisionLog | TechLog} data
   */
  static warn(data) {
    logger.warn(data);
  }
}

module.exports = { CustomLog, logger };
