//backend/src/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes สำหรับดึงข้อมูลสินค้าทั้งหมดและสร้างสินค้าใหม่
router
  .route('/')
  .get(getProducts)
  .post(protect, admin, createProduct);

// Route สำหรับดึงข้อมูลสินค้าขายดี
router.get('/featured', getFeaturedProducts);

// Routes สำหรับดึง อัปเดต และลบข้อมูลสินค้าตาม ID
router
  .route('/:id')
  .get(getProductById)
  .put(protect, admin, updateProduct)  // ไม่ต้องใส่ middleware เพิ่มเติม
  .delete(protect, admin, deleteProduct);

module.exports = router;