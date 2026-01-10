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
    
    // คำนวณ subtotal
    const subtotal = order.orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    const emailContent = `
Order Details

Order Date: ${new Date(order.createdAt).toLocaleString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})}

Order Number: ${order._id}

Order Items
${orderItemsList}

Shipping Cost: $${order.shippingCost.toFixed(2)}
${order.discountCode && order.discountAmount ? `Discount: ${order.discountCode} (-$${order.discountAmount.toFixed(2)})` : 'Discount: None'}

Total Amount: $${order.totalAmount.toFixed(2)}

Shipping Information

Customer: ${orderWithUser.user.name || 'N/A'}

Phone: ${orderWithUser.user.phone || 'N/A'}

Address:
${order.shippingAddress}

Country: ${order.destinationCountry}
    `.trim();
    
    const testEmail = 'kraichan.official@gmail.com';
    const recipientEmail = testEmail; 
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail, 
      subject: `New Order #${order._id.toString()} - ${orderWithUser.user.name || orderWithUser.user.email}`,
      text: emailContent,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #1a1a1a; font-family: 'Roboto', Arial, sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0A0A0A; border-radius: 24px; overflow: hidden; border: 1px solid #7c4d33; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);">
                  
                   <!-- Header -->
                   <tr>
                     <td style="background: linear-gradient(135deg, #b88c41 0%, #7c4d33 100%); padding: 30px; text-align: center;">
                       <h1 style="margin: 0; color: #F5F1E6; font-size: 28px; font-weight: 300; letter-spacing: 1px;">Confirmed Order</h1>
                     </td>
                   </tr>
                  
                  <!-- Order Details Section -->
                  <tr>
                    <td style="padding: 30px;">
                      <div style="background-color: #1a1a1a; padding: 20px; border-radius: 12px; border: 1px solid #7c4d33; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Order Date</p>
                        <p style="margin: 0; color: #F5F1E6; font-size: 16px;">${new Date(order.createdAt).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</p>
                      </div>
                      
                      <div style="background-color: #1a1a1a; padding: 20px; border-radius: 12px; border: 1px solid #7c4d33; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Order Number</p>
                        <p style="margin: 0; color: #F5F1E6; font-size: 16px; font-family: monospace; letter-spacing: 1px;">${order._id}</p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Order Items Section -->
                  <tr>
                    <td style="padding: 0 30px 30px 30px;">
                      <div style="background-color: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #7c4d33;">
                        <h2 style="margin: 0 0 20px 0; color: #b88c41; font-size: 18px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Order Items</h2>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          ${order.orderItems.map((item, index) => `
                            <tr>
                              <td style="padding: ${index > 0 ? '15px 0 0 0' : '0'}; border-top: ${index > 0 ? '1px solid #7c4d33' : 'none'};">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="color: #F5F1E6; font-size: 15px; padding-bottom: 5px;">
                                      <strong>${item.name}</strong>
                                    </td>
                                    <td align="right" style="color: #b88c41; font-size: 15px; font-weight: 500;">
                                      $${(item.price * item.quantity).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="color: #e3dcd4; font-size: 13px;">
                                      Quantity: ${item.quantity} × $${item.price.toFixed(2)}
                                    </td>
                                    <td></td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          `).join('')}
                        </table>
                        
                        <!-- Summary -->
                        <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #7c4d33;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 8px 0; color: #e3dcd4; font-size: 14px;">Shipping Cost</td>
                              <td align="right" style="padding: 8px 0; color: #F5F1E6; font-size: 14px;">$${order.shippingCost.toFixed(2)}</td>
                            </tr>
                            ${order.discountCode && order.discountAmount ? `
                            <tr>
                              <td style="padding: 8px 0; color: #7eb47e; font-size: 14px;">
                                Discount (${order.discountCode})
                              </td>
                              <td align="right" style="padding: 8px 0; color: #7eb47e; font-size: 14px;">-$${order.discountAmount.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            <tr>
                              <td style="padding: 15px 0 0 0; color: #F5F1E6; font-size: 18px; font-weight: 600; border-top: 1px solid #7c4d33;">Total Amount</td>
                              <td align="right" style="padding: 15px 0 0 0; color: #b88c41; font-size: 20px; font-weight: 600; border-top: 1px solid #7c4d33;">$${order.totalAmount.toFixed(2)}</td>
                            </tr>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Shipping Information Section -->
                  <tr>
                    <td style="padding: 0 30px 30px 30px;">
                      <div style="background-color: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #7c4d33;">
                        <h2 style="margin: 0 0 20px 0; color: #b88c41; font-size: 18px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Shipping Information</h2>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 10px 0; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; width: 120px;">Customer</td>
                            <td style="padding: 10px 0; color: #F5F1E6; font-size: 15px;">${orderWithUser.user.name || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Phone</td>
                            <td style="padding: 10px 0; color: #F5F1E6; font-size: 15px;">${orderWithUser.user.phone || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; vertical-align: top; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Address</td>
                            <td style="padding: 10px 0; color: #F5F1E6; font-size: 15px; line-height: 1.6;">${order.shippingAddress.replace(/\n/g, '<br>')}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; color: #b88c41; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Country</td>
                            <td style="padding: 10px 0; color: #F5F1E6; font-size: 15px;">${order.destinationCountry}</td>
                          </tr>
                        </table>
                      </div>
                    </td>
                  </tr>
                  
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
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

