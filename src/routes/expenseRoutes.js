import express from 'express';
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  voidExpense,
  getExpenseCategories,
  createExpenseCategory,
} from '../controllers/expenseController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/categories')
  .get(getExpenseCategories)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createExpenseCategory);

router.route('/')
  .get(getExpenses)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts', 'Operations'), createExpense);

router.route('/:id')
  .get(getExpenseById)
  .put(authorize('Super Admin', 'Branch Admin', 'Accounts'), updateExpense);

router.route('/:id/void')
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), voidExpense);

export default router;
