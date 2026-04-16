import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    linkedin_sub: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },
    last_login_at: { type: Date, default: () => new Date() },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: "Users" }
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type UserModel = Model<UserDocument>;

export const User: UserModel =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);
