//src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { MESSAGES } = require('../config/constants');

// ตรวจสอบว่ามี token และมีสิทธิ์เข้าถึงหรือไม่
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // ตรวจสอบ token จาก header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // รับค่า token จาก header
      token = req.headers.authorization.split(' ')[1];

      // ตรวจสอบ token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // เก็บข้อมูลผู้ใช้ (ไม่รวมรหัสผ่าน) ใน req.user
      req.user = await User.findById(decoded.id).select('-password');

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error(MESSAGES.UNAUTHORIZED);
    }
  }

  if (!token) {
    res.status(401);
    throw new Error(MESSAGES.UNAUTHORIZED);
  }
});

// ตรวจสอบว่าผู้ใช้เป็นแอดมินหรือไม่
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403);
    throw new Error('ไม่มีสิทธิ์เข้าถึงส่วนนี้ เฉพาะแอดมินเท่านั้น');
  }
};

// ตรวจสอบว่าผู้ใช้กรอกข้อมูลส่วนตัวครบหรือไม่
const completeProfile = (req, res, next) => {
  if (req.user && req.user.profileComplete) {
    next();
  } else {
    res.status(403);
    throw new Error('กรุณากรอกข้อมูลส่วนตัวให้ครบถ้วนก่อนดำเนินการต่อ');
  }
};

module.exports = { protect, admin, completeProfile };