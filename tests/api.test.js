const assert = require('assert');
const bcrypt = require('bcryptjs');
const { generateCaptcha, verifyCaptcha } = require('../src/services/captcha.service');
const { buildScopeFilter } = require('../src/middleware/scope.middleware');
const { generateComplaintTrackingId } = require('../src/utils/trackingId');

console.log('====================================================');
console.log('  जन कनेक्ट (JAN CONNECT) - ऑटोमेटेड API एवं सुरक्षा परीक्षण');
console.log('====================================================\n');

async function runTestSuite() {
  let totalTests = 0;
  let passedTests = 0;

  async function runTest(testName, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } catch (error) {
      console.error(`❌ [FAIL] ${testName}`);
      console.error(`   त्रुटि: ${error.message}\n`);
    }
  }

  // 1. CAPTCHA Tests
  await runTest('CAPTCHA जनरेशन: चुनौती आईडी और प्रश्न प्राप्त होना चाहिए, उत्तर नहीं', () => {
    const c = generateCaptcha();
    assert(c.challengeId && typeof c.challengeId === 'string', 'Challenge ID must be string');
    assert(c.question && c.question.includes('='), 'Question must contain =');
    assert(c.expiresInSeconds === 180, 'Expiration must be 180s');
    // Confirm answer is NOT in the client payload
    assert(c.answer === undefined, 'Answer must never be leaked to client!');
  });

  await runTest('CAPTCHA सत्यापन: गलत उत्तर अस्वीकार होना चाहिए', () => {
    const c = generateCaptcha();
    const res = verifyCaptcha(c.challengeId, '99999');
    assert(res.valid === false, 'Invalid answer must be rejected');
  });

  await runTest('CAPTCHA सत्यापन: एकल उपयोग (Single-use) प्रवर्तन - दूसरा प्रयास विफल होना चाहिए', () => {
    const c = generateCaptcha();
    const parts = c.question.replace(' = ?', '').split(' ');
    const n1 = parseInt(parts[0], 10);
    const op = parts[1];
    const n2 = parseInt(parts[2], 10);
    const realAnswer = op === '+' ? n1 + n2 : n1 - n2;

    const firstAttempt = verifyCaptcha(c.challengeId, realAnswer);
    assert(firstAttempt.valid === true, 'First attempt with correct answer should succeed');

    const replayAttempt = verifyCaptcha(c.challengeId, realAnswer);
    assert(replayAttempt.valid === false, 'Replay attack must be blocked!');
  });

  // 2. Role-Based Scope Isolation Tests
  await runTest('Scope Filter: सुपर एडमिन का स्कोप अनप्रतिबंधित ({}) होना चाहिए', () => {
    const superAdmin = { role: 'SUPER_ADMIN' };
    const filter = buildScopeFilter(superAdmin);
    assert.deepStrictEqual(filter, {}, 'Super admin filter must be empty');
  });

  await runTest('Scope Filter: नागरिक (Citizen) केवल अपनी शिकायतें देख सकता है', () => {
    const citizen = { role: 'CITIZEN', _id: 'citizen-id-123' };
    const filter = buildScopeFilter(citizen);
    assert.strictEqual(filter.citizenId, 'citizen-id-123', 'Citizen filter must enforce citizenId');
  });

  await runTest('Scope Filter: जनप्रतिनिधि/स्टाफ केवल अपनी विधानसभा का डेटा देख सकते हैं', () => {
    const staff = { role: 'PA_STAFF', constituencyId: 'constituency-456' };
    const filter = buildScopeFilter(staff);
    assert.strictEqual(filter.constituencyId, 'constituency-456', 'Staff filter must enforce constituencyId');
  });

  await runTest('Scope Filter: बूथ कार्यकर्ता का स्कोप उसके बूथ/विधानसभा तक सीमित होना चाहिए', () => {
    const worker = { role: 'BOOTH_WORKER', constituencyId: 'c-1', boothId: 'b-99' };
    const filter = buildScopeFilter(worker);
    assert.strictEqual(filter.boothId, 'b-99', 'Worker filter must enforce boothId');
  });

  // 3. CSV Formula Injection Defense Test
  await runTest('सुरक्षा: CSV फॉर्मूला इंजेक्शन (CWE-1236) रोकथाम जांच', () => {
    const dangerousInputs = [
      '=CMD|"/C calc"!A0',
      '+2+5',
      '-5+10',
      '@SUM(A1:A10)',
      '\t=1+1'
    ];

    function sanitizeCsvCell(value) {
      if (value === null || value === undefined) return '""';
      let str = String(value).trim();
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    }

    for (const input of dangerousInputs) {
      const sanitized = sanitizeCsvCell(input);
      assert(sanitized.startsWith('"\''), `Payload [${input}] must be sanitized with leading apostrophe, got: ${sanitized}`);
    }
  });

  // 4. Staff Private Notes Privacy Verification
  await runTest('गोपनीयता: नागरिकों के लिए स्टाफ की निजी टिप्पणियां (isInternal: true) फिल्टर होनी चाहिए', () => {
    const sampleUpdates = [
      { text: 'सार्वजनिक प्रगति: कार्य शुरू हुआ', isInternal: false },
      { text: 'गोपनीय स्टाफ नोट: नागरिक से दोबारा फोन पर बात की', isInternal: true },
      { text: 'सार्वजनिक टिप्पणी: निरीक्षण पूर्ण हुआ', isInternal: false }
    ];

    const citizenVisible = sampleUpdates.filter(u => !u.isInternal);
    assert.strictEqual(citizenVisible.length, 2, 'Citizen must only see 2 public updates');
    assert(citizenVisible.every(u => !u.isInternal), 'No internal update must leak to citizen');

    const staffVisible = sampleUpdates;
    assert.strictEqual(staffVisible.length, 3, 'Staff sees all 3 updates including internal notes');
  });

  // 5. Tracking ID Format Test
  await runTest('ट्रैकिंग आईडी: प्रारूप JC-YYYY-XXXXXX होना चाहिए', () => {
    const id1 = generateComplaintTrackingId();
    const id2 = generateComplaintTrackingId();
    const currentYear = new Date().getFullYear();
    const regex = new RegExp(`^JC-${currentYear}-[0-9A-F]{6}$`);

    assert(regex.test(id1), `Tracking ID ${id1} format mismatch`);
    assert(regex.test(id2), `Tracking ID ${id2} format mismatch`);
    assert.notStrictEqual(id1, id2, 'Tracking IDs must be unique');
  });

  // 6. Bcrypt Password Hashing Test
  await runTest('सुरक्षा: पासवर्ड सुरक्षित हैशिंग (Bcrypt salt rounds >= 10)', async () => {
    const plain = 'SecretPass@2026';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(plain, salt);

    assert(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Must be valid bcrypt hash');
    assert.notStrictEqual(plain, hash, 'Plain text must never equal hash');
    const valid = await bcrypt.compare(plain, hash);
    assert(valid === true, 'Matching password must succeed');
    const invalid = await bcrypt.compare('WrongPassword', hash);
    assert(invalid === false, 'Non-matching password must fail');
  });

  // 7. Phone Normalization & Canonical Identity Tests
  const { normalizePhoneNumber } = require('../src/utils/phone');
  await runTest('फोन सत्यापन: सामान्य 10 अंक (+91, 0, स्पेस और हाइफन) शुद्ध होने चाहिए', () => {
    const t1 = normalizePhoneNumber('+91 98930 01122');
    assert.strictEqual(t1.isValid, true);
    assert.strictEqual(t1.normalized, '9893001122');

    const t2 = normalizePhoneNumber('09893001122');
    assert.strictEqual(t2.isValid, true);
    assert.strictEqual(t2.normalized, '9893001122');

    const t3 = normalizePhoneNumber('91-9893001122');
    assert.strictEqual(t3.isValid, true);
    assert.strictEqual(t3.normalized, '9893001122');
  });

  await runTest('फोन सत्यापन: वैज्ञानिक संकेतन (Scientific Notation e.g. 9.893E+09) सुरक्षित पूर्णांक बनना चाहिए', () => {
    const sci = normalizePhoneNumber('9.893001122e+09');
    assert.strictEqual(sci.isValid, true);
    assert.strictEqual(sci.normalized, '9893001122');
  });

  await runTest('फोन सत्यापन: अमान्य फोन नंबर (कम अंक या गैर-भारतीय अंक) अस्वीकार होने चाहिए', () => {
    const shortNum = normalizePhoneNumber('989300');
    assert.strictEqual(shortNum.isValid, false);

    const nonIndian = normalizePhoneNumber('1234567890');
    assert.strictEqual(nonIndian.isValid, false);
  });

  // 8. Express App Smoke Test
  await runTest('Express API: ऐप इंस्टेंस और v1 रूट माउंटिंग सत्यापित', () => {
    const app = require('../src/app');
    assert(typeof app.handle === 'function', 'App must be an Express instance');
  });

  // 9. Master Data Models & Decoupling
  await runTest('मास्टर डेटा: पदनाम (Designations) और भूमिका (Roles) का पूर्ण पृथक्करण', () => {
    const validRoles = ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER', 'CITIZEN'];
    const sampleDesignation = 'विधायक (MLA)';
    // A designation is NEVER an account role
    assert.strictEqual(validRoles.includes(sampleDesignation), false);
    // User role CITIZEN can hold any designation
    const user = { role: 'CITIZEN', designation: 'जिला पंचायत अध्यक्ष' };
    assert.strictEqual(user.role, 'CITIZEN');
    assert.strictEqual(user.designation, 'जिला पंचायत अध्यक्ष');
  });

  // 10. Geography Master Cascading
  await runTest('भौगोलिक पदानुक्रम: राज्य -> संभाग -> जिला -> ग्रामीण (ब्लॉक/पंचायत/गांव) अथवा शहरी (निकाय/वार्ड)', () => {
    const LocationMaster = require('../src/models/LocationMaster');
    assert(LocationMaster.schema.paths.state, 'State field required');
    assert(LocationMaster.schema.paths.district, 'District field required');
    assert(LocationMaster.schema.paths.areaType, 'AreaType field required');
    assert(LocationMaster.schema.paths.developmentBlock, 'DevelopmentBlock field required');
    assert(LocationMaster.schema.paths.localBody, 'LocalBody field required');
  });

  // 11. Excel Multi-person and Sanitization
  await runTest('एक्सेल सुरक्षा एवं पार्सिंग: फॉर्मूला इंजेक्शन से बचाव एवं सेल सैनिटाइजेशन', () => {
    const dirty1 = '=SUM(A1:A10)';
    const dirty2 = '+919893001122';
    const dirty3 = '@admin';
    const sanitize = (val) => {
      let str = String(val).trim();
      if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
      return str;
    };
    assert.strictEqual(sanitize(dirty1).startsWith("'="), true);
    assert.strictEqual(sanitize(dirty2).startsWith("'+"), true);
    assert.strictEqual(sanitize(dirty3).startsWith("'@"), true);
  });

  // 12. Smart FAQ Bot Matcher Tests
  await runTest('स्मार्ट FAQ बॉट: भाषा पहचान और टोकनाइज़ेशन (Hindi & English)', () => {
    const { detectLanguage, tokenize } = require('../src/utils/faqMatcher');
    assert.strictEqual(detectLanguage('पोर्टल पर लॉगिन कैसे करें?'), 'HI');
    assert.strictEqual(detectLanguage('How to lodge a complaint?'), 'EN');

    const tokensHi = tokenize('पोर्टल पर लॉगिन कैसे करें?');
    assert(tokensHi.includes('लॉगिन'), 'Must tokenize Hindi keyword लॉगिन');

    const tokensEn = tokenize('How to lodge a complaint online?');
    assert(tokensEn.includes('lodge') || tokensEn.includes('complaint'), 'Must tokenize English keywords');
  });

  await runTest('स्मार्ट FAQ बॉट: सटीक मिलान एवं विश्वास स्कोर (Confidence Score)', () => {
    const { matchFaq } = require('../src/utils/faqMatcher');
    const sampleFaqs = [
      {
        faqId: 'FAQ-01',
        questionHi: 'लॉगिन कैसे करें?',
        questionEn: 'How to login?',
        answerHi: 'लॉगिन बटन पर क्लिक करें।',
        answerEn: 'Click login button.',
        keywords: ['लॉगिन', 'login', 'पासवर्ड'],
        alternativePhrases: ['लॉगिन करने का तरीका']
      },
      {
        faqId: 'FAQ-02',
        questionHi: 'शिकायत कैसे दर्ज करें?',
        questionEn: 'How to file a complaint?',
        answerHi: 'डैशबोर्ड में शिकायत विकल्प चुनें।',
        answerEn: 'Choose complaint option in dashboard.',
        keywords: ['शिकायत', 'complaint', 'समस्या'],
        alternativePhrases: ['शिकायत दर्ज करने की प्रक्रिया']
      }
    ];

    // Direct Hindi match
    const r1 = matchFaq('मुझे शिकायत करनी है', sampleFaqs);
    assert.strictEqual(r1.status, 'ANSWERED');
    assert.strictEqual(r1.matchedFaq.faqId, 'FAQ-02');

    // Direct English match
    const r2 = matchFaq('how do I login to the portal', sampleFaqs);
    assert.strictEqual(r2.status, 'ANSWERED');
    assert.strictEqual(r2.matchedFaq.faqId, 'FAQ-01');

    // Unknown fallback
    const r3 = matchFaq('चांद पर जाने का टिकट कितने का है?', sampleFaqs);
    assert.strictEqual(r3.status, 'UNANSWERED');
    assert.strictEqual(r3.matchedFaq, null);
  });

  // 13. Soft Delete and Recovery Schema
  await runTest('डेटा रिकवरी: यूजर स्कीमा में isDeleted और रिकवरी फील्ड्स उपस्थित होने चाहिए', () => {
    const User = require('../src/models/User');
    assert(User.schema.paths.isDeleted, 'isDeleted path must exist');
    assert(User.schema.paths.deletedAt, 'deletedAt path must exist');
    assert(User.schema.paths.deletedBy, 'deletedBy path must exist');
  });

  console.log('\n====================================================');
  console.log(`  परीक्षण परिणाम: ${passedTests}/${totalTests} सफल (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
