import mongoose, { InferSchemaType, Model } from 'mongoose';

const diceGameSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    betAmount: { type: Number, required: true },
    target: { type: Number, required: true },
    isOver: { type: Boolean, required: true },
    roll: { type: Number, required: true },
    winChance: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    payout: { type: Number, default: 0 },
    status: { type: String, enum: ['won', 'lost'], required: true, index: true },
    serverSeed: { type: String, required: true },
    hashedServerSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

export type DiceGameDoc = InferSchemaType<typeof diceGameSchema> & { _id: mongoose.Types.ObjectId };

export const DiceGameModel: Model<DiceGameDoc> =
  (mongoose.models.DiceGame as Model<DiceGameDoc>) ||
  mongoose.model<DiceGameDoc>('DiceGame', diceGameSchema);
