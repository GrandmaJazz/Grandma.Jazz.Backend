// backend/src/models/Order.js
const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../config/constants');

const orderItemSchema = mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  weight: {
    type: Number,
    required: true
  }
});

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    orderItems: [orderItemSchema],
    shippingAddress: {
      type: String,
      required: true
    },
    contactPhone: {
      type: String,
      required: true
    },
    destinationCountry: {
      type: String,
      required: true
    },
    shippingCost: {
      type: Number,
      required: true,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING
    },
    paymentId: {
      type: String
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date
    },
    // เพิ่มฟิลด์ trackingNumber
    trackingNumber: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;