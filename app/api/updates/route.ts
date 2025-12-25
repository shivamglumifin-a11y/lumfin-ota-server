import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

interface UpdateLean {
  id: string;
  runtimeVersion: string;
  platform: 'ios' | 'android';
  channel: 'development' | 'staging' | 'production';
  status: 'draft' | 'published' | 'rolled_back';
  manifest: {
    id: string;
    createdAt: number;
    runtimeVersion: string;
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
  };
  message?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;

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

    const update = await Update.findOne({
      runtimeVersion,
      platform,
      channel,
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .lean() as UpdateLean | null;

    if (!update) {
      return new NextResponse(null, {
        headers: {
          'expo-protocol-version': '1',
        },
      });
    }

    const manifest = structuredClone(update.manifest);

    // REQUIRED FIELDS
    manifest.id = update.id;
    manifest.runtimeVersion = update.runtimeVersion;
    // createdAt should be timestamp (number), not ISO string
    manifest.createdAt = update.publishedAt 
      ? new Date(update.publishedAt).getTime() 
      : new Date(update.createdAt).getTime();

    // Ensure assets array exists
    if (!Array.isArray(manifest.assets)) {
      return NextResponse.json(
        { error: 'Invalid manifest: assets missing' },
        { status: 500 }
      );
    }

    // Ensure launchAsset
    manifest.launchAsset =
      manifest.launchAsset ||
      manifest.assets.find((a: any) => a.key === 'bundle');

    if (!manifest.launchAsset) {
      return NextResponse.json(
        { error: 'Invalid manifest: launchAsset missing' },
        { status: 500 }
      );
    }

    // 🚨 HARD REQUIREMENTS
    manifest.launchAsset.contentType = 'application/octet-stream';

    console.log('📦 Returning update:', {
      id: manifest.id,
      bundle: manifest.launchAsset.url,
      hash: manifest.launchAsset.hash,
    });

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
