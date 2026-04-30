import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { discovery, jwks, authorize, callback, token, userinfo, entraLogin } from '../controllers/oidcProvider';

const router = Router();

const entraLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/.well-known/openid-configuration', discovery);
router.get('/.well-known/jwks.json', jwks);
router.get('/authorize', authorize);
router.get('/callback', callback);
router.post('/token', token);
router.get('/userinfo', userinfo);
router.post('/entra-login', entraLoginLimiter, entraLogin);

export default router;
