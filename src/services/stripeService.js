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
const Ticket = require('../models/Ticket');
const Discount = require('../models/Discount');
const { ORDER_STATUS } = require('../config/constants');

// สร้าง checkout session สำหรับ Order (เดิม)
const createCheckoutSession = async (orderItems, userId, shippingAddress, contactPhone, destinationCountry, shippingCost, discountCode = null, discountAmount = 0) => {
  try {
    // ตรวจสอบอีกครั้งก่อนใช้งาน
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    // แปลงรายการสินค้าให้อยู่ในรูปแบบที่ Stripe ต้องการ
    const lineItems = orderItems.map(item => {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            images: [item.image],
            description: `จำนวน: ${item.quantity}`
          },
          unit_amount: Math.round(item.price * 100) // แปลงเป็นเซ็นต์ (Stripe ใช้หน่วยเล็กสุดของสกุลเงิน)
        },
        quantity: item.quantity
      };
    });

    // เพิ่ม shipping เป็น line item
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Shipping to ${destinationCountry}`,
            description: destinationCountry === 'Thailand' ? 'Domestic Shipping' : 'EMS World Merchandise'
          },
          unit_amount: Math.round(shippingCost * 100) // USD เป็นเซ็นต์
        },
        quantity: 1
      });
    }

    // เพิ่มส่วนลดเป็น line item (ถ้ามี) - ใช้จำนวนติดลบ
    if (discountAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Discount${discountCode ? ` (${discountCode})` : ''}`,
            description: 'Discount applied'
          },
          unit_amount: -Math.round(discountAmount * 100) // จำนวนติดลบสำหรับส่วนลด
        },
        quantity: 1
      });
    }

    // คำนวณยอดรวม (รวมค่าส่ง ลบส่วนลด) - totalAmount ยังเป็น USD
    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const totalAmount = subtotal + shippingCost - discountAmount;

    // สร้างคำสั่งซื้อในฐานข้อมูลของเรา
    const order = await Order.create({
      user: userId,
      orderItems,
      shippingAddress,
      contactPhone,
      destinationCountry,
      shippingCost,
      discountCode,
      discountAmount,
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
        orderId: order._id.toString(),
        type: 'order' // identifier สำหรับ webhook
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

// สร้าง checkout session สำหรับ Ticket (ใหม่)
const createTicketCheckoutSession = async (ticketId, userId) => {
  try {
    // ตรวจสอบ API key
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    // ดึงข้อมูล ticket พร้อม event details
    const ticket = await Ticket.findById(ticketId)
      .populate('event', 'title eventDate ticketPrice')
      .populate('user', 'name email phone');

    if (!ticket || ticket.user._id.toString() !== userId.toString()) {
      throw new Error('ไม่พบตั๋วหรือไม่มีสิทธิ์เข้าถึง');
    }

    // Check if event date has passed
    const now = new Date();
    const eventDate = new Date(ticket.event.eventDate);
    if (eventDate < now) {
      throw new Error('ไม่สามารถชำระเงินสำหรับงานที่จัดไปแล้ว งานนี้จัดผ่านไปแล้ว');
    }

    if (ticket.status === 'paid') {
      throw new Error('ตั๋วนี้ชำระเงินแล้ว');
    }

    if (ticket.status === 'cancelled') {
      throw new Error('ตั๋วนี้ถูกยกเลิกแล้ว');
    }

    // สร้าง line items สำหรับ Stripe
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${ticket.event.title} - Concert Tickets`,
          description: `${ticket.quantity} ticket(s) for ${ticket.event.title}`,
          images: [`${process.env.CLIENT_URL}/images/concert-ticket.jpg`] // placeholder image
        },
        unit_amount: Math.round(ticket.event.ticketPrice * 100) // แปลงเป็นเซ็นต์
      },
      quantity: ticket.quantity
    }];

    // เตรียม URLs สำหรับ redirect
    const successUrl = `${process.env.CLIENT_URL}/ticket-checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/ticket-checkout/cancel?ticketId=${ticketId}`;
    
    console.log('Creating Stripe ticket checkout session with URLs:', { successUrl, cancelUrl });

    // สร้าง session สำหรับการชำระเงิน
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: ticket.user.email,
      metadata: {
        ticketId: ticket._id.toString(),
        type: 'ticket' // identifier สำหรับ webhook
      }
    });

    console.log('Stripe ticket checkout session created successfully:', session.id);
    return { session, ticket };
  } catch (error) {
    console.error('Stripe ticket checkout error:', error);
    throw new Error('ไม่สามารถสร้าง ticket checkout session ได้: ' + (error.message || 'Unknown error'));
  }
};

// ตรวจสอบสถานะการชำระเงินสำหรับ Order (เดิม)
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
        
        // บันทึกการใช้งานส่วนลด (ถ้ามี)
        if (order.discountCode) {
          const discount = await Discount.findOne({ code: order.discountCode });
          if (discount && !discount.hasUserUsed(order.user.toString())) {
            discount.usedBy.push(order.user);
            await discount.save();
            console.log(`Discount ${order.discountCode} usage recorded for user ${order.user}`);
          }
        }
        
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

// ตรวจสอบสถานะการชำระเงินสำหรับ Ticket (ใหม่)
const verifyTicketPayment = async (sessionId) => {
  try {
    // ตรวจสอบ API key
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    console.log('Verifying ticket payment for session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid' && session.metadata.type === 'ticket') {
      const ticketId = session.metadata.ticketId;
      
      // อัปเดตสถานะ ticket ในฐานข้อมูล
      const ticket = await Ticket.findById(ticketId)
        .populate('event', 'title eventDate ticketPrice');
      
      if (ticket) {
        ticket.status = 'paid';
        ticket.paymentId = session.payment_intent;
        
        await ticket.save();
        console.log(`Ticket ${ticketId} marked as paid`);
        
        return { success: true, ticket };
      }
    }
    
    return { success: false };
  } catch (error) {
    console.error('Verify ticket payment error:', error);
    throw new Error('ไม่สามารถตรวจสอบสถานะการชำระเงินตั๋วได้: ' + (error.message || 'Unknown error'));
  }
};

// จัดการ webhook จาก Stripe (อัปเดต - รองรับทั้ง Order และ Ticket)
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
        // ตรวจสอบว่าเป็น ticket หรือ order
        if (session.metadata.type === 'ticket') {
          // จัดการ ticket payment
          const ticketId = session.metadata.ticketId;
          
          const ticket = await Ticket.findById(ticketId);
          if (ticket) {
            ticket.status = 'paid';
            ticket.paymentId = session.payment_intent;
            
            await ticket.save();
            console.log(`Webhook: Ticket ${ticketId} marked as paid`);
          }
        } else {
          // จัดการ order payment (เดิม)
          const orderId = session.metadata.orderId;
          
          const order = await Order.findById(orderId);
          if (order) {
            order.isPaid = true;
            order.paidAt = Date.now();
            order.status = ORDER_STATUS.PAID;
            order.paymentId = session.payment_intent;
            
            await order.save();
            
            // บันทึกการใช้งานส่วนลด (ถ้ามี)
            if (order.discountCode) {
              const discount = await Discount.findOne({ code: order.discountCode });
              if (discount && !discount.hasUserUsed(order.user.toString())) {
                discount.usedBy.push(order.user);
                await discount.save();
                console.log(`Webhook: Discount ${order.discountCode} usage recorded for user ${order.user}`);
              }
            }
            
            console.log(`Webhook: Order ${orderId} marked as paid`);
          }
        }
      }
    }
    
    return { received: true };
  } catch (error) {
    console.error('Webhook error:', error);
    throw new Error('Webhook ล้มเหลว: ' + (error.message || 'Unknown error'));
  }
};

module.exports = { 
  createCheckoutSession, 
  verifyPayment, 
  handleWebhook,
  createTicketCheckoutSession, // เพิ่มใหม่
  verifyTicketPayment // เพิ่มใหม่
};