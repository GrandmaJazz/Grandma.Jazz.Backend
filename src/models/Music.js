const mongoose = require('mongoose');

const MusicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'กรุณาระบุชื่อเพลง'],
    trim: true
  },
  artist: {
    type: String,
    trim: true
  },
  filePath: {
    type: String,
    required: [true, 'กรุณาอัปโหลดไฟล์เพลง']
  },
  duration: {
    type: Number,
    default: 0 // ความยาวของเพลงในวินาที
  },
  cards: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
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
MusicSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Music', MusicSchema);