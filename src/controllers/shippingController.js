const asyncHandler = require('express-async-handler');
const { countries, loadShippingQuote } = require('../services/shippingService');

const getShippingCountries = (req, res) => res.json({ success: true, countries });

const getShippingQuote = asyncHandler(async (req, res) => {
  try {
    const quote = await loadShippingQuote(req.body.orderItems, req.body.destinationCountry);
    res.json({ success: true, quote });
  } catch (error) {
    res.status(error.status || 500);
    throw error;
  }
});

module.exports = { getShippingCountries, getShippingQuote };
