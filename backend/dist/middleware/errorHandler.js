"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, next) {
    logger_1.logger.error(`Unhandled error: ${err.message}\n${err.stack}`);
    if (res.headersSent) {
        next(err);
        return;
    }
    res.status(500).json({
        error: 'internal_server_error',
        error_description: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred',
    });
}
