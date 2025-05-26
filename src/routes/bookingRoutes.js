const express = require('express');
const router = express.Router();
const {
  createBooking,
  getUserBookings,
  getBookingById,
  updateBookingPayment,
  getAllBookings
} = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.use(protect);

// User routes
router.post('/', createBooking);
router.get('/my-bookings', getUserBookings);
router.get('/:id', getBookingById);
router.put('/:id/payment', updateBookingPayment);

// Admin routes (you may want to add admin middleware here)
router.get('/admin/all', getAllBookings);

module.exports = router; 