const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config();

// เชื่อมต่อกับฐานข้อมูล
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      // กำหนดอีเมลที่ต้องการให้เป็นแอดมิน
      const adminEmail = 'kraichan.official@gmail.com'; // เปลี่ยนเป็นอีเมลที่คุณใช้ล็อกอิน
      
      // ค้นหาและอัปเดตผู้ใช้
      const user = await User.findOneAndUpdate(
        { email: adminEmail },
        { isAdmin: true },
        { new: true }
      );
      
      if (user) {
        console.log(`User ${user.email} has been updated to admin`);
      } else {
        console.log(`User with email ${adminEmail} not found`);
      }
    } catch (error) {
      console.error('Error:', error);
    }
    
    // ปิดการเชื่อมต่อกับฐานข้อมูล
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });