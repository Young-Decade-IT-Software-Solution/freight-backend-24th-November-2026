import express from 'express';
import {
  getReceipts,
  getReceiptById,
  createReceipt,
  reverseReceipt,
} from '../controllers/receiptController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getReceipts)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createReceipt);

router.get('/:id', getReceiptById);
router.post('/:id/reverse', authorize('Super Admin', 'Branch Admin', 'Accounts'), reverseReceipt);

export default router;
