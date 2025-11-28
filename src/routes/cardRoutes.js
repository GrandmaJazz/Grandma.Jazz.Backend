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
const { uploaders } = require('../config/awsS3');

// Routes สำหรับการจัดการการ์ด
router.route('/')
  .get(getCards)
  .post(
    protect, 
    admin, 
    uploaders.cardUpload.fields([
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
    uploaders.cardUpload.fields([
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