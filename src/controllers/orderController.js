//backend/src/controllers/orderController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Discount = require('../models/Discount');
const { createCheckoutSession, verifyPayment } = require('../services/stripeService');
const { ORDER_STATUS } = require('../config/constants');

const { buildQuote, assertQuoteAccepted, defaultConfig } = require('../services/checkoutQuote');
const quoteDependencies = {
  findProducts: ids => Product.find({ _id: { $in: ids } }),
  findDiscount: code => Discount.findOne({ code }),
};
const quoteFor = (input, userId) => buildQuote(input, userId, quoteDependencies);

const getShippingConfig = (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true,
    countries: Object.keys(defaultConfig.countryZones).sort(),
    packagingGrams: defaultConfig.packagingGrams, service: defaultConfig.service,
    rateVersion: defaultConfig.version });
};
const quoteOrder = asyncHandler(async (req, res) => {
  const quote = await quoteFor(req.body, req.user._id);
  res.set('Cache-Control', 'no-store').json({ success: true, quote });
});
const createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress, quoteId } = req.body;
  if (typeof shippingAddress !== 'string' || !shippingAddress.trim() || shippingAddress.length > 2000) {
    res.status(400);
    throw new Error('Enter a shipping address of at most 2,000 characters.');
  }
  const user = await User.findById(req.user._id);
  if (!user?.profileComplete || !user.phone) {
    res.status(400);
    throw new Error('Complete your profile and phone number before ordering.');
  }
  const quote = await quoteFor(req.body, req.user._id);
  assertQuoteAccepted(quote, quoteId);
  const { session, order } = await createCheckoutSession(quote, req.user._id, shippingAddress.trim(), user.phone);
  res.status(201).json({ success: true, sessionId: session.id, sessionUrl: session.url,
    order: { _id: order._id, totalAmount: order.totalAmount, shippingCost: order.shippingCost, status: order.status } });
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

// @desc    สร้าง checkout session ใหม่จาก order ที่มีอยู่ (สำหรับกลับไปชำระเงิน)
// @route   POST /api/orders/:id/retry-payment
// @access  Private
const retryPayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    res.status(404);
    throw new Error('ไม่พบคำสั่งซื้อ');
  }
  
  // ตรวจสอบว่าเป็นเจ้าของคำสั่งซื้อหรือไม่
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('ไม่มีสิทธิ์เข้าถึงคำสั่งซื้อนี้');
  }
  
  // ตรวจสอบว่ายังไม่ได้ชำระเงิน
  if (order.isPaid) {
    res.status(400);
    throw new Error('คำสั่งซื้อนี้ชำระเงินแล้ว');
  }
  
  if (order.status === ORDER_STATUS.CANCELED || !order.checkoutQuote?.quoteId) {
    res.status(409);
    throw new Error('Please start a new checkout to review current prices and shipping.');
  }
  const quote = await quoteFor({ orderItems: order.orderItems.map(item => ({
    product: String(item.product), quantity: item.quantity })),
    destinationCountry: order.destinationCountry, discountCode: order.discountCode }, req.user._id);
  assertQuoteAccepted(quote, order.checkoutQuote.quoteId);
  const { createPaymentSession } = require('../services/checkoutPayment');
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const session = await createPaymentSession(stripe, quote, order._id, process.env.CLIENT_URL);
  res.json({ success: true, sessionUrl: session.url, sessionId: session.id });
});

// @desc    ยกเลิกคำสั่งซื้อ (สำหรับผู้ใช้)
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    res.status(404);
    throw new Error('ไม่พบคำสั่งซื้อ');
  }
  
  // ตรวจสอบว่าเป็นเจ้าของคำสั่งซื้อหรือไม่
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('ไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้');
  }
  
  // ตรวจสอบว่ายังสามารถยกเลิกได้ (เฉพาะคำสั่งซื้อที่ยังไม่ได้จ่ายเงิน)
  if (order.isPaid) {
    res.status(400);
    throw new Error('ไม่สามารถยกเลิกคำสั่งซื้อที่ชำระเงินแล้ว กรุณาติดต่อฝ่ายสนับสนุนลูกค้า');
  }
  
  // ตรวจสอบว่าคำสั่งซื้อถูกยกเลิกไปแล้วหรือไม่
  if (order.status === ORDER_STATUS.CANCELED) {
    res.status(400);
    throw new Error('คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว');
  }
  
  // อัปเดตสถานะเป็น canceled
  order.status = ORDER_STATUS.CANCELED;
  
  const updatedOrder = await order.save();
  
  res.json({
    success: true,
    message: 'ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว',
    order: updatedOrder
  });
});

module.exports = {
  getShippingConfig,
  quoteOrder,
  createOrder,
  checkPaymentStatus,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
  updateTrackingNumber,
  retryPayment,
  cancelOrder
};