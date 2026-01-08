//backend/src/app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const TicketExpirationService = require('./services/ticketExpirationService');

// โหลดค่าจากไฟล์ .env ก่อนที่จะมีการใช้ค่าต่างๆ
dotenv.config();

// แสดงข้อมูลการโหลดค่าสำคัญ (ไม่แสดงค่าจริง เพื่อความปลอดภัย)
console.log('Environment variables loaded:');
console.log('- PORT:', process.env.PORT ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- MONGO_URI:', process.env.MONGO_URI ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด');
console.log('- CLIENT_URL:', process.env.CLIENT_URL);

const multer = require('multer');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const cardRoutes = require('./routes/cardRoutes');
const musicRoutes = require('./routes/musicRoutes');
const blogRoutes = require('./routes/blogRoutes');
const eventRoutes = require('./routes/eventRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const discountRoutes = require('./routes/discountRoutes');

// สร้างแอปพลิเคชัน Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// กำหนดค่า CORS ที่แก้ไขแล้ว
const allowedOrigins = [
  process.env.CLIENT_URL || 'https://grandma-jazz-murex.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'  // เพิ่ม Vite default port (ถ้าใช้)
];

app.use(cors({
  origin: function(origin, callback) {
    // อนุญาตให้เรียกจาก REST client หรือ Postman (ไม่มี origin)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Origin blocked: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true
}));

// Static folder - ปิดการใช้งานเพราะใช้ S3 แทน
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/discounts', discountRoutes);

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

// CORS diagnostic route
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working properly!',
    origin: req.headers.origin || 'No origin header',
    allowedOrigins
  });
});

// Middleware สำหรับจัดการข้อผิดพลาด
app.use(notFound);
app.use(errorHandler);

// Start automatic ticket expiration cleanup
TicketExpirationService.startAutomaticCleanup();

module.exports = app;