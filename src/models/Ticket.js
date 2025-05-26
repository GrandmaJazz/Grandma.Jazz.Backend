const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [{
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    }
  }],
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  totalAmount: {
    type: Number,
    required: true
  },
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending'
  },
  paymentId: {
    type: String
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate unique ticket number
ticketSchema.pre('save', function(next) {
  if (!this.ticketNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.ticketNumber = `TKT-${timestamp.slice(-6)}-${random}`;
  }
  this.updatedAt = Date.now();
  next();
});

// Update the updatedAt field before updating
ticketSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema); 