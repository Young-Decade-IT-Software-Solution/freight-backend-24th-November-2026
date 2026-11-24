import CustomerReceipt from '../models/CustomerReceipt.js';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import Branch from '../models/Branch.js';
import CashBankAccount from '../models/CashBankAccount.js';
import AccountTransaction from '../models/AccountTransaction.js';
import Activity from '../models/Activity.js';
import { generateNextSequence, sanitizeBranchCode } from '../utils/sequenceGenerator.js';
import { roundMoney, toCents, fromCents } from '../utils/financialCalculations.js';

// @desc    Get all customer receipts
// @route   GET /api/receipts
// @access  Private
export const getReceipts = async (req, res, next) => {
  try {
    let query = {};

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.customerId) query.customer = req.query.customerId;
    if (req.query.accountId) query.account = req.query.accountId;
    if (req.query.status) query.status = req.query.status;

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      const matchingCustomers = await Customer.find({
        $or: [{ companyName: regex }, { contactPerson: regex }],
      }).select('_id');
      const custIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { receiptNumber: regex },
        { transactionReference: regex },
        { customer: { $in: custIds } },
      ];
    }

    if (req.query.startDate && req.query.endDate) {
      query.receiptDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const [total, receipts] = await Promise.all([
      CustomerReceipt.countDocuments(query),
      CustomerReceipt.find(query)
        .populate('customer', 'customerCode companyName contactPerson')
        .populate('branch', 'name code city country')
        .populate('account', 'accountName accountType bankName currency')
        .populate('receivedBy', 'name email')
        .sort({ receiptDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      count: receipts.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: receipts,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single receipt by ID
// @route   GET /api/receipts/:id
// @access  Private
export const getReceiptById = async (req, res, next) => {
  try {
    const receipt = await CustomerReceipt.findById(req.params.id)
      .populate('customer')
      .populate('branch')
      .populate('account')
      .populate('allocations.invoice')
      .populate('receivedBy', 'name email')
      .populate('reversedBy', 'name email');

    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== receipt.branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: receipt });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new customer receipt and allocate to invoice(s)
// @route   POST /api/receipts
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createReceipt = async (req, res, next) => {
  try {
    const customerId = req.body.customer || req.body.customerId;
    const branchIdInput = req.body.branch || req.body.branchId;
    const accountId = req.body.account || req.body.accountId;
    const paymentMethod = req.body.paymentMethod || req.body.paymentMode || 'Bank Transfer';
    const transactionReference = req.body.transactionReference || req.body.referenceNumber || '';
    const {
      receiptDate,
      currency,
      amount,
      allocations = [],
      notes,
    } = req.body;

    if (!customerId) return res.status(400).json({ success: false, message: 'Customer is required' });
    if (!accountId) return res.status(400).json({ success: false, message: 'Cash/Bank Account is required' });

    const totalReceiptAmount = roundMoney(amount);
    if (totalReceiptAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Receipt amount must be greater than zero' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const account = await CashBankAccount.findById(accountId);
    if (!account) return res.status(404).json({ success: false, message: 'Cash/Bank Account not found' });

    // Multi-currency safety: ensure receipt currency matches account currency
    const receiptCurrency = currency || account.currency || 'USD';
    if (account.currency !== receiptCurrency) {
      return res.status(400).json({
        success: false,
        message: `Account currency (${account.currency}) does not match receipt currency (${receiptCurrency}). Multi-currency transactions require compatible accounts.`,
      });
    }

    // Branch scoping
    let assignedBranch = req.user.branch?._id || req.user.branch;
    if (req.user.role === 'Super Admin' && branchIdInput) {
      assignedBranch = branchIdInput;
    }
    const branchDoc = await Branch.findById(assignedBranch);
    if (!branchDoc) return res.status(400).json({ success: false, message: 'Valid branch required' });

    // Validate allocations against invoice outstanding balance
    let totalAllocatedCents = 0;
    const validatedAllocations = [];

    for (const alloc of allocations) {
      const allocAmount = roundMoney(alloc.amount || alloc.allocatedAmount);
      if (allocAmount <= 0) continue;

      const invoice = await Invoice.findById(alloc.invoice);
      if (!invoice) {
        return res.status(404).json({ success: false, message: `Invoice not found for ID ${alloc.invoice}` });
      }

      if (invoice.currency !== receiptCurrency) {
        return res.status(400).json({
          success: false,
          message: `Invoice ${invoice.invoiceNumber} currency (${invoice.currency}) does not match receipt currency (${receiptCurrency}).`,
        });
      }

      if (invoice.status === 'Void') {
        return res.status(400).json({
          success: false,
          message: `Cannot allocate payment to voided invoice ${invoice.invoiceNumber}.`,
        });
      }

      // Check over-allocation
      if (toCents(allocAmount) > toCents(invoice.balanceAmount)) {
        return res.status(400).json({
          success: false,
          message: `Allocation of ${receiptCurrency} ${allocAmount} exceeds outstanding balance of ${invoice.invoiceNumber} (${receiptCurrency} ${invoice.balanceAmount}).`,
        });
      }

      totalAllocatedCents += toCents(allocAmount);
      validatedAllocations.push({
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        amount: allocAmount,
        invoiceDoc: invoice,
      });
    }

    if (totalAllocatedCents > toCents(totalReceiptAmount)) {
      return res.status(400).json({
        success: false,
        message: `Total allocated amount (${fromCents(totalAllocatedCents)}) cannot exceed received amount (${totalReceiptAmount}).`,
      });
    }

    const allocatedAmount = fromCents(totalAllocatedCents);
    const unallocatedAmount = roundMoney(totalReceiptAmount - allocatedAmount);

    // Concurrency-safe atomic receipt numbering
    const receiptNumber = await generateNextSequence('REC', assignedBranch);

    // Create CustomerReceipt
    const receipt = await CustomerReceipt.create({
      receiptNumber,
      receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
      customer: customer._id,
      branch: assignedBranch,
      branchCode: sanitizeBranchCode(branchDoc.code),
      paymentMethod: paymentMethod || 'Bank Transfer',
      account: account._id,
      transactionReference: transactionReference || '',
      currency: receiptCurrency,
      amount: totalReceiptAmount,
      allocatedAmount,
      unallocatedAmount,
      allocations: validatedAllocations.map((a) => ({
        invoice: a.invoice,
        invoiceNumber: a.invoiceNumber,
        amount: a.amount,
      })),
      notes: notes || '',
      status: 'Active',
      receivedBy: req.user._id,
      createdBy: req.user._id,
    });

    // Update allocated Invoices
    for (const item of validatedAllocations) {
      const inv = item.invoiceDoc;
      const newPaidCents = toCents(inv.paidAmount || 0) + toCents(item.amount);
      const newBalCents = Math.max(0, toCents(inv.totalAmount) - newPaidCents);

      inv.paidAmount = fromCents(newPaidCents);
      inv.balanceAmount = fromCents(newBalCents);
      inv.status = newBalCents === 0 ? 'Paid' : 'Partially Paid';

      inv.paymentHistory.push({
        receipt: receipt._id,
        receiptNumber: receipt.receiptNumber,
        amount: item.amount,
        date: receipt.receiptDate,
        recordedBy: req.user._id,
      });

      await inv.save();
    }

    // Update Cash/Bank Account balance & record AccountTransaction
    const prevBalance = account.currentBalance || 0;
    const newBalance = roundMoney(prevBalance + totalReceiptAmount);
    account.currentBalance = newBalance;
    await account.save();

    await AccountTransaction.create({
      account: account._id,
      branch: assignedBranch,
      transactionNumber: receipt.receiptNumber,
      transactionDate: receipt.receiptDate,
      transactionType: 'Customer Receipt',
      description: `Payment received from ${customer.companyName} (${receipt.paymentMethod})`,
      debit: 0,
      credit: totalReceiptAmount,
      balance: newBalance,
      currency: receiptCurrency,
      referenceId: receipt._id,
      referenceType: 'CustomerReceipt',
      referenceNumber: receipt.receiptNumber,
      notes: receipt.notes,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Receipt Created',
      module: 'Accounting',
      details: `Recorded customer receipt ${receipt.receiptNumber} from ${customer.companyName} (${receiptCurrency} ${totalReceiptAmount})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await CustomerReceipt.findById(receipt._id)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code')
      .populate('account', 'accountName accountType currency');

    res.status(201).json({
      success: true,
      message: 'Customer payment recorded successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Controlled reversal of customer receipt
// @route   POST /api/receipts/:id/reverse
// @access  Private (Super Admin, Branch Admin, Accounts)
export const reverseReceipt = async (req, res, next) => {
  try {
    const receipt = await CustomerReceipt.findById(req.params.id);
    if (!receipt) return res.status(404).json({ success: false, message: 'Receipt not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== receipt.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (receipt.isReversed || receipt.status === 'Reversed') {
      return res.status(400).json({ success: false, message: 'Receipt has already been reversed' });
    }

    const reason = req.body.reason || req.body.reversalReason;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reversal reason is required' });
    }

    // Reverse each allocated invoice
    for (const alloc of receipt.allocations) {
      const invoice = await Invoice.findById(alloc.invoice);
      if (invoice) {
        const newPaidCents = Math.max(0, toCents(invoice.paidAmount) - toCents(alloc.amount));
        const newBalCents = Math.min(toCents(invoice.totalAmount), toCents(invoice.balanceAmount) + toCents(alloc.amount));

        invoice.paidAmount = fromCents(newPaidCents);
        invoice.balanceAmount = fromCents(newBalCents);
        invoice.status = newPaidCents === 0 ? 'Issued' : 'Partially Paid';

        invoice.paymentHistory = invoice.paymentHistory.filter(
          (p) => p.receipt?.toString() !== receipt._id.toString()
        );

        await invoice.save();
      }
    }

    // Reverse Cash/Bank Account balance & write Reversal Transaction
    const account = await CashBankAccount.findById(receipt.account);
    if (account) {
      const prevBal = account.currentBalance || 0;
      const newBal = roundMoney(prevBal - receipt.amount);
      account.currentBalance = newBal;
      await account.save();

      await AccountTransaction.create({
        account: account._id,
        branch: receipt.branch,
        transactionNumber: `REV-${receipt.receiptNumber}`,
        transactionDate: new Date(),
        transactionType: 'Customer Receipt Reversal',
        description: `Reversal of Receipt ${receipt.receiptNumber}: ${reason.trim()}`,
        debit: receipt.amount,
        credit: 0,
        balance: newBal,
        currency: receipt.currency,
        referenceId: receipt._id,
        referenceType: 'CustomerReceipt',
        referenceNumber: receipt.receiptNumber,
        notes: reason.trim(),
        createdBy: req.user._id,
      });
    }

    receipt.isReversed = true;
    receipt.status = 'Reversed';
    receipt.reversedAt = new Date();
    receipt.reversedBy = req.user._id;
    receipt.reversalReason = reason.trim();
    await receipt.save();

    await Activity.create({
      action: 'Receipt Reversed',
      module: 'Accounting',
      details: `Reversed customer receipt ${receipt.receiptNumber} (${receipt.currency} ${receipt.amount}). Reason: ${reason.trim()}`,
      user: req.user._id,
      userName: req.user.name,
      branch: receipt.branch,
    });

    res.json({
      success: true,
      message: `Receipt ${receipt.receiptNumber} has been reversed successfully.`,
      data: receipt,
    });
  } catch (err) {
    next(err);
  }
};
