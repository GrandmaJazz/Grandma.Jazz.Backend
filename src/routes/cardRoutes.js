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
const { upload } = require('../config/gridfs'); // เปลี่ยนเป็นใช้ GridFS

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

module.exports = router;