const { randomUUID } = require('node:crypto');
const { createPaymentSession } = require('./checkoutPayment');

const conflict = message => Object.assign(new Error(message), { status: 409 });
const sameSessionOrder = (session, order) => session?.metadata?.type === 'order' &&
  session.metadata.orderId === String(order._id);
const sameQuote = (session, quote) => session.mode === 'payment' && session.currency === 'usd' &&
  session.amount_total === quote.totalCents && session.metadata.quoteId === quote.quoteId;

async function withCheckoutLock(orderId, dependencies, action) {
  const { Order, now = () => new Date() } = dependencies;
  const at = now(); const token = randomUUID();
  const order = await Order.findOneAndUpdate({
    _id: orderId, isPaid: { $ne: true }, status: 'pending',
    $or: [{ checkoutSessionLockUntil: { $exists: false } }, { checkoutSessionLockUntil: { $lte: at } }],
  }, { $set: { checkoutSessionLockToken: token, checkoutSessionLockUntil: new Date(+at + 60000) } }, { new: true });
  if (!order) throw conflict('Payment is already being prepared or the order changed. Please try again.');
  const filter = { _id: orderId, checkoutSessionLockToken: token, isPaid: { $ne: true }, status: 'pending' };
  try { return await action(order, filter); }
  finally {
    await Order.updateOne({ _id: orderId, checkoutSessionLockToken: token }, {
      $unset: { checkoutSessionLockToken: '', checkoutSessionLockUntil: '' },
    });
  }
}

async function getOrderCheckoutSession(orderId, quote, dependencies) {
  const { Order, stripe, clientUrl, onPaid } = dependencies;
  return withCheckoutLock(orderId, dependencies, async (order, filter) => {
    if (!order.checkoutQuote?.quoteId || quote.quoteId !== order.checkoutQuote.quoteId || !order.checkoutSessionAttempt) {
      throw conflict('Please start a new checkout to review current prices and shipping.');
    }
    let attempt = order.checkoutSessionAttempt;
    if (order.checkoutSessionId) {
      const previous = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (!sameSessionOrder(previous, order) || !sameQuote(previous, quote)) {
        throw conflict('The saved payment session does not match this order. Please contact us.');
      }
      if (previous.status === 'complete' && previous.payment_status === 'paid') {
        await onPaid(previous);
        throw conflict('This order is already paid. View the order instead of paying again.');
      }
      if (previous.status === 'open') return { session: previous, order };
      if (previous.status !== 'expired') throw conflict('The previous payment is still processing. Please try again later.');
      // Persist the new attempt BEFORE Stripe: a timeout/crash retries exactly
      // this key, never a second independently payable session.
      attempt++;
      const updated = await Order.updateOne(filter, {
        $set: { checkoutSessionAttempt: attempt }, $unset: { checkoutSessionId: '' },
      });
      if (!updated.matchedCount) throw conflict('Order changed while preparing payment. Please try again.');
    }
    const key = `shop-order:${orderId}:attempt:${attempt}`;
    const session = await createPaymentSession(stripe, quote, orderId, clientUrl, key);
    if (!sameSessionOrder(session, order) || !sameQuote(session, quote)) {
      throw conflict('The payment service returned a different order total. Please contact us.');
    }
    const saved = await Order.updateOne(filter, { $set: { checkoutSessionId: session.id } });
    if (!saved.matchedCount) throw conflict('Order changed while preparing payment. Please try again.');
    return { session, order };
  });
}

async function cancelOrderCheckout(orderId, dependencies) {
  const { Order, stripe, onPaid } = dependencies;
  return withCheckoutLock(orderId, dependencies, async (order, filter) => {
    if (!order.checkoutSessionId) {
      throw conflict('The payment session cannot be safely cancelled yet. Please retry payment or contact us.');
    }
    const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
    if (!sameSessionOrder(session, order)) throw conflict('The payment session does not match this order. Please contact us.');
    if (session.status === 'complete' && session.payment_status === 'paid') {
      await onPaid(session);
      throw conflict('This order is already paid. Please contact us about cancellation.');
    }
    if (session.status === 'open') {
      const expired = await stripe.checkout.sessions.expire(session.id);
      if (expired.status !== 'expired') throw conflict('The payment session could not be cancelled. Please try again.');
    } else if (session.status !== 'expired') {
      throw conflict('Payment is still processing. Please contact us about cancellation.');
    }
    const cancelled = await Order.findOneAndUpdate(filter, { $set: { status: 'canceled' } }, { new: true });
    if (!cancelled) throw conflict('Order changed while cancelling. Please reload the order.');
    return cancelled;
  });
}

module.exports = { getOrderCheckoutSession, cancelOrderCheckout };
