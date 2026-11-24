import express from 'express';
import {
  getCustomerLedger,
  getSupplierLedger,
  getAccountsReceivable,
  getAccountsPayable,
  getProfitLoss,
} from '../controllers/financialReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/customer-ledger', getCustomerLedger);
router.get('/supplier-ledger', getSupplierLedger);
router.get('/accounts-receivable', getAccountsReceivable);
router.get('/accounts-payable', getAccountsPayable);
router.get('/profit-loss', authorize('Super Admin', 'Branch Admin', 'Accounts'), getProfitLoss);

export default router;
