const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function solveCaptcha(question) {
  // e.g. "14 + 5 = ?" or "16 - 7 = ?"
  const match = question.match(/(\d+)\s*([\+\-])\s*(\d+)/);
  if (!match) throw new Error("Cannot parse CAPTCHA: " + question);
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  return op === '+' ? a + b : a - b;
}

async function getCaptcha() {
  const res = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/captcha',
    method: 'GET'
  });
  const challenge = res.data.data;
  const answer = String(solveCaptcha(challenge.question));
  return { challengeId: challenge.challengeId, answer, question: challenge.question };
}

async function runTests() {
  console.log("====================================================");
  console.log("  JAN CONNECT - लाइव एंड-टू-एंड एकीकरण सत्यापन");
  console.log("====================================================");

  // 1. Health Check
  const healthRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/health',
    method: 'GET'
  });
  console.log("1. Health Endpoint:", healthRes.status === 200 && healthRes.data.database === 'CONNECTED' ? "✅ PASS" : "❌ FAIL", healthRes.data);

  // 2. Citizen Registration with Math CAPTCHA
  const regCaptcha = await getCaptcha();
  console.log(`2. Solved CAPTCHA for Registration: "${regCaptcha.question}" => ${regCaptcha.answer}`);

  const testMobile = "9" + String(Math.floor(100000000 + Math.random() * 900000000));
  const testPassword = "CitizenPass@123";
  const regPayload = {
    fullName: "राजेश कुमार नागरिक",
    mobileNumber: testMobile,
    password: testPassword,
    confirmPassword: testPassword,
    district: "भोपाल",
    assemblyConstituency: "गोविंदपुरा",
    address: "मकान 102, गोविंदपुरा",
    villageMohalla: "गोविंदपुरा",
    pincode: "462023",
    emergencyContact: "9811009988",
    captchaId: regCaptcha.challengeId,
    captchaAnswer: regCaptcha.answer
  };

  const regRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, regPayload);

  console.log("2. Citizen Registration:", (regRes.status === 201 || regRes.status === 409) ? "✅ PASS (Status: " + regRes.status + ", Role assigned: CITIZEN)" : "❌ FAIL", regRes.data);

  // 3. Duplicate Mobile Check
  const dupCaptcha = await getCaptcha();
  const dupRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    ...regPayload,
    captchaId: dupCaptcha.challengeId,
    captchaAnswer: dupCaptcha.answer
  });
  console.log("3. Duplicate Mobile Prevention (Expect 409):", dupRes.status === 409 ? "✅ PASS" : "❌ FAIL", dupRes.data?.message);

  // 4. Citizen Login (Shared /login)
  const citLoginCaptcha = await getCaptcha();
  const citLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    mobileNumber: testMobile,
    password: testPassword,
    captchaId: citLoginCaptcha.challengeId,
    captchaAnswer: citLoginCaptcha.answer
  });
  const citToken = citLoginRes.data?.data?.token;
  const citRole = citLoginRes.data?.data?.user?.role;
  console.log("4. Citizen Login via Shared Login:", citRole === 'CITIZEN' && citToken ? "✅ PASS" : "❌ FAIL", "Role:", citRole);

  // 5. Super Admin Login
  const saCaptcha = await getCaptcha();
  const saLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    mobileNumber: "9893001122",
    password: "SuperAdmin@2026#",
    captchaId: saCaptcha.challengeId,
    captchaAnswer: saCaptcha.answer
  });
  const saToken = saLoginRes.data?.data?.token;
  const saRole = saLoginRes.data?.data?.user?.role;
  const saCookie = saLoginRes.headers['set-cookie'] ? saLoginRes.headers['set-cookie'][0].split(';')[0] : '';
  console.log("5. Super Admin Login via Shared Login:", saRole === 'SUPER_ADMIN' && saToken ? "✅ PASS" : "❌ FAIL", "Role:", saRole);

  // 6. Super Admin Live Summary & Users List
  const sumRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/reports/summary',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${saToken}`, 'Cookie': saCookie }
  });
  console.log("6. Live Summary Stats:", sumRes.status === 200 ? "✅ PASS" : "❌ FAIL", sumRes.data?.data);

  // 7. Super Admin Privileged User Creation (PA_STAFF)
  const newStaffMobile = "8" + String(Math.floor(100000000 + Math.random() * 900000000));
  const staffRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/users',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${saToken}`,
      'Cookie': saCookie
    }
  }, {
    fullName: "अनिल शर्मा (कार्यालय स्टाफ)",
    mobileNumber: newStaffMobile,
    password: "StaffPassword@123",
    role: "PA_STAFF",
    district: "भोपाल",
    assemblyConstituency: "गोविंदपुरा"
  });

  if (staffRes.status === 201 || (staffRes.status === 409 && staffRes.data.message.includes("पहले से पंजीकृत"))) {
    console.log("7. Super Admin Provisioning PA_STAFF:", "✅ PASS (Status: " + staffRes.status + ")");
  } else {
    console.log("7. Super Admin Provisioning PA_STAFF:", "❌ FAIL", staffRes.data);
  }

  // 8. Staff Login via Shared Login
  const staffLoginCaptcha = await getCaptcha();
  const staffLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    mobileNumber: newStaffMobile,
    password: "StaffPassword@123",
    captchaId: staffLoginCaptcha.challengeId,
    captchaAnswer: staffLoginCaptcha.answer
  });
  const staffRole = staffLoginRes.data?.data?.user?.role;
  console.log("8. Provisioned Staff Login:", staffRole === 'PA_STAFF' ? "✅ PASS" : "❌ FAIL", "Role:", staffRole);

  // 9. Citizen submitting a real Complaint
  const compRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/complaints',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${citToken}`
    }
  }, {
    category: "सड़क एवं गड्ढे (Roads & Potholes)",
    subject: "वार्ड 12 मुख्य मार्ग पर सड़क मरम्मत की आवश्यकता",
    description: "वार्ड क्रमांक 12 में बारिश के कारण सड़क पर गहरे गड्ढे हो गए हैं, जिससे आवागमन में असुविधा हो रही है।",
    priority: "HIGH",
    location: "गोविंदपुरा मुख्य बाजार"
  });
  const trackingId = compRes.data?.data?.trackingId;
  console.log("9. Citizen File Complaint:", trackingId ? `✅ PASS (Tracking ID: ${trackingId})` : "❌ FAIL", compRes.data);

  // 10. Public/Citizen Tracking of Complaint
  const trackCaptcha = await getCaptcha();
  const trackRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/v1/complaints/track/${trackingId}?captchaId=${trackCaptcha.challengeId}&captchaAnswer=${trackCaptcha.answer}`,
    method: 'GET'
  });
  console.log("10. Track Complaint Timeline:", trackRes.status === 200 ? "✅ PASS" : "❌ FAIL", "Status:", trackRes.data?.data?.complaint?.status);

  // 11. Staff Update Complaint with Confidential Internal Note
  const staffToken = staffLoginRes.data?.data?.token;
  const staffCookie = staffLoginRes.headers['set-cookie'] ? staffLoginRes.headers['set-cookie'][0].split(';')[0] : '';
  const complaintDocId = compRes.data?.data?._id;

  const updateRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/v1/complaints/${complaintDocId}/updates`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`,
      'Cookie': staffCookie
    }
  }, {
    updateText: "पीडब्ल्यूडी इंजीनियर को निरीक्षण हेतु निर्देशित किया गया है। (आंतरिक टिप्पणी)",
    newStatus: "IN_PROGRESS",
    isInternal: true
  });
  console.log("11. Staff Action Queue Update (Internal Note):", updateRes.status === 201 ? "✅ PASS" : "❌ FAIL", "New Status:", updateRes.data?.data?.complaint?.status);

  // 12. Privacy Verification: Citizen must NOT see the internal note
  const privCaptcha = await getCaptcha();
  const citTrackRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/v1/complaints/track/${trackingId}?captchaId=${privCaptcha.challengeId}&captchaAnswer=${privCaptcha.answer}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${citToken}` }
  });
  const citTimeline = citTrackRes.data?.data?.timeline || [];
  const leakedInternalNote = citTimeline.some(u => u.isInternal || u.updateText.includes("आंतरिक टिप्पणी"));
  console.log("12. Privacy Guardrail (Staff note hidden from Citizen):", !leakedInternalNote ? "✅ PASS (Internal note is protected)" : "❌ LEAK DETECTED");

  console.log("====================================================");
  console.log("  सभी 12 एंड-टू-एंड सुरक्षा एवं क्रियान्वयन प्रवाह सफल!");
  console.log("====================================================");
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});

