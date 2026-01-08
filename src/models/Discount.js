// backend/src/models/Discount.js
const mongoose = require('mongoose');

const discountSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    discountType: {
      type: String,
      required: true,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    usedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    validFrom: {
      type: Date,
      default: Date.now
    },
    validUntil: {
      type: Date
    },
    description: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Index for faster lookups
discountSchema.index({ code: 1 });
discountSchema.index({ isActive: 1 });

// Method to check if discount is valid
discountSchema.methods.isValid = function() {
  const now = new Date();
  
  // Check if active
  if (!this.isActive) {
    return { valid: false, message: 'ส่วนลดนี้ถูกปิดการใช้งาน' };
  }
  
  // Check validity period
  if (this.validFrom && now < this.validFrom) {
    return { valid: false, message: 'ส่วนลดยังไม่สามารถใช้งานได้' };
  }
  
  if (this.validUntil && now > this.validUntil) {
    return { valid: false, message: 'ส่วนลดหมดอายุแล้ว' };
  }
  
  return { valid: true };
};

// Method to check if user has already used this discount
discountSchema.methods.hasUserUsed = function(userId) {
  return this.usedBy.some(id => id.toString() === userId.toString());
};

// Method to apply discount to an amount
discountSchema.methods.applyDiscount = function(amount) {
  if (this.discountType === 'percentage') {
    const discountAmount = (amount * this.value) / 100;
    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalAmount: Math.round((amount - discountAmount) * 100) / 100
    };
  } else {
    // Fixed amount
    const discountAmount = Math.min(this.value, amount);
    return {
      discountAmount: discountAmount,
      finalAmount: Math.round((amount - discountAmount) * 100) / 100
    };
  }
};

const Discount = mongoose.model('Discount', discountSchema);

module.exports = Discount;

