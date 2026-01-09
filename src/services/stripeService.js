
require('dotenv').config(); 

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

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
const { sendOrderNotificationToAdmins } = require('./emailService');


const createCheckoutSession = async (orderItems, userId, shippingAddress, contactPhone, destinationCountry, shippingCost, discountCode = null, discountAmount = 0) => {
  try {

    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    const lineItems = orderItems.map(item => {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            images: [item.image],
            description: `จำนวน: ${item.quantity}`
          },
          unit_amount: Math.round(item.price * 100) 
        },
        quantity: item.quantity
      };
    });


    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Shipping to ${destinationCountry}`,
            description: destinationCountry === 'Thailand' ? 'Domestic Shipping' : 'EMS World Merchandise'
          },
          unit_amount: Math.round(shippingCost * 100) 
        },
        quantity: 1
      });
    }


    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const totalAmount = subtotal + shippingCost - discountAmount;


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

    const successUrl = `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/checkout/cancel`;
    
    console.log('Creating Stripe checkout session with URLs:', { successUrl, cancelUrl });

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: order._id.toString(),
        type: 'order' 
      }
    };

    if (discountCode && discountAmount > 0) {
      sessionConfig.metadata.discountCode = discountCode;
      sessionConfig.metadata.discountAmount = discountAmount.toString();
      
      try {
        const couponId = `disc_${order._id.toString().replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
        
        const coupon = await stripe.coupons.create({
          id: couponId,
          amount_off: Math.round(discountAmount * 100), 
          currency: 'usd',
          duration: 'once',
          name: `Discount: ${discountCode}`
        });
        
        sessionConfig.discounts = [{
          coupon: coupon.id
        }];
        
        console.log(`Stripe coupon created for discount ${discountCode}: ${coupon.id}, amount: $${discountAmount}`);
      } catch (couponError) {
        console.error('Error creating Stripe coupon:', couponError);
        try {
          const coupon = await stripe.coupons.create({
            amount_off: Math.round(discountAmount * 100),
            currency: 'usd',
            duration: 'once',
            name: `Discount: ${discountCode}`
          });
          
          sessionConfig.discounts = [{
            coupon: coupon.id
          }];
          
          console.log(`Stripe coupon created (auto ID) for discount ${discountCode}: ${coupon.id}`);
        } catch (retryError) {
          console.error('Error creating Stripe coupon (retry):', retryError);
        }
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('Stripe checkout session created successfully:', session.id);
    return { session, order };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    if (error.type) {
      console.error('Stripe error type:', error.type);
    }
    if (error.raw) {
      console.error('Stripe raw error:', error.raw);
    }
    throw new Error('ไม่สามารถสร้าง checkout session ได้: ' + (error.message || 'Unknown error'));
  }
};

const createTicketCheckoutSession = async (ticketId, userId) => {
  try {
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    const ticket = await Ticket.findById(ticketId)
      .populate('event', 'title eventDate ticketPrice')
      .populate('user', 'name email phone');

    if (!ticket || ticket.user._id.toString() !== userId.toString()) {
      throw new Error('ไม่พบตั๋วหรือไม่มีสิทธิ์เข้าถึง');
    }

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

    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${ticket.event.title} - Concert Tickets`,
          description: `${ticket.quantity} ticket(s) for ${ticket.event.title}`,
          images: [`${process.env.CLIENT_URL}/images/concert-ticket.jpg`] 
        },
        unit_amount: Math.round(ticket.event.ticketPrice * 100) 
      },
      quantity: ticket.quantity
    }];

    const successUrl = `${process.env.CLIENT_URL}/ticket-checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/ticket-checkout/cancel?ticketId=${ticketId}`;
    
    console.log('Creating Stripe ticket checkout session with URLs:', { successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: ticket.user.email,
      metadata: {
        ticketId: ticket._id.toString(),
        type: 'ticket' 
      }
    });

    console.log('Stripe ticket checkout session created successfully:', session.id);
    return { session, ticket };
  } catch (error) {
    console.error('Stripe ticket checkout error:', error);
    throw new Error('ไม่สามารถสร้าง ticket checkout session ได้: ' + (error.message || 'Unknown error'));
  }
};

const verifyPayment = async (sessionId) => {
  try {
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    console.log('Verifying payment for session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const orderId = session.metadata.orderId;
      
      const order = await Order.findById(orderId);
      
      if (order) {
        order.isPaid = true;
        order.paidAt = Date.now();
        order.status = ORDER_STATUS.PAID;
        order.paymentId = session.payment_intent;
        
        await order.save();
        
        if (order.discountCode) {
          const discount = await Discount.findOne({ code: order.discountCode });
          if (discount && !discount.hasUserUsed(order.user.toString())) {
            discount.usedBy.push(order.user);
            await discount.save();
            console.log(`Discount ${order.discountCode} usage recorded for user ${order.user}`);
          }
        }
        
        console.log(`Order ${orderId} marked as paid`);
        
        await sendOrderNotificationToAdmins(order);
        
        return { success: true, order };
      }
    }
    
    return { success: false };
  } catch (error) {
    console.error('Verify payment error:', error);
    throw new Error('ไม่สามารถตรวจสอบสถานะการชำระเงินได้: ' + (error.message || 'Unknown error'));
  }
};

const verifyTicketPayment = async (sessionId) => {
  try {
    if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
      throw new Error('ไม่พบ Stripe API Key ที่ถูกต้อง กรุณาตรวจสอบการตั้งค่าในไฟล์ .env');
    }

    console.log('Verifying ticket payment for session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid' && session.metadata.type === 'ticket') {
      const ticketId = session.metadata.ticketId;
      
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

const handleWebhook = async (payload, signature) => {
  try {
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
      
      if (session.payment_status === 'paid') {
        if (session.metadata.type === 'ticket') {
          const ticketId = session.metadata.ticketId;
          
          const ticket = await Ticket.findById(ticketId);
          if (ticket) {
            ticket.status = 'paid';
            ticket.paymentId = session.payment_intent;
            
            await ticket.save();
            console.log(`Webhook: Ticket ${ticketId} marked as paid`);
          }
        } else {
          const orderId = session.metadata.orderId;
          
          const order = await Order.findById(orderId);
          if (order) {
            order.isPaid = true;
            order.paidAt = Date.now();
            order.status = ORDER_STATUS.PAID;
            order.paymentId = session.payment_intent;
            
            await order.save();
            
            if (order.discountCode) {
              const discount = await Discount.findOne({ code: order.discountCode });
              if (discount && !discount.hasUserUsed(order.user.toString())) {
                discount.usedBy.push(order.user);
                await discount.save();
                console.log(`Webhook: Discount ${order.discountCode} usage recorded for user ${order.user}`);
              }
            }
            
            console.log(`Webhook: Order ${orderId} marked as paid`);
            
            await sendOrderNotificationToAdmins(order);
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
  createTicketCheckoutSession, 
  verifyTicketPayment 
};