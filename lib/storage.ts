import { put } from '@vercel/blob';
import * as fs from 'fs';
import crypto from 'crypto';

// Upload to Vercel Blob Storage
export async function uploadToVercelBlob(
  filePath: string,
  fileName: string
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set in .env.local');
  }

  // Use Readable stream for Vercel Blob Storage
  const fileStream = fs.createReadStream(filePath);
  
  const blob = await put(fileName, fileStream, {
    access: 'public',
    addRandomSuffix: false,
  });

  return blob.url;
}

// Calculate SHA256 hash
export function calculateHash(content: Buffer | string): string {
  const data = typeof content === 'string' ? Buffer.from(content) : content;
  return crypto.createHash('sha256').update(data).digest('hex');
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
  };
  return types[ext] || 'application/octet-stream';
}

