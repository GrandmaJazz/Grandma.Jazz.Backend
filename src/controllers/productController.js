//backend/src/controllers/productController.js
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');

// @desc    ดึงข้อมูลสินค้าทั้งหมด
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  // ดึงค่า query parameters
  const { category, featured } = req.query;
  
  // สร้าง query object
  const query = {};
  
  // เพิ่มเงื่อนไขตาม query parameters
  if (category) {
    query.category = category;
  }
  
  if (featured === 'true') {
    query.isFeatured = true;
  }
  
  // ดึงข้อมูลสินค้าตามเงื่อนไข
  const products = await Product.find(query);
  
  res.json({
    success: true,
    count: products.length,
    products
  });
});

// @desc    ดึงข้อมูลสินค้าขายดี (Featured)
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isFeatured: true }).limit(4);
  
  res.json({
    success: true,
    count: products.length,
    products
  });
});

// @desc    ดึงข้อมูลสินค้าตาม ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  
  if (product) {
    res.json({
      success: true,
      product
    });
  } else {
    res.status(404);
    throw new Error('Product not found.');
  }
});

// @desc    สร้างสินค้าใหม่
// @route   POST /api/products
// @access  Private/Admin
const { productInput } = require('../services/productInput');
const createProduct = asyncHandler(async (req, res) => {
  const data = productInput(req.body);
  if (data.isFeatured && await Product.countDocuments({ isFeatured: true }) >= 4) {
    res.status(400);
    throw new Error('Maximum of four featured products reached.');
  }
  const product = await Product.create(data);
  res.status(201).json({ success: true, product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const data = productInput(req.body, true);
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error('Product not found.'); }
  if (data.isFeatured && !product.isFeatured && await Product.countDocuments({ isFeatured: true }) >= 4) {
    res.status(400);
    throw new Error('Maximum of four featured products reached.');
  }
  const updatedProduct = await Product.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
  res.json({ success: true, product: updatedProduct });
});

// @desc    ลบสินค้า
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  
  if (product) {
    await product.deleteOne();
    
    res.json({
      success: true,
      message: 'ลบสินค้าเรียบร้อยแล้ว'
    });
  } else {
    res.status(404);
    throw new Error('Product not found.');
  }
});

module.exports = {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};