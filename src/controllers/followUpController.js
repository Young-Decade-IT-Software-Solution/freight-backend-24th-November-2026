import FollowUp from '../models/FollowUp.js';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Activity from '../models/Activity.js';

// @desc    Get follow-ups (branch-scoped, upcoming/completed/overdue filters)
// @route   GET /api/follow-ups
// @access  Private
export const getFollowUps = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.targetType) {
      query.targetType = req.query.targetType;
    }
    if (req.query.leadId) {
      query.lead = req.query.leadId;
    }
    if (req.query.customerId) {
      query.customer = req.query.customerId;
    }

    const now = new Date();

    // Tabs: upcoming, completed, overdue
    if (req.query.filter === 'upcoming') {
      query.status = 'Pending';
      query.followUpDate = { $gte: now };
    } else if (req.query.filter === 'overdue') {
      query.status = 'Pending';
      query.followUpDate = { $lt: now };
    } else if (req.query.filter === 'completed') {
      query.status = 'Completed';
    } else if (req.query.status) {
      query.status = req.query.status;
    }

    const followUps = await FollowUp.find(query)
      .populate('lead', 'leadNumber companyName contactPerson phone email')
      .populate('customer', 'customerCode companyName contactPerson phone email')
      .populate('assignedTo', 'name email')
      .populate('branch', 'name code')
      .sort({ followUpDate: 1 });

    res.json({
      success: true,
      count: followUps.length,
      data: followUps,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create follow-up
// @route   POST /api/follow-ups
// @access  Private
export const createFollowUp = async (req, res, next) => {
  try {
    const {
      targetType,
      leadId,
      customerId,
      followUpDate,
      assignedTo,
      notes,
      branch,
    } = req.body;

    let assignedBranch = branch;
    if (!assignedBranch) {
      assignedBranch = req.user.branch?._id || req.user.branch;
    }

    if (targetType === 'Lead' && leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) assignedBranch = lead.branch;
    } else if (targetType === 'Customer' && customerId) {
      const customer = await Customer.findById(customerId);
      if (customer) assignedBranch = customer.branch;
    }

    const followUp = await FollowUp.create({
      targetType: targetType || (leadId ? 'Lead' : 'Customer'),
      lead: leadId || undefined,
      customer: customerId || undefined,
      followUpDate: new Date(followUpDate),
      assignedTo: assignedTo || req.user._id,
      notes,
      status: 'Pending',
      branch: assignedBranch,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Follow-Up Scheduled',
      module: 'Lead',
      details: `Scheduled follow-up for ${followUp.targetType} on ${new Date(followUpDate).toLocaleDateString()}`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await FollowUp.findById(followUp._id)
      .populate('lead', 'leadNumber companyName contactPerson')
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('assignedTo', 'name email');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update follow-up / mark completed
// @route   PUT /api/follow-ups/:id
// @access  Private
export const updateFollowUp = async (req, res, next) => {
  try {
    let followUp = await FollowUp.findById(req.params.id);
    if (!followUp) {
      return res.status(404).json({ success: false, message: 'Follow-up not found' });
    }

    if (req.body.status === 'Completed' && followUp.status !== 'Completed') {
      req.body.completedAt = new Date();
    }

    followUp = await FollowUp.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('lead', 'leadNumber companyName contactPerson')
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('assignedTo', 'name email');

    res.json({
      success: true,
      data: followUp,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete follow-up
// @route   DELETE /api/follow-ups/:id
// @access  Private
export const deleteFollowUp = async (req, res, next) => {
  try {
    const followUp = await FollowUp.findById(req.params.id);
    if (!followUp) {
      return res.status(404).json({ success: false, message: 'Follow-up not found' });
    }

    await FollowUp.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Follow-up removed' });
  } catch (err) {
    next(err);
  }
};
