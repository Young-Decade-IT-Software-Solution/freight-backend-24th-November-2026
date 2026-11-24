import express from 'express';
import {
  getSystemSettings,
  updateCompanySettings,
  updateFreightSettings,
  updateFinancialSettings,
  updateEmailSettings,
  testEmailDelivery,
  updateStorageSettings,
  getBranchSettings,
  updateBranchSettings,
  toggleBranchStatus,
} from '../controllers/settingController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('Super Admin', 'Branch Admin'), getSystemSettings);
router.put('/company', authorize('Super Admin'), updateCompanySettings);
router.put('/freight', authorize('Super Admin'), updateFreightSettings);
router.put('/financial', authorize('Super Admin'), updateFinancialSettings);
router.put('/email', authorize('Super Admin'), updateEmailSettings);
router.post('/email/test', authorize('Super Admin'), testEmailDelivery);
router.put('/storage', authorize('Super Admin'), updateStorageSettings);

// Branch settings
router.get('/branches', authorize('Super Admin', 'Branch Admin'), getBranchSettings);
router.put('/branches/:id', authorize('Super Admin', 'Branch Admin'), updateBranchSettings);
router.put('/branches/:id/toggle', authorize('Super Admin'), toggleBranchStatus);

export default router;
