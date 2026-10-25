const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function auditDB() {
  const mongoUri = process.env.MONGODB_URI || "mongodb+srv://infosystem:Rajd2003@cluster0.u0le37x.mongodb.net/test?retryWrites=true&w=majority";
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  console.log("Existing Collections:", collections.map(c => c.name));

  const usersColl = db.collection('users');
  const totalUsers = await usersColl.countDocuments();
  console.log("Total Users in DB:", totalUsers);

  // Group by role
  const roleCounts = await usersColl.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } }
  ]).toArray();
  console.log("User Counts by Role:", roleCounts);

  // Group by status
  const statusCounts = await usersColl.aggregate([
    { $group: { _id: "$accountStatus", count: { $sum: 1 } } }
  ]).toArray();
  console.log("User Counts by Status:", statusCounts);

  // Users with / without mobileNumber
  const usersWithMobile = await usersColl.countDocuments({ mobileNumber: { $exists: true, $ne: null, $ne: "" } });
  const usersWithDesignation = await usersColl.countDocuments({ designation: { $exists: true, $ne: null, $ne: "" } });
  const usersWithDistrict = await usersColl.countDocuments({ district: { $exists: true, $ne: null, $ne: "" } });
  const usersWithWard = await usersColl.countDocuments({ wardNumber: { $exists: true, $ne: null, $ne: "" } });

  console.log("Users with mobileNumber:", usersWithMobile);
  console.log("Users with designation:", usersWithDesignation);
  console.log("Users with district:", usersWithDistrict);
  console.log("Users with wardNumber:", usersWithWard);

  // Complaints count
  const complaintsColl = db.collection('complaints');
  const totalComplaints = await complaintsColl.countDocuments();
  console.log("Total Complaints in DB:", totalComplaints);

  // Sample user record fields
  const sampleUser = await usersColl.findOne({});
  if (sampleUser) {
    const sanitizedSample = { ...sampleUser };
    delete sanitizedSample.passwordHash;
    console.log("Sample User Document Keys:", Object.keys(sanitizedSample));
  }

  await mongoose.disconnect();
}

auditDB().catch(err => {
  console.error("Audit error:", err.message);
  process.exit(1);
});
