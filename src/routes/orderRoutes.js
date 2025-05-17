//backend/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
  createOrder,
  checkPaymentStatus,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
  updateTrackingNumber // เพิ่มฟังก์ชันใหม่
} = require('../controllers/orderController');
const { protect, admin, completeProfile } = require('../middleware/authMiddleware');
// Routes สำหรับดึงข้อมูลคำสั่งซื้อทั้งหมด (แอดมิน) และสร้างคำสั่งซื้อใหม่
router
  .route('/')
  .get(protect, admin, getOrders)
  .post(protect, completeProfile, createOrder);

// Route สำหรับดึงคำสั่งซื้อของผู้ใช้
router.get('/myorders', protect, getMyOrders);

// Route สำหรับตรวจสอบสถานะการชำระเงิน
router.get('/verify-payment/:sessionId', protect, checkPaymentStatus);

// Routes สำหรับดึงข้อมูลคำสั่งซื้อตาม ID
router.get('/:id', protect, getOrderById);

// Route สำหรับอัปเดตสถานะคำสั่งซื้อ (แอดมิน)
router.put('/:id/status', protect, admin, updateOrderStatus);

// Route สำหรับอัปเดต tracking number (แอดมิน)
router.put('/:id/tracking', protect, admin, updateTrackingNumber);

module.exports = router;