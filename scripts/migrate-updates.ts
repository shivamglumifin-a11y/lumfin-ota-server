// Load environment variables
try {
  require('dotenv').config({ path: '.env' });
} catch (e) {
  // dotenv not available, continue
}

import mongoose from 'mongoose';
import { Update } from '../models/Update';
import { randomUUID } from 'crypto';

async function migrateUpdates() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('Please define MONGODB_URI in environment variables');
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all updates that don't have id field set
    const updatesWithoutId = await Update.find({
      $or: [
        { id: { $exists: false } },
        { id: null }
      ]
    });

    console.log(`Found ${updatesWithoutId.length} updates without id field`);

    for (const update of updatesWithoutId) {
      // Generate a new UUID for this update
      const newId = randomUUID();

      // Update the document
      await Update.updateOne(
        { _id: update._id },
        {
          $set: {
            id: newId
          }
        }
      );

      console.log(`✅ Migrated update ${update._id} -> id: ${newId}`);
      console.log(`   Scope: ${update.runtimeVersion}-${update.platform}-${update.channel}`);
    }

    console.log('\n🎉 Migration completed!');
    console.log('All existing updates now have proper UUID ids.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

migrateUpdates();
