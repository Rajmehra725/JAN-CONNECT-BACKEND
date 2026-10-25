const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Faq = require('../models/Faq');

const SEED_FAQS = [
  {
    faqId: 'FAQ-LOGIN-01',
    questionHi: 'जन कनेक्ट पोर्टल पर लॉगिन कैसे करें?',
    questionEn: 'How do I log in to the Jan Connect portal?',
    answerHi: 'लॉगिन करने के लिए ऊपर दाईं ओर "लॉगिन" बटन पर क्लिक करें। अपना 10 अंकों का पंजीकृत मोबाइल नंबर और पासवर्ड दर्ज करें। इसके बाद "लॉगिन करें" पर क्लिक करें।',
    answerEn: 'To log in, click the "Login" button on the top right. Enter your 10-digit registered mobile number and password, then click "Log In".',
    keywords: ['लॉगिन', 'login', 'साइन इन', 'signin', 'पासवर्ड', 'password', 'प्रवेश', 'मोबाइल नंबर'],
    alternativePhrases: [
      'लॉगिन कैसे होगा',
      'how to login',
      'पोर्टल में प्रवेश कैसे करें',
      'लॉग इन करने का तरीका'
    ],
    category: 'ACCOUNT_LOGIN',
    sortOrder: 1
  },
  {
    faqId: 'FAQ-REGISTER-02',
    questionHi: 'नया नागरिक खाता कैसे पंजीकृत करें?',
    questionEn: 'How to register a new citizen account?',
    answerHi: 'नया खाता बनाने के लिए "पंजीकरण" (Register) पेज पर जाएँ। अपना पूरा नाम, 10 अंकों का वैध मोबाइल नंबर दर्ज करें और अपना सुरक्षित पासवर्ड सेट करें। इसके बाद सबमिट बटन दबाएँ।',
    answerEn: 'To create a new account, visit the "Register" page. Enter your full name, valid 10-digit mobile number, and set a secure password, then click Submit.',
    keywords: ['रजिस्ट्रेशन', 'registration', 'पंजीकरण', 'साइन अप', 'signup', 'नया खाता', 'new account'],
    alternativePhrases: [
      'नया अकाउंट कैसे बनाएं',
      'how to register',
      'नागरिक पंजीकरण कैसे करें',
      'create new user'
    ],
    category: 'MEMBER_REGISTRATION',
    sortOrder: 2
  },
  {
    faqId: 'FAQ-COMPLAINT-SUBMIT-03',
    questionHi: 'पोर्टल पर जन शिकायत कैसे दर्ज करें?',
    questionEn: 'How to lodge a civic complaint on Jan Connect?',
    answerHi: 'शिकायत दर्ज करने के लिए अपने नागरिक खाते में लॉगिन करें और "नई शिकायत दर्ज करें" पर जाएँ। शिकायत का विषय, उचित श्रेणी (Category), और विस्तृत विवरण भरें। यदि आवश्यक हो तो फोटो या दस्तावेज़ संलग्न करें और सबमिट करें। आपको तुरंत एक ट्रैकिंग आईडी (जैसे CMP-xxxx) प्राप्त होगी।',
    answerEn: 'To lodge a complaint, log in to your Citizen account and navigate to "New Complaint". Select category, enter subject, write description, optionally attach photos, and submit. You will receive an instant Tracking ID (e.g., CMP-xxxx).',
    keywords: ['शिकायत', 'complaint', 'समस्या', 'problem', 'शिकायत दर्ज', 'file complaint', 'ग्रीवेंस', 'grievance'],
    alternativePhrases: [
      'शिकायत कैसे करें',
      'how to submit complaint',
      'समस्या की शिकायत कहाँ करें',
      'शिकायत दर्ज करने की प्रक्रिया'
    ],
    category: 'COMPLAINT_MANAGEMENT',
    sortOrder: 3
  },
  {
    faqId: 'FAQ-COMPLAINT-STATUS-04',
    questionHi: 'अपनी दर्ज शिकायत की स्थिति (Status) कैसे ट्रैक करें?',
    questionEn: 'How to track the status of my registered complaint?',
    answerHi: 'शिकायत की स्थिति जानने के लिए पोर्टल के "शिकायत ट्रैक करें" विकल्प पर जाएँ और अपनी ट्रैकिंग संख्या (Tracking ID) दर्ज करें। आप अपने नागरिक डैशबोर्ड में भी अपनी सभी दर्ज शिकायतों की नवीनतम स्थिति देख सकते हैं।',
    answerEn: 'To track your complaint status, go to "Track Complaint" and enter your Tracking ID. You can also view all your complaints and their live updates inside your Citizen Dashboard.',
    keywords: ['ट्रैक', 'track', 'स्थिति', 'status', 'शिकायत स्थिति', 'complaint status', 'ट्रैकिंग आईडी', 'tracking id'],
    alternativePhrases: [
      'शिकायत का स्टेटस कैसे देखें',
      'track my complaint',
      'शिकायत की जांच कैसे करें',
      'check complaint progress'
    ],
    category: 'COMPLAINT_STATUS',
    sortOrder: 4
  },
  {
    faqId: 'FAQ-DIRECTORY-05',
    questionHi: 'जनप्रतिनिधि या अधिकारी से संपर्क कैसे करें (निर्देशिका)?',
    questionEn: 'How to contact representatives or officials via directory?',
    answerHi: 'ऊपर मेनू में "निर्देशिका" (Directory) पर क्लिक करें। वहाँ आप अपने जिले, ब्लॉक, या पद (सांसद, विधायक, पार्षद, सरपंच, तहसीलदार आदि) के अनुसार जनप्रतिनिधियों और प्रशासनिक अधिकारियों की सूची और कार्यालय संपर्क विवरण देख सकते हैं।',
    answerEn: 'Click "Directory" in the top navigation. You can filter by district, block, or designation (MP, MLA, Councillor, Sarpanch, Tehsildar, etc.) to view official public contact details.',
    keywords: ['निर्देशिका', 'directory', 'विधायक', 'mla', 'सांसद', 'mp', 'सरपंच', 'sarpanch', 'अधिकारी', 'officer', 'संपर्क', 'contact'],
    alternativePhrases: [
      'अधिकारियों का नंबर कहाँ मिलेगा',
      'how to find mla number',
      'जनप्रतिनिधि डायरेक्टरी',
      'सार्वजनिक निर्देशिका'
    ],
    category: 'DIRECTORY_DESIGNATION',
    sortOrder: 5
  },
  {
    faqId: 'FAQ-SUPPORT-06',
    questionHi: 'तकनीकी सहायता या हेल्पलाइन नंबर क्या है?',
    questionEn: 'What is the technical support helpline or contact email?',
    answerHi: 'तकनीकी सहायता के लिए आप support@janconnect.in पर ईमेल कर सकते हैं या पोर्टल के नीचे दाईं ओर दिए गए लाइव चैट विजेट (Live Chat) से हमारे प्रतिनिधि से सीधे बात कर सकते हैं। आपातकालीन शासकीय सहायता के लिए सीएम हेल्पलाइन 181 पर संपर्क करें।',
    answerEn: 'For technical help, email support@janconnect.in or use the live chat widget at the bottom right. For MP state government emergency assistance, dial CM Helpline 181.',
    keywords: ['हेल्पलाइन', 'helpline', 'सपोर्ट', 'support', 'ईमेल', 'email', 'कस्टमर केयर', 'customer care', 'लाइव चैट', 'live chat'],
    alternativePhrases: [
      'हेल्पलाइन नंबर क्या है',
      'support contact',
      'कस्टमर सपोर्ट',
      'मदद चाहिए'
    ],
    category: 'TECHNICAL_SUPPORT',
    sortOrder: 6
  },
  {
    faqId: 'FAQ-PROFILE-07',
    questionHi: 'अपनी प्रोफाइल और पता कैसे अपडेट करें?',
    questionEn: 'How to update my personal profile and address?',
    answerHi: 'प्रोफाइल अपडेट करने के लिए लॉगिन करने के बाद ऊपरी मेनू से "प्रोफाइल" (Profile) पेज पर जाएँ। वहाँ आप अपना नाम, ईमेल, पता, वार्ड, व विधानसभा क्षेत्र अपडेट कर सकते हैं।',
    answerEn: 'To update your profile, log in and visit the "Profile" page. You can edit your name, email, residential address, ward, and constituency details.',
    keywords: ['प्रोफाइल', 'profile', 'पता', 'address', 'नाम बदलना', 'update profile', 'एडिट'],
    alternativePhrases: [
      'प्रोफाइल कैसे बदलें',
      'how to change address',
      'मोबाइल नंबर या ईमेल अपडेट',
      'edit profile'
    ],
    category: 'PROFILE_UPDATE',
    sortOrder: 7
  }
];

async function seedFaqs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB Atlas...');

  let upsertedCount = 0;
  for (const item of SEED_FAQS) {
    await Faq.findOneAndUpdate(
      { faqId: item.faqId },
      { $set: item },
      { upsert: true, new: true }
    );
    upsertedCount++;
  }

  console.log(`Successfully seeded/upserted ${upsertedCount} verified FAQs.`);
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

seedFaqs().catch(err => {
  console.error('Error seeding FAQs:', err);
  process.exit(1);
});
