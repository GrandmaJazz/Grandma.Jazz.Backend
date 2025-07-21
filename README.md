# Grandma Jazz Backend

Backend API สำหรับร้าน Grandma Jazz

## การติดตั้ง

1. ติดตั้ง dependencies:
```bash
npm install
```

2. สร้างไฟล์ `.env` และกำหนดค่าตัวแปรต่างๆ:
```env
MONGODB_URI=mongodb://localhost:27017/grandma-jazz
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
STRIPE_SECRET_KEY=your_stripe_secret_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
AWS_S3_BUCKET_NAME=your_bucket_name
```

3. เริ่มเซิร์ฟเวอร์:
```bash
npm run dev
```

## Scripts

### อัปเดตหมวดหมู่สินค้า

หากคุณต้องการอัปเดตหมวดหมู่สินค้าในฐานข้อมูลจากเดิม (Vinyl Records, CDs, Instruments) เป็นใหม่ (Merchandise, Coffees, Teas, Garments):

```bash
cd backend
node scripts/update-categories.js
```

สคริปต์นี้จะ:
- อัปเดต `vinyl` และ `cds` เป็น `merchandise`
- อัปเดต `instruments` เป็น `garments`
- แสดงสรุปผลการอัปเดต

## API Endpoints

### Products
- `GET /api/products` - ดึงข้อมูลสินค้าทั้งหมด
- `GET /api/products/:id` - ดึงข้อมูลสินค้าตาม ID
- `POST /api/products` - สร้างสินค้าใหม่ (Admin)
- `PUT /api/products/:id` - อัปเดตสินค้า (Admin)
- `DELETE /api/products/:id` - ลบสินค้า (Admin)

### Auth
- `POST /api/auth/google` - เข้าสู่ระบบด้วย Google
- `GET /api/auth/profile` - ดึงข้อมูลโปรไฟล์
- `PUT /api/auth/profile` - อัปเดตโปรไฟล์

### Orders
- `GET /api/orders` - ดึงข้อมูลคำสั่งซื้อ
- `POST /api/orders` - สร้างคำสั่งซื้อใหม่

### และอื่นๆ...
