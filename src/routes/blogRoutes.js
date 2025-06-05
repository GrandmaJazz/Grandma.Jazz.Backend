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
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตรวจสอบว่ามีโฟลเดอร์สำหรับเก็บรูปภาพบล็อกหรือไม่
const blogUploadDir = path.join(__dirname, '../../uploads/blogs');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(blogUploadDir)) {
  fs.mkdirSync(blogUploadDir, { recursive: true });
}

// กำหนดค่า Multer สำหรับอัปโหลดรูปภาพ
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, blogUploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `blog-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// กำหนดเงื่อนไขการตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  // อนุญาตเฉพาะไฟล์รูปภาพ
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// สร้าง multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB สูงสุด
  }
});

// Public routes
router.get('/', getBlogs);
router.get('/public/:id', getBlogById); // route สำหรับ public access

// Admin routes
router.get('/admin/all', protect, admin, getAllBlogsAdmin);
router.get('/admin/stats', protect, admin, getBlogStats);
router.get('/admin/:id', protect, admin, getBlogById); // route สำหรับ admin access
router.post('/', protect, admin, upload.array('images', 10), createBlog);
router.put('/:id', protect, admin, upload.array('images', 10), updateBlog);
router.delete('/:id', protect, admin, deleteBlog);
router.delete('/:id/images/:imageIndex', protect, admin, deleteImageFromBlog);

module.exports = router;