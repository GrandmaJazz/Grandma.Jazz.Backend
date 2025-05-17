const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const User = require('../models/User');

// @desc    ดึงรายการรีวิวทั้งหมด
// @route   GET /api/reviews
// @access  Public
const getReviews = asyncHandler(async (req, res) => {
  // อนุญาตให้กำหนดจำนวนรีวิวที่ต้องการดึงได้ (limit) โดยค่าเริ่มต้นคือ 20
  const limit = Number(req.query.limit) || 20;
  
  // ดึงเฉพาะรีวิวที่เผยแพร่แล้ว (isPublished = true) เรียงตามวันที่สร้างจากใหม่ไปเก่า
  const reviews = await Review.find({ isPublished: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({
      path: 'user',
      select: 'name surname'
    });
  
  // แปลงข้อมูลให้อยู่ในรูปแบบที่เหมาะสมสำหรับ frontend
  const formattedReviews = reviews.map(review => {
    const userName = review.user 
      ? `${review.user.name || ''} ${review.user.surname ? review.user.surname.charAt(0) + '.' : ''}`.trim()
      : 'ผู้ใช้นิรนาม';
      
    return {
      id: review._id,
      rating: review.rating,
      text: review.text,
      userName,
      createdAt: review.createdAt
    };
  });

  res.json({
    success: true,
    count: formattedReviews.length,
    reviews: formattedReviews
  });
});

// @desc    สร้างรีวิวใหม่
// @route   POST /api/reviews
// @access  Private (ต้องล็อกอินก่อน)
const createReview = asyncHandler(async (req, res) => {
  const { rating, text } = req.body;

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!rating || !text) {
    res.status(400);
    throw new Error('กรุณากรอกคะแนนและข้อความรีวิว');
  }

  // ตรวจสอบว่า rating อยู่ในช่วง 1-5
  if (rating < 1 || rating > 5) {
    res.status(400);
    throw new Error('คะแนนต้องอยู่ในช่วง 1-5');
  }

  // ตรวจสอบความยาวของข้อความ
  if (text.length > 200) {
    res.status(400);
    throw new Error('ข้อความต้องไม่เกิน 200 ตัวอักษร');
  }

  // สร้างรีวิวใหม่
  const review = await Review.create({
    user: req.user._id,
    rating,
    text,
    isPublished: true
  });

  // ดึงข้อมูลผู้ใช้เพื่อส่งกลับไป
  const user = await User.findById(req.user._id).select('name surname');
  
  // ถ้าสร้างสำเร็จ ส่งข้อมูลกลับไป
  if (review) {
    const userName = `${user.name || ''} ${user.surname ? user.surname.charAt(0) + '.' : ''}`.trim() || 'ผู้ใช้นิรนาม';
    
    res.status(201).json({
      success: true,
      review: {
        id: review._id,
        rating: review.rating,
        text: review.text,
        userName,
        createdAt: review.createdAt
      }
    });
  } else {
    res.status(400);
    throw new Error('ข้อมูลรีวิวไม่ถูกต้อง');
  }
});

// @desc    ดึงรีวิวของผู้ใช้ที่ล็อกอิน
// @route   GET /api/reviews/myreviews
// @access  Private
const getUserReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .sort({ createdAt: -1 });
  
  const formattedReviews = reviews.map(review => {
    return {
      id: review._id,
      rating: review.rating,
      text: review.text,
      isPublished: review.isPublished,
      createdAt: review.createdAt
    };
  });

  res.json({
    success: true,
    count: formattedReviews.length,
    reviews: formattedReviews
  });
});

// @desc    อัปเดตรีวิว
// @route   PUT /api/reviews/:id
// @access  Private (เฉพาะเจ้าของรีวิว)
const updateReview = asyncHandler(async (req, res) => {
  const { rating, text } = req.body;
  
  // ค้นหารีวิวตาม ID
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    res.status(404);
    throw new Error('ไม่พบรีวิวนี้');
  }
  
  // ตรวจสอบว่าผู้ใช้เป็นเจ้าของรีวิวหรือไม่
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('คุณไม่มีสิทธิ์แก้ไขรีวิวนี้');
  }
  
  // อัปเดตข้อมูล
  if (rating !== undefined) review.rating = rating;
  if (text !== undefined) review.text = text;
  
  // ตรวจสอบความถูกต้องของข้อมูล
  if (review.rating < 1 || review.rating > 5) {
    res.status(400);
    throw new Error('คะแนนต้องอยู่ในช่วง 1-5');
  }
  
  if (review.text.length > 200) {
    res.status(400);
    throw new Error('ข้อความต้องไม่เกิน 200 ตัวอักษร');
  }
  
  // บันทึกการเปลี่ยนแปลง
  const updatedReview = await review.save();
  
  // ดึงข้อมูลผู้ใช้
  const user = await User.findById(req.user._id).select('name surname');
  const userName = `${user.name || ''} ${user.surname ? user.surname.charAt(0) + '.' : ''}`.trim() || 'ผู้ใช้นิรนาม';
  
  res.json({
    success: true,
    review: {
      id: updatedReview._id,
      rating: updatedReview.rating,
      text: updatedReview.text,
      userName,
      createdAt: updatedReview.createdAt,
      isPublished: updatedReview.isPublished
    }
  });
});

// @desc    ลบรีวิว
// @route   DELETE /api/reviews/:id
// @access  Private (เฉพาะเจ้าของรีวิวและแอดมิน)
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    res.status(404);
    throw new Error('ไม่พบรีวิวนี้');
  }
  
  // ตรวจสอบว่าผู้ใช้เป็นเจ้าของรีวิวหรือเป็นแอดมินหรือไม่
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('คุณไม่มีสิทธิ์ลบรีวิวนี้');
  }
  
  await Review.deleteOne({ _id: review._id });
  
  res.json({
    success: true,
    message: 'ลบรีวิวเรียบร้อยแล้ว'
  });
});

module.exports = {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews
};