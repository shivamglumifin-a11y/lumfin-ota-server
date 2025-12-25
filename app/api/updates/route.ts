import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';
import { randomUUID } from 'crypto';

function isUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * GET /api/updates
 * 
 * Returns a fully Expo-compliant manifest for OTA updates.
 * 
 * CRITICAL: This endpoint enforces Expo's immutable asset contract:
 * - manifest.id is always a valid UUID
 * - manifest.createdAt is always an ISO string
 * - launchAsset is always present with contentType = application/octet-stream
 * - Response headers completely disable caching to prevent CDN poisoning
 */
export async function GET(req: NextRequest) {
  await connectDB();

  const params = req.nextUrl.searchParams;

  // Extract Expo headers/query params
  const runtimeVersion = req.headers.get('expo-runtime-version') || params.get('runtimeVersion');
  const platform = req.headers.get('expo-platform') || params.get('platform');
  const channel = req.headers.get('expo-channel-name') || params.get('channel') || 'production';

  if (!runtimeVersion || !platform) {
    return new NextResponse(
      JSON.stringify({ error: 'Missing required parameters: runtimeVersion and platform' }),
      { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }

  // Find latest published update
  const update = await Update.findOne({
    runtimeVersion,
    platform,
    channel,
    status: 'published',
  })
    .sort({ commitTime: -1 })
    .lean();

  // Return empty response if no update found (Expo protocol)
  if (!update) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'expo-protocol-version': '1',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }

  // Type assertion for lean query result
  type UpdateDoc = {
    id: string;
    manifest: any;
    commitTime: Date;
    createdAt: Date;
  };
  const updateDoc = update as unknown as UpdateDoc;

  // Clone manifest to avoid mutating database document
  const manifest = structuredClone(updateDoc.manifest);

  // CRITICAL: Ensure manifest.id is always a valid UUID
  // Use update.id if it's a valid UUID, otherwise generate a new one
  manifest.id = isUUID(updateDoc.id) ? updateDoc.id : randomUUID();

  // CRITICAL: Ensure manifest.createdAt is always an ISO string
  // Use commitTime (when update was published) or createdAt as fallback
  const createdAtDate = updateDoc.commitTime || updateDoc.createdAt || new Date();
  manifest.createdAt = createdAtDate instanceof Date 
    ? createdAtDate.toISOString() 
    : new Date(createdAtDate).toISOString();

  // CRITICAL: Preserve runtimeVersion (must match request)
  manifest.runtimeVersion = runtimeVersion;

  // CRITICAL: Ensure launchAsset is always present
  // Expo requires launchAsset field for OTA updates
  if (!manifest.launchAsset) {
    // Try to find bundle in assets array
    manifest.launchAsset = manifest.assets?.find((a: any) => a.key === 'bundle');
    
    // If still not found, use first asset as fallback
    if (!manifest.launchAsset && manifest.assets && manifest.assets.length > 0) {
      manifest.launchAsset = manifest.assets[0];
    }
    
    // If no assets at all, this is an invalid manifest
    if (!manifest.launchAsset) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid manifest: missing launchAsset' }),
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }
  }

  // CRITICAL: Force launchAsset contentType to application/octet-stream
  // This ensures Hermes bytecode (.hbc) files are served correctly
  manifest.launchAsset.contentType = 'application/octet-stream';

  // Ensure assets array exists
  if (!manifest.assets) {
    manifest.assets = [];
  }

  // Ensure launchAsset is in assets array (Expo requirement)
  const launchAssetInAssets = manifest.assets.some((a: any) => 
    a.url === manifest.launchAsset.url || a.key === manifest.launchAsset.key
  );
  if (!launchAssetInAssets) {
    manifest.assets.unshift(manifest.launchAsset);
  }

  // Ensure metadata and extra fields exist (Expo compatibility)
  manifest.metadata = manifest.metadata || {};
  manifest.extra = manifest.extra || {};

  // Return fully Expo-compliant manifest with anti-cache headers
  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',

      // CRITICAL: Completely disable caching to prevent CDN poisoning
      // These headers ensure:
      // - No browser caching
      // - No CDN/proxy caching
      // - Always fetch fresh manifest
      // - Prevents asset reuse across updates
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
