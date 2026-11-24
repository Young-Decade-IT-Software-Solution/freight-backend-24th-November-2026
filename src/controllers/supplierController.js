import Supplier from '../models/Supplier.js';
import SupplierBill from '../models/SupplierBill.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Activity from '../models/Activity.js';
import { generateNextSequence } from '../utils/sequenceGenerator.js';

// @desc    Get all suppliers with filters, search, payable balances
// @route   GET /api/suppliers
// @access  Private
export const getSuppliers = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.country) query.country = req.query.country;
    if (req.query.supplierType) query.supplierType = req.query.supplierType;
    if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { supplierCode: regex },
        { companyName: regex },
        { contactPerson: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const suppliers = await Supplier.find(query)
      .populate('branch', 'name code city country')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Compute live financial totals per supplier (total bills, total paid, outstanding balance)
    const enriched = await Promise.all(
      suppliers.map(async (sup) => {
        const bills = await SupplierBill.find({ supplier: sup._id, status: { $ne: 'Void' } });
        let totalBilled = 0;
        let totalPaid = 0;
        let outstandingPayable = 0;

        bills.forEach((b) => {
          totalBilled += b.totalAmount || 0;
          totalPaid += b.paidAmount || 0;
          outstandingPayable += b.balanceAmount || 0;
        });

        return {
          ...sup.toObject(),
          totalBilled: Math.round(totalBilled * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          outstandingPayable: Math.round(outstandingPayable * 100) / 100,
          billsCount: bills.length,
        };
      })
    );

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single supplier by ID with bills & payments history
// @route   GET /api/suppliers/:id
// @access  Private
export const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('branch')
      .populate('createdBy', 'name email');

    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== supplier.branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const [bills, payments] = await Promise.all([
      SupplierBill.find({ supplier: supplier._id })
        .populate('shipment', 'shipmentNumber origin destination freightType')
        .sort({ billDate: -1 }),
      SupplierPayment.find({ supplier: supplier._id })
        .populate('account', 'accountName currency bankName')
        .sort({ paymentDate: -1 }),
    ]);

    let totalBilled = 0;
    let totalPaid = 0;
    let outstandingPayable = 0;

    bills.filter((b) => b.status !== 'Void').forEach((b) => {
      totalBilled += b.totalAmount || 0;
      totalPaid += b.paidAmount || 0;
      outstandingPayable += b.balanceAmount || 0;
    });

    res.json({
      success: true,
      data: {
        ...supplier.toObject(),
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstandingPayable: Math.round(outstandingPayable * 100) / 100,
        bills,
        payments,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new supplier
// @route   POST /api/suppliers
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createSupplier = async (req, res, next) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      address,
      country,
      taxNumber,
      supplierType,
      preferredCurrency,
      paymentTerms,
      branch: branchIdInput,
      notes,
    } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ success: false, message: 'Company Name is required' });
    }

    let assignedBranch = req.user.branch?._id || req.user.branch;
    if (req.user.role === 'Super Admin' && branchIdInput) {
      assignedBranch = branchIdInput;
    }

    const supplierCode = await generateNextSequence('SUP');

    const supplier = await Supplier.create({
      supplierCode,
      companyName: companyName.trim(),
      contactPerson: contactPerson || '',
      email: email || '',
      phone: phone || '',
      address: address || '',
      country: country || 'Global',
      taxNumber: taxNumber || '',
      supplierType: supplierType || 'Shipping Line',
      preferredCurrency: preferredCurrency || 'USD',
      paymentTerms: paymentTerms || 'Net 30 Days',
      branch: assignedBranch,
      notes: notes || '',
      isActive: true,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Supplier Created',
      module: 'Accounting',
      details: `Created supplier ${supplier.supplierCode} (${supplier.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await Supplier.findById(supplier._id).populate('branch', 'name code city country');

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private (Super Admin, Branch Admin, Accounts)
export const updateSupplier = async (req, res, next) => {
  try {
    let supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== supplier.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const allowed = [
      'companyName',
      'contactPerson',
      'email',
      'phone',
      'address',
      'country',
      'taxNumber',
      'supplierType',
      'preferredCurrency',
      'paymentTerms',
      'notes',
      'isActive',
    ];

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) supplier[key] = req.body[key];
    });

    await supplier.save();

    res.json({ success: true, message: 'Supplier updated successfully', data: supplier });
  } catch (err) {
    next(err);
  }
};
