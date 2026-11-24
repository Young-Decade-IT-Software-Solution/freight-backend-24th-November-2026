import mongoose from 'mongoose';

export const DEFAULT_MILESTONE_TITLES = [
  'Booking Confirmed',
  'Cargo Received',
  'Origin Customs Completed',
  'Departed Origin',
  'Arrived at Destination',
  'Destination Customs Completed',
  'Out for Delivery',
  'Delivered',
];

const shipmentMilestoneSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Milestone title is required'],
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Delayed'],
      default: 'Pending',
    },
    completedDate: {
      type: Date,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    completedByName: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

shipmentMilestoneSchema.index({ shipment: 1, order: 1 });

export default mongoose.model('ShipmentMilestone', shipmentMilestoneSchema);
