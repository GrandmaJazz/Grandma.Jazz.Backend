const Music = require('../models/Music');
const Card = require('../models/Card');
const asyncHandler = require('express-async-handler');
const { deleteFile } = require('../utils/gridFsHelper');

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
    throw new Error('Music not found');
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
    throw new Error('Please upload a music file');
  }
  
  const file = req.file;
  const filePath = `/api/files/${file.bucketName}/${file.filename}`;
  
  // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
  const fileName = file.originalname.split('.').slice(0, -1).join('.');
  
  // อ่านข้อมูล duration ถ้ามีใน metadata
  let duration = 0;
  if (file.metadata && file.metadata.duration) {
    duration = file.metadata.duration;
  }
  
  const music = await Music.create({
    title: fileName,
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
    throw new Error('Music not found');
  }
  
  const updateData = {
    isActive: req.body.isActive !== undefined ? req.body.isActive : music.isActive,
    updatedAt: Date.now()
  };
  
  // ถ้ามีชื่อเพลงใหม่
  if (req.body.title) {
    updateData.title = req.body.title;
  }
  
  // ถ้ามีการอัปโหลดไฟล์เพลงใหม่
  if (req.file) {
    // ลบไฟล์เพลงเก่าจาก GridFS (ถ้ามี)
    if (music.filePath) {
      try {
        // แยกชื่อไฟล์จาก URL
        const oldFilename = music.filePath.split('/').pop();
        const bucketName = 'music';
        
        // ลบไฟล์เก่า
        await deleteFile(oldFilename, bucketName);
      } catch (error) {
        console.error('Error deleting old music file:', error);
        // ดำเนินการต่อแม้ลบไฟล์ไม่สำเร็จ
      }
    }
    
    const file = req.file;
    updateData.filePath = `/api/files/${file.bucketName}/${file.filename}`;
    
    // ถ้าไม่มีการระบุชื่อเพลงใหม่ ใช้ชื่อไฟล์
    if (!req.body.title) {
      updateData.title = file.originalname.split('.').slice(0, -1).join('.');
    }
    
    // อ่านข้อมูล duration ถ้ามีใน metadata
    if (file.metadata && file.metadata.duration) {
      updateData.duration = file.metadata.duration;
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
    throw new Error('Music not found');
  }
  
  // ลบไฟล์เพลงจาก GridFS
  if (music.filePath) {
    try {
      // แยกชื่อไฟล์จาก URL
      const filename = music.filePath.split('/').pop();
      const bucketName = 'music';
      
      // ลบไฟล์
      await deleteFile(filename, bucketName);
    } catch (error) {
      console.error('Error deleting music file:', error);
      // ดำเนินการต่อแม้ลบไฟล์ไม่สำเร็จ
    }
  }
  
  // อัพเดต Card ที่เกี่ยวข้อง - ลบเพลงออกจากการอ้างอิงในการ์ด
  await Card.updateMany(
    { music: music._id },
    { $pull: { music: music._id } }
  );
  
  // ลบเพลงจากฐานข้อมูล
  await Music.findByIdAndDelete(music._id);
  
  res.status(200).json({
    success: true,
    message: 'Music deleted successfully'
  });
});

module.exports = {
  getMusic,
  getMusicById,
  createMusic,
  updateMusic,
  deleteMusic
};