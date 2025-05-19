// แก้ไขฟังก์ชัน createCard เพื่อรองรับการอัพโหลดหลายไฟล์
const createCard = asyncHandler(async (req, res) => {
  // ตรวจสอบว่ามีการอัปโหลดรูปภาพหรือไม่
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload card image');
  }
  
  const imagePath = `/uploads/cards/${req.file.filename}`;
  
  // สร้างการ์ด
  const card = await Card.create({
    title: req.body.title || 'Untitled Card',
    description: req.body.description || '',
    imagePath,
    order: req.body.order || 0,
    isActive: req.body.isActive === 'false' ? false : true
  });
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music) {
    // อาจจะเป็นไฟล์เดียวหรือหลายไฟล์
    const musicFiles = Array.isArray(req.files.music) ? req.files.music : [req.files.music];
    
    for (const file of musicFiles) {
      const filePath = `/uploads/music/${file.filename}`;
      
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // อ่านข้อมูล metadata จากไฟล์เพลง
      let duration = 0;
      try {
        const fullPath = path.join(__dirname, '..', '..', filePath);
        const metadata = await mm.parseFile(fullPath);
        duration = metadata.format.duration || 0;
      } catch (error) {
        console.error('Error parsing music metadata:', error);
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

// อัพเดต updateCard ฟังก์ชันให้รองรับการอัพโหลดเพลงเพิ่มเติม
const updateCard = asyncHandler(async (req, res) => {
  let card = await Card.findById(req.params.id);
  
  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }
  
  const updateData = {
    title: req.body.title || card.title,
    description: req.body.description || card.description,
    order: req.body.order !== undefined ? req.body.order : card.order,
    isActive: req.body.isActive !== undefined ? (req.body.isActive === 'false' ? false : true) : card.isActive,
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
  
  // ถ้ามีการอัปโหลดไฟล์เพลง (req.files.music)
  if (req.files && req.files.music) {
    // อาจจะเป็นไฟล์เดียวหรือหลายไฟล์
    const musicFiles = Array.isArray(req.files.music) ? req.files.music : [req.files.music];
    
    for (const file of musicFiles) {
      const filePath = `/uploads/music/${file.filename}`;
      
      // ใช้ชื่อไฟล์เป็นชื่อเพลง (ตัด extension ออก)
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      
      // อ่านข้อมูล metadata จากไฟล์เพลง
      let duration = 0;
      try {
        const fullPath = path.join(__dirname, '..', '..', filePath);
        const metadata = await mm.parseFile(fullPath);
        duration = metadata.format.duration || 0;
      } catch (error) {
        console.error('Error parsing music metadata:', error);
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