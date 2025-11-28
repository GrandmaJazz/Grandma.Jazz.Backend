//backend/src/models/User.js
const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    name: {
      type: String,
      trim: true
    },
    surname: {
      type: String,
      trim: true
    },
    birthYear: {
      type: Number,
      required: true
    },
    age: {
      type: Number,
      required: true
    },
    phone: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false
    },
    profileComplete: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Virtual method to check if profile is complete
userSchema.methods.isProfileComplete = function() {
  return Boolean(this.name && this.surname && this.phone);
};

// Pre-save hook to update profileComplete status
userSchema.pre('save', function(next) {
  this.profileComplete = this.isProfileComplete();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;