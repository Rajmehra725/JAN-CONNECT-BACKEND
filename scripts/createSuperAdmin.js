require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../src/config/db');
const User = require('../src/models/User');
const { logAudit } = require('../src/services/audit.service');

function askQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createSuperAdmin() {
  console.log('====================================================');
  console.log('  जन कनेक्ट (JAN CONNECT) - Super Admin Bootstrap CLI');
  console.log('====================================================\n');

  let conn;
  try {
    conn = await connectDB();
  } catch (dbErr) {
    console.error('❌ डेटाबेस से संपर्क नहीं हो सका। कृपया MongoDB सेवा और क्रेडेंशियल्स जाँचें।');
    console.error('   त्रुटि विवरण:', dbErr.message);
    process.exit(1);
  }

  // Prevent duplicate primary Super Admin
  const existingAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
  if (existingAdmin) {
    console.log(`⚠️  चेतावनी: मुख्य सुपर एडमिन खाता पहले से मौजूद है (मोबाइल: ${existingAdmin.mobileNumber})।`);
    console.log('सुरक्षा कारणों से केवल एक प्राथमिक सुपर एडमिन खाता अनुमत है।');
    await mongoose.disconnect();
    process.exit(0);
  }

  let fullName = process.env.SUPER_ADMIN_NAME || process.argv[2];
  let mobileNumber = process.env.SUPER_ADMIN_MOBILE || process.argv[3];
  let password = process.env.SUPER_ADMIN_PASSWORD || process.argv[4];
  let confirmPassword = process.env.SUPER_ADMIN_CONFIRM_PASSWORD || process.argv[5];

  // If not supplied via env or args, prompt interactively
  if (!fullName || !mobileNumber || !password) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (!fullName) {
      fullName = await askQuestion(rl, 'प्रशासक का पूरा नाम (Full Name) दर्ज करें: ');
    }
    if (!mobileNumber) {
      mobileNumber = await askQuestion(rl, '10 अंकों का मोबाइल नंबर (Mobile Number) दर्ज करें: ');
    }
    if (!password) {
      password = await askQuestion(rl, 'सुरक्षित पासवर्ड (Password) दर्ज करें (न्यूनतम 6 अक्षर): ');
    }
    if (!confirmPassword) {
      confirmPassword = await askQuestion(rl, 'पासवर्ड की पुष्टि करें (Confirm Password): ');
    }

    rl.close();
  } else if (!confirmPassword) {
    confirmPassword = password;
  }

  fullName = String(fullName || '').trim();
  if (!fullName) {
    console.error('❌ त्रुटि: प्रशासक का नाम अनिवार्य है।');
    await mongoose.disconnect();
    process.exit(1);
  }

  let cleanMobile = String(mobileNumber || '').trim().replace(/^(\+91|91|0)/, '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(cleanMobile)) {
    console.error('❌ त्रुटि: कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें।');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!password || password.length < 6) {
    console.error('❌ त्रुटि: पासवर्ड न्यूनतम 6 अक्षरों का होना चाहिए।');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (password !== confirmPassword) {
    console.error('❌ त्रुटि: पासवर्ड और पासवर्ड पुष्टि (Confirm Password) मेल नहीं खाते।');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Check if mobile already exists
  const existingUser = await User.findOne({ mobileNumber: cleanMobile });
  if (existingUser) {
    console.error(`❌ त्रुटि: मोबाइल नंबर [${cleanMobile}] पहले से पंजीकृत है (भूमिका: ${existingUser.role})।`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\nनया सुपर एडमिन खाता बनाया जा रहा है...');
  console.log(`- प्रशासक नाम: ${fullName}`);
  console.log(`- मोबाइल नंबर: ${cleanMobile}`);

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const superAdmin = new User({
    fullName,
    mobileNumber: cleanMobile,
    passwordHash,
    role: 'SUPER_ADMIN',
    accountStatus: 'ACTIVE',
    preferredLanguage: 'HINDI'
  });

  await superAdmin.save();

  await logAudit({
    userId: superAdmin._id,
    userRole: 'SUPER_ADMIN',
    action: 'SUPER_ADMIN_BOOTSTRAP',
    resourceType: 'User',
    resourceId: superAdmin._id,
    ipAddress: '127.0.0.1',
    userAgent: 'CLI_BOOTSTRAP_SCRIPT',
    details: { mobileNumber: cleanMobile }
  });

  console.log('\n✅ सुपर एडमिन खाता सफलतापूर्वक बन गया है!');
  console.log(`खाता विवरण:`);
  console.log(`- नाम: ${fullName}`);
  console.log(`- मोबाइल: ${cleanMobile}`);
  console.log(`- भूमिका: SUPER_ADMIN`);
  console.log(`- स्थिति: ACTIVE`);
  console.log(`🔒 सुरक्षा सूचना: पासवर्ड सुरक्षित रूप से हैश (Bcrypt) करके संग्रहीत किया गया है।`);
  console.log(`लॉगिन करने हेतु http://localhost:3000/login पर जाएँ।\n`);

  await mongoose.disconnect();
  process.exit(0);
}

createSuperAdmin().catch(async (err) => {
  console.error('❌ त्रुटि:', err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
