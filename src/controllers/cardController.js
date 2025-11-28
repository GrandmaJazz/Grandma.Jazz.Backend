const Card = require('../models/Card');
const Music = require('../models/Music');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/awsS3');

// @desc    ดึงข้อมูลการ์ดทั้งหมดสำหรับแอดมิน
// @route   GET /api/cards/admin/all
// @access  Private/Admin
const getAllCardsAdmin = asyncHandler(async (req, res) => {
  const cards = await Card.find()
    .sort({ order: 1, createdAt: -1 })
    .populate({
      path: 'music',
      select: 'title filePath duration'
    });
  
  res.status(200).json({
    success: true,
    count: cards.length,
    cards
  });
});

// @desc    ดึงข้อมูลการ์ดทั้งหมด
// @route   GET /api/cards
// @access  Public
const getCards = asyncHandler(async (req, res) => {
  const cards = await Card.find({ isActive: true })
    .sort({ order: 1 })
    .populate({
      path: 'music',
      select: 'title filePath duration',
      match: { isActive: true }
    });
  
  res.status(200).json({
    success: true,
    count: cards.length,
    cards
  });
});

// @desc    ดึงข้อมูลการ์ดโดย ID
// @route   GET /api/cards/:id
// @access  Public
const getCardById = asyncHandler(async (req, res) => {
  const card = await Card.findById(req.params.id)
    .populate({
      path: 'music',
      select: 'title filePath duration',
      match: { isActive: true }
    });
  
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  res.status(200).json({
    success: true,
    card
  });
});

// @desc    สร้างการ์ดใหม่
// @route   POST /api/cards
// @access  Private/Admin
const createCard = asyncHandler(async (req, res) => {
  // ตรวจสอบว่ามีการอัปโหลดรูปภาพหรือไม่
  if (!req.file && (!req.files || !req.files.image)) {
    res.status(400);
    throw new Error('Please upload a card image');
  }
  
  // หาไฟล์รูปภาพ - อาจมาจาก req.file หรือ req.files.image
  const imageFile = req.file || req.files.image[0];
  const imagePath = imageFile.location; // S3 URL
  const imageS3Key = imageFile.key; // S3 key for deletion
  
  // กำหนดชื่อที่มีความหมายมากขึ้น เช่น ใช้วันที่สร้าง
  const defaultTitle = `Music Card ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })}`;
  
  // สร้างการ์ด
  const card = await Card.create({
    title: req.body.title || defaultTitle,
    description: req.body.description || '',
    imagePath,
    imageS3Key,
    order: req.body.order || 0,
    isActive: req.body.isActive === 'false' ? false : true
  });
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music) {
    // อาจจะเป็นไฟล์เดียวหรือหลายไฟล์
    const musicFiles = Array.isArray(req.files.music) ? req.files.music : [req.files.music];
    
    for (const file of musicFiles) {
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // สร้างเพลง
      const music = await Music.create({
        title: fileName,
        filePath: file.location, // S3 URL
        fileS3Key: file.key, // S3 key
        duration: 0, // จะต้องหาวิธีดึง duration จาก S3 file
        cards: [card._id]
      });
      
      // เพิ่มเพลงเข้าการ์ด
      card.music.push(music._id);
    }
    
    await card.save();
  }
  
  res.status(201).json({
    success: true,
    card
  });
});

// @desc    อัพเดตการ์ด
// @route   PUT /api/cards/:id
// @access  Private/Admin
const updateCard = asyncHandler(async (req, res) => {
  let card = await Card.findById(req.params.id);
  
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ถ้าไม่มีการส่ง title หรือ description มา ให้ใช้ค่าเดิม
  // ไม่ใช่รับค่าจาก req.body แล้วเปลี่ยนเป็นค่าว่าง
  const updateData = {
    isActive: req.body.isActive !== undefined ? 
      (typeof req.body.isActive === 'string' ? req.body.isActive === 'true' : Boolean(req.body.isActive)) : 
      card.isActive,
    updatedAt: Date.now()
  };
  
  // อัพเดต title เฉพาะเมื่อมีการส่งมา
  if (req.body.title !== undefined) {
    updateData.title = req.body.title;
  }
  
  // อัพเดต description เฉพาะเมื่อมีการส่งมา
  if (req.body.description !== undefined) {
    updateData.description = req.body.description;
  }
  
  // อัพเดต order เฉพาะเมื่อมีการส่งมา
  if (req.body.order !== undefined) {
    updateData.order = req.body.order;
  }
  
  // ถ้ามีการอัปโหลดรูปภาพใหม่
  if (req.file || (req.files && req.files.image)) {
    // หาไฟล์รูปภาพ - อาจมาจาก req.file หรือ req.files.image
    const imageFile = req.file || req.files.image[0];
    
    // ลบรูปภาพเก่าจาก S3 (ถ้ามี)
    if (card.imageS3Key) {
      try {
        const deleteParams = {
          Bucket: bucketName,
          Key: card.imageS3Key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      } catch (error) {
        console.error('Error deleting old image from S3:', error);
      }
    }
    
    updateData.imagePath = imageFile.location; // S3 URL
    updateData.imageS3Key = imageFile.key; // S3 key
  }
  
  card = await Card.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('music');
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music) {
    // อาจจะเป็นไฟล์เดียวหรือหลายไฟล์
    const musicFiles = Array.isArray(req.files.music) ? req.files.music : [req.files.music];
    
    for (const file of musicFiles) {
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // สร้างเพลง
      const music = await Music.create({
        title: fileName,
        filePath: file.location, // S3 URL
        fileS3Key: file.key, // S3 key
        duration: 0,
        cards: [card._id]
      });
      
      // เพิ่มเพลงเข้าการ์ด
      card.music.push(music._id);
    }
    
    await card.save();
  }
  
  // ดึงข้อมูลการ์ดล่าสุดพร้อมเพลงทั้งหมด
  card = await Card.findById(req.params.id).populate('music');
  
  res.status(200).json({
    success: true,
    card
  });
});

// @desc    ลบการ์ด
// @route   DELETE /api/cards/:id
// @access  Private/Admin
const deleteCard = asyncHandler(async (req, res) => {
  const card = await Card.findById(req.params.id);
  
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ลบรูปภาพจาก S3
  if (card.imageS3Key) {
    try {
      const deleteParams = {
        Bucket: bucketName,
        Key: card.imageS3Key
      };
      await s3Client.send(new DeleteObjectCommand(deleteParams));
    } catch (error) {
      console.error('Error deleting image file from S3:', error);
      // ยังคงดำเนินการต่อไปแม้ลบไฟล์ไม่สำเร็จ
    }
  }
  
  // อัพเดต Music ที่เกี่ยวข้อง
  try {
    await Music.updateMany(
      { cards: card._id },
      { $pull: { cards: card._id } }
    );
  } catch (error) {
    console.error('Error updating music references:', error);
    // ยังคงดำเนินการต่อไปแม้อัพเดตความสัมพันธ์ไม่สำเร็จ
  }
  
  // แก้ไขจาก card.remove() เป็น findByIdAndDelete
  await Card.findByIdAndDelete(req.params.id);
  
  res.status(200).json({
    success: true,
    message: 'Card deleted successfully'
  });
});

// @desc    เพิ่มเพลงเข้าการ์ด
// @route   POST /api/cards/:id/music
// @access  Private/Admin
const addMusicToCard = asyncHandler(async (req, res) => {
  const { musicId } = req.body;
  
  if (!musicId) {
    res.status(400);
    throw new Error('Please provide a music ID');
  }
  
  // ตรวจสอบว่ามีการ์ดนี้หรือไม่
  const card = await Card.findById(req.params.id);
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(musicId);
  if (!music) {
    res.status(404);
    throw new Error('Music not found');
  }
  
  // ตรวจสอบว่าเพลงนี้อยู่ในการ์ดแล้วหรือไม่
  if (card.music.includes(musicId)) {
    res.status(400);
    throw new Error('This music is already in the card');
  }
  
  // เพิ่มเพลงเข้าการ์ด
  card.music.push(musicId);
  await card.save();
  
  // เพิ่มการ์ดเข้าเพลง
  music.cards.push(card._id);
  await music.save();
  
  res.status(200).json({
    success: true,
    card: await Card.findById(req.params.id).populate('music')
  });
});

// @desc    ลบเพลงออกจากการ์ด
// @route   DELETE /api/cards/:id/music/:musicId
// @access  Private/Admin
const removeMusicFromCard = asyncHandler(async (req, res) => {
  const cardId = req.params.id;
  const musicId = req.params.musicId;
  
  // ตรวจสอบว่ามีการ์ดนี้หรือไม่
  const card = await Card.findById(cardId);
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(musicId);
  if (!music) {
    res.status(404);
    throw new Error('Music not found');
  }
  
  // ลบเพลงออกจากการ์ด
  card.music = card.music.filter(id => id.toString() !== musicId);
  await card.save();
  
  // ลบการ์ดออกจากเพลง
  music.cards = music.cards.filter(id => id.toString() !== cardId);
  await music.save();
  
  res.status(200).json({
    success: true,
    card: await Card.findById(cardId).populate('music')
  });
});

// @desc    Toggle card status (Active/Inactive)
// @route   PATCH /api/cards/:id/status
// @access  Private/Admin
const toggleCardStatus = asyncHandler(async (req, res) => {
  const card = await Card.findById(req.params.id);
  
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  // Toggle the status or set to specific value if provided
  const newStatus = req.body.isActive !== undefined ? req.body.isActive : !card.isActive;
  
  const updatedCard = await Card.findByIdAndUpdate(
    req.params.id,
    { 
      isActive: newStatus,
      updatedAt: Date.now()
    },
    {
      new: true,
      runValidators: true
    }
  ).populate('music');
  
  res.status(200).json({
    success: true,
    card: updatedCard
  });
});

module.exports = {
  getAllCardsAdmin,
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  addMusicToCard,
  removeMusicFromCard,
  toggleCardStatus
};