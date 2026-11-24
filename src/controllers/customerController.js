import Customer from '../models/Customer.js';
import Quotation from '../models/Quotation.js';
import Shipment from '../models/Shipment.js';
import FollowUp from '../models/FollowUp.js';
import Activity from '../models/Activity.js';

// @desc    Get all customers (branch-scoped)
// @route   GET /api/customers
// @access  Private
export const getCustomers = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      query.$or = [
        { customerCode: regex },
        { companyName: regex },
        { contactPerson: regex },
        { email: regex },
        { phone: regex },
        { country: regex },
      ];
    }

    const customers = await Customer.find(query)
      .populate('branch', 'name code city country')
      .populate('convertedFromLead', 'leadNumber')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single customer with quotations, shipments & follow-up history
// @route   GET /api/customers/:id
// @access  Private
export const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('branch', 'name code city country')
      .populate('convertedFromLead', 'leadNumber contactPerson')
      .populate('createdBy', 'name email');

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const customerBranchId = customer.branch?._id?.toString() || customer.branch?.toString();
      if (userBranchId !== customerBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this customer record' });
      }
    }

    // Parallel fetch related quotations, shipments, follow-ups
    const [quotations, shipments, followUps] = await Promise.all([
      Quotation.find({ customer: customer._id }).sort({ createdAt: -1 }),
      Shipment.find({ customer: customer._id }).sort({ createdAt: -1 }),
      FollowUp.find({ customer: customer._id }).populate('assignedTo', 'name email').sort({ followUpDate: -1 }),
    ]);

    res.json({
      success: true,
      data: {
        ...customer.toObject(),
        quotations,
        shipments,
        followUps,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
export const createCustomer = async (req, res, next) => {
  try {
    const {
      customerCode: customCode,
      companyName,
      contactPerson,
      email,
      phone,
      address,
      country,
      taxNumber,
      currency,
      branch,
      notes,
    } = req.body;

    const assignedBranch = req.user.role === 'Super Admin' && branch
      ? branch
      : (req.user.branch?._id || req.user.branch);

    if (!assignedBranch) {
      return res.status(400).json({ success: false, message: 'Branch is required' });
    }

    let code = customCode?.trim();
    if (!code) {
      const year = new Date().getFullYear();
      const count = await Customer.countDocuments();
      code = `CUST-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    const existing = await Customer.findOne({ customerCode: code });
    if (existing) {
      return res.status(400).json({ success: false, message: `Customer code '${code}' already exists` });
    }

    const customer = await Customer.create({
      customerCode: code,
      companyName,
      contactPerson,
      email: email.toLowerCase(),
      phone,
      address: address || '',
      country: country || 'United Arab Emirates',
      taxNumber: taxNumber || '',
      currency: currency || 'USD',
      branch: assignedBranch,
      notes: notes || '',
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Customer Created',
      module: 'Customer',
      details: `Created customer ${customer.customerCode} (${customer.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await Customer.findById(customer._id).populate('branch', 'name code');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
export const updateCustomer = async (req, res, next) => {
  try {
    let customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const custBranchId = customer.branch?._id?.toString() || customer.branch?.toString();
      if (userBranchId !== custBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      delete req.body.branch;
      delete req.body.customerCode;
    }

    customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('branch', 'name code');

    await Activity.create({
      action: 'Customer Updated',
      module: 'Customer',
      details: `Updated customer ${customer.customerCode} (${customer.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: customer.branch?._id || customer.branch,
    });

    res.json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private (Super Admin or Branch Admin)
export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const custBranchId = customer.branch?._id?.toString() || customer.branch?.toString();
      if (userBranchId !== custBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Check if customer has active shipments or quotations
    const quoteCount = await Quotation.countDocuments({ customer: customer._id });
    if (quoteCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete customer with ${quoteCount} associated quotation(s).`,
      });
    }

    await Customer.findByIdAndDelete(req.params.id);

    await Activity.create({
      action: 'Customer Deleted',
      module: 'Customer',
      details: `Deleted customer ${customer.customerCode} (${customer.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: customer.branch,
    });

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
