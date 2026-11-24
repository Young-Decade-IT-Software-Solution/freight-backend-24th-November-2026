import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import FollowUp from '../models/FollowUp.js';
import Activity from '../models/Activity.js';

// @desc    Get all leads (branch-scoped)
// @route   GET /api/leads
// @access  Private
export const getLeads = async (req, res, next) => {
  try {
    let query = {};

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    // Status filter
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Search filter (companyName, contactPerson, email, leadNumber)
    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      query.$or = [
        { leadNumber: regex },
        { companyName: regex },
        { contactPerson: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const leads = await Lead.find(query)
      .populate('branch', 'name code city')
      .populate('assignedTo', 'name email')
      .populate('convertedToCustomer', 'customerCode companyName contactPerson')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single lead with follow-up history
// @route   GET /api/leads/:id
// @access  Private
export const getLeadById = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('branch', 'name code city country')
      .populate('assignedTo', 'name email phone')
      .populate('convertedToCustomer', 'customerCode companyName contactPerson email phone')
      .populate('createdBy', 'name email');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Branch access check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const leadBranchId = lead.branch?._id?.toString() || lead.branch?.toString();
      if (userBranchId !== leadBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this lead' });
      }
    }

    // Fetch follow-ups for this lead
    const followUps = await FollowUp.find({ lead: lead._id })
      .populate('assignedTo', 'name email')
      .sort({ followUpDate: -1 });

    res.json({
      success: true,
      data: {
        ...lead.toObject(),
        followUps,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create lead
// @route   POST /api/leads
// @access  Private
export const createLead = async (req, res, next) => {
  try {
    const {
      contactPerson,
      companyName,
      email,
      phone,
      country,
      leadSource,
      status,
      notes,
      assignedTo,
      branch,
    } = req.body;

    const assignedBranch = req.user.role === 'Super Admin' && branch
      ? branch
      : (req.user.branch?._id || req.user.branch);

    if (!assignedBranch) {
      return res.status(400).json({ success: false, message: 'Branch must be provided' });
    }

    const year = new Date().getFullYear();
    const count = await Lead.countDocuments();
    const leadNumber = `LED-${year}-${String(count + 1).padStart(4, '0')}`;

    const lead = await Lead.create({
      leadNumber,
      contactPerson,
      leadName: contactPerson,
      companyName,
      email,
      phone,
      country: country || 'United Arab Emirates',
      leadSource: leadSource || 'Website',
      status: status || 'New',
      notes: notes || '',
      assignedTo: assignedTo || req.user._id,
      branch: assignedBranch,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Lead Created',
      module: 'Lead',
      details: `Created lead ${lead.leadNumber} for ${lead.companyName} (${lead.contactPerson})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('branch', 'name code')
      .populate('assignedTo', 'name email');

    res.status(201).json({
      success: true,
      data: populatedLead,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
export const updateLead = async (req, res, next) => {
  try {
    let lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const leadBranchId = lead.branch?._id?.toString() || lead.branch?.toString();
      if (userBranchId !== leadBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this lead' });
      }
      delete req.body.branch; // Prevent unauthorized branch transfer
    }

    if (req.body.contactPerson) {
      req.body.leadName = req.body.contactPerson;
    }

    lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('branch', 'name code')
      .populate('assignedTo', 'name email')
      .populate('convertedToCustomer', 'customerCode companyName contactPerson');

    await Activity.create({
      action: 'Lead Updated',
      module: 'Lead',
      details: `Updated lead ${lead.leadNumber} (${lead.companyName}) status: ${lead.status}`,
      user: req.user._id,
      userName: req.user.name,
      branch: lead.branch?._id || lead.branch,
    });

    res.json({
      success: true,
      data: lead,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
export const deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const leadBranchId = lead.branch?._id?.toString() || lead.branch?.toString();
      if (userBranchId !== leadBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Delete associated follow-ups
    await FollowUp.deleteMany({ lead: lead._id });
    await Lead.findByIdAndDelete(req.params.id);

    await Activity.create({
      action: 'Lead Deleted',
      module: 'Lead',
      details: `Deleted lead ${lead.leadNumber} (${lead.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: lead.branch,
    });

    res.json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Convert qualified lead to customer
// @route   POST /api/leads/:id/convert
// @access  Private
export const convertLeadToCustomer = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (lead.convertedToCustomer) {
      return res.status(400).json({
        success: false,
        message: 'This lead has already been converted to a customer',
      });
    }

    // Auto customer code
    const year = new Date().getFullYear();
    const count = await Customer.countDocuments();
    const customerCode = `CUST-${year}-${String(count + 1).padStart(4, '0')}`;

    // Create Customer from Lead details
    const customer = await Customer.create({
      customerCode,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson || lead.leadName,
      email: lead.email || `${lead.companyName.toLowerCase().replace(/\s+/g, '')}@example.com`,
      phone: lead.phone || 'N/A',
      country: lead.country || 'United Arab Emirates',
      address: req.body.address || '',
      taxNumber: req.body.taxNumber || '',
      currency: req.body.currency || 'USD',
      branch: lead.branch,
      notes: `Converted from lead ${lead.leadNumber}. ${lead.notes || ''}`,
      convertedFromLead: lead._id,
      createdBy: req.user._id,
    });

    // Update lead record
    lead.status = 'Converted';
    lead.convertedToCustomer = customer._id;
    lead.convertedAt = new Date();
    await lead.save();

    await Activity.create({
      action: 'Lead Converted',
      module: 'Customer',
      details: `Converted lead ${lead.leadNumber} to customer ${customer.customerCode} (${customer.companyName})`,
      user: req.user._id,
      userName: req.user.name,
      branch: lead.branch,
    });

    res.json({
      success: true,
      message: 'Lead converted to customer successfully',
      data: {
        lead,
        customer,
      },
    });
  } catch (err) {
    next(err);
  }
};
