import mongoose, { InferSchemaType, Model } from 'mongoose';

const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

export type PlatformSettingDoc = InferSchemaType<typeof platformSettingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PlatformSettingModel: Model<PlatformSettingDoc> =
  (mongoose.models.PlatformSetting as Model<PlatformSettingDoc>) ||
  mongoose.model<PlatformSettingDoc>('PlatformSetting', platformSettingSchema);
