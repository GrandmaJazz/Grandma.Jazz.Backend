//backend/src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const {
  uploadFile,
  uploadMultipleFiles
} = require('../controllers/uploadController');
const { protect, admin } = require('../middleware/authMiddleware');

// Route สำหรับอัปโหลดไฟล์เดียว
router.post('/', protect, admin, uploadFile);

// Route สำหรับอัปโหลดหลายไฟล์
router.post('/multiple', protect, admin, uploadMultipleFiles);

module.exports = router;