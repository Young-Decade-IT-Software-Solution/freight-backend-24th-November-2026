import Expense from '../models/Expense.js';
import ExpenseCategory, { DEFAULT_CATEGORIES } from '../models/ExpenseCategory.js';
import CashBankAccount from '../models/CashBankAccount.js';
import AccountTransaction from '../models/AccountTransaction.js';
import Branch from '../models/Branch.js';
import { generateNextSequence } from '../utils/sequenceGenerator.js';
import { toCents, fromCents, roundMoney } from '../utils/financialCalculations.js';

// Helper to seed default categories if none exist
const ensureDefaultCategories = async () => {
  const count = await ExpenseCategory.countDocuments();
  if (count === 0) {
    const docs = DEFAULT_CATEGORIES.map((cat) => ({
      name: cat,
      isDefault: true,
      isActive: true,
    }));
    await ExpenseCategory.insertMany(docs);
  }
};

// @desc    Get expense categories
// @route   GET /api/expenses/categories
// @access  Private
export const getExpenseCategories = async (req, res, next) => {
  try {
    await ensureDefaultCategories();
    const categories = await ExpenseCategory.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new expense category
// @route   POST /api/expenses/categories
// @access  Private (Manager/Super Admin)
export const createExpenseCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    const existing = await ExpenseCategory.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }
    const cat = await ExpenseCategory.create({
      name: name.trim(),
      description: description || '',
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all expenses with filtering & branch scoping
// @route   GET /api/expenses
// @access  Private
export const getExpenses = async (req, res, next) => {
  try {
    let query = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branch) {
      query.branch = req.query.branch;
    }

    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.category = req.query.category;
    if (req.query.currency) query.currency = req.query.currency;
    if (req.query.shipment) query.shipment = req.query.shipment;

    if (req.query.startDate || req.query.endDate) {
      query.expenseDate = {};
      if (req.query.startDate) query.expenseDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.expenseDate.$lte = new Date(req.query.endDate);
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { expenseNumber: searchRegex },
        { description: searchRegex },
        { vendor: searchRegex },
        { referenceNumber: searchRegex },
      ];
    }

    const expenses = await Expense.find(query)
      .populate('branch', 'name code')
      .populate('account', 'accountName accountType currency bankName')
      .populate('shipment', 'shipmentNumber origin destination')
      .populate('recordedBy', 'name email')
      .sort({ expenseDate: -1, createdAt: -1 });

    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single expense by ID
// @route   GET /api/expenses/:id
// @access  Private
export const getExpenseById = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('branch', 'name code')
      .populate('account', 'accountName accountType currency bankName')
      .populate('shipment', 'shipmentNumber origin destination freightType status')
      .populate('recordedBy', 'name email')
      .populate('voidedBy', 'name email');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(expense.branch._id || expense.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this branch expense' });
      }
    }

    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

// @desc    Record a new expense
// @route   POST /api/expenses
// @access  Private
export const createExpense = async (req, res, next) => {
  try {
    const {
      branchId,
      expenseDate,
      category,
      description,
      amount,
      tax = 0,
      currency = 'USD',
      paymentMethod = 'Cash',
      accountId,
      vendor = '',
      shipmentId,
      referenceNumber = '',
      attachment = '',
      notes = '',
      status = 'Recorded',
    } = req.body;

    const targetBranchId = req.user.role === 'Super Admin' && branchId ? branchId : (req.user.branch?._id || req.user.branch);
    const branchDoc = await Branch.findById(targetBranchId);
    if (!branchDoc) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID' });
    }

    if (!category || !description || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Category, description, and positive amount are required' });
    }

    const branchCode = branchDoc.code || 'HQ-DXB';
    const expenseNumber = await generateNextSequence('EXP', targetBranchId);

    const numAmount = roundMoney(Number(amount));
    const numTax = roundMoney(Number(tax || 0));
    const totalAmount = roundMoney(numAmount + numTax);

    let accountDoc = null;
    if (accountId) {
      accountDoc = await CashBankAccount.findById(accountId);
      if (!accountDoc) {
        return res.status(400).json({ success: false, message: 'Selected cash/bank account not found' });
      }
      if (accountDoc.currency !== currency) {
        return res.status(400).json({
          success: false,
          message: `Account currency (${accountDoc.currency}) does not match expense currency (${currency})`,
        });
      }
    }

    const expense = await Expense.create({
      expenseNumber,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      branch: targetBranchId,
      branchCode,
      category,
      description,
      amount: numAmount,
      tax: numTax,
      totalAmount,
      currency,
      paymentMethod,
      account: accountId || null,
      vendor,
      shipment: shipmentId || null,
      referenceNumber,
      attachment,
      notes,
      status,
      recordedBy: req.user._id,
      createdBy: req.user._id,
    });

    // If Recorded & account linked, update account balance & create AccountTransaction
    if (status === 'Recorded' && accountDoc) {
      const prevBalCents = toCents(accountDoc.currentBalance);
      const expenseCents = toCents(totalAmount);
      const newBalCents = prevBalCents - expenseCents;
      accountDoc.currentBalance = fromCents(newBalCents);
      await accountDoc.save();

      await AccountTransaction.create({
        account: accountDoc._id,
        branch: targetBranchId,
        transactionNumber: expenseNumber,
        transactionDate: expense.expenseDate,
        transactionType: 'Expense',
        description: `Expense: ${category} - ${description}`,
        debit: totalAmount, // Outflow
        credit: 0,
        balance: accountDoc.currentBalance,
        currency,
        referenceId: expense._id,
        referenceType: 'Expense',
        referenceNumber: expenseNumber,
        notes: `Vendor: ${vendor || 'N/A'}, Ref: ${referenceNumber || 'N/A'}`,
        createdBy: req.user._id,
      });
    }

    res.status(201).json({ success: true, message: 'Expense recorded successfully', data: expense });
  } catch (error) {
    next(error);
  }
};

// @desc    Update draft or details of an expense
// @route   PUT /api/expenses/:id
// @access  Private
export const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    if (expense.status === 'Void') {
      return res.status(400).json({ success: false, message: 'Cannot edit a voided expense' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(expense.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to edit this expense' });
      }
    }

    const { category, description, vendor, referenceNumber, notes, attachment } = req.body;
    if (category) expense.category = category;
    if (description) expense.description = description;
    if (vendor !== undefined) expense.vendor = vendor;
    if (referenceNumber !== undefined) expense.referenceNumber = referenceNumber;
    if (notes !== undefined) expense.notes = notes;
    if (attachment !== undefined) expense.attachment = attachment;

    await expense.save();
    res.json({ success: true, message: 'Expense updated successfully', data: expense });
  } catch (error) {
    next(error);
  }
};

// @desc    Void an expense record (reverses account transaction)
// @route   POST /api/expenses/:id/void
// @access  Private (Branch Admin, Super Admin, Accounts)
export const voidExpense = async (req, res, next) => {
  try {
    const { voidReason } = req.body;
    if (!voidReason || !voidReason.trim()) {
      return res.status(400).json({ success: false, message: 'Void reason is required' });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    if (expense.status === 'Void') {
      return res.status(400).json({ success: false, message: 'Expense is already voided' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(expense.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    expense.status = 'Void';
    expense.voidedAt = new Date();
    expense.voidedBy = req.user._id;
    expense.voidReason = voidReason.trim();
    await expense.save();

    // If an account was previously debited, reverse it
    if (expense.account) {
      const accountDoc = await CashBankAccount.findById(expense.account);
      if (accountDoc) {
        const prevBalCents = toCents(accountDoc.currentBalance);
        const expenseCents = toCents(expense.totalAmount);
        const newBalCents = prevBalCents + expenseCents;
        accountDoc.currentBalance = fromCents(newBalCents);
        await accountDoc.save();

        await AccountTransaction.create({
          account: accountDoc._id,
          branch: expense.branch,
          transactionNumber: `${expense.expenseNumber}-VOID`,
          transactionDate: new Date(),
          transactionType: 'Expense Void',
          description: `Void Expense: ${expense.expenseNumber} - ${expense.description}`,
          debit: 0,
          credit: expense.totalAmount, // Inflow restoration
          balance: accountDoc.currentBalance,
          currency: expense.currency,
          referenceId: expense._id,
          referenceType: 'Expense',
          referenceNumber: expense.expenseNumber,
          notes: `Reason: ${voidReason.trim()}`,
          createdBy: req.user._id,
        });
      }
    }

    res.json({ success: true, message: 'Expense successfully voided and reversed', data: expense });
  } catch (error) {
    next(error);
  }
};
