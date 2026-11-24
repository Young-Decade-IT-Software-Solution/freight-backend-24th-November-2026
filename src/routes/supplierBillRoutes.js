import express from 'express';
import {
  getSupplierBills,
  getSupplierBillById,
  createSupplierBill,
  updateSupplierBill,
  recordSupplierBill,
  voidSupplierBill,
} from '../controllers/supplierBillController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getSupplierBills)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createSupplierBill);

router
  .route('/:id')
  .get(getSupplierBillById)
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), updateSupplierBill);

router.route('/:id/record')
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), recordSupplierBill)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), recordSupplierBill);

router.route('/:id/approve')
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), recordSupplierBill)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), recordSupplierBill);

router.route('/:id/void')
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), voidSupplierBill)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), voidSupplierBill);

export default router;
