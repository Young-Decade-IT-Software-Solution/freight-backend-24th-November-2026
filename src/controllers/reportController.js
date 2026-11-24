import PDFDocument from 'pdfkit';
import Shipment from '../models/Shipment.js';
import Quotation from '../models/Quotation.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import CustomerReceipt from '../models/CustomerReceipt.js';
import SupplierBill from '../models/SupplierBill.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Expense from '../models/Expense.js';
import CashBankAccount from '../models/CashBankAccount.js';
import Branch from '../models/Branch.js';
import ExchangeRate from '../models/ExchangeRate.js';

// =========================================================================
// HELPER: UNIVERSAL REPORT FILTER & ROLE / BRANCH ENFORCEMENT
// =========================================================================
export const buildReportFilter = (req, dateField = 'createdAt') => {
  const filter = {};
  const { startDate, endDate, branch, freightMode, customer, status, currency } = req.query;

  // Branch isolation
  if (req.user.role !== 'Super Admin') {
    const userBranchId = req.user.branch?._id || req.user.branch;
    filter.branch = userBranchId;
  } else if (branch && branch !== 'ALL') {
    filter.branch = branch;
  }

  // Date range
  if (startDate || endDate) {
    filter[dateField] = {};
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      filter[dateField].$gte = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      filter[dateField].$lte = e;
    }
  }

  // Freight mode
  if (freightMode && freightMode !== 'ALL') {
    filter.freightType = freightMode;
  }

  // Customer
  if (customer && customer !== 'ALL') {
    filter.customer = customer;
  }

  // Status
  if (status && status !== 'ALL') {
    filter.status = status;
  }

  // Currency
  if (currency && currency !== 'ALL') {
    filter.currency = currency;
  }

  return filter;
};

// =========================================================================
// 1. SALES REPORTS
// =========================================================================

// @desc    Get Sales & Quotation Executive Summary
// @route   GET /api/reports/sales-summary
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getSalesSummary = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');

    // Quotations
    const quotations = await Quotation.find(filter).populate('customer', 'companyName').populate('branch', 'name code');
    const totalQuotations = quotations.length;
    let totalQuoteValue = 0;
    let acceptedValue = 0;
    let rejectedValue = 0;
    let pendingValue = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;

    quotations.forEach((q) => {
      const val = q.totalAmount || 0;
      totalQuoteValue += val;
      if (q.status === 'Accepted') {
        acceptedValue += val;
        acceptedCount++;
      } else if (q.status === 'Rejected') {
        rejectedValue += val;
        rejectedCount++;
      } else {
        pendingValue += val;
        pendingCount++;
      }
    });

    const conversionRate = totalQuotations > 0 ? ((acceptedCount / totalQuotations) * 100).toFixed(1) : 0;

    // Actual invoiced revenue (Non-Draft invoices)
    const invFilter = buildReportFilter(req, 'invoiceDate');
    invFilter.status = { $in: ['Issued', 'Partially Paid', 'Paid', 'Overdue'] };
    const invoices = await Invoice.find(invFilter);
    const invoicedRevenue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const collectedRevenue = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const outstandingReceivables = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

    res.json({
      success: true,
      data: {
        kpis: {
          totalQuotations,
          totalQuoteValue,
          acceptedCount,
          acceptedValue,
          rejectedCount,
          rejectedValue,
          pendingCount,
          pendingValue,
          conversionRate: Number(conversionRate),
          invoicedRevenue,
          collectedRevenue,
          outstandingReceivables,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Quotation Register (Tabular Listing)
// @route   GET /api/reports/quotations-register
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getQuotationRegister = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const quotations = await Quotation.find(filter)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: quotations.length,
      data: quotations,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Customer-wise Sales Report
// @route   GET /api/reports/sales-by-customer
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getCustomerWiseSales = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const quotations = await Quotation.find(filter).populate('customer', 'customerCode companyName');

    const customerMap = {};
    quotations.forEach((q) => {
      const custId = q.customer?._id?.toString() || 'unknown';
      const custName = q.customer?.companyName || 'Unknown Customer';
      const custCode = q.customer?.customerCode || 'N/A';

      if (!customerMap[custId]) {
        customerMap[custId] = {
          customerId: custId,
          customerName: custName,
          customerCode: custCode,
          quotationCount: 0,
          totalQuoteValue: 0,
          acceptedCount: 0,
          acceptedValue: 0,
          currency: q.currency || 'USD',
        };
      }

      customerMap[custId].quotationCount++;
      customerMap[custId].totalQuoteValue += q.totalAmount || 0;
      if (q.status === 'Accepted') {
        customerMap[custId].acceptedCount++;
        customerMap[custId].acceptedValue += q.totalAmount || 0;
      }
    });

    const list = Object.values(customerMap).sort((a, b) => b.acceptedValue - a.acceptedValue);

    res.json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Branch-wise Sales Report
// @route   GET /api/reports/sales-by-branch
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getBranchWiseSales = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const quotations = await Quotation.find(filter).populate('branch', 'name code city country');

    const branchMap = {};
    quotations.forEach((q) => {
      const bId = q.branch?._id?.toString() || 'unknown';
      const bName = q.branch?.name || 'Head Office';
      const bCode = q.branch?.code || 'HQ';

      if (!branchMap[bId]) {
        branchMap[bId] = {
          branchId: bId,
          branchName: bName,
          branchCode: bCode,
          quotationCount: 0,
          totalQuoteValue: 0,
          acceptedCount: 0,
          acceptedValue: 0,
          currency: q.currency || 'USD',
        };
      }

      branchMap[bId].quotationCount++;
      branchMap[bId].totalQuoteValue += q.totalAmount || 0;
      if (q.status === 'Accepted') {
        branchMap[bId].acceptedCount++;
        branchMap[bId].acceptedValue += q.totalAmount || 0;
      }
    });

    const list = Object.values(branchMap).sort((a, b) => b.acceptedValue - a.acceptedValue);

    res.json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Freight Mode-wise Sales Report
// @route   GET /api/reports/sales-by-freight-mode
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getFreightModeSales = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const quotations = await Quotation.find(filter);

    const modeMap = {};
    quotations.forEach((q) => {
      const mode = q.freightType || 'Other';
      if (!modeMap[mode]) {
        modeMap[mode] = {
          mode,
          quoteCount: 0,
          totalQuoteValue: 0,
          acceptedCount: 0,
          acceptedValue: 0,
        };
      }
      modeMap[mode].quoteCount++;
      modeMap[mode].totalQuoteValue += q.totalAmount || 0;
      if (q.status === 'Accepted') {
        modeMap[mode].acceptedCount++;
        modeMap[mode].acceptedValue += q.totalAmount || 0;
      }
    });

    const list = Object.values(modeMap).sort((a, b) => b.totalQuoteValue - a.totalQuoteValue);

    res.json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// 2. SHIPMENT & OPERATIONS REPORTS
// =========================================================================

// @desc    Get Shipment Register (Tabular Listing)
// @route   GET /api/reports/shipments-register
// @access  Private (Super Admin, Branch Admin, Operations, Sales, Accounts)
export const getShipmentRegister = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const shipments = await Shipment.find(filter)
      .populate('customer', 'customerCode companyName')
      .populate('branch', 'name code')
      .select('-internalRemarks')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Shipment Operations Summary & Breakdown
// @route   GET /api/reports/shipments-summary
// @access  Private (Super Admin, Branch Admin, Operations, Accounts)
export const getShipmentOperationsSummary = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const shipments = await Shipment.find(filter).select('-internalRemarks');

    let total = shipments.length;
    let active = 0;
    let delivered = 0;
    let inTransit = 0;
    let booked = 0;
    let customs = 0;
    let delayed = 0;
    let cancelled = 0;

    const statusCounts = {};

    shipments.forEach((s) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
      if (s.status === 'Delivered') delivered++;
      else if (s.status === 'Cancelled') cancelled++;
      else active++;

      if (s.status === 'In Transit') inTransit++;
      if (s.status === 'Booked') booked++;
      if (s.status === 'Customs Clearance') customs++;
      if (s.status === 'On Hold') delayed++;
    });

    res.json({
      success: true,
      data: {
        kpis: {
          totalShipments: total,
          activeShipments: active,
          deliveredShipments: delivered,
          inTransitShipments: inTransit,
          bookedShipments: booked,
          customsClearanceShipments: customs,
          delayedShipments: delayed,
          cancelledShipments: cancelled,
        },
        statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Top Trade Lanes (Origin - Destination Summary)
// @route   GET /api/reports/trade-lanes
// @access  Private (Super Admin, Branch Admin, Operations)
export const getTradeLanesReport = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'createdAt');
    const shipments = await Shipment.find(filter);

    const laneMap = {};
    shipments.forEach((s) => {
      const lane = `${s.origin} → ${s.destination}`;
      if (!laneMap[lane]) {
        laneMap[lane] = {
          lane,
          origin: s.origin,
          destination: s.destination,
          shipmentCount: 0,
          totalWeight: 0,
          totalVolume: 0,
          freightModes: new Set(),
        };
      }
      laneMap[lane].shipmentCount++;
      laneMap[lane].totalWeight += s.weight || 0;
      laneMap[lane].totalVolume += s.volume || 0;
      laneMap[lane].freightModes.add(s.freightType);
    });

    const list = Object.values(laneMap)
      .map((item) => ({ ...item, freightModes: Array.from(item.freightModes) }))
      .sort((a, b) => b.shipmentCount - a.shipmentCount)
      .slice(0, 15);

    res.json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// 3. CUSTOMER REPORTS
// =========================================================================

// @desc    Get Customer Directory Master Report
// @route   GET /api/reports/customers-directory
// @access  Private (Super Admin, Branch Admin, Sales, Accounts)
export const getCustomerDirectoryReport = async (req, res, next) => {
  try {
    const custFilter = {};
    if (req.user.role !== 'Super Admin') {
      custFilter.branch = req.user.branch?._id || req.user.branch;
    } else if (req.query.branch && req.query.branch !== 'ALL') {
      custFilter.branch = req.query.branch;
    }

    const customers = await Customer.find(custFilter).populate('branch', 'name code').sort({ companyName: 1 });

    // Fetch aggregates for all customers
    const customerIds = customers.map((c) => c._id);

    const [shipmentCounts, invoiceAggregates] = await Promise.all([
      Shipment.aggregate([
        { $match: { customer: { $in: customerIds } } },
        { $group: { _id: '$customer', count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { customer: { $in: customerIds }, status: { $ne: 'Draft' } } },
        {
          $group: {
            _id: '$customer',
            totalInvoiced: { $sum: '$totalAmount' },
            totalBalance: { $sum: '$balanceAmount' },
          },
        },
      ]),
    ]);

    const shipMap = {};
    shipmentCounts.forEach((s) => (shipMap[s._id.toString()] = s.count));

    const invMap = {};
    invoiceAggregates.forEach((i) => {
      invMap[i._id.toString()] = {
        totalInvoiced: i.totalInvoiced || 0,
        totalBalance: i.totalBalance || 0,
      };
    });

    const list = customers.map((c) => {
      const cId = c._id.toString();
      return {
        _id: c._id,
        customerCode: c.customerCode,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        email: c.email,
        phone: c.phone,
        country: c.country,
        currency: c.currency,
        branch: c.branch?.name || 'Main Hub',
        totalShipments: shipMap[cId] || 0,
        totalInvoiced: invMap[cId]?.totalInvoiced || 0,
        outstandingBalance: invMap[cId]?.totalBalance || 0,
      };
    });

    res.json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// 4. FINANCIAL REGISTERS (Invoice Register, Receipt Register, Expense Summary)
// =========================================================================

// @desc    Get Invoice Register Report
// @route   GET /api/reports/invoices-register
// @access  Private (Super Admin, Branch Admin, Accounts)
export const getInvoiceRegisterReport = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'invoiceDate');
    const invoices = await Invoice.find(filter)
      .populate('customer', 'customerCode companyName')
      .populate('branch', 'name code')
      .populate('shipment', 'shipmentNumber origin destination')
      .sort({ invoiceDate: -1 });

    res.json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Customer Receipts Register Report
// @route   GET /api/reports/receipts-register
// @access  Private (Super Admin, Branch Admin, Accounts)
export const getCustomerReceiptsRegister = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'receiptDate');
    const receipts = await CustomerReceipt.find(filter)
      .populate('customer', 'customerCode companyName')
      .populate('branch', 'name code')
      .populate('account', 'accountName bankName')
      .sort({ receiptDate: -1 });

    res.json({
      success: true,
      count: receipts.length,
      data: receipts,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Expenses Summary Report
// @route   GET /api/reports/expenses-summary
// @access  Private (Super Admin, Branch Admin, Accounts)
export const getExpensesSummaryReport = async (req, res, next) => {
  try {
    const filter = buildReportFilter(req, 'expenseDate');
    const expenses = await Expense.find(filter)
      .populate('branch', 'name code')
      .sort({ expenseDate: -1 });

    let totalExpense = 0;
    const categoryMap = {};

    expenses.forEach((exp) => {
      totalExpense += exp.amount || 0;
      const catName = exp.category || 'Uncategorized';
      categoryMap[catName] = (categoryMap[catName] || 0) + (exp.amount || 0);
    });

    res.json({
      success: true,
      count: expenses.length,
      data: {
        totalExpense,
        categoryBreakdown: Object.entries(categoryMap).map(([category, amount]) => ({ category, amount })),
        expenses,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Cash & Bank Accounts Summary Report
// @route   GET /api/reports/cash-bank-summary
// @access  Private (Super Admin, Branch Admin, Accounts)
export const getCashBankSummaryReport = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'Super Admin') {
      filter.branch = req.user.branch?._id || req.user.branch;
    } else if (req.query.branch && req.query.branch !== 'ALL') {
      filter.branch = req.query.branch;
    }

    const accounts = await CashBankAccount.find(filter).populate('branch', 'name code');
    const totalCash = accounts.filter((a) => a.accountType === 'Cash').reduce((s, a) => s + (a.currentBalance || 0), 0);
    const totalBank = accounts.filter((a) => a.accountType === 'Bank').reduce((s, a) => s + (a.currentBalance || 0), 0);

    res.json({
      success: true,
      count: accounts.length,
      data: {
        totalCash,
        totalBank,
        totalLiquidity: totalCash + totalBank,
        accounts,
      },
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// 5. UNIVERSAL REPORT EXPORTS (CSV & PDF)
// =========================================================================

// @desc    Export Report Data to CSV
// @route   GET /api/reports/export/csv
// @access  Private
export const exportReportCsv = async (req, res, next) => {
  try {
    const { reportType } = req.query;
    let csvData = '';
    let filename = `Report_${reportType || 'Export'}_${Date.now()}.csv`;

    if (reportType === 'quotations') {
      const filter = buildReportFilter(req, 'createdAt');
      const items = await Quotation.find(filter).populate('customer', 'companyName').populate('branch', 'code');
      csvData = 'Quotation Number,Customer,Origin,Destination,Freight Mode,Total Amount,Currency,Status,Date\n';
      items.forEach((q) => {
        csvData += `"${q.quotationNumber}","${q.customer?.companyName || ''}","${q.origin}","${q.destination}","${q.freightType}",${q.totalAmount},"${q.currency}","${q.status}","${new Date(q.createdAt).toISOString().split('T')[0]}"\n`;
      });
    } else if (reportType === 'shipments') {
      const filter = buildReportFilter(req, 'createdAt');
      const items = await Shipment.find(filter).populate('customer', 'companyName').select('-internalRemarks');
      csvData = 'Shipment Number,Customer,Origin,Destination,Freight Mode,Weight,Volume,Status,Booking Date\n';
      items.forEach((s) => {
        csvData += `"${s.shipmentNumber}","${s.customer?.companyName || ''}","${s.origin}","${s.destination}","${s.freightType}",${s.weight || 0},${s.volume || 0},"${s.status}","${new Date(s.createdAt).toISOString().split('T')[0]}"\n`;
      });
    } else if (reportType === 'invoices') {
      const filter = buildReportFilter(req, 'invoiceDate');
      const items = await Invoice.find(filter).populate('customer', 'companyName');
      csvData = 'Invoice Number,Customer,Invoice Date,Due Date,Total Amount,Paid Amount,Balance Amount,Currency,Status\n';
      items.forEach((inv) => {
        csvData += `"${inv.invoiceNumber}","${inv.customer?.companyName || ''}","${new Date(inv.invoiceDate).toISOString().split('T')[0]}","${new Date(inv.dueDate).toISOString().split('T')[0]}",${inv.totalAmount},${inv.paidAmount},${inv.balanceAmount},"${inv.currency}","${inv.status}"\n`;
      });
    } else {
      // Default customer directory
      const items = await Customer.find().populate('branch', 'name');
      csvData = 'Customer Code,Company Name,Contact Person,Email,Phone,Country,Currency,Branch\n';
      items.forEach((c) => {
        csvData += `"${c.customerCode}","${c.companyName}","${c.contactPerson}","${c.email}","${c.phone}","${c.country}","${c.currency}","${c.branch?.name || ''}"\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    next(err);
  }
};
