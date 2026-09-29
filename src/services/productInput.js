const { CheckoutError } = require('./checkoutQuote');
const categories = ['merchandise', 'coffees', 'teas', 'garments'];
function productInput(body, partial = false) {
  const data = {};
  for (const field of ['name', 'description', 'category']) {
    if (partial && body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || !body[field].trim()) throw new CheckoutError(`${field} is required.`);
    data[field] = body[field].trim();
  }
  if (data.category !== undefined && !categories.includes(data.category)) throw new CheckoutError('Invalid product category.');
  for (const field of ['price', 'weight']) {
    if (partial && body[field] === undefined) continue;
    const value = typeof body[field] === 'number' ? body[field] : typeof body[field] === 'string' && body[field].trim() ? Number(body[field]) : NaN;
    if (!Number.isFinite(value) || value <= 0 || (field === 'weight' && value > 30))
      throw new CheckoutError(field === 'weight' ? 'Weight must be greater than 0 and at most 30 kg.' : 'Price must be a positive number.');
    data[field] = field === 'price' ? Math.round(value * 100) / 100 : value;
  }
  if (!partial || body.images !== undefined) {
    if (!Array.isArray(body.images) || !body.images.length || body.images.some(url => {
      try { return !['https:', 'http:'].includes(new URL(url).protocol); } catch { return true; }
    })) throw new CheckoutError('At least one valid image URL is required.');
    data.images = body.images;
  }
  for (const field of ['isFeatured', 'isOutOfStock']) {
    if (body[field] === undefined) { if (!partial) data[field] = false; continue; }
    if (![true, false, 'true', 'false'].includes(body[field])) throw new CheckoutError(`Invalid ${field} value.`);
    data[field] = body[field] === true || body[field] === 'true';
  }
  return data;
}
module.exports = { productInput };
