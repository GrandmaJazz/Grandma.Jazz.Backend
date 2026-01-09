// backend/src/routes/discountRoutes.js
const express = require('express');
const router = express.Router();
const {
  validateDiscount,
  getDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  toggleDiscount
} = require('../controllers/discountController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public route - validate discount (requires authentication)
router.post('/validate', protect, validateDiscount);

// Admin routes
router.route('/')
  .get(protect, admin, getDiscounts)
  .post(protect, admin, createDiscount);

router.route('/:id')
  .get(protect, admin, getDiscountById)
  .put(protect, admin, updateDiscount)
  .delete(protect, admin, deleteDiscount);

router.put('/:id/toggle', protect, admin, toggleDiscount);

module.exports = router;



