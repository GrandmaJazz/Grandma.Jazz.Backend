//backend/src/models/Product.js
const mongoose = require('mongoose');

const productSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function(v) {
          return v > 0 && v <= 30; // รองรับ 0-30 kg ตาม EMS
        },
        message: 'Weight must be between 0 and 30 kg'
      }
    },
    images: {
      type: [String], // เป็น array ของ string เพื่อรองรับหลาย URL
      required: true,
      validate: {
        validator: function(v) {
          return v.length > 0; // ต้องมีอย่างน้อย 1 รูป
        },
        message: 'At least one image is required'
      }
    },
    isOutOfStock: {
      type: Boolean,
      default: false
    },
    isFeatured: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Static method to get featured products (maximum 4)
productSchema.statics.getFeaturedProducts = async function() {
  return this.find({ isFeatured: true }).limit(4);
};

// Static method to get all available products
productSchema.statics.getAvailableProducts = async function() {
  return this.find({ isOutOfStock: false });
};

// Static method to get products by category
productSchema.statics.getByCategory = async function(category) {
  return this.find({ category });
};

// Method to check if product can be featured
productSchema.methods.canBeFeatured = async function() {
  if (this.isFeatured) return true;
  
  const featuredCount = await this.constructor.countDocuments({ isFeatured: true });
  return featuredCount < 4;
};

// Method to update stock status
productSchema.methods.updateStockStatus = function(isOutOfStock) {
  this.isOutOfStock = isOutOfStock;
  return this.save();
};

// Method to toggle featured status
productSchema.methods.toggleFeatured = async function() {
  // If already featured, we can always un-feature it
  if (this.isFeatured) {
    this.isFeatured = false;
    return this.save();
  }
  
  // Check if can be featured
  const canBeFeatured = await this.canBeFeatured();
  
  if (canBeFeatured) {
    this.isFeatured = true;
    return this.save();
  } else {
    throw new Error('Maximum number of featured products reached (4)');
  }
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;