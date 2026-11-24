import express from 'express';
import {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
} from '../controllers/branchController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getBranches)
  .post(authorize('Super Admin'), createBranch);

router
  .route('/:id')
  .get(getBranchById)
  .put(authorize('Super Admin', 'Branch Admin'), updateBranch)
  .delete(authorize('Super Admin'), deleteBranch);

export default router;
