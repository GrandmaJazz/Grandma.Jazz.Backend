const Blog = require('../models/Blog');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// @desc    ดึงบล็อกทั้งหมด (สำหรับ public)
// @route   GET /api/blogs
// @access  Public
const getBlogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, search, tags } = req.query;
  
  const query = { isPublished: true };
  
  // ค้นหาตามคำค้น
  if (search) {
    query.$text = { $search: search };
  }
  
  // กรองตาม tags
  if (tags) {
    const tagArray = tags.split(',').map(tag => tag.trim());
    query.tags = { $in: tagArray };
  }
  
  // ดึงข้อมูลบล็อกพร้อม content เพื่อแสดงใน modal
  const blogs = await Blog.find(query)
    .populate('author', 'name email')
    .sort({ publishedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    // ลบ .select('-content') ออกแล้ว เพื่อให้ส่ง content มาด้วย
  
  const total = await Blog.countDocuments(query);
  
  res.json({
    success: true,
    count: blogs.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    blogs
  });
});

// @desc    ดึงบล็อกทั้งหมด (สำหรับ admin)
// @route   GET /api/blogs/admin/all
// @access  Private/Admin
const getAllBlogsAdmin = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, search, status } = req.query;
  
  const query = {};
  
  // กรองตามสถานะ
  if (status === 'published') {
    query.isPublished = true;
  } else if (status === 'draft') {
    query.isPublished = false;
  }
  
  // ค้นหาตามชื่อ
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }
  
  const blogs = await Blog.find(query)
    .populate('author', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  
  const total = await Blog.countDocuments(query);
  
  res.json({
    success: true,
    count: blogs.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    blogs
  });
});

// @desc    ดึงบล็อกตาม ID หรือ slug
// @route   GET /api/blogs/:id
// @access  Public
const getBlogById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // ค้นหาด้วย ID หรือ slug
  const query = mongoose.Types.ObjectId.isValid(id) 
    ? { _id: id } 
    : { slug: id };
  
  // เพิ่มเงื่อนไข published สำหรับ public access
  if (!req.user || !req.user.isAdmin) {
    query.isPublished = true;
  }
  
  const blog = await Blog.findOne(query)
    .populate('author', 'name email');
  
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  
  // เพิ่ม view count (ถ้าไม่ใช่ admin)
  if (!req.user || !req.user.isAdmin) {
    blog.views += 1;
    await blog.save();
  }
  
  res.json({
    success: true,
    blog
  });
});

// @desc    สร้างบล็อกใหม่
// @route   POST /api/blogs
// @access  Private/Admin
const createBlog = asyncHandler(async (req, res) => {
  const { title, content, excerpt, tags, isPublished, seo } = req.body;
  
  if (!title || !content) {
    res.status(400);
    throw new Error('Please provide title and content');
  }
  
  // จัดการรูปภาพ
  const images = [];
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, index) => {
      images.push({
        path: `/uploads/blogs/${file.filename}`,
        caption: req.body[`imageCaption_${index}`] || ''
      });
    });
  }
  
  const blog = await Blog.create({
    title,
    content,
    excerpt,
    images,
    tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
    isPublished: isPublished === 'true',
    author: req.user._id,
    seo: {
      metaDescription: seo?.metaDescription || '',
      metaKeywords: seo?.metaKeywords ? seo.metaKeywords.split(',').map(k => k.trim()) : []
    }
  });
  
  res.status(201).json({
    success: true,
    blog
  });
});

// @desc    อัปเดตบล็อก
// @route   PUT /api/blogs/:id
// @access  Private/Admin
const updateBlog = asyncHandler(async (req, res) => {
  const { title, content, excerpt, tags, isPublished, seo } = req.body;
  
  let blog = await Blog.findById(req.params.id);
  
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  
  // จัดการรูปภาพใหม่
  const newImages = [];
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, index) => {
      newImages.push({
        path: `/uploads/blogs/${file.filename}`,
        caption: req.body[`imageCaption_${index}`] || ''
      });
    });
  }
  
  // ถ้ามีการอัปโหลดรูปใหม่ ให้ใช้รูปใหม่ ไม่งั้นใช้รูปเดิม
  const images = newImages.length > 0 ? [...blog.images, ...newImages] : blog.images;
  
  const updateData = {
    title: title || blog.title,
    content: content || blog.content,
    excerpt: excerpt || blog.excerpt,
    images,
    tags: tags ? tags.split(',').map(tag => tag.trim()) : blog.tags,
    isPublished: isPublished !== undefined ? isPublished === 'true' : blog.isPublished,
    seo: {
      metaDescription: seo?.metaDescription || blog.seo?.metaDescription || '',
      metaKeywords: seo?.metaKeywords ? 
        seo.metaKeywords.split(',').map(k => k.trim()) : 
        blog.seo?.metaKeywords || []
    },
    updatedAt: Date.now()
  };
  
  blog = await Blog.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('author', 'name email');
  
  res.json({
    success: true,
    blog
  });
});

// @desc    ลบบล็อก
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
const deleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  
  // ลบรูปภาพทั้งหมด
  blog.images.forEach(image => {
    const imagePath = path.join(__dirname, '..', '..', image.path);
    if (fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
  });
  
  await Blog.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Blog deleted successfully'
  });
});

// @desc    ลบรูปภาพจากบล็อก
// @route   DELETE /api/blogs/:id/images/:imageIndex
// @access  Private/Admin
const deleteImageFromBlog = asyncHandler(async (req, res) => {
  const { id, imageIndex } = req.params;
  
  const blog = await Blog.findById(id);
  
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  
  if (imageIndex >= blog.images.length) {
    res.status(404);
    throw new Error('Image not found');
  }
  
  // ลบไฟล์รูปภาพ
  const imagePath = path.join(__dirname, '..', '..', blog.images[imageIndex].path);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
  
  // ลบรูปภาพจาก array
  blog.images.splice(imageIndex, 1);
  await blog.save();
  
  res.json({
    success: true,
    blog
  });
});

// @desc    ดึงสถิติบล็อก
// @route   GET /api/blogs/admin/stats
// @access  Private/Admin
const getBlogStats = asyncHandler(async (req, res) => {
  const totalBlogs = await Blog.countDocuments();
  const publishedBlogs = await Blog.countDocuments({ isPublished: true });
  const draftBlogs = await Blog.countDocuments({ isPublished: false });
  const totalViews = await Blog.aggregate([
    { $group: { _id: null, total: { $sum: '$views' } } }
  ]);
  
  // บล็อกล่าสุด
  const recentBlogs = await Blog.find()
    .populate('author', 'name')
    .sort({ createdAt: -1 })
    .limit(5)
    .select('title isPublished createdAt views');
  
  res.json({
    success: true,
    stats: {
      total: totalBlogs,
      published: publishedBlogs,
      draft: draftBlogs,
      totalViews: totalViews[0]?.total || 0,
      recentBlogs
    }
  });
});

module.exports = {
  getBlogs,
  getAllBlogsAdmin,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  deleteImageFromBlog,
  getBlogStats
};