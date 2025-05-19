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
const { upload } = require('../config/gridfs'); // เปลี่ยนเป็นใช้ GridFS

// Routes
router.route('/')
  .get(protect, admin, getMusic)
  .post(protect, admin, upload.single('file'), createMusic);

router.route('/:id')
  .get(protect, admin, getMusicById)
  .put(protect, admin, upload.single('file'), updateMusic)
  .delete(protect, admin, deleteMusic);

module.exports = router;