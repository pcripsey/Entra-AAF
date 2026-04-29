import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  login,
  logout,
  getStatus,
  getEntraConfigController,
  updateEntraConfigController,
  getAafConfigController,
  updateAafConfigController,
  getSessions,
  getAuditLogsController,
  getAttributeMappingsController,
  updateAttributeMappingsController,
  getSystemInfo,
  getBackendLogsController,
} from '../controllers/admin';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/status', getStatus);

router.get('/config/entra', requireAuth, getEntraConfigController);
router.put('/config/entra', requireAuth, updateEntraConfigController);
router.get('/config/aaf', requireAuth, getAafConfigController);
router.put('/config/aaf', requireAuth, updateAafConfigController);
router.get('/sessions', requireAuth, getSessions);
router.get('/audit-logs', requireAuth, getAuditLogsController);
router.get('/attribute-mappings', requireAuth, getAttributeMappingsController);
router.put('/attribute-mappings', requireAuth, updateAttributeMappingsController);
router.get('/system', requireAuth, getSystemInfo);
router.get('/backend-logs', requireAuth, getBackendLogsController);

export default router;
