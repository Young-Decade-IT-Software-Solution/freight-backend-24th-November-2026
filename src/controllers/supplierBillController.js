import SupplierBill from '../models/SupplierBill.js';
import Supplier from '../models/Supplier.js';
import Shipment from '../models/Shipment.js';
import Branch from '../models/Branch.js';
import Activity from '../models/Activity.js';
import { generateNextSequence, sanitizeBranchCode } from '../utils/sequenceGenerator.js';
import { calculateFinancialTotals, roundMoney } from '../utils/financialCalculations.js';

// @desc    Get all supplier bills
// @route   GET /api/supplier-bills
// @access  Private
export const getSupplierBills = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.supplierId) query.supplier = req.query.supplierId;
    if (req.query.shipmentId) query.shipment = req.query.shipmentId;
    if (req.query.status) query.status = req.query.status;
    if (req.query.currency) query.currency = req.query.currency;

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      const matchingSuppliers = await Supplier.find({
        $or: [{ companyName: regex }, { contactPerson: regex }],
      }).select('_id');
      const supIds = matchingSuppliers.map((s) => s._id);

      query.$or = [
        { billNumber: regex },
        { supplierInvoiceReference: regex },
        { supplier: { $in: supIds } },
      ];
    }

    if (req.query.startDate && req.query.endDate) {
      query.billDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const [total, bills] = await Promise.all([
      SupplierBill.countDocuments(query),
      SupplierBill.find(query)
        .populate('supplier', 'supplierCode companyName contactPerson email')
        .populate('branch', 'name code city country')
        .populate('shipment', 'shipmentNumber freightType origin destination')
        .populate('createdBy', 'name email')
        .sort({ billDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      count: bills.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: bills,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single supplier bill by ID
// @route   GET /api/supplier-bills/:id
// @access  Private
export const getSupplierBillById = async (req, res, next) => {
  try {
    const bill = await SupplierBill.findById(req.params.id)
      .populate('supplier')
      .populate('branch')
      .populate('shipment')
      .populate('createdBy', 'name email')
      .populate('recordedBy', 'name email')
      .populate('paymentHistory.recordedBy', 'name email');

    if (!bill) return res.status(404).json({ success: false, message: 'Supplier bill not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== bill.branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: bill });
  } catch (err) {
    next(err);
  }
};

// @desc    Create supplier bill
// @route   POST /api/supplier-bills
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createSupplierBill = async (req, res, next) => {
  try {
    const supplierId = req.body.supplier || req.body.supplierId;
    const supplierInvoiceReference = req.body.supplierInvoiceReference || req.body.vendorBillNumber || '';
    const branchIdInput = req.body.branch || req.body.branchId;
    const shipmentId = req.body.shipment || req.body.shipmentId;
    const {
      billDate,
      dueDate,
      currency,
      description,
      lineItems = [],
      tax = 0,
      discount = 0,
      internalNotes,
      attachment,
      status: initialStatus = 'Approved',
    } = req.body;

    if (!supplierId) return res.status(400).json({ success: false, message: 'Supplier is required' });

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    let assignedBranch = req.user.branch?._id || req.user.branch;
    if (req.user.role === 'Super Admin' && branchIdInput) {
      assignedBranch = branchIdInput;
    }
    const branchDoc = await Branch.findById(assignedBranch);
    if (!branchDoc) return res.status(400).json({ success: false, message: 'Valid branch required' });

    // Check duplicate supplier invoice reference
    if (supplierInvoiceReference && supplierInvoiceReference.trim()) {
      const existing = await SupplierBill.findOne({
        supplier: supplier._id,
        branch: assignedBranch,
        supplierInvoiceReference: supplierInvoiceReference.trim(),
        status: { $ne: 'Void' },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Bill with supplier reference '${supplierInvoiceReference.trim()}' already exists for this vendor and branch.`,
        });
      }
    }

    const billNumber = await generateNextSequence('BIL', assignedBranch);

    const calculated = calculateFinancialTotals({
      lineItems,
      tax,
      discount,
    });

    const isRecorded = initialStatus === 'Approved';
    const computedDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const bill = await SupplierBill.create({
      billNumber,
      supplierInvoiceReference: supplierInvoiceReference ? supplierInvoiceReference.trim() : '',
      supplier: supplier._id,
      branch: assignedBranch,
      branchCode: sanitizeBranchCode(branchDoc.code),
      shipment: shipmentId || undefined,
      billDate: billDate ? new Date(billDate) : new Date(),
      dueDate: computedDueDate,
      currency: currency || supplier.preferredCurrency || 'USD',
      description: description || '',
      ...calculated,
      paidAmount: 0,
      balanceAmount: calculated.totalAmount,
      status: initialStatus,
      internalNotes: internalNotes || '',
      attachment: attachment || '',
      recordedAt: isRecorded ? new Date() : undefined,
      recordedBy: isRecorded ? req.user._id : undefined,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Supplier Bill Created',
      module: 'Accounting',
      details: `Created supplier bill ${bill.billNumber} for ${supplier.companyName} (${bill.currency} ${bill.totalAmount})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await SupplierBill.findById(bill._id)
      .populate('supplier', 'supplierCode companyName')
      .populate('branch', 'name code');

    res.status(201).json({
      success: true,
      message: 'Supplier bill created successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update draft supplier bill
// @route   PUT /api/supplier-bills/:id
// @access  Private (Super Admin, Branch Admin, Accounts)
export const updateSupplierBill = async (req, res, next) => {
  try {
    let bill = await SupplierBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Supplier bill not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== bill.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (bill.status !== 'Draft' && req.user.role !== 'Super Admin') {
      return res.status(400).json({
        success: false,
        message: 'Only Draft supplier bills can be edited.',
      });
    }

    const {
      supplierInvoiceReference,
      dueDate,
      description,
      lineItems,
      tax,
      discount,
      internalNotes,
      attachment,
    } = req.body;

    if (lineItems) {
      const calculated = calculateFinancialTotals({
        lineItems,
        tax: tax !== undefined ? tax : bill.tax,
        discount: discount !== undefined ? discount : bill.discount,
      });
      bill.lineItems = calculated.lineItems;
      bill.subtotal = calculated.subtotal;
      bill.discount = calculated.discount;
      bill.tax = calculated.tax;
      bill.totalAmount = calculated.totalAmount;
      bill.balanceAmount = roundMoney(calculated.totalAmount - (bill.paidAmount || 0));
    }

    if (supplierInvoiceReference !== undefined) bill.supplierInvoiceReference = supplierInvoiceReference.trim();
    if (dueDate) bill.dueDate = new Date(dueDate);
    if (description !== undefined) bill.description = description;
    if (internalNotes !== undefined) bill.internalNotes = internalNotes;
    if (attachment !== undefined) bill.attachment = attachment;

    await bill.save();

    res.json({ success: true, message: 'Supplier bill updated successfully', data: bill });
  } catch (err) {
    next(err);
  }
};

// @desc    Record / Approve supplier bill
// @route   PUT /api/supplier-bills/:id/record
// @access  Private (Super Admin, Branch Admin, Accounts)
export const recordSupplierBill = async (req, res, next) => {
  try {
    const bill = await SupplierBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Supplier bill not found' });

    if (bill.status !== 'Draft') {
      return res.status(400).json({ success: false, message: `Bill is already in '${bill.status}' status.` });
    }

    bill.status = 'Approved';
    bill.recordedAt = new Date();
    bill.recordedBy = req.user._id;
    await bill.save();

    res.json({ success: true, message: 'Supplier bill approved/recorded', data: bill });
  } catch (err) {
    next(err);
  }
};

// @desc    Void supplier bill (must not have payments)
// @route   PUT /api/supplier-bills/:id/void
// @access  Private (Super Admin, Branch Admin, Accounts)
export const voidSupplierBill = async (req, res, next) => {
  try {
    const bill = await SupplierBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Supplier bill not found' });

    if (bill.paidAmount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot void a supplier bill with recorded payments. Reverse payments first.',
      });
    }

    if (bill.status === 'Void') {
      return res.status(400).json({ success: false, message: 'Bill is already voided.' });
    }

    bill.status = 'Void';
    bill.voidedAt = new Date();
    bill.voidedBy = req.user._id;
    bill.voidReason = req.body.reason || 'Voided by administrative action';
    await bill.save();

    await Activity.create({
      action: 'Supplier Bill Voided',
      module: 'Accounting',
      details: `Voided supplier bill ${bill.billNumber}. Reason: ${bill.voidReason}`,
      user: req.user._id,
      userName: req.user.name,
      branch: bill.branch,
    });

    res.json({ success: true, message: 'Supplier bill voided successfully', data: bill });
  } catch (err) {
    next(err);
  }
};
