import User, { USER_ROLES } from '../models/User.js';
import Branch from '../models/Branch.js';
import Activity from '../models/Activity.js';

// @desc    Get all users (branch scoped for non-Super Admin)
// @route   GET /api/users
// @access  Private (Super Admin, Branch Admin)
export const getUsers = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role === 'Super Admin') {
      if (req.query.branchId) {
        query.branch = req.query.branchId;
      }
    } else if (req.user.role === 'Branch Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else {
      // General staff only see users in their own branch
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    }

    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      query.$or = [{ name: regex }, { email: regex }, { department: regex }];
    }

    const users = await User.find(query)
      .populate('branch', 'name code city country')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('branch');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Role security check
    if (req.user.role !== 'Super Admin') {
      const reqBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const targetBranchId = user.branch?._id?.toString() || user.branch?.toString();
      if (reqBranchId !== targetBranchId && req.user._id.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied to this user record' });
      }
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private (Super Admin, Branch Admin)
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, branch, phone, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required',
      });
    }

    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${USER_ROLES.join(', ')}`,
      });
    }

    // Branch Admin can only create users within their own branch and cannot create Super Admin
    let assignedBranch = branch;
    if (req.user.role === 'Branch Admin') {
      if (role === 'Super Admin') {
        return res.status(403).json({
          success: false,
          message: 'Branch Admins cannot create Super Admins',
        });
      }
      assignedBranch = req.user.branch?._id || req.user.branch;
    }

    if (role !== 'Super Admin' && !assignedBranch) {
      return res.status(400).json({
        success: false,
        message: 'A branch must be assigned for this role',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role,
      branch: role === 'Super Admin' ? (assignedBranch || null) : assignedBranch,
      phone: phone || '',
      department: department || '',
    });

    await Activity.create({
      action: 'User Created',
      module: 'User',
      details: `Created user ${newUser.name} with role ${newUser.role}`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populatedUser = await User.findById(newUser._id).populate('branch');

    res.status(201).json({
      success: true,
      data: populatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Super Admin, Branch Admin)
export const updateUser = async (req, res, next) => {
  try {
    let user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Branch Admin checks
    if (req.user.role === 'Branch Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const targetBranchId = user.branch?._id?.toString() || user.branch?.toString();
      if (userBranchId !== targetBranchId) {
        return res.status(403).json({
          success: false,
          message: 'Branch Admins can only edit users within their branch',
        });
      }
      if (req.body.role === 'Super Admin') {
        return res.status(403).json({
          success: false,
          message: 'Branch Admins cannot promote users to Super Admin',
        });
      }
      // Cannot move user to another branch
      delete req.body.branch;
    }

    // If password provided, hash it
    if (req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters',
        });
      }
      user.password = req.body.password;
    }

    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email.toLowerCase();
    if (req.body.role) user.role = req.body.role;
    if (req.body.branch !== undefined) user.branch = req.body.branch || null;
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    if (req.body.department !== undefined) user.department = req.body.department;
    if (req.body.isActive !== undefined) user.isActive = req.body.isActive;

    await user.save();

    await Activity.create({
      action: 'User Updated',
      module: 'User',
      details: `Updated user ${user.name} (${user.email})`,
      user: req.user._id,
      userName: req.user.name,
      branch: user.branch,
    });

    const updatedUser = await User.findById(user._id).populate('branch');

    res.json({
      success: true,
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Super Admin only)
export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    await User.findByIdAndDelete(req.params.id);

    await Activity.create({
      action: 'User Deleted',
      module: 'User',
      details: `Deleted user ${user.name} (${user.email})`,
      user: req.user._id,
      userName: req.user.name,
      branch: user.branch,
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
