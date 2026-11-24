import ExchangeRate from '../models/ExchangeRate.js';

// Default initial rates relative to USD if not set
const DEFAULT_RATES = [
  { fromCurrency: 'USD', toCurrency: 'AED', rate: 3.6725 },
  { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.92 },
  { fromCurrency: 'USD', toCurrency: 'SAR', rate: 3.75 },
  { fromCurrency: 'USD', toCurrency: 'TRY', rate: 34.50 },
  { fromCurrency: 'USD', toCurrency: 'CNY', rate: 7.24 },
  { fromCurrency: 'USD', toCurrency: 'INR', rate: 84.40 },
  { fromCurrency: 'USD', toCurrency: 'GBP', rate: 0.79 },
];

// Helper to seed initial rates
const ensureInitialRates = async () => {
  const count = await ExchangeRate.countDocuments();
  if (count === 0) {
    const docs = DEFAULT_RATES.map((r) => ({
      ...r,
      effectiveDate: new Date(),
      notes: 'Initial default benchmark rate',
    }));
    await ExchangeRate.insertMany(docs);
  }
};

// @desc    Get latest exchange rates
// @route   GET /api/financial-settings /api/exchange-rates
// @access  Private
export const getExchangeRates = async (req, res, next) => {
  try {
    await ensureInitialRates();

    // Get the most recent rate for each unique (fromCurrency, toCurrency)
    const rates = await ExchangeRate.aggregate([
      { $sort: { effectiveDate: -1, createdAt: -1 } },
      {
        $group: {
          _id: { fromCurrency: '$fromCurrency', toCurrency: '$toCurrency' },
          latestId: { $first: '$_id' },
          fromCurrency: { $first: '$fromCurrency' },
          toCurrency: { $first: '$toCurrency' },
          rate: { $first: '$rate' },
          effectiveDate: { $first: '$effectiveDate' },
          notes: { $first: '$notes' },
          updatedAt: { $first: '$updatedAt' },
        },
      },
      { $sort: { fromCurrency: 1, toCurrency: 1 } },
    ]);

    res.json({
      success: true,
      baseCurrency: 'USD',
      supportedCurrencies: ['USD', 'EUR', 'AED', 'SAR', 'TRY', 'CNY', 'INR', 'GBP'],
      count: rates.length,
      data: rates,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add / Update an exchange rate
// @route   POST /api/exchange-rates
// @access  Private (Super Admin, Accounts)
export const setExchangeRate = async (req, res, next) => {
  try {
    const { fromCurrency, toCurrency, rate, effectiveDate, notes } = req.body;

    if (!fromCurrency || !toCurrency || !rate || Number(rate) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'fromCurrency, toCurrency, and a positive rate are required',
      });
    }

    const doc = await ExchangeRate.create({
      fromCurrency: fromCurrency.toUpperCase().trim(),
      toCurrency: toCurrency.toUpperCase().trim(),
      rate: Number(rate),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      notes: notes || '',
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Exchange rate saved successfully', data: doc });
  } catch (error) {
    next(error);
  }
};

// @desc    Get rate history for currency pair
// @route   GET /api/exchange-rates/history
// @access  Private
export const getExchangeRateHistory = async (req, res, next) => {
  try {
    const { fromCurrency, toCurrency } = req.query;
    let filter = {};
    if (fromCurrency) filter.fromCurrency = fromCurrency.toUpperCase();
    if (toCurrency) filter.toCurrency = toCurrency.toUpperCase();

    const history = await ExchangeRate.find(filter)
      .populate('createdBy', 'name email')
      .sort({ effectiveDate: -1, createdAt: -1 })
      .limit(100);

    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    next(error);
  }
};
