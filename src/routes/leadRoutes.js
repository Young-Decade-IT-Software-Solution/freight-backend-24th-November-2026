import express from 'express';
import {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  convertLeadToCustomer,
} from '../controllers/leadController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getLeads)
  .post(authorize('Super Admin', 'Branch Admin', 'Sales'), createLead);

router
  .route('/:id')
  .get(getLeadById)
  .put(authorize('Super Admin', 'Branch Admin', 'Sales'), updateLead)
  .delete(authorize('Super Admin', 'Branch Admin'), deleteLead);

router.post(
  '/:id/convert',
  authorize('Super Admin', 'Branch Admin', 'Sales'),
  convertLeadToCustomer
);

export default router;
