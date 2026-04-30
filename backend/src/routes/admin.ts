import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import {
  login,
  logout,
  getStatus,
  getEntraConfigController,
  updateEntraConfigController,
  getAafConfigController,
  updateAafConfigController,
  getAafMfaConfigController,
  updateAafMfaConfigController,
  getSessions,
  getAuditLogsController,
  getAttributeMappingsController,
  updateAttributeMappingsController,
  getSystemInfo,
  getBackendLogsController,
} from '../controllers/admin';

const router = Router();

const backendLogsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', login);
router.post('/logout', logout);
router.get('/status', getStatus);

router.get('/config/entra', requireAuth, getEntraConfigController);
router.put('/config/entra', requireAuth, updateEntraConfigController);
router.get('/config/aaf', requireAuth, getAafConfigController);
router.put('/config/aaf', requireAuth, updateAafConfigController);
router.get('/config/aaf-mfa', requireAuth, getAafMfaConfigController);
router.put('/config/aaf-mfa', requireAuth, updateAafMfaConfigController);
router.get('/sessions', requireAuth, getSessions);
router.get('/audit-logs', requireAuth, getAuditLogsController);
router.get('/attribute-mappings', requireAuth, getAttributeMappingsController);
router.put('/attribute-mappings', requireAuth, updateAttributeMappingsController);
router.get('/system', requireAuth, getSystemInfo);
router.get('/backend-logs', requireAuth, backendLogsLimiter, getBackendLogsController);

export default router;
