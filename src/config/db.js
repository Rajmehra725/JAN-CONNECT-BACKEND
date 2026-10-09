const mongoose = require("mongoose");
const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGODB_URI ||
      "mongodb+srv://infosystem:Rajd2003@cluster0.u0le37x.mongodb.net/test?retryWrites=true&w=majority";

    console.log("Connecting to MongoDB...");

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log("✅ MongoDB Connected");
    console.log("Host:", conn.connection.host);

    // Safe backward-compatible migration for legacy user documents
    try {
      const usersCollection = conn.connection.db.collection("users");
      const legacyUsers = await usersCollection.find({
        $or: [
          { mobileNumber: { $exists: false } },
          { mobileNumber: null },
          { role: "user" }
        ]
      }).toArray();

      for (const lu of legacyUsers) {
        const updateDoc = {};
        if (!lu.mobileNumber && lu.phone) {
          updateDoc.mobileNumber = String(lu.phone).trim();
        }
        if (lu.role === "user") {
          updateDoc.role = "CITIZEN";
        }
        if (!lu.accountStatus) {
          updateDoc.accountStatus = "ACTIVE";
        }
        if (Object.keys(updateDoc).length > 0) {
          await usersCollection.updateOne({ _id: lu._id }, { $set: updateDoc });
          console.log(`[Migration] Migrated legacy user record ${lu._id} to standard schema.`);
        }
      }

      // Drop obsolete legacy unique index on 'phone' if present
      const existingIndexes = await usersCollection.indexes();
      const hasLegacyPhoneIndex = existingIndexes.some(idx => idx.name === 'phone_1');
      if (hasLegacyPhoneIndex) {
        await usersCollection.dropIndex('phone_1');
        console.log('[Migration] Dropped obsolete legacy phone_1 unique index.');
      }
    } catch (migErr) {
      console.warn("[Migration Warning] Non-critical schema migration check:", migErr.message);
    }

    return conn;
  } catch (error) {
    console.error("❌ MongoDB Error:", error.message);
    throw error;
  }
};

module.exports = { connectDB, mongoose };