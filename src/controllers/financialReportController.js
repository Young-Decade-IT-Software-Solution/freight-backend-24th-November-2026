import Invoice from '../models/Invoice.js';
import CustomerReceipt from '../models/CustomerReceipt.js';
import Supplier from '../models/Supplier.js';
import SupplierBill from '../models/SupplierBill.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';
import { toCents, fromCents, roundMoney } from '../utils/financialCalculations.js';

// Helper to determine aging bucket given due date
const getAgingBucket = (dueDate) => {
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = now.getTime() - due.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'current';
  if (diffDays <= 30) return '1-30';
  if (diffDays <= 60) return '31-60';
  if (diffDays <= 90) return '61-90';
  return '90+';
};

// @desc    Customer Ledger Report
// @route   GET /api/reports/customer-ledger
// @access  Private
export const getCustomerLedger = async (req, res, next) => {
  try {
    const { customerId, startDate, endDate, currency } = req.query;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId query parameter is required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Branch check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (customer.branch && String(customer.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();

    // 1. Calculate opening balance (all transactions before start)
    const priorInvoices = await Invoice.find({
      customer: customerId,
      status: { $nin: ['Draft', 'Void'] },
      issueDate: { $lt: start },
      ...(currency ? { currency } : {}),
    });

    const priorReceipts = await CustomerReceipt.find({
      customer: customerId,
      status: { $ne: 'Void' },
      receiptDate: { $lt: start },
      ...(currency ? { currency } : {}),
    });

    let openingDebitCents = 0;
    priorInvoices.forEach((inv) => {
      openingDebitCents += toCents(inv.totalAmount);
    });

    let openingCreditCents = 0;
    priorReceipts.forEach((rec) => {
      if (rec.status === 'Reversed') {
        // reversed receipts do not reduce customer debt
      } else {
        openingCreditCents += toCents(rec.amount);
      }
    });

    const openingBalance = fromCents(openingDebitCents - openingCreditCents);

    // 2. Fetch period invoices
    const periodInvoices = await Invoice.find({
      customer: customerId,
      status: { $nin: ['Draft', 'Void'] },
      issueDate: { $gte: start, $lte: end },
      ...(currency ? { currency } : {}),
    }).sort({ issueDate: 1 });

    // 3. Fetch period receipts
    const periodReceipts = await CustomerReceipt.find({
      customer: customerId,
      status: { $ne: 'Void' },
      receiptDate: { $gte: start, $lte: end },
      ...(currency ? { currency } : {}),
    }).sort({ receiptDate: 1 });

    // Combine into chronological entries
    const entries = [];

    periodInvoices.forEach((inv) => {
      entries.push({
        date: inv.issueDate,
        transactionType: 'Invoice',
        referenceNumber: inv.invoiceNumber,
        referenceId: inv._id,
        description: `Invoice for ${inv.currency} ${inv.totalAmount} (${inv.paymentStatus})`,
        debit: inv.totalAmount,
        credit: 0,
        currency: inv.currency,
        createdAt: inv.createdAt,
      });
    });

    periodReceipts.forEach((rec) => {
      if (rec.status === 'Reversed') {
        // Original receipt
        entries.push({
          date: rec.receiptDate,
          transactionType: 'Receipt',
          referenceNumber: rec.receiptNumber,
          referenceId: rec._id,
          description: `Payment received (${rec.paymentMode})`,
          debit: 0,
          credit: rec.amount,
          currency: rec.currency,
          createdAt: rec.createdAt,
        });
        // Reversal entry
        entries.push({
          date: rec.reversedAt || rec.receiptDate,
          transactionType: 'Receipt Reversal',
          referenceNumber: `${rec.receiptNumber}-REV`,
          referenceId: rec._id,
          description: `Reversal: ${rec.reversalReason || 'Cancelled'}`,
          debit: rec.amount,
          credit: 0,
          currency: rec.currency,
          createdAt: rec.reversedAt || rec.updatedAt,
        });
      } else {
        entries.push({
          date: rec.receiptDate,
          transactionType: 'Receipt',
          referenceNumber: rec.receiptNumber,
          referenceId: rec._id,
          description: `Payment received via ${rec.paymentMode} - Ref: ${rec.referenceNumber || 'N/A'}`,
          debit: 0,
          credit: rec.amount,
          currency: rec.currency,
          createdAt: rec.createdAt,
        });
      }
    });

    // Sort all entries chronologically
    entries.sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

    // Calculate running balance
    let currentBalCents = toCents(openingBalance);
    let totalDebitCents = 0;
    let totalCreditCents = 0;

    const ledger = entries.map((entry) => {
      const dCents = toCents(entry.debit);
      const cCents = toCents(entry.credit);
      totalDebitCents += dCents;
      totalCreditCents += cCents;
      currentBalCents = currentBalCents + dCents - cCents;

      return {
        ...entry,
        runningBalance: fromCents(currentBalCents),
      };
    });

    const closingBalance = fromCents(currentBalCents);

    res.json({
      success: true,
      customer: {
        _id: customer._id,
        companyName: customer.companyName,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        preferredCurrency: customer.preferredCurrency,
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      summary: {
        openingBalance,
        totalDebit: fromCents(totalDebitCents),
        totalCredit: fromCents(totalCreditCents),
        closingBalance,
      },
      count: ledger.length,
      data: ledger,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Supplier Ledger Report
// @route   GET /api/reports/supplier-ledger
// @access  Private
export const getSupplierLedger = async (req, res, next) => {
  try {
    const { supplierId, startDate, endDate, currency } = req.query;
    if (!supplierId) {
      return res.status(400).json({ success: false, message: 'supplierId query parameter is required' });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (supplier.branch && String(supplier.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();

    // 1. Calculate opening balance (all transactions before start)
    const priorBills = await SupplierBill.find({
      supplier: supplierId,
      status: { $nin: ['Draft', 'Void'] },
      billDate: { $lt: start },
      ...(currency ? { currency } : {}),
    });

    const priorPayments = await SupplierPayment.find({
      supplier: supplierId,
      status: { $ne: 'Void' },
      paymentDate: { $lt: start },
      ...(currency ? { currency } : {}),
    });

    let openingBillCents = 0;
    priorBills.forEach((b) => {
      openingBillCents += toCents(b.totalAmount);
    });

    let openingPayCents = 0;
    priorPayments.forEach((p) => {
      if (p.status !== 'Reversed') {
        openingPayCents += toCents(p.amount);
      }
    });

    const openingBalance = fromCents(openingBillCents - openingPayCents);

    // 2. Fetch period bills
    const periodBills = await SupplierBill.find({
      supplier: supplierId,
      status: { $nin: ['Draft', 'Void'] },
      billDate: { $gte: start, $lte: end },
      ...(currency ? { currency } : {}),
    }).sort({ billDate: 1 });

    // 3. Fetch period payments
    const periodPayments = await SupplierPayment.find({
      supplier: supplierId,
      status: { $ne: 'Void' },
      paymentDate: { $gte: start, $lte: end },
      ...(currency ? { currency } : {}),
    }).sort({ paymentDate: 1 });

    const entries = [];

    periodBills.forEach((b) => {
      entries.push({
        date: b.billDate,
        transactionType: 'Supplier Bill',
        referenceNumber: b.billNumber,
        referenceId: b._id,
        description: `Bill ${b.vendorBillNumber ? `(${b.vendorBillNumber})` : ''} - ${b.currency} ${b.totalAmount}`,
        debit: 0,
        credit: b.totalAmount, // Increases payable
        currency: b.currency,
        createdAt: b.createdAt,
      });
    });

    periodPayments.forEach((p) => {
      if (p.status === 'Reversed') {
        entries.push({
          date: p.paymentDate,
          transactionType: 'Supplier Payment',
          referenceNumber: p.paymentNumber,
          referenceId: p._id,
          description: `Payment paid via ${p.paymentMode}`,
          debit: p.amount, // Clears payable
          credit: 0,
          currency: p.currency,
          createdAt: p.createdAt,
        });
        entries.push({
          date: p.reversedAt || p.paymentDate,
          transactionType: 'Payment Reversal',
          referenceNumber: `${p.paymentNumber}-REV`,
          referenceId: p._id,
          description: `Reversal: ${p.reversalReason || 'Cancelled'}`,
          debit: 0,
          credit: p.amount,
          currency: p.currency,
          createdAt: p.reversedAt || p.updatedAt,
        });
      } else {
        entries.push({
          date: p.paymentDate,
          transactionType: 'Supplier Payment',
          referenceNumber: p.paymentNumber,
          referenceId: p._id,
          description: `Payment paid via ${p.paymentMode} - Ref: ${p.referenceNumber || 'N/A'}`,
          debit: p.amount,
          credit: 0,
          currency: p.currency,
          createdAt: p.createdAt,
        });
      }
    });

    entries.sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

    let currentBalCents = toCents(openingBalance);
    let totalDebitCents = 0;
    let totalCreditCents = 0;

    const ledger = entries.map((entry) => {
      const dCents = toCents(entry.debit);
      const cCents = toCents(entry.credit);
      totalDebitCents += dCents;
      totalCreditCents += cCents;
      currentBalCents = currentBalCents + cCents - dCents;

      return {
        ...entry,
        runningBalance: fromCents(currentBalCents),
      };
    });

    const closingBalance = fromCents(currentBalCents);

    res.json({
      success: true,
      supplier: {
        _id: supplier._id,
        supplierCode: supplier.supplierCode,
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone,
        preferredCurrency: supplier.preferredCurrency,
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      summary: {
        openingBalance,
        totalBilled: fromCents(totalCreditCents),
        totalPaid: fromCents(totalDebitCents),
        closingBalance,
      },
      count: ledger.length,
      data: ledger,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accounts Receivable Aging Report
// @route   GET /api/reports/accounts-receivable
// @access  Private
export const getAccountsReceivable = async (req, res, next) => {
  try {
    let branchFilter = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      branchFilter.branch = userBranchId;
    } else if (req.query.branch) {
      branchFilter.branch = req.query.branch;
    }

    const invoices = await Invoice.find({
      ...branchFilter,
      status: { $in: ['Issued', 'Partially Paid', 'Overdue'] },
      balanceAmount: { $gt: 0 },
    })
      .populate('customer', 'companyName contactPerson email phone')
      .populate('branch', 'name code')
      .sort({ dueDate: 1 });

    const summaryByCurrency = {};
    const customerBreakdown = {};

    invoices.forEach((inv) => {
      const curr = inv.currency || 'USD';
      if (!summaryByCurrency[curr]) {
        summaryByCurrency[curr] = {
          totalOutstanding: 0,
          current: 0,
          '1-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
          invoiceCount: 0,
        };
      }

      const bucket = getAgingBucket(inv.dueDate);
      const balCents = toCents(inv.balanceAmount);

      summaryByCurrency[curr].totalOutstanding = fromCents(toCents(summaryByCurrency[curr].totalOutstanding) + balCents);
      summaryByCurrency[curr][bucket] = fromCents(toCents(summaryByCurrency[curr][bucket]) + balCents);
      summaryByCurrency[curr].invoiceCount += 1;

      const custId = inv.customer?._id?.toString() || 'unknown';
      if (!customerBreakdown[custId]) {
        customerBreakdown[custId] = {
          customerId: custId,
          customerName: inv.customer?.companyName || 'Unknown Customer',
          currency: curr,
          totalOutstanding: 0,
          current: 0,
          '1-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
          invoices: [],
        };
      }

      customerBreakdown[custId].totalOutstanding = fromCents(toCents(customerBreakdown[custId].totalOutstanding) + balCents);
      customerBreakdown[custId][bucket] = fromCents(toCents(customerBreakdown[custId][bucket]) + balCents);
      customerBreakdown[custId].invoices.push({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        currency: inv.currency,
        status: inv.status,
        bucket,
      });
    });

    res.json({
      success: true,
      summaryByCurrency,
      customerBreakdown: Object.values(customerBreakdown),
      totalInvoices: invoices.length,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accounts Payable Aging Report
// @route   GET /api/reports/accounts-payable
// @access  Private
export const getAccountsPayable = async (req, res, next) => {
  try {
    let branchFilter = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      branchFilter.branch = userBranchId;
    } else if (req.query.branch) {
      branchFilter.branch = req.query.branch;
    }

    const bills = await SupplierBill.find({
      ...branchFilter,
      status: { $in: ['Approved', 'Partially Paid', 'Overdue'] },
      balanceAmount: { $gt: 0 },
    })
      .populate('supplier', 'companyName contactPerson email phone')
      .populate('branch', 'name code')
      .sort({ dueDate: 1 });

    const summaryByCurrency = {};
    const supplierBreakdown = {};

    bills.forEach((bill) => {
      const curr = bill.currency || 'USD';
      if (!summaryByCurrency[curr]) {
        summaryByCurrency[curr] = {
          totalOutstanding: 0,
          current: 0,
          '1-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
          billCount: 0,
        };
      }

      const bucket = getAgingBucket(bill.dueDate);
      const balCents = toCents(bill.balanceAmount);

      summaryByCurrency[curr].totalOutstanding = fromCents(toCents(summaryByCurrency[curr].totalOutstanding) + balCents);
      summaryByCurrency[curr][bucket] = fromCents(toCents(summaryByCurrency[curr][bucket]) + balCents);
      summaryByCurrency[curr].billCount += 1;

      const supId = bill.supplier?._id?.toString() || 'unknown';
      if (!supplierBreakdown[supId]) {
        supplierBreakdown[supId] = {
          supplierId: supId,
          supplierName: bill.supplier?.companyName || 'Unknown Supplier',
          currency: curr,
          totalOutstanding: 0,
          current: 0,
          '1-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
          bills: [],
        };
      }

      supplierBreakdown[supId].totalOutstanding = fromCents(toCents(supplierBreakdown[supId].totalOutstanding) + balCents);
      supplierBreakdown[supId][bucket] = fromCents(toCents(supplierBreakdown[supId][bucket]) + balCents);
      supplierBreakdown[supId].bills.push({
        _id: bill._id,
        billNumber: bill.billNumber,
        vendorBillNumber: bill.vendorBillNumber,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        balanceAmount: bill.balanceAmount,
        currency: bill.currency,
        status: bill.status,
        bucket,
      });
    });

    res.json({
      success: true,
      summaryByCurrency,
      supplierBreakdown: Object.values(supplierBreakdown),
      totalBills: bills.length,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Basic Profit & Loss Report
// @route   GET /api/reports/profit-loss
// @access  Private
export const getProfitLoss = async (req, res, next) => {
  try {
    let branchFilter = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      branchFilter.branch = userBranchId;
    } else if (req.query.branch) {
      branchFilter.branch = req.query.branch;
    }

    const { startDate, endDate } = req.query;
    const dateQuery = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));

    // 1. Operating Income / Revenue (Invoices issued in date range)
    const invoiceQuery = {
      ...branchFilter,
      status: { $nin: ['Draft', 'Void'] },
    };
    if (startDate || endDate) invoiceQuery.issueDate = dateQuery;
    const invoices = await Invoice.find(invoiceQuery);

    const revenueByCurrency = {};
    invoices.forEach((inv) => {
      const curr = inv.currency || 'USD';
      revenueByCurrency[curr] = fromCents(toCents(revenueByCurrency[curr] || 0) + toCents(inv.totalAmount));
    });

    // 2. Direct Costs:
    // a. Supplier bills linked to shipments
    const billQuery = {
      ...branchFilter,
      shipment: { $ne: null },
      status: { $nin: ['Draft', 'Void'] },
    };
    if (startDate || endDate) billQuery.billDate = dateQuery;
    const directBills = await SupplierBill.find(billQuery);

    // b. Expenses linked to shipments
    const expenseDirectQuery = {
      ...branchFilter,
      shipment: { $ne: null },
      status: { $ne: 'Void' },
    };
    if (startDate || endDate) expenseDirectQuery.expenseDate = dateQuery;
    const directExpenses = await Expense.find(expenseDirectQuery);

    const directCostsByCurrency = {};
    directBills.forEach((b) => {
      const curr = b.currency || 'USD';
      directCostsByCurrency[curr] = fromCents(toCents(directCostsByCurrency[curr] || 0) + toCents(b.totalAmount));
    });
    directExpenses.forEach((e) => {
      const curr = e.currency || 'USD';
      directCostsByCurrency[curr] = fromCents(toCents(directCostsByCurrency[curr] || 0) + toCents(e.totalAmount));
    });

    // 3. Operating Expenses (Expenses not linked to shipments)
    const overheadQuery = {
      ...branchFilter,
      shipment: null,
      status: { $ne: 'Void' },
    };
    if (startDate || endDate) overheadQuery.expenseDate = dateQuery;
    const overheadExpenses = await Expense.find(overheadQuery);

    const overheadByCurrency = {};
    const overheadByCategory = {};

    overheadExpenses.forEach((e) => {
      const curr = e.currency || 'USD';
      overheadByCurrency[curr] = fromCents(toCents(overheadByCurrency[curr] || 0) + toCents(e.totalAmount));

      const cat = e.category || 'Other Expenses';
      overheadByCategory[cat] = fromCents(toCents(overheadByCategory[cat] || 0) + toCents(e.totalAmount));
    });

    // Calculate gross profit and net profit by currency
    const allCurrencies = Array.from(
      new Set([
        ...Object.keys(revenueByCurrency),
        ...Object.keys(directCostsByCurrency),
        ...Object.keys(overheadByCurrency),
      ])
    );

    const profitByCurrency = {};
    allCurrencies.forEach((curr) => {
      const rev = toCents(revenueByCurrency[curr] || 0);
      const direct = toCents(directCostsByCurrency[curr] || 0);
      const gross = rev - direct;
      const overhead = toCents(overheadByCurrency[curr] || 0);
      const net = gross - overhead;

      profitByCurrency[curr] = {
        currency: curr,
        revenue: fromCents(rev),
        directCosts: fromCents(direct),
        grossProfit: fromCents(gross),
        operatingExpenses: fromCents(overhead),
        netProfit: fromCents(net),
      };
    });

    res.json({
      success: true,
      period: { startDate: startDate || null, endDate: endDate || null },
      summary: profitByCurrency,
      details: {
        revenueByCurrency,
        directCostsByCurrency,
        overheadByCurrency,
        overheadByCategory,
        invoiceCount: invoices.length,
        directBillCount: directBills.length,
        directExpenseCount: directExpenses.length,
        overheadExpenseCount: overheadExpenses.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
