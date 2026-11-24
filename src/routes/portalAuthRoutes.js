import express from 'express';
import {
  portalLogin,
  getPortalMe,
  portalLogout,
  portalForgotPassword,
  portalResetPassword,
  verifyInvitationToken,
  acceptInvitation,
} from '../controllers/portalAuthController.js';
import { protectPortal } from '../middleware/portalAuth.js';

const router = express.Router();

router.post('/login', portalLogin);
router.post('/logout', portalLogout);
router.get('/me', protectPortal, getPortalMe);
router.post('/forgot-password', portalForgotPassword);
router.post('/reset-password', portalResetPassword);
router.get('/verify-invitation/:token', verifyInvitationToken);
router.post('/accept-invitation', acceptInvitation);

export default router;
