import mongoose from 'mongoose';

interface IAsset {
  hash: string;
  key: string;
  contentType: string;
  url: string;
}

interface IManifest {
  id: string;
  createdAt: number;
  runtimeVersion: string;
  assets: IAsset[];
}

interface IUpdate extends mongoose.Document {
  id: string;
  runtimeVersion: string;
  platform: 'ios' | 'android';
  channel: 'development' | 'staging' | 'production';
  status: 'draft' | 'published' | 'rolled_back';
  manifest: IManifest;
  message?: string;
  createdAt: Date;
  publishedAt?: Date;
}

const UpdateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  runtimeVersion: { type: String, required: true },
  platform: { type: String, enum: ['ios', 'android'], required: true },
  channel: { 
    type: String, 
    enum: ['development', 'staging', 'production'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['draft', 'published', 'rolled_back'], 
    default: 'draft' 
  },
  manifest: { type: mongoose.Schema.Types.Mixed, required: true },
  message: { type: String },
  createdAt: { type: Date, default: Date.now },
  publishedAt: { type: Date },
});

// Index for fast lookups
UpdateSchema.index({ 
  runtimeVersion: 1, 
  platform: 1, 
  channel: 1, 
  status: 1 
});

UpdateSchema.index({ publishedAt: -1 });

export const Update = mongoose.models.Update || mongoose.model<IUpdate>('Update', UpdateSchema);

