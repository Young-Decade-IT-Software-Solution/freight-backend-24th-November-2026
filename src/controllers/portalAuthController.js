import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import CustomerUser from '../models/CustomerUser.js';
import Customer from '../models/Customer.js';
import Activity from '../models/Activity.js';

// Helper to generate JWT token for customer portal
const generatePortalToken = (customerUser) => {
  return jwt.sign(
    {
      customerUserId: customerUser._id,
      customerId: customerUser.customer._id || customerUser.customer,
      isCustomerPortal: true,
    },
    process.env.JWT_SECRET || 'freighterp_jwt_secret_production_ready_key_98374',
    { expiresIn: '30d' }
  );
};

// @desc    Customer Portal Login
// @route   POST /api/portal/auth/login
// @access  Public
export const portalLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    const customerUser = await CustomerUser.findOne({
      email: email.toLowerCase().trim(),
    })
      .select('+password')
      .populate('customer');

    if (!customerUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid customer portal email or password',
      });
    }

    const isMatch = await customerUser.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid customer portal email or password',
      });
    }

    if (customerUser.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: `Your portal account is ${customerUser.status}. Please contact your account manager.`,
      });
    }

    if (!customerUser.customer) {
      return res.status(403).json({
        success: false,
        message: 'No associated customer company record found.',
      });
    }

    customerUser.lastLogin = new Date();
    await customerUser.save();

    const token = generatePortalToken(customerUser);

    res.json({
      success: true,
      token,
      user: {
        _id: customerUser._id,
        name: customerUser.name,
        email: customerUser.email,
        phone: customerUser.phone,
        role: customerUser.role,
        status: customerUser.status,
        lastLogin: customerUser.lastLogin,
      },
      customer: customerUser.customer,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current authenticated customer user & company profile
// @route   GET /api/portal/auth/me
// @access  Private (Customer Portal)
export const getPortalMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      _id: req.customerUser._id,
      name: req.customerUser.name,
      email: req.customerUser.email,
      phone: req.customerUser.phone,
      role: req.customerUser.role,
      status: req.customerUser.status,
      lastLogin: req.customerUser.lastLogin,
    },
    customer: req.customer,
  });
};

// @desc    Customer Portal Logout
// @route   POST /api/portal/auth/logout
// @access  Public
export const portalLogout = (req, res) => {
  res.json({
    success: true,
    message: 'Logged out of Customer Portal successfully',
  });
};

// @desc    Customer Portal Forgot Password
// @route   POST /api/portal/auth/forgot-password
// @access  Public
export const portalForgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide customer account email' });
    }

    const customerUser = await CustomerUser.findOne({ email: email.toLowerCase().trim() });
    if (!customerUser) {
      return res.status(404).json({
        success: false,
        message: 'No customer account registered with this email address',
      });
    }

    const resetToken = customerUser.generateResetToken();
    await customerUser.save();

    res.json({
      success: true,
      message: 'Password reset link generated and simulated for customer email',
      resetToken,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer Portal Reset Password
// @route   POST /api/portal/auth/reset-password
// @access  Public
export const portalResetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const customerUser = await CustomerUser.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!customerUser) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired',
      });
    }

    customerUser.password = password;
    customerUser.resetPasswordToken = undefined;
    customerUser.resetPasswordExpires = undefined;
    await customerUser.save();

    res.json({
      success: true,
      message: 'Password has been reset successfully. You may now log in.',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify customer invitation token
// @route   GET /api/portal/auth/verify-invitation/:token
// @access  Public
export const verifyInvitationToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const customerUser = await CustomerUser.findOne({
      invitationToken: hashedToken,
      invitationExpires: { $gt: Date.now() },
    }).populate('customer');

    if (!customerUser) {
      return res.status(400).json({
        success: false,
        message: 'Invitation link is invalid or has expired.',
      });
    }

    res.json({
      success: true,
      user: {
        name: customerUser.name,
        email: customerUser.email,
        phone: customerUser.phone,
      },
      customer: customerUser.customer,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Accept invitation and activate account
// @route   POST /api/portal/auth/accept-invitation
// @access  Public
export const acceptInvitation = async (req, res, next) => {
  try {
    const { token, password, name, phone } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Invitation token and password are required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const customerUser = await CustomerUser.findOne({
      invitationToken: hashedToken,
      invitationExpires: { $gt: Date.now() },
    }).populate('customer');

    if (!customerUser) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token is invalid or has expired.',
      });
    }

    customerUser.password = password;
    customerUser.status = 'Active';
    customerUser.invitationToken = undefined;
    customerUser.invitationExpires = undefined;
    if (name) customerUser.name = name.trim();
    if (phone) customerUser.phone = phone.trim();
    customerUser.lastLogin = new Date();
    await customerUser.save();

    await Activity.create({
      action: 'Portal Account Activated',
      module: 'Portal',
      details: `Customer contact ${customerUser.name} (${customerUser.email}) activated portal access for ${customerUser.customer?.companyName}`,
      customerUser: customerUser._id,
      branch: customerUser.customer?.branch,
      userName: customerUser.name,
    });

    const authToken = generatePortalToken(customerUser);

    res.json({
      success: true,
      message: 'Invitation accepted and account activated successfully',
      token: authToken,
      user: {
        _id: customerUser._id,
        name: customerUser.name,
        email: customerUser.email,
        phone: customerUser.phone,
        role: customerUser.role,
        status: customerUser.status,
      },
      customer: customerUser.customer,
    });
  } catch (err) {
    next(err);
  }
};
