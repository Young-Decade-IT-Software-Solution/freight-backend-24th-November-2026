import Counter from '../models/Counter.js';
import Branch from '../models/Branch.js';

/**
 * Clean branch code for sequence prefixes
 * e.g., 'HQ-DXB' -> 'DXB', 'BR-RTM' -> 'RTM', 'BR-SIN' -> 'SIN', 'BR-SHA' -> 'SHA', 'BR-IST' -> 'IST'
 */
export const sanitizeBranchCode = (code = '') => {
  const parts = code.toUpperCase().split('-');
  return parts.length > 1 ? parts[1] : parts[0] || 'HQ';
};

/**
 * Concurrency-safe atomic sequence generator using MongoDB findOneAndUpdate
 * @param {string} type - 'INV', 'REC', 'BIL', 'SPY', 'EXP', 'SUP'
 * @param {string|ObjectId} branchId - Branch reference (required for branch-scoped sequences)
 * @param {number} [year] - Calendar year (defaults to current year)
 */
export const generateNextSequence = async (type, branchId = null, year = null) => {
  const currentYear = year || new Date().getFullYear();
  let branchCode = 'GLOBAL';

  if (branchId) {
    const branch = await Branch.findById(branchId);
    if (branch && branch.code) {
      branchCode = sanitizeBranchCode(branch.code);
    }
  }

  if (type === 'SUP') {
    const counterKey = 'supplier_code_seq';
    const counter = await Counter.findOneAndUpdate(
      { _id: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const seqStr = String(counter.seq).padStart(5, '0');
    return `SUP-${seqStr}`;
  }

  // Branch-scoped annual sequence key
  const counterKey = `${type.toLowerCase()}_${branchCode}_${currentYear}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const seqStr = String(counter.seq).padStart(5, '0');
  return `${type}-${branchCode}-${currentYear}-${seqStr}`;
};
