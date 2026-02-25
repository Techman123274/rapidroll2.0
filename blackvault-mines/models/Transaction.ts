import mongoose, { InferSchemaType, Model } from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['bet', 'payout', 'rakeback_claim'], required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
    gameType: { type: String, enum: ['mines', 'dice', 'vip'], default: 'mines' }
  },
  { timestamps: true }
);

export type TransactionDoc = InferSchemaType<typeof transactionSchema> & { _id: mongoose.Types.ObjectId };

export const TransactionModel: Model<TransactionDoc> =
  (mongoose.models.Transaction as Model<TransactionDoc>) ||
  mongoose.model<TransactionDoc>('Transaction', transactionSchema);
