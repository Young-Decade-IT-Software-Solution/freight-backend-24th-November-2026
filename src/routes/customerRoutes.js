import express from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getCustomers)
  .post(authorize('Super Admin', 'Branch Admin', 'Sales', 'Operations'), createCustomer);

router
  .route('/:id')
  .get(getCustomerById)
  .put(authorize('Super Admin', 'Branch Admin', 'Sales'), updateCustomer)
  .delete(authorize('Super Admin', 'Branch Admin'), deleteCustomer);

export default router;
