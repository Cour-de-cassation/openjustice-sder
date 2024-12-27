const pino = require("pino");
// Configuration pour Pino en local
const pinoPrettyConf = {
    transport: {
        target: "pino-pretty",
        options: {
            singleLine: true,
            colorize: true,
            translateTime: "SYS:dd-mm-yyyy - HH:MM:ss Z",
        },
    },
};

// Configuration principale pour Pino
const PinoConfig = {
    base: { appName: "OpenJustice-sder" },
    formatters: {
        level: (label) => ({
            logLevel: label.toUpperCase(),
        }),
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toLocaleString()}"`,
    redact: {
        paths: ["req", "res", "headers", "ip", "responseTime", "pid", "level"],
        censor: "",
        remove: true,
    },
    transport: process.env.NODE_ENV === "local" ? pinoPrettyConf.transport : undefined,
    autoLogging: false,
};

// Initialisation du logger Pino
const logger = pino(PinoConfig);

class CustomLog {
    // Méthode pour générer un objet de log structuré
    static createLog({
        operationName,
        msg,
        data,
        httpMethod,
        path,
        correlationId,
        statusCode,
    } = {}) {
        return {
            operationName,
            msg,
            data,
            httpMethod,
            path,
            correlationId,
            statusCode,
        };
    }

    // Méthode utilitaire pour journaliser avec un format structuré
    static log(level = "info", logDetails = {}) {
        const logEntry = this.createLog(logDetails);
        logger[level](logEntry);
    }
}

module.exports = { CustomLog };