//backend/src/models/Blog.js
const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide blog title'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Please provide blog content'],
    trim: true
  },
  excerpt: {
    type: String,
    trim: true,
    maxlength: [300, 'Excerpt cannot exceed 300 characters']
  },
  images: [{
    path: {
      type: String,
      required: true
    },
    s3Key: {
      type: String,
      default: null
    },
    caption: {
      type: String,
      trim: true
    }
  }],
  slug: {
    type: String,
    unique: true,
    trim: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  seo: {
    metaDescription: {
      type: String,
      maxlength: [160, 'Meta description cannot exceed 160 characters']
    },
    metaKeywords: [{
      type: String,
      trim: true
    }]
  }
}, {
  timestamps: true
});

// สร้าง slug อัตโนมัติจาก title
BlogSchema.pre('save', function(next) {
  if (this.isModified('title') || this.isNew) {
    this.slug = this.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // ลบอักขระพิเศษ
      .replace(/[\s_-]+/g, '-') // แทนที่ space ด้วย -
      .replace(/^-+|-+$/g, ''); // ลบ - ที่หัวและท้าย
    
    // เพิ่ม timestamp ถ้า slug ซ้ำ
    if (!this.isNew) {
      this.slug += `-${Date.now()}`;
    }
  }
  
  // กำหนดเวลาเผยแพร่
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // สร้าง excerpt อัตโนมัติถ้าไม่มี
  if (!this.excerpt && this.content) {
    this.excerpt = this.content
      .replace(/<[^>]*>/g, '') // ลบ HTML tags
      .substring(0, 150) + '...';
  }
  
  next();
});

// Index สำหรับการค้นหา
BlogSchema.index({ title: 'text', content: 'text', tags: 'text' });
BlogSchema.index({ slug: 1 });
BlogSchema.index({ isPublished: 1, publishedAt: -1 });

module.exports = mongoose.model('Blog', BlogSchema);