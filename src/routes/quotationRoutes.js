import express from 'express';
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  updateQuotationStatus,
  duplicateQuotation,
  convertToShipment,
  generateQuotationPdf,
  sendQuotationEmail,
} from '../controllers/quotationController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getQuotations)
  .post(authorize('Super Admin', 'Branch Admin', 'Sales'), createQuotation);

router
  .route('/:id')
  .get(getQuotationById)
  .put(authorize('Super Admin', 'Branch Admin', 'Sales'), updateQuotation)
  .delete(authorize('Super Admin', 'Branch Admin'), deleteQuotation);

router.patch(
  '/:id/status',
  authorize('Super Admin', 'Branch Admin', 'Sales'),
  updateQuotationStatus
);

router.post(
  '/:id/duplicate',
  authorize('Super Admin', 'Branch Admin', 'Sales'),
  duplicateQuotation
);

router.post(
  '/:id/convert-to-shipment',
  authorize('Super Admin', 'Branch Admin', 'Operations', 'Sales'),
  convertToShipment
);

router.get('/:id/pdf', generateQuotationPdf);
router.post('/:id/send-email', sendQuotationEmail);

export default router;
