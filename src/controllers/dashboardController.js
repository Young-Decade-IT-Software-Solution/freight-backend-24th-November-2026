import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Quotation from '../models/Quotation.js';
import Shipment from '../models/Shipment.js';
import Invoice from '../models/Invoice.js';
import CustomerReceipt from '../models/CustomerReceipt.js';
import SupplierBill from '../models/SupplierBill.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Expense from '../models/Expense.js';
import Branch from '../models/Branch.js';
import Activity from '../models/Activity.js';
import { roundMoney } from '../utils/financialCalculations.js';

// @desc    Get business dashboard statistics & summaries
// @route   GET /api/dashboard
// @access  Private
export const getDashboardStats = async (req, res, next) => {
  try {
    // Branch scoping
    let branchFilter = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      branchFilter = { branch: userBranchId };
    } else if (req.query.branchId) {
      branchFilter = { branch: req.query.branchId };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Leads & Customers
    const [totalLeads, totalCustomers] = await Promise.all([
      Lead.countDocuments(branchFilter),
      Customer.countDocuments(branchFilter),
    ]);

    // 2. Quotations & Shipments
    const [openQuotations, activeShipments, completedShipments] = await Promise.all([
      Quotation.countDocuments({
        ...branchFilter,
        status: { $in: ['Draft', 'Sent'] },
      }),
      Shipment.countDocuments({
        ...branchFilter,
        status: { $nin: ['Delivered', 'Cancelled'] },
      }),
      Shipment.countDocuments({
        ...branchFilter,
        status: 'Delivered',
      }),
    ]);

    // 3. Financial KPI Aggregations
    // Total Invoiced (All-time non-draft/void)
    const invoicedAgg = await Invoice.aggregate([
      { $match: { ...branchFilter, status: { $nin: ['Draft', 'Void'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalInvoiced = roundMoney(invoicedAgg[0]?.total || 0);

    // Revenue this month
    const revMonthAgg = await Invoice.aggregate([
      {
        $match: {
          ...branchFilter,
          status: { $nin: ['Draft', 'Void'] },
          issueDate: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const revenueThisMonth = roundMoney(revMonthAgg[0]?.total || 0);

    // Total Collected (Customer Receipts non-void/reversed)
    const receiptAgg = await CustomerReceipt.aggregate([
      { $match: { ...branchFilter, status: { $nin: ['Void', 'Reversed'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalCollected = roundMoney(receiptAgg[0]?.total || 0);

    // Outstanding Receivables (Open Invoices balanceAmount)
    const receivableAgg = await Invoice.aggregate([
      {
        $match: {
          ...branchFilter,
          status: { $in: ['Issued', 'Partially Paid', 'Overdue'] },
          balanceAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$balanceAmount' } } },
    ]);
    const outstandingReceivables = roundMoney(receivableAgg[0]?.total || 0);

    // Outstanding Payables (Open Supplier Bills balanceAmount)
    const payableAgg = await SupplierBill.aggregate([
      {
        $match: {
          ...branchFilter,
          status: { $in: ['Approved', 'Partially Paid', 'Overdue'] },
          balanceAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$balanceAmount' } } },
    ]);
    const outstandingPayables = roundMoney(payableAgg[0]?.total || 0);

    // Total Expenses
    const expenseAgg = await Expense.aggregate([
      { $match: { ...branchFilter, status: { $ne: 'Void' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalExpenses = roundMoney(expenseAgg[0]?.total || 0);

    // Expenses this month
    const expMonthAgg = await Expense.aggregate([
      {
        $match: {
          ...branchFilter,
          status: { $ne: 'Void' },
          expenseDate: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const expensesThisMonth = roundMoney(expMonthAgg[0]?.total || 0);

    // Overdue Invoices count
    const overdueInvoices = await Invoice.countDocuments({
      ...branchFilter,
      status: { $in: ['Issued', 'Partially Paid', 'Overdue'] },
      balanceAmount: { $gt: 0 },
      dueDate: { $lt: now },
    });

    // Overdue Bills count
    const overdueBills = await SupplierBill.countDocuments({
      ...branchFilter,
      status: { $in: ['Approved', 'Partially Paid', 'Overdue'] },
      balanceAmount: { $gt: 0 },
      dueDate: { $lt: now },
    });

    // Pending Invoices
    const pendingInvoices = await Invoice.countDocuments({
      ...branchFilter,
      status: { $in: ['Issued', 'Partially Paid', 'Overdue'] },
    });

    // 4. Phase 3 Shipment Analytics
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [shipmentsInTransit, arrivingSoon, delayedShipmentsCount] = await Promise.all([
      Shipment.countDocuments({ ...branchFilter, status: 'In Transit' }),
      Shipment.countDocuments({
        ...branchFilter,
        status: { $nin: ['Delivered', 'Cancelled'] },
        eta: { $gte: now, $lte: in7Days },
      }),
      Shipment.countDocuments({
        ...branchFilter,
        status: { $nin: ['Delivered', 'Cancelled'] },
        eta: { $lt: now },
      }),
    ]);

    // Upcoming arrivals (next 5)
    const upcomingArrivals = await Shipment.find({
      ...branchFilter,
      status: { $nin: ['Delivered', 'Cancelled'] },
      eta: { $gte: now },
    })
      .populate('customer', 'companyName')
      .populate('branch', 'name code')
      .sort({ eta: 1 })
      .limit(5);

    // Delayed shipments list (up to 5)
    const delayedShipmentsList = await Shipment.find({
      ...branchFilter,
      status: { $nin: ['Delivered', 'Cancelled'] },
      eta: { $lt: now },
    })
      .populate('customer', 'companyName')
      .populate('branch', 'name code')
      .sort({ eta: 1 })
      .limit(5);

    // Status breakdown aggregation
    const statusAgg = await Shipment.aggregate([
      { $match: branchFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const statusBreakdown = statusAgg.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Recent items
    const [recentQuotations, recentShipments, recentInvoices, recentReceipts] = await Promise.all([
      Quotation.find(branchFilter)
        .populate('customer', 'companyName contactPerson')
        .populate('branch', 'name code')
        .sort({ createdAt: -1 })
        .limit(5),
      Shipment.find(branchFilter)
        .populate('customer', 'companyName')
        .populate('branch', 'name code')
        .sort({ createdAt: -1 })
        .limit(5),
      Invoice.find(branchFilter)
        .populate('customer', 'companyName')
        .populate('branch', 'name code')
        .sort({ createdAt: -1 })
        .limit(5),
      CustomerReceipt.find(branchFilter)
        .populate('customer', 'companyName')
        .populate('branch', 'name code')
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    // Recent Activities (latest 8)
    let activityFilter = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      activityFilter = { $or: [{ branch: userBranchId }, { branch: { $exists: false } }] };
    }
    const recentActivities = await Activity.find(activityFilter)
      .populate('branch', 'name code')
      .sort({ createdAt: -1 })
      .limit(8);

    // Branch-wise Basic Statistics
    const branches = await Branch.find({ isActive: true });
    const branchStats = await Promise.all(
      branches.map(async (b) => {
        const [leads, customers, shipments, invoices, receivableSum] = await Promise.all([
          Lead.countDocuments({ branch: b._id }),
          Customer.countDocuments({ branch: b._id }),
          Shipment.countDocuments({ branch: b._id }),
          Invoice.countDocuments({ branch: b._id }),
          Invoice.aggregate([
            { $match: { branch: b._id, status: { $in: ['Issued', 'Partially Paid', 'Overdue'] } } },
            { $group: { _id: null, total: { $sum: '$balanceAmount' } } },
          ]),
        ]);
        return {
          _id: b._id,
          name: b.name,
          code: b.code,
          city: b.city,
          country: b.country,
          leads,
          customers,
          shipments,
          invoices,
          outstandingReceivables: roundMoney(receivableSum[0]?.total || 0),
        };
      })
    );

    res.json({
      success: true,
      data: {
        kpis: {
          totalLeads,
          totalCustomers,
          openQuotations,
          activeShipments,
          completedShipments,
          pendingInvoices,
          outstandingPayments: outstandingReceivables,
          totalInvoiced,
          totalCollected,
          outstandingReceivables,
          outstandingPayables,
          totalExpenses,
          revenueThisMonth,
          expensesThisMonth,
          overdueInvoices,
          overdueBills,
          shipmentsInTransit,
          arrivingSoon,
          delayedShipments: delayedShipmentsCount,
        },
        shipmentAnalytics: {
          upcomingArrivals,
          delayedShipmentsList,
          statusBreakdown,
        },
        recentQuotations,
        recentShipments,
        recentInvoices,
        recentReceipts,
        recentActivities,
        branchStats,
      },
    });
  } catch (err) {
    next(err);
  }
};
