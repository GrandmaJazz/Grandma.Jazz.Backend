const Music = require('../models/Music');
const Card = require('../models/Card');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

// @desc    ดึงข้อมูลเพลงทั้งหมด
// @route   GET /api/music
// @access  Private/Admin
const getMusic = asyncHandler(async (req, res) => {
  const music = await Music.find()
    .sort({ createdAt: -1 })
    .populate('cards', 'title imagePath');
  
  res.status(200).json({
    success: true,
    count: music.length,
    music
  });
});

// @desc    ดึงข้อมูลเพลงโดย ID
// @route   GET /api/music/:id
// @access  Private/Admin
const getMusicById = asyncHandler(async (req, res) => {
  const music = await Music.findById(req.params.id)
    .populate('cards', 'title imagePath');
  
  if (!music) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลเพลง');
  }
  
  res.status(200).json({
    success: true,
    music
  });
});

// @desc    อัปโหลดและสร้างเพลงใหม่
// @route   POST /api/music
// @access  Private/Admin
const createMusic = asyncHandler(async (req, res) => {
  // ตรวจสอบว่ามีการอัปโหลดไฟล์เพลงหรือไม่
  if (!req.file) {
    res.status(400);
    throw new Error('กรุณาอัปโหลดไฟล์เพลง');
  }
  
  const filePath = `/uploads/music/${req.file.filename}`;
  const fullPath = path.join(__dirname, '..', '..', filePath);
  
  // อ่านข้อมูล metadata จากไฟล์เพลง
  let duration = 0;
  try {
    const metadata = await mm.parseFile(fullPath);
    duration = metadata.format.duration || 0;
  } catch (error) {
    console.error('Error parsing music metadata:', error);
  }
  
  const music = await Music.create({
    title: req.body.title || 'Untitled',
    artist: req.body.artist || 'Unknown',
    filePath,
    duration
  });
  
  res.status(201).json({
    success: true,
    music
  });
});

// @desc    อัพเดตข้อมูลเพลง
// @route   PUT /api/music/:id
// @access  Private/Admin
const updateMusic = asyncHandler(async (req, res) => {
  let music = await Music.findById(req.params.id);
  
  if (!music) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลเพลง');
  }
  
  const updateData = {
    title: req.body.title || music.title,
    artist: req.body.artist || music.artist,
    isActive: req.body.isActive !== undefined ? req.body.isActive : music.isActive,
    updatedAt: Date.now()
  };
  
  // ถ้ามีการอัปโหลดไฟล์เพลงใหม่
  if (req.file) {
    // ลบไฟล์เพลงเก่า (ถ้ามี)
    if (music.filePath) {
      const oldFilePath = path.join(__dirname, '..', '..', music.filePath);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    
    const filePath = `/uploads/music/${req.file.filename}`;
    updateData.filePath = filePath;
    
    // อ่านข้อมูล metadata จากไฟล์เพลงใหม่
    const fullPath = path.join(__dirname, '..', '..', filePath);
    try {
      const metadata = await mm.parseFile(fullPath);
      updateData.duration = metadata.format.duration || 0;
    } catch (error) {
      console.error('Error parsing music metadata:', error);
    }
  }
  
  music = await Music.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('cards');
  
  res.status(200).json({
    success: true,
    music
  });
});

// @desc    ลบเพลง
// @route   DELETE /api/music/:id
// @access  Private/Admin
const deleteMusic = asyncHandler(async (req, res) => {
  const music = await Music.findById(req.params.id);
  
  if (!music) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลเพลง');
  }
  
  // ลบไฟล์เพลง
  if (music.filePath) {
    const filePath = path.join(__dirname, '..', '..', music.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  // อัพเดต Card ที่เกี่ยวข้อง
  await Card.updateMany(
    { music: music._id },
    { $pull: { music: music._id } }
  );
  
  await music.remove();
  
  res.status(200).json({
    success: true,
    message: 'ลบเพลงเรียบร้อยแล้ว'
  });
});

module.exports = {
  getMusic,
  getMusicById,
  createMusic,
  updateMusic,
  deleteMusic
};