const express = require('express');
const { handleWebhook } = require('../services/stripeService');
const router = express.Router();

// Register before the application's JSON middleware: Stripe verifies the exact
// received bytes, not a parsed/re-serialized object.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await handleWebhook(req.body, req.headers['stripe-signature']);
    res.json(result);
  } catch (error) {
    console.error('Stripe webhook rejected:', error.type || error.name);
    const status = error.type === 'StripeSignatureVerificationError' ? 400 : 500;
    res.status(status).json({ received: false });
  }
});

module.exports = router;
