import express from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getUsers)
  .post(authorize('Super Admin', 'Branch Admin'), createUser);

router
  .route('/:id')
  .get(getUserById)
  .put(authorize('Super Admin', 'Branch Admin'), updateUser)
  .delete(authorize('Super Admin'), deleteUser);

export default router;
