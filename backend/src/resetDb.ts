import "dotenv/config";
import mongoose from "mongoose";

async function reset() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is missing. Add it to backend/.env or set it in the shell.");
  }

  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not established.");
  }
  const collections = await db.collections();
  for (const collection of collections) {
    await collection.drop();
    console.log("Dropped:", collection.collectionName);
  }

  await mongoose.disconnect();
  console.log("✅ Database cleared");
}

reset().catch((e) => {
  console.error(e);
  process.exit(1);
});
