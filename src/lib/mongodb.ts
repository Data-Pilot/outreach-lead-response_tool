import mongoose from "mongoose";

const globalForMongoose = globalThis as typeof globalThis & {
  __mongooseConnPromise?: Promise<typeof mongoose>;
};

export async function connectToMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }
  if (!globalForMongoose.__mongooseConnPromise) {
    globalForMongoose.__mongooseConnPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }
  await globalForMongoose.__mongooseConnPromise;
  return mongoose.connection;
}
