const express = require('express');
const router = express.Router();
const {
  createTicket,
  getUserTickets,
  getTicketById,
  updateTicketStatus,
  cancelTicket,
  getAllTickets,
  createTicketCheckout,
  verifyTicketPaymentStatus,
  cleanupExpiredTickets
} = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.use(protect);

// User routes
router.post('/', createTicket);
router.get('/my-tickets', getUserTickets);
router.get('/:id', getTicketById);
router.put('/:id/status', updateTicketStatus);
router.delete('/:id', cancelTicket);

// Payment routes
router.post('/checkout-session', createTicketCheckout);
router.get('/verify-payment/:sessionId', verifyTicketPaymentStatus);

// Admin routes (you may want to add admin middleware here)
router.get('/admin/all', getAllTickets);
router.post('/admin/cleanup-expired', cleanupExpiredTickets);

module.exports = router;