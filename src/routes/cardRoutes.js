const express = require('express');
const router = express.Router();
const { 
  getCards, 
  getCardById, 
  createCard, 
  updateCard, 
  deleteCard,
  addMusicToCard,
  removeMusicFromCard
} = require('../controllers/cardController');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตรวจสอบว่ามีโฟลเดอร์สำหรับเก็บรูปภาพการ์ดหรือไม่
const uploadDir = path.join(__dirname, '../../uploads/cards');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// กำหนดค่า Multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, `card-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// กำหนดเงื่อนไขการตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  // อนุญาตเฉพาะไฟล์รูปภาพ
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('ไม่อนุญาตให้อัปโหลดไฟล์ประเภทนี้'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // จำกัดขนาดไฟล์ไม่เกิน 5MB
  }
});

// Routes
router.route('/')
  .get(getCards)
  .post(protect, admin, upload.single('image'), createCard);

router.route('/:id')
  .get(getCardById)
  .put(protect, admin, upload.single('image'), updateCard)
  .delete(protect, admin, deleteCard);

router.route('/:id/music')
  .post(protect, admin, addMusicToCard);

router.route('/:id/music/:musicId')
  .delete(protect, admin, removeMusicFromCard);

module.exports = router;