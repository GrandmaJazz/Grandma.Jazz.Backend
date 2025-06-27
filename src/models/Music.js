const mongoose = require('mongoose');

const MusicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide music title'],
    trim: true
  },
  // ลบฟิลด์ artist ออก หรือคงไว้แต่ไม่บังคับให้กรอก
  filePath: {
    type: String,
    required: [true, 'Please upload music file']
  },
  fileS3Key: {
    type: String,
    default: null
  },
  duration: {
    type: Number,
    default: 0
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

MusicSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Music', MusicSchema);