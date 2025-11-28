const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ตรวจสอบ Google token และสร้างหรือค้นหาผู้ใช้งาน
const verifyGoogleToken = async (googleToken) => {
  try {
    // ตรวจสอบ token กับ Google API
    const ticket = await client.verifyIdToken({
      idToken: googleToken, // ใช้ parameter name ให้ถูกต้อง
      audience: process.env.GOOGLE_CLIENT_ID
    });

    // รับข้อมูลจาก token
    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    // ค้นหาผู้ใช้งานในระบบ
    let user = await User.findOne({ email });

    // ถ้าไม่มีผู้ใช้งาน ให้ส่งข้อมูลกลับเพื่อสร้างใหม่
    if (!user) {
      return {
        isNewUser: true,
        googleId,
        email
      };
    }

    // อัปเดต googleId ถ้ายังไม่มี
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    // สร้าง token สำหรับระบบของเรา
    const token = generateToken(user._id);

    return {
      isNewUser: false,
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        age: user.age,
        phone: user.phone,
        address: user.address,
        isAdmin: user.isAdmin,
        profileComplete: user.profileComplete
      }
    };
  } catch (error) {
    console.error('Google authentication error:', error);
    throw error;
  }
};

// สร้าง JWT token สำหรับผู้ใช้
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// สร้างผู้ใช้ใหม่จากข้อมูล Google และข้อมูลปีเกิด
const createUserFromGoogle = async (googleId, email, birthYear) => {
  try {
    // คำนวณอายุจากปีเกิด
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;
    
    // สร้างผู้ใช้ใหม่
    const user = await User.create({
      email,
      googleId,
      birthYear,
      age
    });

    // สร้าง token สำหรับระบบของเรา
    const token = generateToken(user._id);

    return {
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        age: user.age,
        phone: user.phone,
        address: user.address,
        isAdmin: user.isAdmin,
        profileComplete: user.profileComplete
      }
    };
  } catch (error) {
    console.error('Create user error:', error);
    throw new Error('ไม่สามารถสร้างผู้ใช้ใหม่ได้');
  }
};

module.exports = { verifyGoogleToken, generateToken, createUserFromGoogle };