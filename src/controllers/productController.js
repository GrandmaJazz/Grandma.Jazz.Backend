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
    throw new Error('ไม่พบสินค้า');
  }
});

// @desc    สร้างสินค้าใหม่
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  // Log ข้อมูลที่ได้รับมาเพื่อ debug
  console.log('Request body:', req.body);
  
  const { name, description, price, category, weight, images, isFeatured, isOutOfStock } = req.body;
  
  // แปลงข้อมูลให้อยู่ในรูปแบบที่ถูกต้อง
  const productData = {
    name,
    description,
    price: parseFloat(price),
    weight: parseFloat(weight),
    category,
    images: Array.isArray(images) ? images : [images], // ตรวจสอบว่าเป็น array หรือไม่
    isFeatured: isFeatured === true || isFeatured === 'true',
    isOutOfStock: isOutOfStock === true || isOutOfStock === 'true'
  };
  
  console.log('Processed product data:', productData);
  
  // ตรวจสอบข้อมูลที่จำเป็น
  if (!name || !description || isNaN(productData.price) || !category) {
    console.log('Validation failed:', { name, description, price, category });
    res.status(400);
    throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');
  }
  
  // ตรวจสอบน้ำหนัก
  if (!weight || isNaN(productData.weight) || productData.weight <= 0 || productData.weight > 30) {
    console.log('Weight validation failed:', weight);
    res.status(400);
    throw new Error('น้ำหนักต้องอยู่ระหว่าง 0-30 kg');
  }
  
  // ตรวจสอบว่ามีรูปภาพหรือไม่
  if (!productData.images || productData.images.length === 0 || productData.images[0] === undefined) {
    console.log('Images validation failed:', productData.images);
    res.status(400);
    throw new Error('กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูป');
  }
  
  // ตรวจสอบจำนวนสินค้าขายดี
  if (productData.isFeatured) {
    const featuredCount = await Product.countDocuments({ isFeatured: true });
    
    if (featuredCount >= 4) {
      res.status(400);
      throw new Error('ไม่สามารถเพิ่มสินค้าขายดีได้อีก (สูงสุด 4 รายการ)');
    }
  }
  
  // สร้างสินค้าใหม่
  const product = await Product.create(productData);
  
  if (product) {
    res.status(201).json({
      success: true,
      product
    });
  } else {
    res.status(400);
    throw new Error('ข้อมูลสินค้าไม่ถูกต้อง');
  }
});

// @desc    อัปเดตข้อมูลสินค้า
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  // Log ข้อมูลที่ได้รับมา
  console.log('Update request body:', req.body);
  
  const { name, description, price, category, weight, images, isFeatured, isOutOfStock } = req.body;
  
  // แปลงข้อมูลให้อยู่ในรูปแบบที่ถูกต้อง
  const productData = {
    name,
    description,
    price: price ? parseFloat(price) : undefined,
    weight: weight ? parseFloat(weight) : undefined,
    category,
    images: images ? (Array.isArray(images) ? images : [images]) : undefined,
    isFeatured: isFeatured === true || isFeatured === 'true',
    isOutOfStock: isOutOfStock === true || isOutOfStock === 'true'
  };
  
  console.log('Processed update data:', productData);
  
  // ตรวจสอบน้ำหนัก (ถ้ามีการส่งมา)
  if (weight !== undefined && (isNaN(productData.weight) || productData.weight <= 0 || productData.weight > 30)) {
    console.log('Weight validation failed:', weight);
    res.status(400);
    throw new Error('น้ำหนักต้องอยู่ระหว่าง 0-30 kg');
  }
  
  // ตรวจสอบว่ามีสินค้านี้ในฐานข้อมูลหรือไม่
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    res.status(404);
    throw new Error('ไม่พบสินค้า');
  }
  
  // ตรวจสอบจำนวนสินค้าขายดี
  if (productData.isFeatured && !product.isFeatured) {
    const featuredCount = await Product.countDocuments({ isFeatured: true });
    
    if (featuredCount >= 4) {
      res.status(400);
      throw new Error('ไม่สามารถเพิ่มสินค้าขายดีได้อีก (สูงสุด 4 รายการ)');
    }
  }
  
  // ใช้ findByIdAndUpdate แทน save เพื่อความแน่ใจว่าข้อมูลถูกอัปเดตในฐานข้อมูล
  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        name: productData.name || product.name,
        description: productData.description || product.description,
        price: productData.price !== undefined ? productData.price : product.price,
        weight: productData.weight !== undefined ? productData.weight : product.weight,
        category: productData.category || product.category,
        images: productData.images || product.images,
        isOutOfStock: productData.isOutOfStock !== undefined ? productData.isOutOfStock : product.isOutOfStock,
        isFeatured: productData.isFeatured !== undefined ? productData.isFeatured : product.isFeatured,
      }
    },
    { new: true } // ส่งกลับเอกสารที่อัปเดตแล้ว
  );
  
  if (!updatedProduct) {
    res.status(404);
    throw new Error('ไม่พบสินค้าหรือการอัปเดตล้มเหลว');
  }
  
  console.log('Updated product:', updatedProduct);
  
  res.json({
    success: true,
    product: updatedProduct
  });
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
    throw new Error('ไม่พบสินค้า');
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