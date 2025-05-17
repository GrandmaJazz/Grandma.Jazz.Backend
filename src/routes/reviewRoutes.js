const express = require('express');
const router = express.Router();
const {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes - ไม่จำเป็นต้องล็อกอิน
router.get('/', getReviews);

// Protected routes - ต้องล็อกอินก่อน
router.post('/', protect, createReview);
router.get('/myreviews', protect, getUserReviews);

// Protected routes with review ID
router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, deleteReview);

module.exports = router;