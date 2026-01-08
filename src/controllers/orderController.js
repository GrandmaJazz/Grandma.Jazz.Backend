//backend/src/controllers/orderController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Discount = require('../models/Discount');
const { createCheckoutSession, verifyPayment } = require('../services/stripeService');
const { ORDER_STATUS } = require('../config/constants');

// @desc    สร้างคำสั่งซื้อใหม่และเริ่มกระบวนการชำระเงิน
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress, destinationCountry, shippingCost, discountCode } = req.body;
  
  // ตรวจสอบข้อมูลที่จำเป็น
  if (!orderItems || orderItems.length === 0) {
    res.status(400);
    throw new Error('ไม่มีรายการสินค้าในคำสั่งซื้อ');
  }
  
  if (!shippingAddress) {
    res.status(400);
    throw new Error('กรุณาระบุที่อยู่สำหรับจัดส่ง');
  }
  
  if (!destinationCountry) {
    res.status(400);
    throw new Error('กรุณาเลือกประเทศปลายทาง');
  }
  
  if (shippingCost === undefined || shippingCost < 0) {
    res.status(400);
    throw new Error('ค่าส่งไม่ถูกต้อง');
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
  
  // คำนวณยอดรวมก่อนส่วนลด
  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const totalBeforeDiscount = subtotal + shippingCost;
  
  // ตรวจสอบและใช้ส่วนลด (ถ้ามี)
  let discountAmount = 0;
  let finalDiscountCode = null;
  
  if (discountCode) {
    const discount = await Discount.findOne({ code: discountCode.toUpperCase() });
    
    if (!discount) {
      res.status(404);
      throw new Error('Discount code not found');
    }
    
    // ตรวจสอบความถูกต้องของส่วนลด
    const validityCheck = discount.isValid();
    if (!validityCheck.valid) {
      res.status(400);
      throw new Error(validityCheck.message);
    }
    
    // ตรวจสอบว่า user ใช้ส่วนลดนี้แล้วหรือยัง
    if (discount.hasUserUsed(req.user._id)) {
      res.status(400);
      throw new Error('You have already used this discount code (limited to 1 use per user)');
    }
    
    // คำนวณส่วนลด
    const discountResult = discount.applyDiscount(subtotal);
    discountAmount = discountResult.discountAmount;
    finalDiscountCode = discount.code;
    
    // เพิ่ม user เข้าไปใน usedBy (จะบันทึกเมื่อชำระเงินสำเร็จ)
  }
  
  // สร้าง checkout session กับ Stripe
  const { session, order } = await createCheckoutSession(
    orderItems,
    req.user._id,
    shippingAddress,
    user.phone,
    destinationCountry,
    shippingCost,
    finalDiscountCode,
    discountAmount
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
  
  // สร้าง checkout session ใหม่ (ไม่สร้าง order ใหม่)
  const user = await User.findById(req.user._id);
  
  // สร้าง line items
  const lineItems = order.orderItems.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        images: [item.image],
        description: `จำนวน: ${item.quantity}`
      },
      unit_amount: Math.round(item.price * 100)
    },
    quantity: item.quantity
  }));
  
  // เพิ่ม shipping เป็น line item
  if (order.shippingCost > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Shipping to ${order.destinationCountry}`,
          description: order.destinationCountry === 'Thailand' ? 'Domestic Shipping' : 'EMS World Merchandise'
        },
        unit_amount: Math.round(order.shippingCost * 100)
      },
      quantity: 1
    });
  }
  
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  // สร้าง Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/orders/${order._id}`,
    metadata: {
      orderId: order._id.toString(),
      type: 'order'
    }
  });
  
  res.json({
    success: true,
    sessionUrl: session.url,
    sessionId: session.id
  });
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