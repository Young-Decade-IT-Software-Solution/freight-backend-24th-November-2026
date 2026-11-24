import express from 'express';
import {
  getPortalAccounts,
  inviteCustomerUser,
  resendInvitation,
  updateCustomerUserStatus,
  deleteCustomerUser,
} from '../controllers/portalAccountAdminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(authorize('Super Admin', 'Branch Admin', 'Sales'), getPortalAccounts)
  .post(authorize('Super Admin', 'Branch Admin', 'Sales'), inviteCustomerUser);

router.post('/invite', authorize('Super Admin', 'Branch Admin', 'Sales'), inviteCustomerUser);
router.post('/:id/resend', authorize('Super Admin', 'Branch Admin', 'Sales'), resendInvitation);
router.put('/:id/status', authorize('Super Admin', 'Branch Admin'), updateCustomerUserStatus);
router.delete('/:id', authorize('Super Admin', 'Branch Admin'), deleteCustomerUser);

export default router;
