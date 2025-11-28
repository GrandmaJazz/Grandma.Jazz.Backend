const Music = require('../models/Music');
const Card = require('../models/Card');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/awsS3');

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
  
  // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
  const fileName = req.file.originalname.split('.').slice(0, -1).join('.');
  
  // อ่านข้อมูล metadata จากไฟล์เพลง
  let duration = 0;
  try {
    // เนื่องจากไฟล์อยู่บน S3 เราอาจต้อง stream หรือ download ชั่วคราว
    // หรือจะเก็บ duration จาก frontend
    // ตอนนี้ให้ใช้ค่า default ไปก่อน
    duration = 0;
  } catch (error) {
    console.error('Error parsing music metadata:', error);
  }
  
  const music = await Music.create({
    title: fileName, // ใช้ชื่อไฟล์แทนชื่อเพลง
    filePath: req.file.location, // S3 URL
    fileS3Key: req.file.key, // S3 key for deletion
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
  
  // ถ้ามีชื่อเพลงใหม่ (แต่ส่วนใหญ่เราจะใช้ชื่อไฟล์)
  if (req.body.title) {
    updateData.title = req.body.title;
  }
  
  // ถ้ามีการอัปโหลดไฟล์เพลงใหม่
  if (req.file) {
    // ลบไฟล์เพลงเก่าจาก S3 (ถ้ามี)
    if (music.fileS3Key) {
      try {
        const deleteParams = {
          Bucket: bucketName,
          Key: music.fileS3Key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      } catch (deleteError) {
        console.error('Error deleting old music file from S3:', deleteError);
      }
    }
    
    updateData.filePath = req.file.location; // S3 URL
    updateData.fileS3Key = req.file.key; // S3 key
    
    // ถ้าไม่มีการระบุชื่อเพลงใหม่ ใช้ชื่อไฟล์
    if (!req.body.title) {
      updateData.title = req.file.originalname.split('.').slice(0, -1).join('.');
    }
    
    // สำหรับ metadata จาก S3 อาจต้องใช้วิธีอื่น
    updateData.duration = 0;
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
  
  // ลบไฟล์เพลงจาก S3
  if (music.fileS3Key) {
    try {
      const deleteParams = {
        Bucket: bucketName,
        Key: music.fileS3Key
      };
      await s3Client.send(new DeleteObjectCommand(deleteParams));
    } catch (deleteError) {
      console.error('Error deleting music file from S3:', deleteError);
    }
  }
  
  // อัพเดต Card ที่เกี่ยวข้อง - ลบเพลงออกจากการอ้างอิงในการ์ด
  await Card.updateMany(
    { music: music._id },
    { $pull: { music: music._id } }
  );
  
  // ลบเพลงจากฐานข้อมูล
  await music.remove();
  
  res.status(200).json({
    success: true,
    message: 'Music deleted successfully'
  });
});

// @desc    เพิ่มเพลงเข้าการ์ด
// @route   POST /api/music/:id/cards
// @access  Private/Admin
const addMusicToCard = asyncHandler(async (req, res) => {
  const { cardId } = req.body;
  
  if (!cardId) {
    res.status(400);
    throw new Error('Please provide a card ID');
  }
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(req.params.id);
  if (!music) {
    res.status(404);
    throw new Error('Music not found');
  }
  
  // ตรวจสอบว่ามีการ์ดนี้หรือไม่
  const card = await Card.findById(cardId);
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ตรวจสอบว่าการ์ดนี้มีเพลงนี้อยู่แล้วหรือไม่
  if (card.music.includes(music._id)) {
    res.status(400);
    throw new Error('This music is already in the card');
  }
  
  // เพิ่มการ์ดเข้าเพลง
  music.cards.push(cardId);
  await music.save();
  
  // เพิ่มเพลงเข้าการ์ด
  card.music.push(music._id);
  await card.save();
  
  res.status(200).json({
    success: true,
    music: await Music.findById(req.params.id).populate('cards')
  });
});

// @desc    ลบเพลงออกจากการ์ด
// @route   DELETE /api/music/:id/cards/:cardId
// @access  Private/Admin
const removeMusicFromCard = asyncHandler(async (req, res) => {
  const musicId = req.params.id;
  const cardId = req.params.cardId;
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(musicId);
  if (!music) {
    res.status(404);
    throw new Error('Music not found');
  }
  
  // ตรวจสอบว่ามีการ์ดนี้หรือไม่
  const card = await Card.findById(cardId);
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ลบการ์ดออกจากเพลง
  music.cards = music.cards.filter(id => id.toString() !== cardId);
  await music.save();
  
  // ลบเพลงออกจากการ์ด
  card.music = card.music.filter(id => id.toString() !== musicId);
  await card.save();
  
  res.status(200).json({
    success: true,
    music: await Music.findById(musicId).populate('cards')
  });
});

module.exports = {
  getMusic,
  getMusicById,
  createMusic,
  updateMusic,
  deleteMusic,
  addMusicToCard,
  removeMusicFromCard
};