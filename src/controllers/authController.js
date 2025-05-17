//backend/src/controllers/authController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { verifyGoogleToken, createUserFromGoogle, generateToken } = require('../services/googleAuthService');

// @desc    เตรียมข้อมูลปีเกิดก่อนล็อกอิน
// @route   POST /api/auth/prepare
// @access  Public
const prepareLogin = asyncHandler(async (req, res) => {
  const { birthYear } = req.body;

  // ตรวจสอบว่ามีการส่งปีเกิดมาหรือไม่
  if (!birthYear) {
    res.status(400);
    throw new Error('กรุณาระบุปีเกิด');
  }

  // ตรวจสอบว่าปีเกิดอยู่ในช่วงที่เหมาะสมหรือไม่
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 100; // สมมติว่าอายุมากสุด 100 ปี
  
  if (birthYear < minYear || birthYear > currentYear) {
    res.status(400);
    throw new Error('ปีเกิดไม่ถูกต้อง');
  }

  // คำนวณอายุ
  const age = currentYear - birthYear;
  
  // เก็บข้อมูลไว้ใน session หรือคืนค่าให้ frontend เก็บไว้ชั่วคราว
  res.json({
    success: true,
    data: {
      birthYear,
      age
    }
  });
});

// @desc    ล็อกอินด้วย Google
// @route   POST /api/auth/google
// @access  Public
const googleLogin = asyncHandler(async (req, res) => {
  const { token, birthYear } = req.body;

  if (!token) {
    res.status(400);
    throw new Error('กรุณาระบุ token');
  }

  if (!birthYear) {
    res.status(400);
    throw new Error('กรุณาระบุปีเกิด');
  }

  // ตรวจสอบ token กับ Google
  const googleData = await verifyGoogleToken(token); // ส่ง token จาก req.body

  if (googleData.isNewUser) {
    // สร้างผู้ใช้ใหม่ด้วยข้อมูลจาก Google และปีเกิด
    const userData = await createUserFromGoogle(
      googleData.googleId,
      googleData.email,
      birthYear
    );

    res.json({
      success: true,
      isNewUser: true,
      ...userData
    });
  } else {
    // ผู้ใช้มีอยู่แล้ว
    res.json({
      success: true,
      isNewUser: false,
      ...googleData
    });
  }
});

// @desc    ดึงข้อมูลผู้ใช้ปัจจุบัน
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        age: user.age,
        birthYear: user.birthYear,
        phone: user.phone,
        address: user.address,
        isAdmin: user.isAdmin,
        profileComplete: user.profileComplete
      }
    });
  } else {
    res.status(404);
    throw new Error('ไม่พบผู้ใช้');
  }
});

// @desc    อัปเดตข้อมูลโปรไฟล์
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, surname, phone, address } = req.body;

  const user = await User.findById(req.user._id);

  if (user) {
    // ตรวจสอบข้อมูลที่จำเป็น
    if (!name || !surname || !phone) {
      res.status(400);
      throw new Error('กรุณากรอกข้อมูล ชื่อ นามสกุล และเบอร์โทรศัพท์');
    }

    // อัปเดตข้อมูล
    user.name = name;
    user.surname = surname;
    user.phone = phone;
    user.address = address || ''; // ที่อยู่อาจเป็นค่าว่างได้

    // บันทึกข้อมูล
    const updatedUser = await user.save();

    res.json({
      success: true,
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        surname: updatedUser.surname,
        age: updatedUser.age,
        birthYear: updatedUser.birthYear,
        phone: updatedUser.phone,
        address: updatedUser.address,
        isAdmin: updatedUser.isAdmin,
        profileComplete: updatedUser.profileComplete
      }
    });
  } else {
    res.status(404);
    throw new Error('ไม่พบผู้ใช้');
  }
});

module.exports = {
  prepareLogin,
  googleLogin,
  getUserProfile,
  updateUserProfile
};