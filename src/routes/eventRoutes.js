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
  upload
} = require('../controllers/eventController');

// Public routes
router.get('/active', getActiveEvent);

// Admin routes (you may want to add authentication middleware here)
router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.post('/', upload.single('video'), createEvent);
router.put('/:id', upload.single('video'), updateEvent);
router.delete('/:id', deleteEvent);
router.patch('/:id/toggle-status', toggleEventStatus);

module.exports = router; 