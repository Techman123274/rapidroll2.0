import mongoose, { InferSchemaType, Model } from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actor: { type: String, required: true },
    actorRole: { type: String, required: true },
    target: { type: String, default: '' },
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: mongoose.Types.ObjectId };

export const AuditLogModel: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ||
  mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema);
