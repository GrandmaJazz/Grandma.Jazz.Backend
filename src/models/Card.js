const mongoose = require('mongoose');

const CardSchema = new mongoose.Schema({
  title: {
    type: String,
    // ลบ required: [true, 'กรุณาระบุชื่อการ์ด'] ออก หรือเปลี่ยนเป็น required: false
    default: 'Music Card',
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  imagePath: {
    type: String,
    required: [true, 'Please upload card image']
  },
  imageS3Key: {
    type: String,
    default: null
  },
  order: {
    type: Number,
    default: 0
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