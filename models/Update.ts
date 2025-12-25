import mongoose from 'mongoose';

interface IAsset {
  hash: string;
  key: string;
  contentType: string;
  url: string;
}

interface IManifest {
  id: string;                 // UUID (immutable)
  createdAt: string;          // ISO string (commitTime)
  runtimeVersion: string;
  assets: IAsset[];
  launchAsset: IAsset;
  metadata?: Record<string, any>;
  extra?: Record<string, any>;
}

interface IUpdate extends mongoose.Document {
  runtimeVersion: string;
  platform: 'ios' | 'android';
  channel: 'development' | 'staging' | 'production';
  status: 'draft' | 'published' | 'rolled_back';

  /** Expo critical */
  commitTime: Date;           // UNIQUE per publish
  manifest: IManifest;        // IMMUTABLE after publish

  message?: string;
  createdAt: Date;
}

const UpdateSchema = new mongoose.Schema(
  {
    runtimeVersion: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    channel: {
      type: String,
      enum: ['development', 'staging', 'production'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'rolled_back'],
      default: 'draft',
    },

    /** Expo critical fields */
    commitTime: { type: Date, required: true },
    manifest: { type: mongoose.Schema.Types.Mixed, required: true },

    message: String,
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

/**
 * Fetch latest update fast
 */
UpdateSchema.index({
  runtimeVersion: 1,
  platform: 1,
  channel: 1,
  status: 1,
  commitTime: -1,
});

/**
 * Prevent duplicate commits per scope
 */
UpdateSchema.index(
  {
    runtimeVersion: 1,
    platform: 1,
    channel: 1,
    commitTime: 1,
  },
  { unique: true }
);

export const Update =
  mongoose.models.Update ||
  mongoose.model<IUpdate>('Update', UpdateSchema);
