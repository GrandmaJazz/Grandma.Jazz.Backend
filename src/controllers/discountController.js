// backend/src/controllers/discountController.js
const asyncHandler = require('express-async-handler');
const Discount = require('../models/Discount');

// @desc    Validate discount code
// @route   POST /api/discounts/validate
// @access  Private
const validateDiscount = asyncHandler(async (req, res) => {
  const { code, totalAmount } = req.body;
  const userId = req.user._id;

  if (!code) {
    res.status(400);
    throw new Error('Please provide a discount code');
  }

  if (totalAmount === undefined || totalAmount < 0) {
    res.status(400);
    throw new Error('Invalid total amount');
  }

  const discount = await Discount.findOne({ code: code.toUpperCase() });

  if (!discount) {
    res.status(404);
    throw new Error('Discount code not found');
  }

  // Check if discount is valid
  const validityCheck = discount.isValid();
  if (!validityCheck.valid) {
    res.status(400);
    throw new Error(validityCheck.message);
  }

  // Check if user has already used this discount
  if (discount.hasUserUsed(userId)) {
    res.status(400);
    throw new Error('You have already used this discount code (limited to 1 use per user)');
  }

  // Apply discount
  const result = discount.applyDiscount(totalAmount);

  res.json({
    success: true,
    discount: {
      code: discount.code,
      discountType: discount.discountType,
      value: discount.value,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount
    }
  });
});

// @desc    Get all discounts (Admin only)
// @route   GET /api/discounts
// @access  Private/Admin
const getDiscounts = asyncHandler(async (req, res) => {
  const discounts = await Discount.find({})
    .populate('usedBy', 'name email')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: discounts.length,
    discounts
  });
});

// @desc    Get discount by ID (Admin only)
// @route   GET /api/discounts/:id
// @access  Private/Admin
const getDiscountById = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id)
    .populate('usedBy', 'name email');

  if (!discount) {
    res.status(404);
    throw new Error('Discount not found');
  }

  res.json({
    success: true,
    discount
  });
});

// @desc    Create new discount (Admin only)
// @route   POST /api/discounts
// @access  Private/Admin
const createDiscount = asyncHandler(async (req, res) => {
  const { code, discountType, value, isActive, validFrom, validUntil, description } = req.body;

  if (!code || !discountType || value === undefined) {
    res.status(400);
    throw new Error('Please provide all required fields (code, discountType, value)');
  }

  if (!['percentage', 'fixed'].includes(discountType)) {
    res.status(400);
    throw new Error('Invalid discount type (must be percentage or fixed)');
  }

  if (value < 0) {
    res.status(400);
    throw new Error('Discount value must be greater than or equal to 0');
  }

  if (discountType === 'percentage' && value > 100) {
    res.status(400);
    throw new Error('Percentage discount must not exceed 100%');
  }

  // Check if code already exists
  const existingDiscount = await Discount.findOne({ code: code.toUpperCase() });
  if (existingDiscount) {
    res.status(400);
    throw new Error('This discount code already exists');
  }

  const discount = await Discount.create({
    code: code.toUpperCase(),
    discountType,
    value,
    isActive: isActive !== undefined ? isActive : true,
    validFrom: validFrom ? new Date(validFrom) : Date.now(),
    validUntil: validUntil ? new Date(validUntil) : undefined,
    description
  });

  res.status(201).json({
    success: true,
    discount
  });
});

// @desc    Update discount (Admin only)
// @route   PUT /api/discounts/:id
// @access  Private/Admin
const updateDiscount = asyncHandler(async (req, res) => {
  const { code, discountType, value, isActive, validFrom, validUntil, description } = req.body;

  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    res.status(404);
    throw new Error('Discount not found');
  }

  // Validate discount type if provided
  if (discountType && !['percentage', 'fixed'].includes(discountType)) {
    res.status(400);
    throw new Error('Invalid discount type');
  }

  // Validate value if provided
  if (value !== undefined) {
    if (value < 0) {
      res.status(400);
      throw new Error('Discount value must be greater than or equal to 0');
    }
    if (discountType === 'percentage' && value > 100) {
      res.status(400);
      throw new Error('Percentage discount must not exceed 100%');
    }
  }

  // Check if code is being changed and if it already exists
  if (code && code.toUpperCase() !== discount.code) {
    const existingDiscount = await Discount.findOne({ code: code.toUpperCase() });
    if (existingDiscount) {
      res.status(400);
      throw new Error('This discount code already exists');
    }
    discount.code = code.toUpperCase();
  }

  if (discountType !== undefined) discount.discountType = discountType;
  if (value !== undefined) discount.value = value;
  if (isActive !== undefined) discount.isActive = isActive;
  if (validFrom !== undefined) discount.validFrom = new Date(validFrom);
  if (validUntil !== undefined) discount.validUntil = validUntil ? new Date(validUntil) : undefined;
  if (description !== undefined) discount.description = description;

  const updatedDiscount = await discount.save();

  res.json({
    success: true,
    discount: updatedDiscount
  });
});

// @desc    Delete discount (Admin only)
// @route   DELETE /api/discounts/:id
// @access  Private/Admin
const deleteDiscount = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    res.status(404);
    throw new Error('Discount not found');
  }

  await discount.deleteOne();

  res.json({
    success: true,
    message: 'Discount deleted successfully'
  });
});

// @desc    Toggle discount active status (Admin only)
// @route   PUT /api/discounts/:id/toggle
// @access  Private/Admin
const toggleDiscount = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    res.status(404);
    throw new Error('Discount not found');
  }

  discount.isActive = !discount.isActive;
  const updatedDiscount = await discount.save();

  res.json({
    success: true,
    discount: updatedDiscount
  });
});

module.exports = {
  validateDiscount,
  getDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  toggleDiscount
};

