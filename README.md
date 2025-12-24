# Lumfin OTA Update Server 🚀

Over-the-air update server for Lumfin mobile app built with Next.js, MongoDB, and Vercel Blob Storage.

## Features

- ✅ Next.js API routes for update checking
- ✅ MongoDB for update metadata storage
- ✅ Vercel Blob Storage for bundle/asset storage
- ✅ Publishing CLI script
- ✅ Support for multiple channels (development, staging, production)
- ✅ Support for iOS and Android platforms

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.local` and update the values:

```bash
# MongoDB Connection (already configured)
MONGODB_URI=mongodb+srv://...

# Vercel Blob Storage Token (get from Vercel dashboard)
BLOB_READ_WRITE_TOKEN=vercel_blob_token_here

# Public URL (update after deployment)
NEXT_PUBLIC_URL=http://localhost:3000

# Expo Project Path
EXPO_PROJECT_PATH=../lumfin_mobile
```

### 3. Get Vercel Blob Storage Token

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to Storage → Blob
3. Create a new Blob store (or use existing)
4. Copy the `BLOB_READ_WRITE_TOKEN`
5. Add it to `.env.local`

## Development

### Run Development Server

```bash
npm run dev
```

Server will run on `http://localhost:3000`

### Test API Endpoint

```bash
curl "http://localhost:3000/api/updates?runtimeVersion=1.0.0&platform=ios&channel=production"
```

## Publishing Updates

### Prerequisites

1. Make sure your Expo app is built and ready
2. Ensure `EXPO_PROJECT_PATH` in `.env.local` points to your Expo project
3. Have Vercel Blob Storage token configured

### Publish Command

```bash
npm run publish -- \
  --channel=production \
  --platform=ios \
  --runtime-version=1.0.0 \
  --message="Bug fix: Fixed login issue"
```

**Parameters:**
- `--channel`: `development`, `staging`, or `production`
- `--platform`: `ios` or `android`
- `--runtime-version`: Must match your app's runtime version (e.g., `1.0.0`)
- `--message`: Optional description of the update

### What Happens When You Publish

1. ✅ Exports Expo bundle for the specified platform
2. ✅ Calculates SHA256 hash of bundle
3. ✅ Uploads bundle to Vercel Blob Storage
4. ✅ Uploads all assets (images, fonts, etc.)
5. ✅ Creates manifest with all asset URLs
6. ✅ Saves update record to MongoDB
7. ✅ Returns update ID and URLs

## Configure Your Expo App

Update `app.config.ts` in your Expo project:

```typescript
export default () => {
  const envConfig = getEnvConfig();
  const IS_DEV = envConfig.env === 'development';
  const IS_STAGING = envConfig.env === 'staging';
  const IS_PROD = envConfig.env === 'production';

  return {
    expo: {
      // ... existing config
      
      updates: {
        enabled: true,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
        url: IS_PROD
          ? 'https://lumfin-ota-server.vercel.app/api'
          : IS_STAGING
          ? 'https://lumfin-ota-server-staging.vercel.app/api'
          : 'https://lumfin-ota-server-dev.vercel.app/api',
      },
      
      runtimeVersion: {
        policy: 'appVersion',
      },
    }
  };
};
```

## Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Deploy

```bash
vercel
```

### 3. Set Environment Variables

In Vercel Dashboard:
- Go to your project → Settings → Environment Variables
- Add:
  - `MONGODB_URI`
  - `BLOB_READ_WRITE_TOKEN`
  - `NEXT_PUBLIC_URL` (your Vercel deployment URL)
  - `EXPO_PROJECT_PATH`

### 4. Update Expo App Config

Update `app.config.ts` with your Vercel deployment URL.

## API Reference

### GET /api/updates

Check for available updates.

**Query Parameters:**
- `runtimeVersion` (required): App's runtime version
- `platform` (required): `ios` or `android`
- `channel` (optional): `development`, `staging`, or `production` (default: `production`)

**Response:**

```json
{
  "update": {
    "id": "abc123...",
    "createdAt": 1705315200000,
    "runtimeVersion": "1.0.0",
    "manifest": {
      "id": "abc123...",
      "createdAt": 1705315200000,
      "runtimeVersion": "1.0.0",
      "assets": [
        {
          "hash": "sha256:...",
          "key": "bundle",
          "contentType": "application/javascript",
          "url": "https://..."
        }
      ]
    }
  }
}
```

If no update available:
```json
{
  "update": null
}
```

## Database Schema

Updates are stored in MongoDB with the following structure:

```typescript
{
  id: string;                    // Unique update ID
  runtimeVersion: string;         // e.g., "1.0.0"
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
  };
  message?: string;
  createdAt: Date;
  publishedAt?: Date;
}
```

## Troubleshooting

### "Bundle not found" Error

- Ensure `EXPO_PROJECT_PATH` in `.env.local` is correct
- Run `npx expo export` manually in your Expo project first

### "BLOB_READ_WRITE_TOKEN is not set"

- Get token from Vercel Dashboard → Storage → Blob
- Add to `.env.local`

### "MongoDB connection failed"

- Check `MONGODB_URI` in `.env.local`
- Ensure MongoDB Atlas allows connections from your IP (or 0.0.0.0/0 for development)

## License

Private - Lumfin Internal Use Only

