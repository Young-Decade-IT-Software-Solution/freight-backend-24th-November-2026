import SupplierPayment from '../models/SupplierPayment.js';
import SupplierBill from '../models/SupplierBill.js';
import Supplier from '../models/Supplier.js';
import Branch from '../models/Branch.js';
import CashBankAccount from '../models/CashBankAccount.js';
import AccountTransaction from '../models/AccountTransaction.js';
import Activity from '../models/Activity.js';
import { generateNextSequence, sanitizeBranchCode } from '../utils/sequenceGenerator.js';
import { roundMoney, toCents, fromCents } from '../utils/financialCalculations.js';

// @desc    Get all supplier payments
// @route   GET /api/supplier-payments
// @access  Private
export const getSupplierPayments = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.supplierId) query.supplier = req.query.supplierId;
    if (req.query.accountId) query.account = req.query.accountId;
    if (req.query.status) query.status = req.query.status;

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      const matchingSuppliers = await Supplier.find({
        $or: [{ companyName: regex }, { contactPerson: regex }],
      }).select('_id');
      const supIds = matchingSuppliers.map((s) => s._id);

      query.$or = [
        { paymentNumber: regex },
        { transactionReference: regex },
        { supplier: { $in: supIds } },
      ];
    }

    if (req.query.startDate && req.query.endDate) {
      query.paymentDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const [total, payments] = await Promise.all([
      SupplierPayment.countDocuments(query),
      SupplierPayment.find(query)
        .populate('supplier', 'supplierCode companyName contactPerson')
        .populate('branch', 'name code city country')
        .populate('account', 'accountName accountType bankName currency')
        .populate('paidBy', 'name email')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      count: payments.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: payments,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single supplier payment by ID
// @route   GET /api/supplier-payments/:id
// @access  Private
export const getSupplierPaymentById = async (req, res, next) => {
  try {
    const payment = await SupplierPayment.findById(req.params.id)
      .populate('supplier')
      .populate('branch')
      .populate('account')
      .populate('allocations.bill')
      .populate('paidBy', 'name email')
      .populate('reversedBy', 'name email');

    if (!payment) return res.status(404).json({ success: false, message: 'Supplier payment not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== payment.branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

// @desc    Create supplier payment
// @route   POST /api/supplier-payments
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createSupplierPayment = async (req, res, next) => {
  try {
    const supplierId = req.body.supplier || req.body.supplierId;
    const branchIdInput = req.body.branch || req.body.branchId;
    const accountId = req.body.account || req.body.accountId;
    const paymentMethod = req.body.paymentMethod || req.body.paymentMode || 'Bank Transfer';
    const transactionReference = req.body.transactionReference || req.body.referenceNumber || '';
    const {
      paymentDate,
      currency,
      amount,
      allocations = [],
      notes,
    } = req.body;

    if (!supplierId) return res.status(400).json({ success: false, message: 'Supplier is required' });
    if (!accountId) return res.status(400).json({ success: false, message: 'Cash/Bank Account is required' });

    const totalPaymentAmount = roundMoney(amount);
    if (totalPaymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const account = await CashBankAccount.findById(accountId);
    if (!account) return res.status(404).json({ success: false, message: 'Cash/Bank Account not found' });

    const paymentCurrency = currency || account.currency || 'USD';
    if (account.currency !== paymentCurrency) {
      return res.status(400).json({
        success: false,
        message: `Account currency (${account.currency}) does not match payment currency (${paymentCurrency}).`,
      });
    }

    let assignedBranch = req.user.branch?._id || req.user.branch;
    if (req.user.role === 'Super Admin' && branchIdInput) {
      assignedBranch = branchIdInput;
    }
    const branchDoc = await Branch.findById(assignedBranch);
    if (!branchDoc) return res.status(400).json({ success: false, message: 'Valid branch required' });

    let totalAllocatedCents = 0;
    const validatedAllocations = [];

    for (const alloc of allocations) {
      const allocAmount = roundMoney(alloc.amount || alloc.allocatedAmount);
      if (allocAmount <= 0) continue;

      const bill = await SupplierBill.findById(alloc.bill);
      if (!bill) {
        return res.status(404).json({ success: false, message: `Supplier bill not found for ID ${alloc.bill}` });
      }

      if (bill.currency !== paymentCurrency) {
        return res.status(400).json({
          success: false,
          message: `Bill ${bill.billNumber} currency (${bill.currency}) does not match payment currency (${paymentCurrency}).`,
        });
      }

      if (bill.status === 'Void') {
        return res.status(400).json({
          success: false,
          message: `Cannot allocate payment to voided bill ${bill.billNumber}.`,
        });
      }

      if (toCents(allocAmount) > toCents(bill.balanceAmount)) {
        return res.status(400).json({
          success: false,
          message: `Allocation of ${paymentCurrency} ${allocAmount} exceeds outstanding balance of bill ${bill.billNumber} (${paymentCurrency} ${bill.balanceAmount}).`,
        });
      }

      totalAllocatedCents += toCents(allocAmount);
      validatedAllocations.push({
        bill: bill._id,
        billNumber: bill.billNumber,
        amount: allocAmount,
        billDoc: bill,
      });
    }

    if (totalAllocatedCents > toCents(totalPaymentAmount)) {
      return res.status(400).json({
        success: false,
        message: `Total allocated amount (${fromCents(totalAllocatedCents)}) cannot exceed payment amount (${totalPaymentAmount}).`,
      });
    }

    const allocatedAmount = fromCents(totalAllocatedCents);
    const unallocatedAmount = roundMoney(totalPaymentAmount - allocatedAmount);

    const paymentNumber = await generateNextSequence('SPY', assignedBranch);

    const payment = await SupplierPayment.create({
      paymentNumber,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      supplier: supplier._id,
      branch: assignedBranch,
      branchCode: sanitizeBranchCode(branchDoc.code),
      paymentMethod: paymentMethod || 'Bank Transfer',
      account: account._id,
      transactionReference: transactionReference || '',
      currency: paymentCurrency,
      amount: totalPaymentAmount,
      allocatedAmount,
      unallocatedAmount,
      allocations: validatedAllocations.map((a) => ({
        bill: a.bill,
        billNumber: a.billNumber,
        amount: a.amount,
      })),
      notes: notes || '',
      status: 'Active',
      paidBy: req.user._id,
      createdBy: req.user._id,
    });

    // Update allocated Supplier Bills
    for (const item of validatedAllocations) {
      const b = item.billDoc;
      const newPaidCents = toCents(b.paidAmount || 0) + toCents(item.amount);
      const newBalCents = Math.max(0, toCents(b.totalAmount) - newPaidCents);

      b.paidAmount = fromCents(newPaidCents);
      b.balanceAmount = fromCents(newBalCents);
      b.status = newBalCents === 0 ? 'Paid' : 'Partially Paid';

      b.paymentHistory.push({
        payment: payment._id,
        paymentNumber: payment.paymentNumber,
        amount: item.amount,
        date: payment.paymentDate,
        recordedBy: req.user._id,
      });

      await b.save();
    }

    // Update Cash/Bank Account balance (outflow = debit) & record AccountTransaction
    const prevBalance = account.currentBalance || 0;
    const newBalance = roundMoney(prevBalance - totalPaymentAmount);
    account.currentBalance = newBalance;
    await account.save();

    await AccountTransaction.create({
      account: account._id,
      branch: assignedBranch,
      transactionNumber: payment.paymentNumber,
      transactionDate: payment.paymentDate,
      transactionType: 'Supplier Payment',
      description: `Payment to ${supplier.companyName} (${payment.paymentMethod})`,
      debit: totalPaymentAmount,
      credit: 0,
      balance: newBalance,
      currency: paymentCurrency,
      referenceId: payment._id,
      referenceType: 'SupplierPayment',
      referenceNumber: payment.paymentNumber,
      notes: payment.notes,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Supplier Payment Created',
      module: 'Accounting',
      details: `Recorded supplier payment ${payment.paymentNumber} to ${supplier.companyName} (${paymentCurrency} ${totalPaymentAmount})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await SupplierPayment.findById(payment._id)
      .populate('supplier', 'supplierCode companyName contactPerson')
      .populate('branch', 'name code')
      .populate('account', 'accountName accountType currency');

    res.status(201).json({
      success: true,
      message: 'Supplier payment recorded successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Controlled reversal of supplier payment
// @route   POST /api/supplier-payments/:id/reverse
// @access  Private (Super Admin, Branch Admin, Accounts)
export const reverseSupplierPayment = async (req, res, next) => {
  try {
    const payment = await SupplierPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Supplier payment not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== payment.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (payment.isReversed || payment.status === 'Reversed') {
      return res.status(400).json({ success: false, message: 'Supplier payment has already been reversed' });
    }

    const reason = req.body.reason || req.body.reversalReason;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reversal reason is required' });
    }

    // Reverse each allocated bill
    for (const alloc of payment.allocations) {
      const bill = await SupplierBill.findById(alloc.bill);
      if (bill) {
        const newPaidCents = Math.max(0, toCents(bill.paidAmount) - toCents(alloc.amount));
        const newBalCents = Math.min(toCents(bill.totalAmount), toCents(bill.balanceAmount) + toCents(alloc.amount));

        bill.paidAmount = fromCents(newPaidCents);
        bill.balanceAmount = fromCents(newBalCents);
        bill.status = newPaidCents === 0 ? 'Approved' : 'Partially Paid';

        bill.paymentHistory = bill.paymentHistory.filter(
          (p) => p.payment?.toString() !== payment._id.toString()
        );

        await bill.save();
      }
    }

    // Restore Cash/Bank Account balance (inflow = credit) & write Reversal Transaction
    const account = await CashBankAccount.findById(payment.account);
    if (account) {
      const prevBal = account.currentBalance || 0;
      const newBal = roundMoney(prevBal + payment.amount);
      account.currentBalance = newBal;
      await account.save();

      await AccountTransaction.create({
        account: account._id,
        branch: payment.branch,
        transactionNumber: `REV-${payment.paymentNumber}`,
        transactionDate: new Date(),
        transactionType: 'Supplier Payment Reversal',
        description: `Reversal of Supplier Payment ${payment.paymentNumber}: ${reason.trim()}`,
        debit: 0,
        credit: payment.amount,
        balance: newBal,
        currency: payment.currency,
        referenceId: payment._id,
        referenceType: 'SupplierPayment',
        referenceNumber: payment.paymentNumber,
        notes: reason.trim(),
        createdBy: req.user._id,
      });
    }

    payment.isReversed = true;
    payment.status = 'Reversed';
    payment.reversedAt = new Date();
    payment.reversedBy = req.user._id;
    payment.reversalReason = reason.trim();
    await payment.save();

    await Activity.create({
      action: 'Supplier Payment Reversed',
      module: 'Accounting',
      details: `Reversed supplier payment ${payment.paymentNumber} (${payment.currency} ${payment.amount}). Reason: ${reason.trim()}`,
      user: req.user._id,
      userName: req.user.name,
      branch: payment.branch,
    });

    res.json({
      success: true,
      message: `Supplier payment ${payment.paymentNumber} has been reversed successfully.`,
      data: payment,
    });
  } catch (err) {
    next(err);
  }
};
