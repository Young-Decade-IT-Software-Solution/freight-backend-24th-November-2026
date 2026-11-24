import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['Lead', 'Customer'],
      required: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    followUpDate: {
      type: Date,
      required: [true, 'Follow-up date is required'],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned employee is required'],
    },
    notes: {
      type: String,
      required: [true, 'Follow-up notes are required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    completedAt: {
      type: Date,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('FollowUp', followUpSchema);
