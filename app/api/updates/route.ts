import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;

    // Expo headers (preferred)
    const runtimeVersion =
      request.headers.get('expo-runtime-version') ||
      searchParams.get('runtimeVersion');

    const platform =
      request.headers.get('expo-platform') ||
      searchParams.get('platform') ||
      (request.headers.get('user-agent')?.toLowerCase().includes('android')
        ? 'android'
        : null) ||
      (request.headers.get('user-agent')?.toLowerCase().includes('ios')
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

    // ---------------- VALIDATION ----------------
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

    // ---------------- FETCH UPDATE ----------------
    const update = await Update.findOne({
      runtimeVersion,
      platform,
      channel,
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .lean();

    if (!update) {
      console.log('❌ No update found');
      return NextResponse.json(null, {
        headers: {
          'expo-protocol-version': '1',
        },
      });
    }

    const updateData = update as any;

    // ---------------- BUILD MANIFEST (ROOT LEVEL) ----------------
    const manifest = { ...updateData.manifest };

    /**
     * REQUIRED: id (MUST be UUID)
     * Expo parses this using UUID.fromString() on Android
     */
    manifest.id =
      typeof updateData.id === 'string' && isValidUUID(updateData.id)
        ? updateData.id
        : randomUUID();

    /**
     * REQUIRED: createdAt (ISO string)
     */
    manifest.createdAt =
      updateData.publishedAt instanceof Date
        ? updateData.publishedAt.toISOString()
        : new Date(updateData.publishedAt).toISOString();

    /**
     * REQUIRED: runtimeVersion
     */
    manifest.runtimeVersion = updateData.runtimeVersion;

    /**
     * REQUIRED: launchAsset
     */
    if (!manifest.launchAsset && Array.isArray(manifest.assets)) {
      manifest.launchAsset =
        manifest.assets.find((a: any) => a.key === 'bundle') ||
        manifest.assets[0];
    }

    if (!manifest.launchAsset) {
      console.error('❌ Invalid manifest: missing launchAsset');
      return NextResponse.json(
        { error: 'Invalid manifest: missing launchAsset' },
        { status: 500 }
      );
    }

    // Optional but recommended
    manifest.metadata ??= {};
    manifest.extra ??= {};

    console.log('📦 Returning Expo manifest:', {
      id: manifest.id,
      runtimeVersion: manifest.runtimeVersion,
      platform,
      channel,
    });

    // ---------------- RESPONSE ----------------
    // IMPORTANT: Return MANIFEST DIRECTLY (not nested)
    return NextResponse.json(manifest, {
      headers: {
        'Content-Type': 'application/json',
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
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
