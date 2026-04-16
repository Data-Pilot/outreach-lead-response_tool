import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const leadStatuses = [
  "fetched",
  "reviewed",
  "sent",
  "bounced",
  "replied",
  "meeting_set",
] as const;

const variationsSchema = new Schema(
  {
    a: { type: String, default: "" },
    b: { type: String, default: "" },
    c: { type: String, default: "" },
  },
  { _id: false }
);

const leadSchema = new Schema(
  {
    apollo_person_id: { type: String, trim: true, default: "", index: true },
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    company: { type: String, trim: true, default: "" },
    linkedin_url: { type: String, trim: true, default: "" },
    company_size: { type: String, trim: true, default: "" },
    industry: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    variations: { type: variationsSchema, default: () => ({}) },
    approved_variation: { type: String, default: "" },
    status: {
      type: String,
      enum: leadStatuses,
      default: "fetched",
    },
    campaign_id: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: "Leads" }
);

export type LeadStatus = (typeof leadStatuses)[number];
export type LeadDocument = InferSchemaType<typeof leadSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type LeadModel = Model<LeadDocument>;

/**
 * Next.js dev (HMR) can keep `mongoose.models.Lead` from an older compile that did
 * not include newer paths. Re-registering avoids upsert filter errors like
 * Path "apollo_person_id" is not in schema … upsert is true.
 */
if (mongoose.models.Lead) {
  delete mongoose.models.Lead;
}

export const Lead: LeadModel = mongoose.model<LeadDocument>(
  "Lead",
  leadSchema
);
