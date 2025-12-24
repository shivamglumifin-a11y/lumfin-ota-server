import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Update } from '@/models/Update';

export async function GET(request: NextRequest) {
  try {
    // Connect to MongoDB
    await connectDB();

    // Get query parameters
    console.log('🔍 Request url:', request.url);
    console.log('🔍 Request:', request);

    const searchParams = request.nextUrl.searchParams;
    
    // Expo Updates sends these as HEADERS, not query params!
    // Read from headers first, then fallback to query params
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
      queryParams: Object.fromEntries(searchParams.entries()),
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
      // Also check what updates exist in the database for debugging
      const availableUpdates = await Update.find({
        platform,
        status: 'published',
      })
        .select('id runtimeVersion channel platform publishedAt')
        .sort({ publishedAt: -1 })
        .limit(5)
        .lean() as any[];
      console.log('📋 Available updates in database:', JSON.stringify(availableUpdates, null, 2));
      return NextResponse.json({ update: null });
    }

    const updateData = update as any;
    console.log('✅ Update found:', {
      id: updateData.id,
      runtimeVersion: updateData.runtimeVersion,
      platform: updateData.platform,
      channel: updateData.channel,
      publishedAt: updateData.publishedAt,
    });

    // Return update manifest in Expo's expected format
    return NextResponse.json({
      update: {
        id: updateData.id,
        createdAt: updateData.manifest.createdAt,
        runtimeVersion: updateData.runtimeVersion,
        manifest: updateData.manifest,
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

