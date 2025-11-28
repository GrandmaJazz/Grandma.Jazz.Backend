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
    enum: ['pending', 'paid', 'cancelled', 'expired'],
    default: 'pending'
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Set expiration to 24 hours from creation for pending tickets
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
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

// Virtual field to check if ticket is expired
ticketSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && new Date() > this.expiresAt;
});

// Include virtuals when converting to JSON
ticketSchema.set('toJSON', { virtuals: true });
ticketSchema.set('toObject', { virtuals: true });

// Generate unique ticket number and set expiration
ticketSchema.pre('save', function(next) {
  if (!this.ticketNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.ticketNumber = `TKT-${timestamp.slice(-6)}-${random}`;
  }
  
  // Set expiration for new pending tickets
  if (this.isNew && this.status === 'pending') {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  // Clear expiration when ticket is paid
  if (this.status === 'paid') {
    this.expiresAt = null;
  }
  
  this.updatedAt = Date.now();
  next();
});

// Update the updatedAt field before updating
ticketSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Create index for automatic expiration
ticketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Ticket', ticketSchema); 