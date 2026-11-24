import CashBankAccount from '../models/CashBankAccount.js';
import AccountTransaction from '../models/AccountTransaction.js';
import Branch from '../models/Branch.js';
import { toCents, fromCents, roundMoney } from '../utils/financialCalculations.js';

// @desc    Get all cash & bank accounts
// @route   GET /api/cash-bank/accounts
// @access  Private
export const getAccounts = async (req, res, next) => {
  try {
    let query = {};
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branch) {
      query.branch = req.query.branch;
    }

    if (req.query.accountType) query.accountType = req.query.accountType;
    if (req.query.currency) query.currency = req.query.currency;
    if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

    const accounts = await CashBankAccount.find(query)
      .populate('branch', 'name code')
      .sort({ accountType: 1, accountName: 1 });

    res.json({ success: true, count: accounts.length, data: accounts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single cash/bank account details
// @route   GET /api/cash-bank/accounts/:id
// @access  Private
export const getAccountById = async (req, res, next) => {
  try {
    const account = await CashBankAccount.findById(req.params.id).populate('branch', 'name code');
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(account.branch._id || account.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

// @desc    Create cash or bank account
// @route   POST /api/cash-bank/accounts
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createAccount = async (req, res, next) => {
  try {
    const {
      branchId,
      accountName,
      accountType,
      bankName = '',
      accountNumber = '',
      accountReference = '',
      currency = 'USD',
      openingBalance = 0,
      openingBalanceDate,
    } = req.body;

    const targetBranchId = req.user.role === 'Super Admin' && branchId ? branchId : (req.user.branch?._id || req.user.branch);
    const branchDoc = await Branch.findById(targetBranchId);
    if (!branchDoc) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID' });
    }

    if (!accountName || !accountType) {
      return res.status(400).json({ success: false, message: 'Account name and account type are required' });
    }

    const initialBalance = roundMoney(Number(openingBalance || 0));

    const account = await CashBankAccount.create({
      branch: targetBranchId,
      accountName: accountName.trim(),
      accountType,
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountReference: accountReference.trim(),
      currency,
      openingBalance: initialBalance,
      openingBalanceDate: openingBalanceDate ? new Date(openingBalanceDate) : new Date(),
      currentBalance: initialBalance,
      createdBy: req.user._id,
    });

    // If initial balance > 0, post Opening Balance transaction
    if (initialBalance !== 0) {
      await AccountTransaction.create({
        account: account._id,
        branch: targetBranchId,
        transactionNumber: `OPB-${account._id.toString().slice(-6).toUpperCase()}`,
        transactionDate: account.openingBalanceDate,
        transactionType: 'Opening Balance',
        description: 'Opening Balance initialization',
        debit: initialBalance < 0 ? Math.abs(initialBalance) : 0,
        credit: initialBalance > 0 ? initialBalance : 0,
        balance: initialBalance,
        currency,
        referenceId: account._id,
        referenceType: 'CashBankAccount',
        referenceNumber: 'INITIAL-BALANCE',
        createdBy: req.user._id,
      });
    }

    res.status(201).json({ success: true, message: 'Account created successfully', data: account });
  } catch (error) {
    next(error);
  }
};

// @desc    Update cash/bank account details
// @route   PUT /api/cash-bank/accounts/:id
// @access  Private (Super Admin, Branch Admin)
export const updateAccount = async (req, res, next) => {
  try {
    const account = await CashBankAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(account.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const { accountName, bankName, accountNumber, accountReference, isActive } = req.body;
    if (accountName) account.accountName = accountName.trim();
    if (bankName !== undefined) account.bankName = bankName.trim();
    if (accountNumber !== undefined) account.accountNumber = accountNumber.trim();
    if (accountReference !== undefined) account.accountReference = accountReference.trim();
    if (isActive !== undefined) account.isActive = Boolean(isActive);

    await account.save();
    res.json({ success: true, message: 'Account updated successfully', data: account });
  } catch (error) {
    next(error);
  }
};

// @desc    Get transaction ledger for an account
// @route   GET /api/cash-bank/accounts/:id/transactions
// @access  Private
export const getAccountTransactions = async (req, res, next) => {
  try {
    const account = await CashBankAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(account.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    let query = { account: account._id };
    if (req.query.startDate || req.query.endDate) {
      query.transactionDate = {};
      if (req.query.startDate) query.transactionDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.transactionDate.$lte = new Date(req.query.endDate);
    }
    if (req.query.transactionType) {
      query.transactionType = req.query.transactionType;
    }

    const transactions = await AccountTransaction.find(query)
      .populate('createdBy', 'name email')
      .sort({ transactionDate: -1, createdAt: -1 });

    res.json({
      success: true,
      account: {
        _id: account._id,
        accountName: account.accountName,
        accountType: account.accountType,
        currency: account.currency,
        currentBalance: account.currentBalance,
      },
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manual adjustment for cash/bank balance
// @route   POST /api/cash-bank/accounts/:id/adjust
// @access  Private (Super Admin, Branch Admin, Accounts)
export const adjustAccountBalance = async (req, res, next) => {
  try {
    const { amount, adjustmentType, reason, referenceNumber } = req.body;
    if (!amount || Number(amount) <= 0 || !adjustmentType || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Amount (> 0), adjustmentType ("Deposit" or "Withdrawal"), and reason are required',
      });
    }

    const account = await CashBankAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = String(req.user.branch?._id || req.user.branch);
      if (String(account.branch) !== userBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const numAmount = roundMoney(Number(amount));
    const curCents = toCents(account.currentBalance);
    const adjCents = toCents(numAmount);

    let debit = 0;
    let credit = 0;
    let newBalCents = curCents;

    if (adjustmentType === 'Deposit') {
      credit = numAmount;
      newBalCents = curCents + adjCents;
    } else if (adjustmentType === 'Withdrawal') {
      debit = numAmount;
      newBalCents = curCents - adjCents;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid adjustment type' });
    }

    account.currentBalance = fromCents(newBalCents);
    await account.save();

    const tx = await AccountTransaction.create({
      account: account._id,
      branch: account.branch,
      transactionNumber: `ADJ-${Date.now().toString().slice(-6)}`,
      transactionDate: new Date(),
      transactionType: 'Adjustment',
      description: `Manual Adjustment: ${reason.trim()}`,
      debit,
      credit,
      balance: account.currentBalance,
      currency: account.currency,
      referenceId: account._id,
      referenceType: 'CashBankAccount',
      referenceNumber: referenceNumber || 'MANUAL-ADJUSTMENT',
      notes: reason.trim(),
      createdBy: req.user._id,
    });

    res.json({ success: true, message: 'Account balance adjusted successfully', account, transaction: tx });
  } catch (error) {
    next(error);
  }
};
