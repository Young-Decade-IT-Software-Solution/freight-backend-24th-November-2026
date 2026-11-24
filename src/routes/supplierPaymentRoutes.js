import express from 'express';
import {
  getSupplierPayments,
  getSupplierPaymentById,
  createSupplierPayment,
  reverseSupplierPayment,
} from '../controllers/supplierPaymentController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getSupplierPayments)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createSupplierPayment);

router.get('/:id', getSupplierPaymentById);
router.post('/:id/reverse', authorize('Super Admin', 'Branch Admin', 'Accounts'), reverseSupplierPayment);

export default router;
