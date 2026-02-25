import mongoose, { InferSchemaType, Model } from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['player', 'admin', 'owner'], default: 'player' },
    minesBanned: { type: Boolean, default: false },
    balance: { type: Number, default: 0 },
    totalWagered: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    vipPoints: { type: Number, default: 0 },
    dailyReward: { type: Number, default: 10 },
    lastDailyClaimedAt: { type: Date, default: null },
    vipTier: { type: String, default: 'Bronze' },
    rakebackBalance: { type: Number, default: 0 },
    levelProgress: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    clientSeed: { type: String, default: 'default-client-seed' },
    nonce: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

export const UserModel: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) || mongoose.model<UserDoc>('User', userSchema);
