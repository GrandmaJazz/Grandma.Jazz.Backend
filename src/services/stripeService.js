// backend/src/services/stripeService.js
require('dotenv').config(); // ตรวจสอบให้แน่ใจว่าได้โหลด .env

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// ตรวจสอบค่า API key
if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
  console.error('ERROR: Stripe Secret Key ไม่ถูกกำหนดหรือไม่ถูกต้อง!');
  console.error('กรุณาตรวจสอบไฟล์ .env และตั้งค่า STRIPE_SECRET_KEY ให้ถูกต้อง');
} else {
  console.log('Stripe Secret Key ถูกโหลดแล้ว (เริ่มต้นด้วย: ' + stripeSecretKey.substring(0, 7) + '...)');
}

const stripe = require('stripe')(stripeSecretKey);
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../config/constants');

// สร้าง checkout session
const createCheckoutSession = async (orderItems, userId, shippingAddress, contactPhone) => {
  try {
    // ตรวจสอบอีกครั้งก่อนใช้งาน
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    // แปลงรายการสินค้าให้อยู่ในรูปแบบที่ Stripe ต้องการ
    const lineItems = orderItems.map(item => {
      return {
        price_data: {
          currency: 'thb',
          product_data: {
            name: item.name,
            images: [item.image],
            description: `จำนวน: ${item.quantity}`
          },
          unit_amount: Math.round(item.price * 100) // แปลงเป็นสตางค์ (Stripe ใช้หน่วยเล็กสุดของสกุลเงิน)
        },
        quantity: item.quantity
      };
    });

    // คำนวณยอดรวม
    const totalAmount = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // สร้างคำสั่งซื้อในฐานข้อมูลของเรา
    const order = await Order.create({
      user: userId,
      orderItems,
      shippingAddress,
      contactPhone,
      totalAmount,
      status: ORDER_STATUS.PENDING
    });

    // เตรียม URLs สำหรับ redirect
    const successUrl = `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/checkout/cancel`;
    
    console.log('Creating Stripe checkout session with URLs:', { successUrl, cancelUrl });

    // สร้าง session สำหรับการชำระเงิน
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: order._id.toString()
      }
    });

    console.log('Stripe checkout session created successfully:', session.id);
    return { session, order };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    // บันทึกรายละเอียดข้อผิดพลาดมากขึ้น
    if (error.type) {
      console.error('Stripe error type:', error.type);
    }
    if (error.raw) {
      console.error('Stripe raw error:', error.raw);
    }
    throw new Error('ไม่สามารถสร้าง checkout session ได้: ' + (error.message || 'Unknown error'));
  }
};

// ตรวจสอบสถานะการชำระเงิน
const verifyPayment = async (sessionId) => {
  try {
    // ตรวจสอบอีกครั้งก่อนใช้งาน
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    console.log('Verifying payment for session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const orderId = session.metadata.orderId;
      
      // อัปเดตสถานะคำสั่งซื้อในฐานข้อมูลของเรา
      const order = await Order.findById(orderId);
      
      if (order) {
        order.isPaid = true;
        order.paidAt = Date.now();
        order.status = ORDER_STATUS.PAID;
        order.paymentId = session.payment_intent;
        
        await order.save();
        console.log(`Order ${orderId} marked as paid`);
        
        return { success: true, order };
      }
    }
    
    return { success: false };
  } catch (error) {
    console.error('Verify payment error:', error);
    throw new Error('ไม่สามารถตรวจสอบสถานะการชำระเงินได้: ' + (error.message || 'Unknown error'));
  }
};

// จัดการ webhook จาก Stripe
const handleWebhook = async (payload, signature) => {
  try {
    // ตรวจสอบค่า webhook secret
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || webhookSecret === 'your_stripe_webhook_secret') {
      console.warn('คำเตือน: STRIPE_WEBHOOK_SECRET ไม่ถูกกำหนดหรือเป็นค่าเริ่มต้น');
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    
    console.log('Received Stripe webhook event:', event.type);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // ตรวจสอบว่าการชำระเงินสำเร็จ
      if (session.payment_status === 'paid') {
        const orderId = session.metadata.orderId;
        
        // อัปเดตสถานะคำสั่งซื้อในฐานข้อมูลของเรา
        const order = await Order.findById(orderId);
        
        if (order) {
          order.isPaid = true;
          order.paidAt = Date.now();
          order.status = ORDER_STATUS.PAID;
          order.paymentId = session.payment_intent;
          
          await order.save();
          console.log(`Webhook: Order ${orderId} marked as paid`);
        }
      }
    }
    
    return { received: true };
  } catch (error) {
    console.error('Webhook error:', error);
    throw new Error('Webhook ล้มเหลว: ' + (error.message || 'Unknown error'));
  }
};

module.exports = { createCheckoutSession, verifyPayment, handleWebhook };