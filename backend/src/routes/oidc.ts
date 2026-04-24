import { Router } from 'express';
import { discovery, jwks, authorize, callback, token, userinfo } from '../controllers/oidcProvider';

const router = Router();

router.get('/.well-known/openid-configuration', discovery);
router.get('/.well-known/jwks.json', jwks);
router.get('/authorize', authorize);
router.get('/callback', callback);
router.post('/token', token);
router.get('/userinfo', userinfo);

export default router;
