
require('dotenv').config(); 

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey || stripeSecretKey === 'your_stripe_secret_key' || stripeSecretKey.trim() === '') {
  console.error('ERROR: Stripe Secret Key ไม่ถูกกำหนดหรือไม่ถูกต้อง!');
  console.error('กรุณาตรวจสอบไฟล์ .env และตั้งค่า STRIPE_SECRET_KEY ให้ถูกต้อง');
} else {
  console.log('Stripe payment service configured.');
}

const stripe = require('stripe')(stripeSecretKey);
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const Discount = require('../models/Discount');
const { ORDER_STATUS } = require('../config/constants');
const { sendOrderNotificationToAdmins, sendOrderConfirmationToCustomer } = require('./emailService');


const { createPaymentSession } = require('./checkoutPayment');
const createCheckoutSession = async (quote, userId, shippingAddress, contactPhone) => {
  const order = await Order.create({
    user: userId, orderItems: quote.orderItems, shippingAddress, contactPhone,
    destinationCountry: quote.destinationCountry, shippingCost: quote.shipping.shippingCents / 100,
    discountCode: quote.discountCode, discountAmount: quote.discountCents / 100,
    totalAmount: quote.totalCents / 100, checkoutQuote: quote, status: ORDER_STATUS.PENDING,
  });
  const session = await createPaymentSession(stripe, quote, order._id, process.env.CLIENT_URL);
  return { session, order };
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
        if (order.checkoutQuote && (session.currency !== 'usd' || session.amount_total !== order.checkoutQuote.totalCents)) {
          throw new Error('Payment amount does not match the order quote.');
        }
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
        
        // ส่งอีเมลยืนยันไปหาลูกค้า
        await sendOrderConfirmationToCustomer(order);
        
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
            if (order.checkoutQuote && (session.currency !== 'usd' || session.amount_total !== order.checkoutQuote.totalCents)) {
              throw new Error('Payment amount does not match the order quote.');
            }
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
            
            // ส่งอีเมลยืนยันไปหาลูกค้า
            await sendOrderConfirmationToCustomer(order);
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