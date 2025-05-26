// backend/src/models/Order.js
const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../config/constants');

const orderItemSchema = mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'productType', // 🆕 ใช้ refPath แทน ref
    required: false // 🆕 ไม่ required สำหรับ ticket
  },
  productType: {
    type: String,
    enum: ['Product', 'Event'], // 🆕 เพิ่ม Event
    default: 'Product'
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
  // 🆕 เพิ่มฟิลด์สำหรับ ticket
  ticketReference: {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    attendees: [{
      firstName: String,
      lastName: String
    }],
    isTicketOrder: {
      type: Boolean,
      default: false
    }
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