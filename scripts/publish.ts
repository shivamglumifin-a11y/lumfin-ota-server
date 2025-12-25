// Load environment variables FIRST using require (executes synchronously before ES6 imports)
const path = require('path');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(path.join(__dirname, '..'));

// Now import other modules that don't depend on environment variables
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import mongoose from 'mongoose';
import { uploadToVercelBlob, calculateHash, getContentType, verifyHashFromUrl } from '../lib/storage';

// Modules that depend on env vars will be imported dynamically after env is loaded

interface PublishOptions {
  channel: 'development' | 'staging' | 'production';
  platform: 'ios' | 'android';
  runtimeVersion: string;
  message?: string;
}

function generateUpdateId(): string {
  // Generate a valid UUID v4 format that Expo expects
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

async function publishUpdate(options: PublishOptions) {
  const { channel, platform, runtimeVersion, message } = options;

  console.log(`📦 Publishing update for ${platform} (${channel})...`);

  // Step 1: Dynamically import modules that depend on environment variables
  const { default: connectDB } = await import('../lib/db');
  const { Update } = await import('../models/Update');

  // Step 2: Connect to MongoDB
  await connectDB();
  console.log('✅ Connected to MongoDB');

  // Step 3: Get Expo project path
  const expoProjectPath = process.env.EXPO_PROJECT_PATH || '../lumfin_mobile';
  const absoluteExpoPath = path.resolve(__dirname, '..', expoProjectPath);
  
  if (!fs.existsSync(absoluteExpoPath)) {
    throw new Error(`Expo project not found at ${absoluteExpoPath}`);
  }

  // Step 4: Export Expo bundle
  console.log('🔨 Building bundle...');
  const outputDir = path.join(absoluteExpoPath, 'dist', platform);
  
  try {
    execSync(
      `cd ${absoluteExpoPath} && npx expo export --platform ${platform} --output-dir ./dist/${platform}`,
      { stdio: 'inherit' }
    );
  } catch (error) {
    throw new Error(`Failed to export Expo bundle: ${error}`);
  }

  // Step 5: Find and read bundle
  // Modern Expo exports use _expo/static/js/{platform}/ directory
  const expoStaticDir = path.join(outputDir, '_expo', 'static', 'js', platform);
  let bundlePath: string | null = null;
  
  if (fs.existsSync(expoStaticDir)) {
    // Look for bundle files (.js or .hbc extension)
    const files = fs.readdirSync(expoStaticDir);
    const bundleFile = files.find(file => 
      file.startsWith('entry-') && (file.endsWith('.js') || file.endsWith('.hbc'))
    );
    
    if (bundleFile) {
      bundlePath = path.join(expoStaticDir, bundleFile);
    }
  }
  
  // Fallback to old format: bundles/index-{platform}.js
  if (!bundlePath) {
    const oldBundlePath = path.join(outputDir, 'bundles', `index-${platform}.js`);
    if (fs.existsSync(oldBundlePath)) {
      bundlePath = oldBundlePath;
    }
  }
  
  if (!bundlePath || !fs.existsSync(bundlePath)) {
    throw new Error(
      `Bundle not found. Checked:\n` +
      `  - ${expoStaticDir}/*.{js,hbc}\n` +
      `  - ${path.join(outputDir, 'bundles', `index-${platform}.js`)}\n` +
      `Export output directory: ${outputDir}`
    );
  }
  
  console.log(`📦 Found bundle at: ${bundlePath}`);

  // CRITICAL: For Android, we MUST hash the actual .hbc file bytes
  // Do NOT hash JS, zip, or pre-Hermes output
  const isBinary = bundlePath.endsWith('.hbc');
  
  if (platform === 'android' && !isBinary) {
    throw new Error(
      `❌ Android requires .hbc (Hermes bytecode) file, but found: ${bundlePath}\n` +
      `   Android OTA updates MUST use Hermes bytecode (.hbc) files.\n` +
      `   Ensure your Expo build is configured for Hermes bytecode.`
    );
  }

  // Read bundle as Buffer (binary) for accurate hashing
  // This ensures we hash the EXACT bytes that will be served
  const bundleContent = fs.readFileSync(bundlePath);
  const bundleHash = calculateHash(bundleContent);
  
  console.log(`🔐 Calculated hash: sha256:${bundleHash}`);
  console.log(`   File size: ${bundleContent.length} bytes`);
  console.log(`   File type: ${isBinary ? 'Hermes bytecode (.hbc)' : 'JavaScript (.js)'}`);

  // Step 6: Generate unique updateId (UUID) for this update
  // CRITICAL: This UUID ensures immutable, unique paths for all assets
  const updateId = generateUpdateId();
  console.log(`🆔 Update ID: ${updateId}`);
  
  // Step 7: Upload bundle with immutable path using updateId
  console.log('☁️ Uploading bundle...');
  const bundleExtension = bundlePath.split('.').pop() || 'js';
  
  // CRITICAL: uploadToVercelBlob now enforces immutable paths via updateId
  // For .hbc files, contentType is automatically set to application/octet-stream
  const bundleUrl = await uploadToVercelBlob(
    bundlePath,
    updateId,
    `bundle.${bundleExtension}`
  );
  console.log(`✅ Bundle uploaded: ${bundleUrl}`);

  // CRITICAL: Verify hash matches what's actually served (catches compression issues)
  if (isBinary) {
    console.log('🔍 Verifying hash of served file...');
    const verification = await verifyHashFromUrl(bundleUrl, bundleHash);
    
    if (!verification.matches) {
      console.error('\n❌ HASH VERIFICATION FAILED!');
      console.error(`   Expected: sha256:${bundleHash}`);
      console.error(`   Actual:   sha256:${verification.actualHash}`);
      if (verification.error) {
        console.error(`   Error: ${verification.error}`);
      }
      console.error('\n⚠️  This update will FAIL on Android!');
      console.error('   The file is being compressed by CDN.');
      console.error('   Verify headers:');
      console.error(`   curl -I ${bundleUrl}`);
      console.error('   Expected: Content-Encoding: identity (or missing)');
      console.error('   If Content-Encoding is gzip/br, you need to disable compression.');
      throw new Error('Hash verification failed - CDN compression detected');
    } else {
      console.log(`✅ Hash verification passed: sha256:${verification.actualHash}`);
    }
  }

  // Step 8: Upload assets with immutable paths using updateId
  console.log('📎 Uploading assets...');
  // Modern Expo exports assets to _expo/static/assets/, fallback to assets/
  const modernAssetsDir = path.join(outputDir, '_expo', 'static', 'assets');
  const legacyAssetsDir = path.join(outputDir, 'assets');
  const assetsDir = fs.existsSync(modernAssetsDir) ? modernAssetsDir : legacyAssetsDir;
  const assets: any[] = [];

  if (fs.existsSync(assetsDir)) {
    const assetFiles = getAllFiles(assetsDir);
    
    for (const assetFile of assetFiles) {
      const relativePath = path.relative(assetsDir, assetFile);
      const assetContent = fs.readFileSync(assetFile);
      const assetHash = calculateHash(assetContent);
      
      // CRITICAL: Use updateId to ensure immutable, unique paths
      // Path format: updates/{updateId}/assets/{relativePath}
      const assetUrl = await uploadToVercelBlob(
        assetFile,
        updateId,
        `assets/${relativePath.replace(/\\/g, '/')}`
      );

      assets.push({
        hash: `sha256:${assetHash}`,
        key: `assets/${relativePath.replace(/\\/g, '/')}`,
        contentType: getContentType(assetFile),
        url: assetUrl,
      });
    }
    console.log(`✅ Uploaded ${assets.length} assets`);
  }

  // Step 9: Create manifest in Expo's expected format
  // CRITICAL: Hash must match EXACT bytes served (no compression)
  // CRITICAL: All asset URLs are now immutable (updateId in path ensures uniqueness)
  const bundleAsset = {
    hash: `sha256:${bundleHash}`,
    key: 'bundle',
    contentType: 'application/octet-stream', // Expo requires this for Android/Hermes
    url: bundleUrl,
  };

  // CRITICAL: commitTime must be unique per scope (runtimeVersion + platform + channel)
  // This becomes commit_time in Expo's SQLite database and must be globally unique per scope
  const commitTime = new Date();

  // CRITICAL: Create fully Expo-compliant manifest
  // - id: UUID (immutable identifier)
  // - createdAt: ISO string (when update was published)
  // - runtimeVersion: preserved from options
  // - launchAsset: always present with contentType = application/octet-stream
  // - assets: array including bundle and all other assets
  const manifest = {
    id: updateId, // UUID ensures uniqueness
    createdAt: commitTime.toISOString(), // Expo expects ISO string
    runtimeVersion: runtimeVersion,
    launchAsset: bundleAsset, // Expo requires launchAsset field
    assets: [
      bundleAsset, // Bundle must be in assets array
      ...assets,
    ],
    metadata: {}, // Expo compatibility
    extra: {}, // Expo compatibility
  };

  // Step 10: Save to MongoDB
  console.log('💾 Saving to database...');
  const update = new Update({
    id: updateId,
    runtimeVersion: runtimeVersion,
    platform: platform,
    channel: channel,
    status: 'published',
    commitTime: commitTime, // CRITICAL: Must be set for Expo uniqueness constraint
    manifest: manifest,
    message: message,
    publishedAt: commitTime, // Use same timestamp for consistency
  });

  await update.save();

  console.log(`\n✅ Update published successfully!`);
  console.log(`   ID: ${updateId}`);
  console.log(`   Channel: ${channel}`);
  console.log(`   Platform: ${platform}`);
  console.log(`   Runtime Version: ${runtimeVersion}`);
  console.log(`   Message: ${message || '(no message)'}`);
  console.log(`   Bundle URL: ${bundleUrl}`);
  console.log(`   Assets: ${assets.length}`);
  console.log(`\n📱 Your app will check for updates at:`);
  console.log(`   ${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/updates`);

  await mongoose.connection.close();
}

// CLI argument parsing
const args = process.argv.slice(2);
const channelArg = args.find(a => a.startsWith('--channel'))?.split('=')[1];
const platformArg = args.find(a => a.startsWith('--platform'))?.split('=')[1];
const runtimeVersionArg = args.find(a => a.startsWith('--runtime-version'))?.split('=')[1];
const messageArg = args.find(a => a.startsWith('--message'))?.split('=')[1];

if (!channelArg || !platformArg || !runtimeVersionArg) {
  console.error('Usage: npm run publish -- --channel=<channel> --platform=<platform> --runtime-version=<version> [--message=<message>]');
  console.error('\nExample:');
  console.error('  npm run publish -- --channel=production --platform=ios --runtime-version=1.0.0 --message="Bug fix"');
  process.exit(1);
}

const channel = channelArg as 'development' | 'staging' | 'production';
const platform = platformArg as 'ios' | 'android';
const runtimeVersion = runtimeVersionArg;

if (!['development', 'staging', 'production'].includes(channel)) {
  console.error('Invalid channel. Must be: development, staging, or production');
  process.exit(1);
}

if (!['ios', 'android'].includes(platform)) {
  console.error('Invalid platform. Must be: ios or android');
  process.exit(1);
}

publishUpdate({ channel, platform, runtimeVersion, message: messageArg })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });

