import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;

    // Expo sends these primarily as HEADERS
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

    // Validation
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

    // Fetch latest published update
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

    // ---- BUILD MANIFEST (ROOT LEVEL) ----
    const manifest = { ...updateData.manifest };

    // REQUIRED FIELDS
    manifest.id = updateData.id;

    manifest.createdAt =
      updateData.publishedAt instanceof Date
        ? updateData.publishedAt.toISOString()
        : new Date(updateData.publishedAt).toISOString();

    manifest.runtimeVersion = updateData.runtimeVersion;

    // REQUIRED: launchAsset
    if (!manifest.launchAsset && Array.isArray(manifest.assets)) {
      manifest.launchAsset =
        manifest.assets.find((a: any) => a.key === 'bundle') ||
        manifest.assets[0];
    }

    if (!manifest.launchAsset) {
      console.error('❌ Missing launchAsset in manifest');
      return NextResponse.json(
        { error: 'Invalid manifest: missing launchAsset' },
        { status: 500 }
      );
    }

    console.log('📦 Returning manifest:', {
      id: manifest.id,
      runtimeVersion: manifest.runtimeVersion,
      platform,
      channel,
    });

    // 🚀 IMPORTANT: return MANIFEST DIRECTLY
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
