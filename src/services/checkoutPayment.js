// A single payment representation is used for both initial checkout and retries.
function paymentConfig(quote, orderId, clientUrl) {
  return {
    payment_method_types: ['card'], mode: 'payment',
    line_items: quote.orderItems.map(item => ({
      price_data: { currency: 'usd', product_data: { name: item.name, ...(item.image ? { images: [item.image] } : {}) },
        unit_amount: Math.round(item.price * 100) }, quantity: item.quantity,
    })),
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount',
      fixed_amount: { currency: 'usd', amount: quote.shipping.shippingCents },
      display_name: `${quote.shipping.service} to ${quote.destinationCountry}` } }],
    success_url: `${clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/orders/${orderId}`,
    metadata: { orderId: String(orderId), type: 'order', quoteId: quote.quoteId },
  };
}
async function createPaymentSession(stripe, quote, orderId, clientUrl) {
  const config = paymentConfig(quote, orderId, clientUrl);
  if (quote.discountCents > 0) {
    // Fail closed: never charge full price when creating the discount fails.
    const coupon = await stripe.coupons.create({ amount_off: quote.discountCents,
      currency: 'usd', duration: 'once', name: `Discount: ${quote.discountCode}` });
    config.discounts = [{ coupon: coupon.id }];
  }
  return stripe.checkout.sessions.create(config);
}
module.exports = { paymentConfig, createPaymentSession };
