import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g., 'inv_HQ-DXB_2026', 'rec_HQ-DXB_2026', etc.
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Counter', counterSchema);
