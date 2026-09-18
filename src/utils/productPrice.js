// Round merchandise per unit, before quantity, discounts or postage.
const roundProductPrice = (price) => {
  if (!Number.isFinite(price) || price < 0) throw new Error('Invalid product price');
  return Math.ceil(price);
};

module.exports = { roundProductPrice };
