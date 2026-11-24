/**
 * Restrict access to specified roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to perform this action`,
      });
    }
    next();
  };
};

/**
 * Enforces branch-level data isolation.
 * - Super Admin can access any branch or filter by branch.
 * - Non-Super Admin can only access their own branch.
 */
export const enforceBranchScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.user.role === 'Super Admin') {
    // Super Admin can optionally filter by query branch if provided
    req.branchFilter = req.query.branchId ? { branch: req.query.branchId } : {};
  } else {
    // Other users are strictly scoped to their assigned branch
    if (!req.user.branch) {
      return res.status(403).json({
        success: false,
        message: 'User does not have an assigned branch. Contact administrator',
      });
    }
    req.branchFilter = { branch: req.user.branch._id || req.user.branch };
  }
  next();
};
