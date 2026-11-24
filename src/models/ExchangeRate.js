import mongoose from 'mongoose';

const exchangeRateSchema = new mongoose.Schema(
  {
    fromCurrency: { type: String, required: true, uppercase: true, trim: true },
    toCurrency: { type: String, required: true, uppercase: true, trim: true },
    rate: { type: Number, required: true, min: 0.000001 },
    effectiveDate: { type: Date, default: Date.now, required: true },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

exchangeRateSchema.index({ fromCurrency: 1, toCurrency: 1, effectiveDate: -1 });

export default mongoose.model('ExchangeRate', exchangeRateSchema);
