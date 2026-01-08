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
    throw new Error('กรุณาระบุรหัสส่วนลด');
  }

  if (totalAmount === undefined || totalAmount < 0) {
    res.status(400);
    throw new Error('ยอดรวมไม่ถูกต้อง');
  }

  const discount = await Discount.findOne({ code: code.toUpperCase() });

  if (!discount) {
    res.status(404);
    throw new Error('ไม่พบรหัสส่วนลด');
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
    throw new Error('คุณได้ใช้รหัสส่วนลดนี้แล้ว (จำกัด 1 ครั้งต่อผู้ใช้)');
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
    throw new Error('ไม่พบส่วนลด');
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
    throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน (code, discountType, value)');
  }

  if (!['percentage', 'fixed'].includes(discountType)) {
    res.status(400);
    throw new Error('ประเภทส่วนลดไม่ถูกต้อง (ต้องเป็น percentage หรือ fixed)');
  }

  if (value < 0) {
    res.status(400);
    throw new Error('ค่าส่วนลดต้องมากกว่าหรือเท่ากับ 0');
  }

  if (discountType === 'percentage' && value > 100) {
    res.status(400);
    throw new Error('ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%');
  }

  // Check if code already exists
  const existingDiscount = await Discount.findOne({ code: code.toUpperCase() });
  if (existingDiscount) {
    res.status(400);
    throw new Error('รหัสส่วนลดนี้มีอยู่แล้ว');
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
    throw new Error('ไม่พบส่วนลด');
  }

  // Validate discount type if provided
  if (discountType && !['percentage', 'fixed'].includes(discountType)) {
    res.status(400);
    throw new Error('ประเภทส่วนลดไม่ถูกต้อง');
  }

  // Validate value if provided
  if (value !== undefined) {
    if (value < 0) {
      res.status(400);
      throw new Error('ค่าส่วนลดต้องมากกว่าหรือเท่ากับ 0');
    }
    if (discountType === 'percentage' && value > 100) {
      res.status(400);
      throw new Error('ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%');
    }
  }

  // Check if code is being changed and if it already exists
  if (code && code.toUpperCase() !== discount.code) {
    const existingDiscount = await Discount.findOne({ code: code.toUpperCase() });
    if (existingDiscount) {
      res.status(400);
      throw new Error('รหัสส่วนลดนี้มีอยู่แล้ว');
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
    throw new Error('ไม่พบส่วนลด');
  }

  await discount.deleteOne();

  res.json({
    success: true,
    message: 'ลบส่วนลดเรียบร้อยแล้ว'
  });
});

// @desc    Toggle discount active status (Admin only)
// @route   PUT /api/discounts/:id/toggle
// @access  Private/Admin
const toggleDiscount = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    res.status(404);
    throw new Error('ไม่พบส่วนลด');
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

