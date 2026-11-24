import express from 'express';
import {
  getPortalDashboard,
  getPortalQuotations,
  getPortalQuotationById,
  downloadPortalQuotationPdf,
  acceptPortalQuotation,
  rejectPortalQuotation,
  getPortalShipments,
  getPortalShipmentById,
  getPortalShipmentMilestones,
  getPortalDocuments,
  downloadPortalDocument,
  getPortalInvoices,
  getPortalInvoiceById,
  downloadPortalInvoicePdf,
  getPortalReceipts,
  getPortalProfile,
  updatePortalProfile,
  changePortalPassword,
} from '../controllers/portalDataController.js';
import { protectPortal } from '../middleware/portalAuth.js';

const router = express.Router();

// All routes here strictly protected by customer portal JWT
router.use(protectPortal);

// 1. Dashboard
router.get('/dashboard', getPortalDashboard);

// 2. Quotations
router.get('/quotations', getPortalQuotations);
router.get('/quotations/:id', getPortalQuotationById);
router.get('/quotations/:id/pdf', downloadPortalQuotationPdf);
router.post('/quotations/:id/accept', acceptPortalQuotation);
router.post('/quotations/:id/reject', rejectPortalQuotation);

// 3. Shipments & Tracking
router.get('/shipments', getPortalShipments);
router.get('/shipments/:id', getPortalShipmentById);
router.get('/shipments/:id/milestones', getPortalShipmentMilestones);

// 4. Documents Repository
router.get('/documents', getPortalDocuments);
router.get('/documents/:id/download', downloadPortalDocument);

// 5. Invoices & Receipts
router.get('/invoices', getPortalInvoices);
router.get('/invoices/:id', getPortalInvoiceById);
router.get('/invoices/:id/pdf', downloadPortalInvoicePdf);
router.get('/receipts', getPortalReceipts);

// 6. Customer User Profile
router.get('/profile', getPortalProfile);
router.put('/profile', updatePortalProfile);
router.put('/profile/password', changePortalPassword);

export default router;
