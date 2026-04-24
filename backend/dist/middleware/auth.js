"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
function requireAuth(req, res, next) {
    const sess = req.session;
    if (sess.authenticated) {
        next();
    }
    else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}
