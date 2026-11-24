import express from 'express';
import {
  getShipments,
  getShipmentById,
  createShipment,
  updateShipment,
  deleteShipment,
  updateShipmentStatus,
  getShipmentMilestones,
  createShipmentMilestone,
  updateShipmentMilestone,
  getShipmentDocuments,
  uploadShipmentDocument,
  downloadShipmentDocument,
  deleteShipmentDocument,
  getShipmentActivities,
  exportShipmentsCsv,
} from '../controllers/shipmentController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';
import { documentUpload } from '../config/multer.js';

const router = express.Router();

router.use(protect);

// CSV Export
router.get('/export/csv', exportShipmentsCsv);

// Collection endpoints
router
  .route('/')
  .get(getShipments)
  .post(authorize('Super Admin', 'Branch Admin', 'Operations'), createShipment);

// Single Shipment endpoints
router
  .route('/:id')
  .get(getShipmentById)
  .put(authorize('Super Admin', 'Branch Admin', 'Operations'), updateShipment)
  .delete(authorize('Super Admin', 'Branch Admin'), deleteShipment);

// Status Update
router.put(
  '/:id/status',
  authorize('Super Admin', 'Branch Admin', 'Operations'),
  updateShipmentStatus
);

// Milestone endpoints
router
  .route('/:id/milestones')
  .get(getShipmentMilestones)
  .post(authorize('Super Admin', 'Branch Admin', 'Operations'), createShipmentMilestone);

router.put(
  '/:id/milestones/:milestoneId',
  authorize('Super Admin', 'Branch Admin', 'Operations'),
  updateShipmentMilestone
);

// Document endpoints
router
  .route('/:id/documents')
  .get(getShipmentDocuments)
  .post(
    authorize('Super Admin', 'Branch Admin', 'Operations'),
    documentUpload.single('file'),
    uploadShipmentDocument
  );

router.get('/:id/documents/:documentId/download', downloadShipmentDocument);

router.delete(
  '/:id/documents/:documentId',
  authorize('Super Admin', 'Branch Admin', 'Operations'),
  deleteShipmentDocument
);

// Audit / Activity log
router.get('/:id/activities', getShipmentActivities);

export default router;
