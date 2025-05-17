// อัปเดตไฟล์ backend/src/app.js เพื่อเพิ่ม route สำหรับ reviews
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// โหลดค่าจากไฟล์ .env ก่อนที่จะมีการใช้ค่าต่างๆ
dotenv.config();

// แสดงข้อมูลการโหลดค่าสำคัญ (ไม่แสดงค่าจริง เพื่อความปลอดภัย)
console.log('Environment variables loaded:');
console.log('- PORT:', process.env.PORT ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- MONGO_URI:', process.env.MONGO_URI ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- CLIENT_URL:', process.env.CLIENT_URL);

const path = require('path');
const multer = require('multer');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const reviewRoutes = require('./routes/reviewRoutes'); // เพิ่มบรรทัดนี้

// สร้างแอปพลิเคชัน Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// กำหนดค่า CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://grandma-jazz-murex.vercel.app',
  credentials: true
}));

// Static folder
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reviews', reviewRoutes); // เพิ่มบรรทัดนี้

// Webhook route สำหรับ Stripe (ใช้ raw body parser)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    const stripeService = require('./services/stripeService');
    const event = await stripeService.handleWebhook(req.body, signature);
    res.json(event);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// Middleware สำหรับจัดการข้อผิดพลาด
app.use(notFound);
app.use(errorHandler);

module.exports = app;