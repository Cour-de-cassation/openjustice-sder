// logsFormat.js
const pino = require("pino");
// Initialize Pino with a transport configuration for pretty logs
const logger = pino({
    transport: {
        target: "pino-pretty",
        options: {
            singleLine: true,
            colorize: true,
            translateTime: 'UTC:dd-mm-yyyy - HH:MM:ss Z',
        },
    },
});

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