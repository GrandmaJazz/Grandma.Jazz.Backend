const express = require('express');
const router = express.Router();
const { 
  getAllCardsAdmin,
  getCards, 
  getCardById, 
  createCard, 
  updateCard, 
  deleteCard,
  addMusicToCard,
  removeMusicFromCard,
  toggleCardStatus
} = require('../controllers/cardController');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตรวจสอบว่ามีโฟลเดอร์สำหรับเก็บรูปภาพการ์ดหรือไม่
const cardUploadDir = path.join(__dirname, '../../uploads/cards');
const musicUploadDir = path.join(__dirname, '../../uploads/music');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(cardUploadDir)) {
  fs.mkdirSync(cardUploadDir, { recursive: true });
}
if (!fs.existsSync(musicUploadDir)) {
  fs.mkdirSync(musicUploadDir, { recursive: true });
}

// กำหนดค่า Multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (file.fieldname === 'image') {
      cb(null, cardUploadDir);
    } else if (file.fieldname === 'music') {
      cb(null, musicUploadDir);
    }
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    if (file.fieldname === 'image') {
      cb(null, `card-${uniqueSuffix}${path.extname(file.originalname)}`);
    } else if (file.fieldname === 'music') {
      cb(null, `music-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }
});

// กำหนดเงื่อนไขการตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'image') {
    // อนุญาตเฉพาะไฟล์รูปภาพ
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for card image'), false);
    }
  } else if (file.fieldname === 'music') {
    // อนุญาตเฉพาะไฟล์เสียง
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed for music'), false);
    }
  } else {
    cb(new Error('Unexpected field'), false);
  }
};

// กำหนดขนาดไฟล์สูงสุด
const fileSizeLimit = (req, file, cb) => {
  if (file.fieldname === 'image') {
    // สูงสุด 5MB สำหรับรูปภาพ
    if (file.size > 5 * 1024 * 1024) {
      cb(new Error('Image file size must not exceed 5MB'), false);
    }
  } else if (file.fieldname === 'music') {
    // สูงสุด 50MB สำหรับเพลง
    if (file.size > 50 * 1024 * 1024) {
      cb(new Error('Music file size must not exceed 50MB'), false);
    }
  }
  cb(null, true);
};

// สร้าง multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB เป็นขนาดสูงสุดสำหรับทุกไฟล์
  }
});

// Routes สำหรับการจัดการการ์ด
router.route('/')
  .get(getCards)
  .post(
    protect, 
    admin, 
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'music', maxCount: 10 }
    ]), 
    createCard
  );

// Admin route to get all cards (including inactive)
router.route('/admin/all')
  .get(protect, admin, getAllCardsAdmin);

router.route('/:id')
  .get(getCardById)
  .put(
    protect, 
    admin, 
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'music', maxCount: 10 }
    ]), 
    updateCard
  )
  .delete(protect, admin, deleteCard);

router.route('/:id/music')
  .post(protect, admin, addMusicToCard);

router.route('/:id/music/:musicId')
  .delete(protect, admin, removeMusicFromCard);

// Route for toggling card status
router.route('/:id/status')
  .patch(protect, admin, toggleCardStatus);

module.exports = router;