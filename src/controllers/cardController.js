const Card = require('../models/Card');
const Music = require('../models/Music');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');

// @desc    ดึงข้อมูลการ์ดทั้งหมด
// @route   GET /api/cards
// @access  Public
const getCards = asyncHandler(async (req, res) => {
  const cards = await Card.find({ isActive: true })
    .sort({ order: 1 })
    .populate({
      path: 'music',
      select: 'title artist filePath duration',
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
      select: 'title artist filePath duration',
      match: { isActive: true }
    });
  
  if (!card) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลการ์ด');
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
  if (!req.file) {
    res.status(400);
    throw new Error('กรุณาอัปโหลดรูปภาพการ์ด');
  }
  
  const imagePath = `/uploads/cards/${req.file.filename}`;
  
  const card = await Card.create({
    title: req.body.title,
    description: req.body.description,
    imagePath,
    order: req.body.order || 0
  });
  
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
    throw new Error('ไม่พบข้อมูลการ์ด');
  }
  
  const updateData = {
    title: req.body.title || card.title,
    description: req.body.description || card.description,
    order: req.body.order !== undefined ? req.body.order : card.order,
    isActive: req.body.isActive !== undefined ? req.body.isActive : card.isActive,
    updatedAt: Date.now()
  };
  
  // ถ้ามีการอัปโหลดรูปภาพใหม่
  if (req.file) {
    // ลบรูปภาพเก่า (ถ้ามี)
    if (card.imagePath) {
      const oldImagePath = path.join(__dirname, '..', '..', card.imagePath);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    updateData.imagePath = `/uploads/cards/${req.file.filename}`;
  }
  
  card = await Card.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('music');
  
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
    throw new Error('ไม่พบข้อมูลการ์ด');
  }
  
  // ลบรูปภาพ
  if (card.imagePath) {
    const imagePath = path.join(__dirname, '..', '..', card.imagePath);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  // อัพเดต Music ที่เกี่ยวข้อง
  await Music.updateMany(
    { cards: card._id },
    { $pull: { cards: card._id } }
  );
  
  await card.remove();
  
  res.status(200).json({
    success: true,
    message: 'ลบการ์ดเรียบร้อยแล้ว'
  });
});

// @desc    เพิ่มเพลงเข้าการ์ด
// @route   POST /api/cards/:id/music
// @access  Private/Admin
const addMusicToCard = asyncHandler(async (req, res) => {
  const { musicId } = req.body;
  
  if (!musicId) {
    res.status(400);
    throw new Error('กรุณาระบุไอดีเพลง');
  }
  
  // ตรวจสอบว่ามีการ์ดนี้หรือไม่
  const card = await Card.findById(req.params.id);
  if (!card) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลการ์ด');
  }
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(musicId);
  if (!music) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลเพลง');
  }
  
  // ตรวจสอบว่าเพลงนี้อยู่ในการ์ดแล้วหรือไม่
  if (card.music.includes(musicId)) {
    res.status(400);
    throw new Error('เพลงนี้อยู่ในการ์ดอยู่แล้ว');
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
    throw new Error('ไม่พบข้อมูลการ์ด');
  }
  
  // ตรวจสอบว่ามีเพลงนี้หรือไม่
  const music = await Music.findById(musicId);
  if (!music) {
    res.status(404);
    throw new Error('ไม่พบข้อมูลเพลง');
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

module.exports = {
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  addMusicToCard,
  removeMusicFromCard
};