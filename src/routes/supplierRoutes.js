import express from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
} from '../controllers/supplierController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getSuppliers)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createSupplier);

router
  .route('/:id')
  .get(getSupplierById)
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), updateSupplier);

export default router;
