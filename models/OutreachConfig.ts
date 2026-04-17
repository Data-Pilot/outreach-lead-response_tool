import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** @deprecated — kept only for backwards-compat reads during migration */
export const OUTREACH_CONFIG_SINGLETON_KEY = "default" as const;

const toneValues = ["professional", "casual", "direct"] as const;

const outreachConfigSchema = new Schema(
  {
    /**
     * Per-user config: unique index on `user_id` is declared below.
     * Legacy rows have user_id = "" and singleton_key = "default".
     */
    user_id: {
      type: String,
      default: "",
    },
    singleton_key: {
      type: String,
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

// Unique per user — one config document per user_id
outreachConfigSchema.index({ user_id: 1 }, { unique: true });

export type OutreachTone = (typeof toneValues)[number];

/** API / client shape for the outreach settings document. */
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

/**
 * Next.js dev (HMR) can keep `mongoose.models.OutreachConfig` from an older compile
 * that did not include `user_id`. Re-registering avoids upsert errors like
 * Path "user_id" is not in schema … upsert is `true`.
 */
if (mongoose.models.OutreachConfig) {
  delete mongoose.models.OutreachConfig;
}

export const OutreachConfig: OutreachConfigModel =
  mongoose.model<OutreachConfigDocument>("OutreachConfig", outreachConfigSchema);
