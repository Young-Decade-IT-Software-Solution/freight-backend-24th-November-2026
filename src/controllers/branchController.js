import Branch from '../models/Branch.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private
export const getBranches = async (req, res, next) => {
  try {
    // If not Super Admin, only their branch or active list
    let query = {};
    if (req.user.role !== 'Super Admin') {
      // Non super-admins see their assigned branch details or all active for reference
      if (req.query.assignedOnly === 'true' && req.user.branch) {
        query = { _id: req.user.branch._id || req.user.branch };
      }
    }

    const branches = await Branch.find(query).sort({ isHeadOffice: -1, createdAt: 1 });
    res.json({
      success: true,
      count: branches.length,
      data: branches,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Private
export const getBranchById = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Role check: non-super admin can only view their own branch
    if (
      req.user.role !== 'Super Admin' &&
      req.user.branch &&
      req.user.branch._id.toString() !== branch._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this branch record',
      });
    }

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new branch
// @route   POST /api/branches
// @access  Private (Super Admin only)
export const createBranch = async (req, res, next) => {
  try {
    const { name, code, city, country, address, phone, email, isHeadOffice, isActive } = req.body;

    const existingCode = await Branch.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(400).json({ success: false, message: 'Branch code already in use' });
    }

    const branch = await Branch.create({
      name,
      code: code.toUpperCase(),
      city,
      country,
      address,
      phone,
      email,
      isHeadOffice: Boolean(isHeadOffice),
      isActive: isActive !== undefined ? isActive : true,
    });

    await Activity.create({
      action: 'Branch Created',
      module: 'Branch',
      details: `Created branch ${branch.name} (${branch.code})`,
      user: req.user._id,
      userName: req.user.name,
      branch: branch._id,
    });

    res.status(201).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private (Super Admin & Branch Admin for their own branch)
export const updateBranch = async (req, res, next) => {
  try {
    let branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Branch Admin can only update their own branch (and cannot change code/isHeadOffice)
    if (req.user.role === 'Branch Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== branch._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Branch Admins can only edit their own branch',
        });
      }
      delete req.body.code;
      delete req.body.isHeadOffice;
    }

    branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    await Activity.create({
      action: 'Branch Updated',
      module: 'Branch',
      details: `Updated branch ${branch.name} (${branch.code})`,
      user: req.user._id,
      userName: req.user.name,
      branch: branch._id,
    });

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete branch (soft delete / toggle active or hard delete if no users)
// @route   DELETE /api/branches/:id
// @access  Private (Super Admin only)
export const deleteBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    if (branch.isHeadOffice) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the Head Office branch',
      });
    }

    // Check if any users are assigned
    const userCount = await User.countDocuments({ branch: branch._id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete branch because ${userCount} user(s) are assigned to it. Reassign users first.`,
      });
    }

    await Branch.findByIdAndDelete(req.params.id);

    await Activity.create({
      action: 'Branch Deleted',
      module: 'Branch',
      details: `Deleted branch ${branch.name}`,
      user: req.user._id,
      userName: req.user.name,
    });

    res.json({ success: true, message: 'Branch removed successfully' });
  } catch (err) {
    next(err);
  }
};
