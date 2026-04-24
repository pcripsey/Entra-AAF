"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const express_session_1 = __importDefault(require("express-session"));
const config_1 = require("./config");
const database_1 = require("./models/database");
const jwks_1 = require("./utils/jwks");
const logger_1 = require("./utils/logger");
const oidc_1 = __importDefault(require("./routes/oidc"));
const admin_1 = __importDefault(require("./routes/admin"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, express_session_1.default)({
    secret: config_1.config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config_1.config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 10 * 60 * 1000,
    },
}));
app.use('/', oidc_1.default);
app.use('/api/admin', admin_1.default);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use(errorHandler_1.errorHandler);
async function start() {
    (0, database_1.initializeDatabase)();
    await (0, jwks_1.initializeKeys)();
    app.listen(config_1.config.port, () => {
        logger_1.logger.info(`Entra-AAF Bridge running on port ${config_1.config.port}`);
        logger_1.logger.info(`Base URL: ${config_1.config.baseUrl}`);
        logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
    });
}
start().catch((err) => {
    logger_1.logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
});
exports.default = app;
