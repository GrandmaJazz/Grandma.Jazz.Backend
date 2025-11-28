const express = require('express');
const router = express.Router();
const { 
  getMusic, 
  getMusicById, 
  createMusic, 
  updateMusic, 
  deleteMusic 
} = require('../controllers/musicController');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploaders } = require('../config/awsS3');

// Routes
router.route('/')
  .get(protect, admin, getMusic)
  .post(protect, admin, uploaders.musicUpload.single('file'), createMusic);

router.route('/:id')
  .get(protect, admin, getMusicById)
  .put(protect, admin, uploaders.musicUpload.single('file'), updateMusic)
  .delete(protect, admin, deleteMusic);

module.exports = router;