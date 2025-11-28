const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  eventDate: {
    type: Date,
    required: true
  },
  eventTime: {
    type: String,
    required: false,
    default: '19:00'
  },
  ticketPrice: {
    type: Number,
    required: true,
    default: 0
  },
  totalTickets: {
    type: Number,
    required: true,
    default: 100,
    min: 1
  },
  soldTickets: {
    type: Number,
    default: 0,
    min: 0
  },
  videoPath: {
    type: String,
    default: '/videos/event-background.webm'
  },
  videoS3Key: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
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

// Virtual field for available tickets
eventSchema.virtual('availableTickets').get(function() {
  return Math.max(0, this.totalTickets - this.soldTickets);
});

// Virtual field for sold out status
eventSchema.virtual('isSoldOut').get(function() {
  return this.soldTickets >= this.totalTickets;
});

// Include virtuals when converting to JSON
eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

// Update the updatedAt field before saving
eventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Update the updatedAt field before updating
eventSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

module.exports = mongoose.model('Event', eventSchema); 