import mongoose, { InferSchemaType, Model } from 'mongoose';

const minesGameSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    betAmount: { type: Number, required: true },
    mineCount: { type: Number, required: true },
    gridSize: { type: Number, required: true },
    revealedTiles: { type: [Number], default: [] },
    minesPositions: { type: [Number], required: true },
    multiplier: { type: Number, default: 1 },
    payout: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'lost', 'won', 'cashed_out', 'forced_end'],
      default: 'active',
      index: true
    },
    serverSeed: { type: String, required: true },
    hashedServerSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

export type MinesGameDoc = InferSchemaType<typeof minesGameSchema> & { _id: mongoose.Types.ObjectId };

export const MinesGameModel: Model<MinesGameDoc> =
  (mongoose.models.MinesGame as Model<MinesGameDoc>) ||
  mongoose.model<MinesGameDoc>('MinesGame', minesGameSchema);
