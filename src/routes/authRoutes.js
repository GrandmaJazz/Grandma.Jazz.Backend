//backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const {
  prepareLogin,
  googleLogin,
  getUserProfile,
  updateUserProfile
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Route สำหรับเตรียมข้อมูลปีเกิดก่อนล็อกอิน
router.post('/prepare', prepareLogin);

// Route สำหรับล็อกอินด้วย Google
router.post('/google', googleLogin);

// Route สำหรับดึงและอัปเดตข้อมูลโปรไฟล์
router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

module.exports = router;