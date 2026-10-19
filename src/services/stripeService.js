
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


const { getOrderCheckoutSession, cancelOrderCheckout } = require('./checkoutSessionLifecycle');
const { reconcileOrderPayment } = require('./orderPaymentReconciliation');
const { reconcileTicketPayment } = require('./ticketPaymentReconciliation');
const reconciliationDependencies = {
  Order, Discount,
  // Customer email setup remains deferred; do not enable it as part of payment
  // verification. Existing transport functions are used only on explicit opt-in.
  get notificationsEnabled() { return process.env.ORDER_EMAIL_ENABLED === 'true'; },
  notify: async order => {
    await sendOrderNotificationToAdmins(order);
    await sendOrderConfirmationToCustomer(order);
  },
};
const lifecycleDependencies = {
  Order, stripe,
  get clientUrl() { return process.env.CLIENT_URL; },
  onPaid: session => reconcileOrderPayment(session, reconciliationDependencies),
};
const retryOrderCheckoutSession = (orderId, quote) => getOrderCheckoutSession(orderId, quote, lifecycleDependencies);
const cancelCheckoutSession = orderId => cancelOrderCheckout(orderId, lifecycleDependencies);
const createCheckoutSession = async (quote, userId, shippingAddress, contactPhone) => {
  const order = await Order.create({
    user: userId, orderItems: quote.orderItems, shippingAddress, contactPhone,
    destinationCountry: quote.destinationCountry, shippingCost: quote.shipping.shippingCents / 100,
    discountCode: quote.discountCode, discountAmount: quote.discountCents / 100,
    totalAmount: quote.totalCents / 100, checkoutQuote: quote, status: ORDER_STATUS.PENDING, checkoutSessionAttempt: 1,
  });
  return getOrderCheckoutSession(order._id, quote, lifecycleDependencies);
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

const verifyPayment = async (sessionId, userId) => {
  if (!userId) throw Object.assign(new Error('Sign in to verify this payment.'), { status: 401 });
  if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]{1,240}$/.test(sessionId)) {
    throw Object.assign(new Error('Enter a valid checkout session.'), { status: 400 });
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return reconcileOrderPayment(session, reconciliationDependencies, userId);
};

const verifyTicketPayment = async (sessionId, userId) => {
  if (!userId) throw Object.assign(new Error('Sign in to verify this payment.'), { status: 401 });
  if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]{1,240}$/.test(sessionId)) {
    throw Object.assign(new Error('Enter a valid checkout session.'), { status: 400 });
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return reconcileTicketPayment(session, Ticket, userId);
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
        if (session.metadata?.type === 'ticket') {
          await reconcileTicketPayment(session, Ticket);
        } else if (session.metadata?.type === 'order') {
          await reconcileOrderPayment(session, reconciliationDependencies);

        }
      }
    }
    
    return { received: true };
  } catch (error) {
    console.error('Webhook processing failed:', error.type || error.name);
    throw error;
  }
};

module.exports = { 
  createCheckoutSession,
  retryOrderCheckoutSession,
  cancelCheckoutSession,
  verifyPayment, 
  handleWebhook,
  createTicketCheckoutSession, 
  verifyTicketPayment 
};