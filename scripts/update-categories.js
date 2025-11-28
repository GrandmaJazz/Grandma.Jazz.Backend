const mongoose = require('mongoose');
require('dotenv').config();

// Import Product model
const Product = require('../src/models/Product');

// Category mapping from old to new
const categoryMapping = {
  'vinyl': 'merchandise',
  'cds': 'merchandise', 
  'instruments': 'garments',
  'merchandise': 'merchandise' // keep existing merchandise as is
};

async function updateCategories() {
  try {
    console.log('🔄 Starting category update...');
    console.log('📊 Category mapping:');
    console.log('  vinyl → merchandise');
    console.log('  cds → merchandise');
    console.log('  instruments → garments');
    console.log('  merchandise → merchandise (unchanged)\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/grandma-jazz';
    console.log(`🔗 Connecting to MongoDB: ${mongoUri}`);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get all products with old categories
    const oldCategories = ['vinyl', 'cds', 'instruments'];
    const productsToUpdate = await Product.find({
      category: { $in: oldCategories }
    });

    console.log(`\n📦 Found ${productsToUpdate.length} products to update`);

    if (productsToUpdate.length === 0) {
      console.log('ℹ️  No products found with old categories. All products may already be updated.');
    }

    // Update each product
    for (const product of productsToUpdate) {
      const oldCategory = product.category;
      const newCategory = categoryMapping[oldCategory];
      
      if (newCategory) {
        await Product.findByIdAndUpdate(product._id, {
          category: newCategory
        });
        console.log(`   ✅ Updated "${product.name}" from "${oldCategory}" to "${newCategory}"`);
      }
    }

    // Show summary
    const updatedCounts = {};
    const allNewCategories = ['merchandise', 'coffees', 'teas', 'garments'];
    
    for (const category of allNewCategories) {
      const count = await Product.countDocuments({ category });
      updatedCounts[category] = count;
    }

    console.log('\n=== 📊 Update Summary ===');
    console.log('Current category counts:');
    for (const [category, count] of Object.entries(updatedCounts)) {
      console.log(`  ${category}: ${count} products`);
    }

    // Show all categories in database
    const allCategories = await Product.distinct('category');
    console.log('\n📋 All categories in database:', allCategories);

    console.log('\n🎉 Category update completed successfully!');
    
  } catch (error) {
    if (error.name === 'MongooseServerSelectionError') {
      console.error('❌ MongoDB connection failed!');
      console.error('📝 Please make sure MongoDB is running and accessible.');
      console.error('💡 To run this script:');
      console.error('   1. Start your MongoDB server');
      console.error('   2. Make sure the MONGODB_URI in your .env file is correct');
      console.error('   3. Run: cd backend && node scripts/update-categories.js');
    } else {
      console.error('❌ Error updating categories:', error);
    }
  } finally {
    try {
      await mongoose.connection.close();
      console.log('🔚 Database connection closed');
    } catch (closeError) {
      // Ignore close errors
    }
  }
}

// Run if called directly
if (require.main === module) {
  updateCategories();
}

module.exports = updateCategories; 