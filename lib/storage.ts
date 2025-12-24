import { put } from '@vercel/blob';
import * as fs from 'fs';
import crypto from 'crypto';

interface UploadOptions {
  contentType?: string;
  contentEncoding?: string;
}

// Upload to Vercel Blob Storage
export async function uploadToVercelBlob(
  filePath: string,
  fileName: string,
  options?: UploadOptions
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set in environment variables');
  }

  // Use Readable stream for Vercel Blob Storage
  const fileStream = fs.createReadStream(filePath);
  
  // Determine content type
  const contentType = options?.contentType || getContentType(filePath);
  
  // For .hbc files, we MUST disable compression to ensure hash matches
  const isHbcFile = filePath.toLowerCase().endsWith('.hbc');
  
  const blob = await put(fileName, fileStream, {
    access: 'public',
    addRandomSuffix: false,
    contentType: contentType,
    // Note: Vercel Blob/CDN typically does NOT compress application/octet-stream files
    // Setting contentType to 'application/octet-stream' for .hbc files should prevent compression
  });

  // CRITICAL: For .hbc files, we need to ensure Content-Encoding: identity
  // Vercel Blob doesn't directly support setting Content-Encoding in put(),
  // but we can verify the file after upload and warn if compression is detected
  if (isHbcFile) {
    console.log(`⚠️  IMPORTANT: Verify headers for .hbc file:`);
    console.log(`   curl -I ${blob.url}`);
    console.log(`   Expected: Content-Type: application/octet-stream`);
    console.log(`   Expected: Content-Encoding: identity (or missing)`);
    console.log(`   If Content-Encoding is gzip/br, hash verification will fail!`);
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

