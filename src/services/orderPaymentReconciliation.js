const { ORDER_STATUS } = require('../config/constants');

const paymentError = (message, status = 409) => Object.assign(new Error(message), { status });
const ownerId = user => String(user?._id || user || '');

// The browser return and the signed webhook must use the same checks and atomic
// transition. No customer/Stripe values are used as a source of order totals.
async function reconcileOrderPayment(session, dependencies, requestingUserId) {
  const { Order, Discount, notify, notificationsEnabled = false, now = () => new Date() } = dependencies;
  if (session?.metadata?.type !== 'order' || !/^[a-f\d]{24}$/i.test(session.metadata.orderId || '')) {
    throw paymentError('This is not a shop order payment.', 400);
  }
  const order = await Order.findById(session.metadata.orderId);
  if (!order) throw paymentError('Order not found.', 404);
  // Authenticate before changing payment state or exposing an order. Webhooks
  // omit this argument only after Stripe signature verification.
  if (requestingUserId !== undefined && ownerId(order.user) !== ownerId(requestingUserId)) {
    throw paymentError('You cannot verify payment for this order.', 403);
  }
  if (session.payment_status !== 'paid') return { success: false };

  const expectedCents = order.checkoutQuote?.totalCents ?? Math.round(order.totalAmount * 100);
  if (!Number.isSafeInteger(expectedCents) || expectedCents <= 0 ||
      session.mode !== 'payment' || session.status !== 'complete' || session.currency !== 'usd' ||
      session.amount_total !== expectedCents || !session.payment_intent ||
      (order.checkoutQuote?.quoteId && session.metadata.quoteId !== order.checkoutQuote.quoteId)) {
    throw paymentError('Payment details do not match the saved order.');
  }
  const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
  if (!paymentId) throw paymentError('Payment intent is missing.');
  if (order.isPaid && order.paymentId !== paymentId) {
    // A second distinct charge needs manual reconciliation; never overwrite the
    // original payment or silently report it as the same purchase.
    throw paymentError('A different payment is already recorded for this order.');
  }

  const fulfilled = [ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(order.status);
  const updated = order.isPaid ? null : await Order.findOneAndUpdate({
    _id: order._id, isPaid: { $ne: true }, status: order.status,
  }, { $set: {
    isPaid: true, paidAt: now(), paymentId,
    status: fulfilled ? order.status : ORDER_STATUS.PAID,
  } }, { new: true, runValidators: true });

  const paidOrder = updated || await Order.findById(order._id);
  if (!paidOrder?.isPaid || paidOrder.paymentId !== paymentId) {
    throw paymentError('Order changed while payment was being checked. Please try again.');
  }
  // Safe to repeat after a webhook retry, including when the process stopped
  // after saving payment but before recording discount usage.
  if (paidOrder.discountCode) {
    await Discount.updateOne({ code: paidOrder.discountCode }, { $addToSet: { usedBy: paidOrder.user } });
  }
  // Only the winner of the atomic unpaid -> paid transition can notify. Mail
  // remains deferred unless the operator explicitly enables order delivery.
  if (updated && notificationsEnabled && notify) await notify(paidOrder);
  return { success: true, order: paidOrder };
}

module.exports = { reconcileOrderPayment };
