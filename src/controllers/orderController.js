//backend/src/controllers/orderController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { createCheckoutSession, verifyPayment } = require('../services/stripeService');
const { ORDER_STATUS } = require('../config/constants');

// @desc    สร้างคำสั่งซื้อใหม่และเริ่มกระบวนการชำระเงิน
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress } = req.body;
  
  // ตรวจสอบข้อมูลที่จำเป็น
  if (!orderItems || orderItems.length === 0) {
    res.status(400);
    throw new Error('ไม่มีรายการสินค้าในคำสั่งซื้อ');
  }
  
  if (!shippingAddress) {
    res.status(400);
    throw new Error('กรุณาระบุที่อยู่สำหรับจัดส่ง');
  }
  
  // ตรวจสอบข้อมูลผู้ใช้
  const user = await User.findById(req.user._id);
  
  if (!user.profileComplete) {
    res.status(400);
    throw new Error('กรุณากรอกข้อมูลส่วนตัวให้ครบถ้วนก่อนสั่งซื้อ');
  }
  
  if (!user.phone) {
    res.status(400);
    throw new Error('กรุณาระบุเบอร์โทรศัพท์ก่อนสั่งซื้อ');
  }
  
  // ตรวจสอบว่าสินค้าทุกรายการมีอยู่จริงและไม่หมด
  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    
    if (!product) {
      res.status(404);
      throw new Error(`ไม่พบสินค้า: ${item.name}`);
    }
    
    if (product.isOutOfStock) {
      res.status(400);
      throw new Error(`สินค้าหมด: ${product.name}`);
    }
  }
  
  // สร้าง checkout session กับ Stripe
  const { session, order } = await createCheckoutSession(
    orderItems,
    req.user._id,
    shippingAddress,
    user.phone
  );
  
  res.status(201).json({
    success: true,
    sessionId: session.id,
    sessionUrl: session.url,
    order: {
      _id: order._id,
      totalAmount: order.totalAmount,
      status: order.status
    }
  });
});

// @desc    ตรวจสอบสถานะการชำระเงิน
// @route   GET /api/orders/verify-payment/:sessionId
// @access  Private
const checkPaymentStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    res.status(400);
    throw new Error('กรุณาระบุ session ID');
  }
  
  const { success, order } = await verifyPayment(sessionId);
  
  if (success) {
    res.json({
      success: true,
      isPaid: true,
      order: {
        _id: order._id,
        status: order.status,
        paidAt: order.paidAt
      }
    });
  } else {
    res.json({
      success: true,
      isPaid: false
    });
  }
});

// @desc    ดึงข้อมูลคำสั่งซื้อของผู้ใช้
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 });
  
  res.json({
    success: true,
    count: orders.length,
    orders
  });
});

// @desc    ดึงข้อมูลคำสั่งซื้อตาม ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone');
  
  if (order) {
    // ตรวจสอบว่าเป็นเจ้าของคำสั่งซื้อหรือเป็นแอดมิน
    if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      res.status(403);
      throw new Error('ไม่มีสิทธิ์เข้าถึงคำสั่งซื้อนี้');
    }
    
    res.json({
      success: true,
      order
    });
  } else {
    res.status(404);
    throw new Error('ไม่พบคำสั่งซื้อ');
  }
});

// @desc    ดึงข้อมูลคำสั่งซื้อทั้งหมด (สำหรับแอดมิน)
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
  
  res.json({
    success: true,
    count: orders.length,
    orders
  });
});

// @desc    อัปเดตสถานะคำสั่งซื้อ (สำหรับแอดมิน)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, trackingNumber } = req.body;
  
  // ตรวจสอบว่าสถานะถูกต้อง
  if (!Object.values(ORDER_STATUS).includes(status)) {
    res.status(400);
    throw new Error('สถานะไม่ถูกต้อง');
  }
  
  const order = await Order.findById(req.params.id);
  
  if (order) {
    // อัปเดตสถานะ
    order.status = status;
    
    // อัปเดต tracking number ถ้ามีการส่งมา
    if (trackingNumber !== undefined) {
      order.trackingNumber = trackingNumber;
    }
    
    // หากเปลี่ยนเป็นสถานะ PAID
    if (status === ORDER_STATUS.PAID && !order.isPaid) {
      order.isPaid = true;
      order.paidAt = Date.now();
    }
    
    // บันทึกข้อมูล
    const updatedOrder = await order.save();
    
    res.json({
      success: true,
      order: updatedOrder
    });
  } else {
    res.status(404);
    throw new Error('ไม่พบคำสั่งซื้อ');
  }
});

// @desc    อัปเดต tracking number (สำหรับแอดมิน)
// @route   PUT /api/orders/:id/tracking
// @access  Private/Admin
const updateTrackingNumber = asyncHandler(async (req, res) => {
  const { trackingNumber } = req.body;
  
  if (trackingNumber === undefined) {
    res.status(400);
    throw new Error('กรุณาระบุหมายเลขการจัดส่ง (Tracking Number)');
  }
  
  const order = await Order.findById(req.params.id);
  
  if (order) {
    // อัปเดต tracking number
    order.trackingNumber = trackingNumber;
    
    // หากมีการเพิ่ม tracking number และสถานะยังเป็น pending หรือ paid
    // ให้อัพเดทสถานะเป็น shipped โดยอัตโนมัติ
    if (trackingNumber && (order.status === ORDER_STATUS.PENDING || order.status === ORDER_STATUS.PAID)) {
      order.status = ORDER_STATUS.SHIPPED;
    }
    
    // บันทึกข้อมูล
    const updatedOrder = await order.save();
    
    res.json({
      success: true,
      trackingNumber: updatedOrder.trackingNumber,
      status: updatedOrder.status
    });
  } else {
    res.status(404);
    throw new Error('ไม่พบคำสั่งซื้อ');
  }
});

module.exports = {
  createOrder,
  checkPaymentStatus,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
  updateTrackingNumber 
};