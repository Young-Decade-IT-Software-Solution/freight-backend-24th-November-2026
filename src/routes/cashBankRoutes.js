import express from 'express';
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  getAccountTransactions,
  adjustAccountBalance,
} from '../controllers/cashBankController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/accounts')
  .get(getAccounts)
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), createAccount);

router.route('/accounts/:id')
  .get(getAccountById)
  .put(authorize('Super Admin', 'Branch Admin'), updateAccount);

router.route('/accounts/:id/transactions')
  .get(getAccountTransactions);

router.route('/accounts/:id/adjust')
  .post(authorize('Super Admin', 'Branch Admin', 'Accounts'), adjustAccountBalance);

export default router;
