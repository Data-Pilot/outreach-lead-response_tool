import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const campaignStatuses = ["draft", "sending", "complete"] as const;

const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Mongo `Users` document — set on create; legacy campaigns may omit. */
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    filters: { type: Schema.Types.Mixed, default: () => ({}) },
    total_leads: { type: Number, default: 0, min: 0 },
    sent_count: { type: Number, default: 0, min: 0 },
    reply_count: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: campaignStatuses,
      default: "draft",
    },
    /** Campaign-level email template (subject + body with placeholders) */
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    /** Instantly.ai campaign id returned on send */
    instantly_campaign_id: { type: String, default: "" },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: "Campaigns" }
);

export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignDocument = InferSchemaType<typeof campaignSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type CampaignModel = Model<CampaignDocument>;

export const Campaign: CampaignModel =
  (mongoose.models.Campaign as CampaignModel | undefined) ??
  mongoose.model<CampaignDocument>("Campaign", campaignSchema);
