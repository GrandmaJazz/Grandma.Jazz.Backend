// สถานะคำสั่งซื้อ
const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELED: 'canceled'
};

// ข้อความแสดงผลสำหรับการตอบกลับ API
const MESSAGES = {
  UNAUTHORIZED: 'ไม่มีสิทธิ์เข้าถึงข้อมูล',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  SERVER_ERROR: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์',
  SUCCESS: 'ดำเนินการสำเร็จ',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง'
};

module.exports = {
  ORDER_STATUS,
  MESSAGES
};