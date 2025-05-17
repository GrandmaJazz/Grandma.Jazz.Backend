//backend/server.js
const app = require('./src/app');
const connectDB = require('./src/config/db');

// เชื่อมต่อกับฐานข้อมูล MongoDB
connectDB();

// กำหนดพอร์ต
const PORT = process.env.PORT || 5000;

// เริ่มต้นเซิร์ฟเวอร์
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});