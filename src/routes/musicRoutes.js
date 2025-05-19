const express = require('express');
const router = express.Router();
const { 
  getMusic, 
  getMusicById, 
  createMusic, 
  updateMusic, 
  deleteMusic 
} = require('../controllers/musicController');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตรวจสอบว่ามีโฟลเดอร์สำหรับเก็บไฟล์เพลงหรือไม่
const uploadDir = path.join(__dirname, '../../uploads/music');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// กำหนดค่า Multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, `music-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// กำหนดเงื่อนไขการตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  // อนุญาตเฉพาะไฟล์เสียง
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('ไม่อนุญาตให้อัปโหลดไฟล์ประเภทนี้'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // จำกัดขนาดไฟล์ไม่เกิน 50MB
  }
});

// Routes
router.route('/')
  .get(protect, admin, getMusic)
  .post(protect, admin, upload.single('file'), createMusic);

router.route('/:id')
  .get(protect, admin, getMusicById)
  .put(protect, admin, upload.single('file'), updateMusic)
  .delete(protect, admin, deleteMusic);

module.exports = router;