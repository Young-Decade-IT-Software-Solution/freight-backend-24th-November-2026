import express from 'express';
import {
  getSalesSummary,
  getQuotationRegister,
  getCustomerWiseSales,
  getBranchWiseSales,
  getFreightModeSales,
  getShipmentRegister,
  getShipmentOperationsSummary,
  getTradeLanesReport,
  getCustomerDirectoryReport,
  getInvoiceRegisterReport,
  getCustomerReceiptsRegister,
  getExpensesSummaryReport,
  getCashBankSummaryReport,
  exportReportCsv,
} from '../controllers/reportController.js';

// Retain Phase 4 Financial Reports
import {
  getCustomerLedger,
  getSupplierLedger,
  getAccountsReceivable,
  getAccountsPayable,
  getProfitLoss,
} from '../controllers/financialReportController.js';

import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All reporting routes strictly protected by internal ERP JWT
router.use(protect);

// 1. Sales & Quotation Reports
router.get('/sales-summary', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getSalesSummary);
router.get('/quotations-register', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getQuotationRegister);
router.get('/sales-by-customer', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getCustomerWiseSales);
router.get('/sales-by-branch', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getBranchWiseSales);
router.get('/sales-by-freight-mode', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getFreightModeSales);

// 2. Shipment & Operations Reports
router.get('/shipments-register', authorize('Super Admin', 'Branch Admin', 'Operations', 'Sales', 'Accounts'), getShipmentRegister);
router.get('/shipments-summary', authorize('Super Admin', 'Branch Admin', 'Operations', 'Accounts'), getShipmentOperationsSummary);
router.get('/trade-lanes', authorize('Super Admin', 'Branch Admin', 'Operations', 'Sales', 'Accounts'), getTradeLanesReport);

// 3. Customer Reports
router.get('/customers-directory', authorize('Super Admin', 'Branch Admin', 'Sales', 'Accounts'), getCustomerDirectoryReport);

// 4. Financial Reports & Registers
router.get('/invoices-register', authorize('Super Admin', 'Branch Admin', 'Accounts'), getInvoiceRegisterReport);
router.get('/receipts-register', authorize('Super Admin', 'Branch Admin', 'Accounts'), getCustomerReceiptsRegister);
router.get('/expenses-summary', authorize('Super Admin', 'Branch Admin', 'Accounts'), getExpensesSummaryReport);
router.get('/cash-bank-summary', authorize('Super Admin', 'Branch Admin', 'Accounts'), getCashBankSummaryReport);
router.get('/customer-ledger', authorize('Super Admin', 'Branch Admin', 'Accounts', 'Sales'), getCustomerLedger);
router.get('/supplier-ledger', authorize('Super Admin', 'Branch Admin', 'Accounts'), getSupplierLedger);
router.get('/accounts-receivable', authorize('Super Admin', 'Branch Admin', 'Accounts'), getAccountsReceivable);
router.get('/accounts-payable', authorize('Super Admin', 'Branch Admin', 'Accounts'), getAccountsPayable);
router.get('/profit-loss', authorize('Super Admin', 'Branch Admin', 'Accounts'), getProfitLoss);

// 5. Universal Exports
router.get('/export/csv', exportReportCsv);

export default router;
