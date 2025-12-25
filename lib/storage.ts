import { put } from '@vercel/blob';
import * as fs from 'fs';
import crypto from 'crypto';

interface UploadOptions {
  contentType?: string;
  contentEncoding?: string;
}

/**
 * Upload to Vercel Blob Storage with immutable, unique paths.
 * 
 * CRITICAL: Every file gets a unique path using updateId (UUID) to ensure:
 * - No file is ever overwritten
 * - Assets are immutable once published
 * - Hash verification can never fail due to CDN caching or asset reuse
 * 
 * @param filePath - Local file path to upload
 * @param updateId - UUID of the update (ensures unique, immutable paths)
 * @param relativePath - Relative path within the update (e.g., 'bundle.js' or 'assets/image.png')
 * @param options - Optional upload options
 * @returns The public URL of the uploaded blob
 */
export async function uploadToVercelBlob(
  filePath: string,
  updateId: string,
  relativePath: string,
  options?: UploadOptions
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set in environment variables');
  }

  // Validate updateId is a UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(updateId)) {
    throw new Error(`Invalid updateId format. Expected UUID, got: ${updateId}`);
  }

  // Construct immutable path: updates/{updateId}/{relativePath}
  // This ensures:
  // 1. Each update gets its own namespace
  // 2. No file can ever be overwritten (different updateId = different path)
  // 3. Assets are immutable once published
  const blobPath = `updates/${updateId}/${relativePath}`;

  // Use Readable stream for Vercel Blob Storage
  const fileStream = fs.createReadStream(filePath);
  
  // Determine content type
  // CRITICAL: .hbc files MUST use application/octet-stream to prevent compression
  const isHbcFile = filePath.toLowerCase().endsWith('.hbc');
  const contentType = isHbcFile 
    ? 'application/octet-stream' 
    : (options?.contentType || getContentType(filePath));
  
  // Upload with immutable path (addRandomSuffix: false because updateId already ensures uniqueness)
  const blob = await put(blobPath, fileStream, {
    access: 'public',
    addRandomSuffix: false, // Path is already unique via updateId
    contentType: contentType,
    // Note: Vercel Blob/CDN typically does NOT compress application/octet-stream files
    // Setting contentType to 'application/octet-stream' for .hbc files prevents compression
  });

  // Log verification info for .hbc files
  if (isHbcFile) {
    console.log(`✅ Uploaded Hermes bytecode (.hbc) file:`);
    console.log(`   Path: ${blobPath}`);
    console.log(`   URL: ${blob.url}`);
    console.log(`   Content-Type: application/octet-stream`);
    console.log(`   Verify headers: curl -I ${blob.url}`);
  }

  return blob.url;
}

// Calculate SHA256 hash
export function calculateHash(content: Buffer | string): string {
  const data = typeof content === 'string' ? Buffer.from(content) : content;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Verify hash of file served from URL (catches compression issues)
export async function verifyHashFromUrl(
  url: string,
  expectedHash: string
): Promise<{ matches: boolean; actualHash: string; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept-Encoding': 'identity', // Request no compression
      },
    });

    if (!response.ok) {
      return {
        matches: false,
        actualHash: '',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Check Content-Encoding header
    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding && contentEncoding !== 'identity') {
      return {
        matches: false,
        actualHash: '',
        error: `❌ Compression detected! Content-Encoding: ${contentEncoding}. Hash will NOT match.`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const actualHash = calculateHash(buffer);

    return {
      matches: actualHash === expectedHash,
      actualHash,
      error: actualHash === expectedHash 
        ? undefined 
        : `Hash mismatch! Expected: ${expectedHash}, Got: ${actualHash}`,
    };
  } catch (error: any) {
    return {
      matches: false,
      actualHash: '',
      error: `Verification failed: ${error.message}`,
    };
  }
}

// Get content type from file extension
export function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const types: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'json': 'application/json',
    'ttf': 'font/ttf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'js': 'application/javascript',
    'map': 'application/json',
    'hbc': 'application/octet-stream', // Hermes bytecode - MUST be octet-stream
  };
  return types[ext] || 'application/octet-stream';
}

