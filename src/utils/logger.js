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

class LogsFormat {
    constructor({
        operationName,
        msg,
        data,
        httpMethod = null,
        path = null,
        correlationId = null,
        statusCode = null
    }) {
        this.operationName = operationName;
        this.msg = msg;
        this.data = data;
        this.httpMethod = httpMethod || "no httpMethod";
        this.path = path || "no path";
        this.correlationId = correlationId || "no correlationId";
        this.statusCode = statusCode || "no statusCode";
    }


    // Method to update all log attributes dynamically
    updateLogDetails({
        operationName,
        msg,
        data,
        httpMethod,
        path,
        correlationId,
        statusCode
    }) {
        if (operationName) this.operationName = operationName;
        if (msg) this.msg = msg;
        if (data) this.data = data;
        if (httpMethod) this.httpMethod = httpMethod;
        if (path) this.path = path;
        if (correlationId) this.correlationId = correlationId;
        if (statusCode) this.statusCode = statusCode;
    }

    // Utility function to log with structured format
    log(level = "info") {
        const { operationName, msg, correlationId, ...rest } = this;

        // Log the details using pino logger at the given level
        logger[level]({
            operationName,
            msg,
            correlationId,
            ...rest
        });
    }
}

module.exports = { LogsFormat };