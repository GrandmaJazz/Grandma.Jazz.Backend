const Card = require('../models/Card');
const Music = require('../models/Music');
const asyncHandler = require('express-async-handler');
const { deleteFile } = require('../utils/gridFsHelper');
const mm = require('music-metadata');

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
  if (!req.files || !req.files.image || req.files.image.length === 0) {
    res.status(400);
    throw new Error('Please upload a card image');
  }
  
  // หาไฟล์รูปภาพ
  const imageFile = req.files.image[0];
  // สร้าง URL สำหรับเข้าถึงไฟล์จาก GridFS
  const imagePath = `/api/files/${imageFile.bucketName}/${imageFile.filename}`;
  
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
    order: req.body.order || 0,
    isActive: req.body.isActive === 'false' ? false : true
  });
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music && req.files.music.length > 0) {
    const musicFiles = req.files.music;
    
    for (const file of musicFiles) {
      const filePath = `/api/files/${file.bucketName}/${file.filename}`;
      
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // อ่านข้อมูล duration ถ้ามีใน metadata
      let duration = 0;
      if (file.metadata && file.metadata.duration) {
        duration = file.metadata.duration;
      } else {
        // ถ้าไม่มี duration ใน metadata ให้ใช้ค่าเริ่มต้น
        // หมายเหตุ: การอ่าน duration จาก file โดยตรงอาจทำได้ยากบน GridFS
        // อาจต้องใช้วิธีอื่นในการอ่าน duration เช่น client-side หรือใช้ cloud function
        duration = 0;
      }
      
      // สร้างเพลง
      const music = await Music.create({
        title: fileName,
        filePath,
        duration,
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
  const updateData = {
    isActive: req.body.isActive !== undefined ? (req.body.isActive === 'false' ? false : true) : card.isActive,
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
  if (req.files && req.files.image && req.files.image.length > 0) {
    const imageFile = req.files.image[0];
    
    // ลบรูปภาพเก่าจาก GridFS (ถ้ามี)
    if (card.imagePath) {
      // แยกชื่อไฟล์จาก URL
      const oldFilename = card.imagePath.split('/').pop();
      const bucketName = 'cards';
      
      // ลบไฟล์เก่า
      await deleteFile(oldFilename, bucketName);
    }
    
    // อัพเดตพาธรูปภาพ
    updateData.imagePath = `/api/files/${imageFile.bucketName}/${imageFile.filename}`;
  }
  
  card = await Card.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('music');
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music && req.files.music.length > 0) {
    const musicFiles = req.files.music;
    
    for (const file of musicFiles) {
      const filePath = `/api/files/${file.bucketName}/${file.filename}`;
      
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // อ่านข้อมูล duration ถ้ามีใน metadata
      let duration = 0;
      if (file.metadata && file.metadata.duration) {
        duration = file.metadata.duration;
      }
      
      // สร้างเพลง
      const music = await Music.create({
        title: fileName,
        filePath,
        duration,
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
  
  // ลบรูปภาพจาก GridFS
  if (card.imagePath) {
    try {
      // แยกชื่อไฟล์จาก URL
      const filename = card.imagePath.split('/').pop();
      const bucketName = 'cards';
      
      // ลบไฟล์
      await deleteFile(filename, bucketName);
    } catch (error) {
      console.error('Error deleting image file:', error);
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
  
  // ลบการ์ด
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

module.exports = {
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  addMusicToCard,
  removeMusicFromCard
};