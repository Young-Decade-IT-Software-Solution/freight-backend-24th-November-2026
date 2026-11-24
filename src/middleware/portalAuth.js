import jwt from 'jsonwebtoken';
import CustomerUser from '../models/CustomerUser.js';

export const protectPortal = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Portal authentication required. Token missing.',
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'freighterp_jwt_secret_production_ready_key_98374'
    );

    // Reject internal staff tokens lacking isCustomerPortal flag
    if (!decoded.isCustomerPortal || !decoded.customerUserId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Internal staff tokens cannot access the Customer Portal.',
      });
    }

    const customerUser = await CustomerUser.findById(decoded.customerUserId).populate('customer');

    if (!customerUser) {
      return res.status(401).json({
        success: false,
        message: 'The customer account belonging to this token no longer exists.',
      });
    }

    if (customerUser.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: `Your portal account is ${customerUser.status}. Please contact customer support.`,
      });
    }

    if (!customerUser.customer) {
      return res.status(403).json({
        success: false,
        message: 'No associated customer company record found.',
      });
    }

    // Attach verified customer context
    req.customerUser = customerUser;
    req.customer = customerUser.customer;
    req.customerId = customerUser.customer._id;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired customer portal authorization token.',
    });
  }
};
