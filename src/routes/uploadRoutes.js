//backend/src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const {
  uploadFile,
  uploadMultipleFiles,
  uploadVideo,
  uploadMusic
} = require('../controllers/uploadController');
const { protect, admin } = require('../middleware/authMiddleware');

// Route สำหรับอัปโหลดรูปภาพเดียว
router.post('/', protect, admin, uploadFile);

// Route สำหรับอัปโหลดหลายรูปภาพ
router.post('/multiple', protect, admin, uploadMultipleFiles);

// Route สำหรับอัปโหลดวิดีโอ
router.post('/video', protect, admin, uploadVideo);

// Route สำหรับอัปโหลดเพลง
router.post('/music', protect, admin, uploadMusic);

module.exports = router;