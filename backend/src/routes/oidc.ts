import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  discovery,
  jwks,
  authorize,
  loginEntra,
  callbackEntra,
  callback,
  loginAaf,
  callbackAaf,
  token,
  userinfo,
  entraLogin,
} from '../controllers/oidcProvider';
import { entraEam } from '../controllers/entraEamController';

const router = Router();

const authFlowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// OIDC discovery
router.get('/.well-known/openid-configuration', discovery);
router.get('/.well-known/jwks.json', jwks);

// AAF-as-initiator step-up flow
// 1. AAF → /authorize → bridge validates, creates session, redirects to /login/entra
router.get('/authorize', authFlowLimiter, authorize);
router.post('/authorize', authFlowLimiter, authorize);
// 2. /login/entra → bridge redirects user to Entra ID
router.get('/login/entra', authFlowLimiter, loginEntra);
// 3. Entra → /callback/entra → bridge exchanges code, marks entra_verified, redirects to /login/aaf
router.get('/callback/entra', authFlowLimiter, callbackEntra);
// 4. /login/aaf → bridge redirects user to AAF for MFA
router.get('/login/aaf', authFlowLimiter, loginAaf);
// 5. AAF MFA → /callback/aaf → bridge validates MFA, issues auth code (or id_token for EAM), redirects
router.get('/callback/aaf', authFlowLimiter, callbackAaf);
// Backward-compatible alias for /callback/entra (for existing Entra app registrations)
router.get('/callback', authFlowLimiter, callback);

// Entra-as-initiator (External Authentication Method) flow
// Entra redirects the user here after first-factor authentication so the
// bridge can perform AAF MFA and return an id_token back to Entra.
router.get('/entra-eam', authFlowLimiter, entraEam);

// Token issuance and user info
router.post('/token', token);
router.get('/userinfo', userinfo);

// Removed implicit-flow bypass endpoint — returns 410 Gone
router.post('/entra-login', entraLogin);

export default router;
