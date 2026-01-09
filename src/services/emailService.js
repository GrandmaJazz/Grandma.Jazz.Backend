// Backend/src/services/emailService.js
const nodemailer = require('nodemailer');
const User = require('../models/User');


const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_APP_PASSWORD 
    }
  });
};

const sendOrderNotificationToAdmins = async (order) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.log('ไม่มีการตั้งค่า EMAIL_USER หรือ EMAIL_APP_PASSWORD ข้ามการส่งอีเมล');
      return;
    }
    
    const orderWithUser = await order.populate('user', 'name email phone');
    
    const admins = await User.find({ isAdmin: true });
    
    if (admins.length === 0) {
      console.log('ไม่มีแอดมินในระบบ');
      return;
    }
    
    const transporter = createTransporter();
    
    const orderItemsList = order.orderItems
      .map(item => `  - ${item.name} x${item.quantity} ($${item.price.toFixed(2)} each)`)
      .join('\n');
    
    const emailContent = `
มีคำสั่งซื้อใหม่เข้ามา!

รายละเอียดคำสั่งซื้อ:
- หมายเลขคำสั่งซื้อ: ${order._id}
- ลูกค้า: ${orderWithUser.user.name || 'ไม่ระบุ'} (${orderWithUser.user.email})
- เบอร์โทร: ${orderWithUser.user.phone || 'ไม่ระบุ'}
- สถานะ: ${order.status}
- ยอดรวม: $${order.totalAmount.toFixed(2)}

รายการสินค้า:
${orderItemsList}

ที่อยู่จัดส่ง:
${order.shippingAddress}

ประเทศปลายทาง: ${order.destinationCountry}
ค่าส่ง: $${order.shippingCost.toFixed(2)}
${order.discountCode ? `ส่วนลด: ${order.discountCode} (-$${order.discountAmount.toFixed(2)})` : ''}

วันที่สั่งซื้อ: ${new Date(order.createdAt).toLocaleString('th-TH')}
${order.isPaid ? `วันที่ชำระเงิน: ${new Date(order.paidAt).toLocaleString('th-TH')}` : 'ยังไม่ได้ชำระเงิน'}
    `.trim();
    
    const testEmail = 'kraichan.official@gmail.com';
    const recipientEmail = testEmail; 
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail, 
      subject: `คำสั่งซื้อใหม่ #${order._id.toString().substring(0, 8)} - ${orderWithUser.user.name || orderWithUser.user.email}`,
      text: emailContent,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #b88c41;">มีคำสั่งซื้อใหม่เข้ามา!</h2>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">รายละเอียดคำสั่งซื้อ</h3>
            <p><strong>หมายเลขคำสั่งซื้อ:</strong> ${order._id}</p>
            <p><strong>ลูกค้า:</strong> ${orderWithUser.user.name || 'ไม่ระบุ'} (${orderWithUser.user.email})</p>
            <p><strong>เบอร์โทร:</strong> ${orderWithUser.user.phone || 'ไม่ระบุ'}</p>
            <p><strong>สถานะ:</strong> ${order.status}</p>
            <p><strong>ยอดรวม:</strong> $${order.totalAmount.toFixed(2)}</p>
          </div>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">รายการสินค้า</h3>
            <ul>
              ${order.orderItems.map(item => 
                `<li>${item.name} x${item.quantity} - $${item.price.toFixed(2)} each</li>`
              ).join('')}
            </ul>
          </div>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">ข้อมูลการจัดส่ง</h3>
            <p><strong>ที่อยู่:</strong><br>${order.shippingAddress.replace(/\n/g, '<br>')}</p>
            <p><strong>ประเทศ:</strong> ${order.destinationCountry}</p>
            <p><strong>ค่าส่ง:</strong> $${order.shippingCost.toFixed(2)}</p>
            ${order.discountCode ? `<p><strong>ส่วนลด:</strong> ${order.discountCode} (-$${order.discountAmount.toFixed(2)})</p>` : ''}
          </div>
          
          <div style="margin-top: 20px; padding: 10px; background-color: #e3dcd4; border-radius: 4px;">
            <p style="margin: 0;"><strong>วันที่สั่งซื้อ:</strong> ${new Date(order.createdAt).toLocaleString('th-TH')}</p>
            ${order.isPaid ? `<p style="margin: 5px 0 0 0;"><strong>วันที่ชำระเงิน:</strong> ${new Date(order.paidAt).toLocaleString('th-TH')}</p>` : '<p style="margin: 5px 0 0 0; color: #d32f2f;"><strong>ยังไม่ได้ชำระเงิน</strong></p>'}
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`อีเมลแจ้งเตือนคำสั่งซื้อส่งไปยัง ${recipientEmail} แล้ว (โหมดเทส): ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการส่งอีเมลแจ้งเตือน:', error);
  }
};

module.exports = {
  sendOrderNotificationToAdmins
};

