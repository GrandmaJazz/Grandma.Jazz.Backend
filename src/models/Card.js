const mongoose = require('mongoose');

const CardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'กรุณาระบุชื่อการ์ด'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  imagePath: {
    type: String,
    required: [true, 'กรุณาอัปโหลดรูปภาพการ์ด']
  },
  order: {
    type: Number,
    default: 0 // ใช้สำหรับจัดลำดับการแสดงผลการ์ด
  },
  isActive: {
    type: Boolean,
    default: true
  },
  music: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Music'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// อัพเดทเวลาก่อนบันทึก
CardSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Card', CardSchema);