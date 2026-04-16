import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const OUTREACH_CONFIG_SINGLETON_KEY = "default" as const;

const toneValues = ["professional", "casual", "direct"] as const;

const outreachConfigSchema = new Schema(
  {
    singleton_key: {
      type: String,
      required: true,
      default: OUTREACH_CONFIG_SINGLETON_KEY,
      immutable: true,
    },
    global_context: { type: String, default: "" },
    tone: {
      type: String,
      enum: toneValues,
      default: "professional",
    },
    daily_linkedin_limit: {
      type: Number,
      default: 20,
      min: 1,
      max: 50,
    },
    updated_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: "OutreachConfigs" }
);

outreachConfigSchema.index({ singleton_key: 1 }, { unique: true });

export type OutreachTone = (typeof toneValues)[number];

/** API / client shape for the singleton outreach settings document. */
export type OutreachConfigDTO = {
  global_context: string;
  tone: OutreachTone;
  daily_linkedin_limit: number;
  updated_at: string | null;
};

export type OutreachConfigDocument = InferSchemaType<typeof outreachConfigSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type OutreachConfigModel = Model<OutreachConfigDocument>;

export const OutreachConfig: OutreachConfigModel =
  (mongoose.models.OutreachConfig as OutreachConfigModel | undefined) ??
  mongoose.model<OutreachConfigDocument>("OutreachConfig", outreachConfigSchema);
