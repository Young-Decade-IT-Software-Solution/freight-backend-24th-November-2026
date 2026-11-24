import express from 'express';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  issueInvoice,
  voidInvoice,
  generateInvoicePdf,
  sendInvoiceEmail,
} from '../controllers/invoiceController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getInvoices)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createInvoice);

router
  .route('/:id')
  .get(getInvoiceById)
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), updateInvoice);

router.route('/:id/issue')
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), issueInvoice)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), issueInvoice);

router.route('/:id/void')
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), voidInvoice)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), voidInvoice);
router.get('/:id/pdf', generateInvoicePdf);
router.post('/:id/send-email', authorize('Super Admin', 'Branch Admin', 'Accounts'), sendInvoiceEmail);

export default router;
