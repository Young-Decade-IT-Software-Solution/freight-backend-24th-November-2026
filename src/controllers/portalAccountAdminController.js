import CustomerUser from '../models/CustomerUser.js';
import Customer from '../models/Customer.js';
import Activity from '../models/Activity.js';

// @desc    Get all Customer Portal user accounts
// @route   GET /api/portal/accounts
// @access  Private (Super Admin, Branch Admin, Sales)
export const getPortalAccounts = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.customerId) {
      query.customer = req.query.customerId;
    }

    const accounts = await CustomerUser.find(query)
      .populate('customer', 'customerCode companyName contactPerson email phone branch')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Scoping for non-Super Admin
    let filtered = accounts;
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      filtered = accounts.filter((acc) => {
        const customerBranchId = acc.customer?.branch?.toString();
        return customerBranchId === userBranchId;
      });
    }

    res.json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Invite a customer contact to create a portal account
// @route   POST /api/portal/accounts/invite
// @access  Private (Super Admin, Branch Admin, Sales)
export const inviteCustomerUser = async (req, res, next) => {
  try {
    const { customerId, name, email, phone } = req.body;

    if (!customerId || !email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID, Name, and Email are required',
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const customerBranchId = customer.branch?.toString();
      if (userBranchId !== customerBranchId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You cannot invite portal users for another branch customer',
        });
      }
    }

    // Check if email already registered
    const existing = await CustomerUser.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A portal user with email ${email} already exists`,
      });
    }

    const customerUser = new CustomerUser({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || customer.phone || '',
      customer: customer._id,
      status: 'Pending',
      createdBy: req.user._id,
    });

    const rawInviteToken = customerUser.generateInvitationToken();
    await customerUser.save();

    await Activity.create({
      action: 'Portal Invitation Created',
      module: 'Portal',
      details: `Invited ${customerUser.name} (${customerUser.email}) to Customer Portal for ${customer.companyName}`,
      user: req.user._id,
      userName: req.user.name,
      branch: customer.branch,
    });

    res.status(201).json({
      success: true,
      message: `Invitation generated for ${customerUser.email}`,
      data: customerUser,
      inviteToken: rawInviteToken,
      inviteUrl: `/portal/accept-invitation?token=${rawInviteToken}`,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Resend invitation to customer user
// @route   POST /api/portal/accounts/:id/resend
// @access  Private (Super Admin, Branch Admin, Sales)
export const resendInvitation = async (req, res, next) => {
  try {
    const customerUser = await CustomerUser.findById(req.params.id).populate('customer');
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Portal account not found' });
    }

    if (customerUser.status === 'Active') {
      return res.status(400).json({
        success: false,
        message: 'This account is already active. Send a password reset instead.',
      });
    }

    const rawInviteToken = customerUser.generateInvitationToken();
    customerUser.status = 'Pending';
    await customerUser.save();

    await Activity.create({
      action: 'Portal Invitation Resent',
      module: 'Portal',
      details: `Resent portal invitation to ${customerUser.name} (${customerUser.email})`,
      user: req.user._id,
      userName: req.user.name,
      branch: customerUser.customer?.branch,
    });

    res.json({
      success: true,
      message: `New invitation generated for ${customerUser.email}`,
      inviteToken: rawInviteToken,
      inviteUrl: `/portal/accept-invitation?token=${rawInviteToken}`,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer user account status (Active / Suspended)
// @route   PUT /api/portal/accounts/:id/status
// @access  Private (Super Admin, Branch Admin)
export const updateCustomerUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Active', 'Suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active or Suspended' });
    }

    const customerUser = await CustomerUser.findById(req.params.id).populate('customer');
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Portal account not found' });
    }

    // Branch check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const customerBranchId = customerUser.customer?.branch?.toString();
      if (userBranchId !== customerBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied: Branch mismatch' });
      }
    }

    customerUser.status = status;
    await customerUser.save();

    await Activity.create({
      action: `Portal Account ${status}`,
      module: 'Portal',
      details: `Changed portal account status of ${customerUser.name} (${customerUser.email}) to ${status}`,
      user: req.user._id,
      userName: req.user.name,
      branch: customerUser.customer?.branch,
    });

    res.json({
      success: true,
      message: `Portal account status updated to ${status}`,
      data: customerUser,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a customer portal account
// @route   DELETE /api/portal/accounts/:id
// @access  Private (Super Admin, Branch Admin)
export const deleteCustomerUser = async (req, res, next) => {
  try {
    const customerUser = await CustomerUser.findById(req.params.id).populate('customer');
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Portal account not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const customerBranchId = customerUser.customer?.branch?.toString();
      if (userBranchId !== customerBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied: Branch mismatch' });
      }
    }

    await CustomerUser.findByIdAndDelete(customerUser._id);

    await Activity.create({
      action: 'Portal Account Deleted',
      module: 'Portal',
      details: `Deleted portal user ${customerUser.name} (${customerUser.email})`,
      user: req.user._id,
      userName: req.user.name,
      branch: customerUser.customer?.branch,
    });

    res.json({
      success: true,
      message: 'Portal account deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
