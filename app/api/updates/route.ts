import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

export async function GET(request: NextRequest) {
  try {
    // Connect to MongoDB
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    
    // Expo Updates sends these as HEADERS, not query params!
    const runtimeVersion = request.headers.get('expo-runtime-version')
      || searchParams.get('runtimeVersion')
      || request.headers.get('expo-current-update-id');
      
    const platform = request.headers.get('expo-platform')
      || searchParams.get('platform')
      || (request.headers.get('user-agent')?.toLowerCase().includes('android') ? 'android' : null)
      || (request.headers.get('user-agent')?.toLowerCase().includes('ios') ? 'ios' : null);
      
    const channel = request.headers.get('expo-channel-name')
      || searchParams.get('channel')
      || 'production';

    console.log('📱 Update check request:', {
      runtimeVersion,
      platform,
      channel,
      url: request.url,
    });

    // Validate parameters
    if (!runtimeVersion || !platform) {
      return NextResponse.json(
        { error: 'Missing runtimeVersion or platform' },
        { status: 400 }
      );
    }

    if (!['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be ios or android' },
        { status: 400 }
      );
    }

    // Find latest published update
    const update = await Update.findOne({
      runtimeVersion,
      platform,
      channel,
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .lean();

    if (!update) {
      console.log('❌ No update found for:', { runtimeVersion, platform, channel });
      return NextResponse.json({ update: null });
    }

    const updateData = update as any;
    console.log('✅ Update found:', {
      id: updateData.id,
      runtimeVersion: updateData.runtimeVersion,
      platform: updateData.platform,
      channel: updateData.channel,
    });

    // Get manifest and ensure createdAt is ISO string
    let manifest = updateData.manifest;
    
    // Convert createdAt from timestamp to ISO string if needed
    if (typeof manifest.createdAt === 'number') {
      manifest.createdAt = new Date(manifest.createdAt).toISOString();
    } else if (manifest.createdAt instanceof Date) {
      manifest.createdAt = manifest.createdAt.toISOString();
    }

    // Ensure manifest has launchAsset
    if (!manifest.launchAsset && manifest.assets && manifest.assets.length > 0) {
      manifest.launchAsset = manifest.assets.find((asset: any) => asset.key === 'bundle') || manifest.assets[0];
    }

    // Return in Expo's expected format: manifest nested inside update
    const response = {
      update: {
        id: updateData.id,
        createdAt: typeof updateData.publishedAt === 'number' 
          ? new Date(updateData.publishedAt).toISOString()
          : updateData.publishedAt instanceof Date
          ? updateData.publishedAt.toISOString()
          : updateData.publishedAt,
        runtimeVersion: updateData.runtimeVersion,
        manifest: manifest, // ✅ Manifest nested inside update
      },
    };

    console.log('📤 Returning update response with nested manifest');

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
      },
    });
  } catch (error) {
    console.error('❌ Error fetching update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}