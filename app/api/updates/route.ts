import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

/**
 * Expo Android strictly parses UUID using UUID.fromString()
 */
function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

interface UpdateLean {
  id: string;
  runtimeVersion: string;
  platform: 'ios' | 'android';
  channel: 'development' | 'staging' | 'production';
  status: 'draft' | 'published' | 'rolled_back';
  manifest: {
    id?: string;
    createdAt?: number | string;
    runtimeVersion?: string;
    assets: Array<{
      hash: string;
      key: string;
      contentType: string;
      url: string;
    }>;
    launchAsset?: {
      hash: string;
      key: string;
      contentType: string;
      url: string;
    };
    metadata?: Record<string, any>;
    extra?: Record<string, any>;
  };
  createdAt: Date;
  publishedAt?: Date;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;

    // ---- Expo headers (preferred) ----
    const runtimeVersion =
      request.headers.get('expo-runtime-version') ||
      searchParams.get('runtimeVersion');

    const platform =
      request.headers.get('expo-platform') ||
      searchParams.get('platform') ||
      (request.headers.get('user-agent')?.toLowerCase().includes('android')
        ? 'android'
        : request.headers.get('user-agent')?.toLowerCase().includes('ios')
        ? 'ios'
        : null);

    const channel =
      request.headers.get('expo-channel-name') ||
      searchParams.get('channel') ||
      'production';

    console.log('📱 Expo update request:', {
      runtimeVersion,
      platform,
      channel,
    });

    // ---- Validation ----
    if (!runtimeVersion || !platform) {
      return NextResponse.json(
        { error: 'Missing runtimeVersion or platform' },
        { status: 400 }
      );
    }

    if (!['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform' },
        { status: 400 }
      );
    }

    // ---- Fetch latest published update ----
    const update = (await Update.findOne({
      runtimeVersion,
      platform,
      channel,
      status: 'published',
    })
      .sort({ commitTime: -1 }) // Use commitTime for sorting as it's more reliable
      .lean()) as UpdateLean | null;

    if (!update) {
      return new NextResponse(null, {
        headers: {
          'expo-protocol-version': '1',
        },
      });
    }

    // ---- Build manifest (ROOT LEVEL) ----
    const manifest = structuredClone(update.manifest);

    /**
     * REQUIRED: id (MUST be UUID)
     */
    manifest.id =
      typeof update.id === 'string' && isValidUUID(update.id)
        ? update.id
        : randomUUID();

    /**
     * REQUIRED: createdAt (ISO string – Expo compliant)
     */
    const createdAtDate =
      update.publishedAt ?? update.createdAt ?? new Date();
    manifest.createdAt = new Date(createdAtDate).toISOString();

    /**
     * REQUIRED: runtimeVersion
     */
    manifest.runtimeVersion = update.runtimeVersion;

    /**
     * REQUIRED: assets[]
     */
    if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
      return NextResponse.json(
        { error: 'Invalid manifest: assets missing' },
        { status: 500 }
      );
    }

    /**
     * REQUIRED: launchAsset
     */
    manifest.launchAsset =
      manifest.launchAsset ||
      manifest.assets.find((a) => a.key === 'bundle');

    if (!manifest.launchAsset) {
      return NextResponse.json(
        { error: 'Invalid manifest: launchAsset missing' },
        { status: 500 }
      );
    }

    /**
     * HARD REQUIREMENTS
     */
    manifest.launchAsset.contentType = 'application/octet-stream';
    manifest.metadata ??= {};
    manifest.extra ??= {};

    console.log('📦 Returning Expo manifest:', {
      id: manifest.id,
      runtimeVersion: manifest.runtimeVersion,
      platform,
      channel,
      bundle: manifest.launchAsset.url,
    });

    // ---- IMPORTANT: return manifest directly ----
    return NextResponse.json(manifest, {
      headers: {
        'Content-Type': 'application/json',
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
        'Cache-Control': 'private, max-age=0',
      },
    });
  } catch (error) {
    console.error('❌ Expo update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
