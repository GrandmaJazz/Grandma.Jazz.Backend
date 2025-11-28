//backend/src/routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const {
  getBlogs,
  getAllBlogsAdmin,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  deleteImageFromBlog,
  getBlogStats
} = require('../controllers/blogController');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploaders } = require('../config/awsS3');

// Public routes
router.get('/', getBlogs);
router.get('/public/:id', getBlogById); // route สำหรับ public access

// Admin routes
router.get('/admin/all', protect, admin, getAllBlogsAdmin);
router.get('/admin/stats', protect, admin, getBlogStats);
router.get('/admin/:id', protect, admin, getBlogById); // route สำหรับ admin access
router.post('/', protect, admin, uploaders.blogUpload.array('images', 10), createBlog);
router.put('/:id', protect, admin, uploaders.blogUpload.array('images', 10), updateBlog);
router.delete('/:id', protect, admin, deleteBlog);
router.delete('/:id/images/:imageIndex', protect, admin, deleteImageFromBlog);

module.exports = router;