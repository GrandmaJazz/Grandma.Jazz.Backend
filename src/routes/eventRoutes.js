const express = require('express');
const router = express.Router();
const {
  getAllEvents,
  getActiveEvent,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  toggleEventStatus,
  getEventTicketStats
} = require('../controllers/eventController');
const { uploaders } = require('../config/awsS3');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/active', getActiveEvent);
router.get('/:id/ticket-stats', getEventTicketStats);

// Admin routes
router.get('/', protect, admin, getAllEvents);
router.get('/:id', protect, admin, getEventById);
router.post('/', protect, admin, uploaders.videoUpload.single('video'), createEvent);
router.put('/:id', protect, admin, uploaders.videoUpload.single('video'), updateEvent);
router.delete('/:id', protect, admin, deleteEvent);
router.patch('/:id/toggle-status', protect, admin, toggleEventStatus);

module.exports = router; 