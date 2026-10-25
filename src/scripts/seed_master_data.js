const mongoose = require("mongoose");
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const Department = require("../models/Department");
const Designation = require("../models/Designation");
const LocationMaster = require("../models/LocationMaster");
const Constituency = require("../models/Constituency");
const Ward = require("../models/Ward");

const DEPARTMENTS = [
  { name: "Revenue", nameHi: "राजस्व विभाग", code: "REV" },
  { name: "Rural Development & Panchayati Raj", nameHi: "पंचायत एवं ग्रामीण विकास विभाग", code: "RDPR" },
  { name: "Urban Administration & Development", nameHi: "नगरीय प्रशासन एवं विकास विभाग", code: "UADD" },
  { name: "Police & Home", nameHi: "गृह एवं पुलिस विभाग", code: "HOME" },
  { name: "Public Health & Family Welfare", nameHi: "लोक स्वास्थ्य एवं परिवार कल्याण विभाग", code: "HEALTH" },
  { name: "School Education", nameHi: "स्कूल शिक्षा विभाग", code: "EDU" },
  { name: "Higher Education", nameHi: "उच्च शिक्षा विभाग", code: "HEDU" },
  { name: "Agriculture & Farmer Welfare", nameHi: "किसान कल्याण तथा कृषि विकास विभाग", code: "AGRI" },
  { name: "Women & Child Development", nameHi: "महिला एवं बाल विकास विभाग", code: "WCD" },
  { name: "Public Works Department (PWD)", nameHi: "लोक निर्माण विभाग", code: "PWD" },
  { name: "Public Health Engineering (PHED)", nameHi: "लोक स्वास्थ्य यांत्रिकी विभाग (PHED)", code: "PHED" },
  { name: "Energy & Electricity", nameHi: "ऊर्जा एवं विद्युत वितरण विभाग", code: "ENERGY" },
  { name: "Food & Civil Supplies", nameHi: "खाद्य, नागरिक आपूर्ति एवं उपभोक्ता संरक्षण", code: "FOOD" },
  { name: "Forest & Environment", nameHi: "वन एवं पर्यावरण विभाग", code: "FOREST" },
  { name: "Social Justice & Disabled Welfare", nameHi: "सामाजिक न्याय एवं दिव्यांगजन सशक्तिकरण", code: "SJ" },
  { name: "Transport", nameHi: "परिवहन विभाग", code: "TRANS" }
];

const DESIGNATIONS = [
  // ELECTED REPRESENTATIVES
  {
    title: "Lok Sabha MP",
    titleHi: "सांसद (लोकसभा)",
    category: "ELECTED_REPRESENTATIVE",
    level: "CONSTITUENCY",
    applicableAreaType: "ALL",
    sortOrder: 1
  },
  {
    title: "Rajya Sabha MP",
    titleHi: "सांसद (राज्यसभा)",
    category: "ELECTED_REPRESENTATIVE",
    level: "STATE",
    applicableAreaType: "ALL",
    sortOrder: 2
  },
  {
    title: "MLA",
    titleHi: "विधायक (विधानसभा)",
    category: "ELECTED_REPRESENTATIVE",
    level: "CONSTITUENCY",
    applicableAreaType: "ALL",
    sortOrder: 3
  },
  {
    title: "Mayor",
    titleHi: "महापौर (नगर निगम)",
    category: "ELECTED_REPRESENTATIVE",
    level: "LOCAL_BODY",
    applicableAreaType: "URBAN",
    sortOrder: 4
  },
  {
    title: "Municipal Corporation Councillor",
    titleHi: "पार्षद (नगर निगम)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "URBAN",
    sortOrder: 5
  },
  {
    title: "Municipal Council President",
    titleHi: "अध्यक्ष (नगर पालिका परिषद)",
    category: "ELECTED_REPRESENTATIVE",
    level: "LOCAL_BODY",
    applicableAreaType: "URBAN",
    sortOrder: 6
  },
  {
    title: "Municipal Council Councillor",
    titleHi: "पार्षद (नगर पालिका परिषद)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "URBAN",
    sortOrder: 7
  },
  {
    title: "Nagar Parishad President",
    titleHi: "अध्यक्ष (नगर परिषद)",
    category: "ELECTED_REPRESENTATIVE",
    level: "LOCAL_BODY",
    applicableAreaType: "URBAN",
    sortOrder: 8
  },
  {
    title: "Nagar Parishad Councillor",
    titleHi: "पार्षद (नगर परिषद)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "URBAN",
    sortOrder: 9
  },
  {
    title: "District Panchayat President",
    titleHi: "अध्यक्ष (जिला पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "DISTRICT",
    applicableAreaType: "RURAL",
    sortOrder: 10
  },
  {
    title: "District Panchayat Member",
    titleHi: "सदस्य (जिला पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "DISTRICT",
    applicableAreaType: "RURAL",
    sortOrder: 11
  },
  {
    title: "Janpad Panchayat President",
    titleHi: "अध्यक्ष (जनपद पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "RURAL",
    sortOrder: 12
  },
  {
    title: "Janpad Panchayat Member",
    titleHi: "सदस्य (जनपद पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "RURAL",
    sortOrder: 13
  },
  {
    title: "Gram Panchayat Sarpanch",
    titleHi: "सरपंच (ग्राम पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "RURAL",
    sortOrder: 14
  },
  {
    title: "Gram Panchayat Deputy Sarpanch",
    titleHi: "उप-सरपंच (ग्राम पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "RURAL",
    sortOrder: 15
  },
  {
    title: "Gram Panchayat Member (Panch)",
    titleHi: "पंच (ग्राम पंचायत)",
    category: "ELECTED_REPRESENTATIVE",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "RURAL",
    sortOrder: 16
  },

  // ADMINISTRATIVE OFFICIALS
  {
    title: "District Collector / District Magistrate",
    titleHi: "कलेक्टर एवं जिला दंडाधिकारी",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Revenue",
    sortOrder: 20
  },
  {
    title: "Additional District Magistrate (ADM)",
    titleHi: "अपर जिला दंडाधिकारी (ADM)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Revenue",
    sortOrder: 21
  },
  {
    title: "Superintendent of Police (SP)",
    titleHi: "पुलिस अधीक्षक (SP)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Police & Home",
    sortOrder: 22
  },
  {
    title: "Sub-Divisional Magistrate (SDM)",
    titleHi: "अनुविभागीय अधिकारी राजस्व (SDM)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "ALL",
    departmentName: "Revenue",
    sortOrder: 23
  },
  {
    title: "Tehsildar",
    titleHi: "तहसीलदार",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "ALL",
    departmentName: "Revenue",
    sortOrder: 24
  },
  {
    title: "Naib Tehsildar",
    titleHi: "नायब तहसीलदार",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "ALL",
    departmentName: "Revenue",
    sortOrder: 25
  },
  {
    title: "Janpad Panchayat CEO",
    titleHi: "मुख्य कार्यपालन अधिकारी (जनपद पंचायत)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "RURAL",
    departmentName: "Rural Development & Panchayati Raj",
    sortOrder: 26
  },
  {
    title: "Municipal Commissioner",
    titleHi: "निगमायुक्त (नगर पालिक निगम)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "LOCAL_BODY",
    applicableAreaType: "URBAN",
    departmentName: "Urban Administration & Development",
    sortOrder: 27
  },
  {
    title: "Chief Municipal Officer (CMO)",
    titleHi: "मुख्य नगरपालिका अधिकारी (CMO)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "LOCAL_BODY",
    applicableAreaType: "URBAN",
    departmentName: "Urban Administration & Development",
    sortOrder: 28
  },
  {
    title: "Gram Panchayat Secretary",
    titleHi: "ग्राम पंचायत सचिव",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "RURAL",
    departmentName: "Rural Development & Panchayati Raj",
    sortOrder: 29
  },
  {
    title: "Gram Rozgar Sahayak (GRS)",
    titleHi: "ग्राम रोजगार सहायक (GRS)",
    category: "ADMINISTRATIVE_OFFICIAL",
    level: "PANCHAYAT_WARD",
    applicableAreaType: "RURAL",
    departmentName: "Rural Development & Panchayati Raj",
    sortOrder: 30
  },

  // DEPARTMENTAL OFFICIALS
  {
    title: "Chief Medical and Health Officer (CMHO)",
    titleHi: "मुख्य चिकित्सा एवं स्वास्थ्य अधिकारी (CMHO)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Public Health & Family Welfare",
    sortOrder: 40
  },
  {
    title: "District Education Officer (DEO)",
    titleHi: "जिला शिक्षा अधिकारी (DEO)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "School Education",
    sortOrder: 41
  },
  {
    title: "Deputy Director Agriculture (DDA)",
    titleHi: "उप संचालक कृषि (DDA)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Agriculture & Farmer Welfare",
    sortOrder: 42
  },
  {
    title: "Sub-Divisional Officer of Police (SDOP/DSP)",
    titleHi: "अनुविभागीय अधिकारी पुलिस (SDOP/DSP)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "ALL",
    departmentName: "Police & Home",
    sortOrder: 43
  },
  {
    title: "Station House Officer (SHO/TI)",
    titleHi: "थाना प्रभारी (टीआई / एसएचओ)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "BLOCK_TEHSIL",
    applicableAreaType: "ALL",
    departmentName: "Police & Home",
    sortOrder: 44
  },
  {
    title: "Executive Engineer (PWD)",
    titleHi: "कार्यपालन यंत्री (लोक निर्माण विभाग)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Public Works Department (PWD)",
    sortOrder: 45
  },
  {
    title: "Executive Engineer (Electricity)",
    titleHi: "कार्यपालन यंत्री (मध्य प्रदेश विद्युत वितरण)",
    category: "DEPARTMENTAL_OFFICIAL",
    level: "DISTRICT",
    applicableAreaType: "ALL",
    departmentName: "Energy & Electricity",
    sortOrder: 46
  }
];

// Geographical Hierarchy for Madhya Pradesh
const LOCATION_SEEDS = [
  // --- SATNA DISTRICT ---
  // Urban: Satna Municipal Corporation Wards (Sample set of wards 1 to 16)
  ...[
    { num: "1", name: "सरदार वल्लभभाई पटेल वार्ड" },
    { num: "2", name: "महाराणा प्रताप वार्ड" },
    { num: "3", name: "स्वामी विवेकानंद वार्ड" },
    { num: "4", name: "रानी दुर्गावती वार्ड" },
    { num: "5", name: "शहीद भगत सिंह वार्ड" },
    { num: "6", name: "पंडित दीनदयाल उपाध्याय वार्ड" },
    { num: "7", name: "डॉ. भीमराव अम्बेडकर वार्ड" },
    { num: "8", name: "सुभाष चंद्र बोस वार्ड" },
    { num: "9", name: "डॉ. एपीजे अब्दुल कलाम वार्ड" },
    { num: "10", name: "अटल बिहारी वाजपेयी वार्ड" },
    { num: "11", name: "महात्मा गांधी वार्ड" },
    { num: "12", name: "लाल बहादुर शास्त्री वार्ड" },
    { num: "13", name: "चंद्रशेखर आजाद वार्ड" },
    { num: "14", name: "वीर सावरकर वार्ड" },
    { num: "15", name: "राजीव गांधी वार्ड" },
    { num: "16", name: "राजेंद्र नगर वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Satna",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Satna Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Satna",
    parliamentaryConstituency: "Satna",
    pincode: "485001"
  })),

  // Rural: Sohawal Block (Satna)
  ...[
    { gp: "Kripalpur", village: "Kripalpur", tehsil: "Raghurajnagar" },
    { gp: "Kripalpur", village: "Lalpur", tehsil: "Raghurajnagar" },
    { gp: "Sohawal", village: "Sohawal", tehsil: "Raghurajnagar" },
    { gp: "Sohawal", village: "Hardua", tehsil: "Raghurajnagar" },
    { gp: "Madhavgarh", village: "Madhavgarh", tehsil: "Raghurajnagar" },
    { gp: "Madhavgarh", village: "Badkhar", tehsil: "Raghurajnagar" },
    { gp: "Bela", village: "Bela", tehsil: "Raghurajnagar" },
    { gp: "Bela", village: "Chorhata", tehsil: "Raghurajnagar" },
    { gp: "Sajjanpur", village: "Sajjanpur", tehsil: "Raghurajnagar" }
  ].map(r => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Satna",
    areaType: "RURAL",
    tehsil: r.tehsil,
    developmentBlock: "Sohawal",
    gramPanchayat: r.gp,
    village: r.village,
    assemblyConstituency: "Satna",
    parliamentaryConstituency: "Satna",
    pincode: "485005"
  })),

  // Rural: Rampur Baghelan Block (Satna)
  ...[
    { gp: "Rampur Baghelan", village: "Rampur Baghelan", tehsil: "Rampur Baghelan" },
    { gp: "Beli", village: "Beli", tehsil: "Rampur Baghelan" },
    { gp: "Chormari", village: "Chormari", tehsil: "Rampur Baghelan" },
    { gp: "Khamariya", village: "Khamariya", tehsil: "Rampur Baghelan" },
    { gp: "Manikwar", village: "Manikwar", tehsil: "Rampur Baghelan" }
  ].map(r => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Satna",
    areaType: "RURAL",
    tehsil: r.tehsil,
    developmentBlock: "Rampur Baghelan",
    gramPanchayat: r.gp,
    village: r.village,
    assemblyConstituency: "Rampur Baghelan",
    parliamentaryConstituency: "Satna",
    pincode: "485115"
  })),

  // Rural: Nagod Block (Satna)
  ...[
    { gp: "Nagod Rural", village: "Nagod", tehsil: "Nagod" },
    { gp: "Pitehra", village: "Pitehra", tehsil: "Nagod" },
    { gp: "Rahikwara", village: "Rahikwara", tehsil: "Nagod" },
    { gp: "Singhpur", village: "Singhpur", tehsil: "Nagod" }
  ].map(r => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Satna",
    areaType: "RURAL",
    tehsil: r.tehsil,
    developmentBlock: "Nagod",
    gramPanchayat: r.gp,
    village: r.village,
    assemblyConstituency: "Nagod",
    parliamentaryConstituency: "Satna",
    pincode: "485446"
  })),

  // --- MAIHAR DISTRICT ---
  // Urban: Maihar Municipal Council Wards (Wards 1 to 10)
  ...[
    { num: "1", name: "माँ शारदा वार्ड" },
    { num: "2", name: "उस्ताद अलाउद्दीन खां वार्ड" },
    { num: "3", name: "त्रिकूट पर्वत वार्ड" },
    { num: "4", name: "स्टेशन वार्ड" },
    { num: "5", name: "गांधी चौक वार्ड" },
    { num: "6", name: "पुरानी बस्ती वार्ड" },
    { num: "7", name: "किला वार्ड" },
    { num: "8", name: "सुभाष वार्ड" },
    { num: "9", name: "नेहरू वार्ड" },
    { num: "10", name: "विद्या नगर वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Maihar",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_COUNCIL",
    localBody: "Maihar Municipal Council",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Maihar",
    parliamentaryConstituency: "Satna",
    pincode: "485771"
  })),

  // Rural: Maihar Block
  ...[
    { gp: "Bhatanwara", village: "Bhatanwara", tehsil: "Maihar" },
    { gp: "Bhatanwara", village: "Ghirao", tehsil: "Maihar" },
    { gp: "Sonwari", village: "Sonwari", tehsil: "Maihar" },
    { gp: "Amanganj", village: "Amanganj", tehsil: "Maihar" },
    { gp: "Ghurdang", village: "Ghurdang", tehsil: "Maihar" }
  ].map(r => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Maihar",
    areaType: "RURAL",
    tehsil: r.tehsil,
    developmentBlock: "Maihar",
    gramPanchayat: r.gp,
    village: r.village,
    assemblyConstituency: "Maihar",
    parliamentaryConstituency: "Satna",
    pincode: "485771"
  })),

  // --- REWA DISTRICT ---
  // Urban: Rewa Municipal Corporation Wards
  ...[
    { num: "1", name: "सिविल लाइंस वार्ड" },
    { num: "2", name: "विश्वविद्यालय वार्ड" },
    { num: "3", name: "अमहिया वार्ड" },
    { num: "4", name: "बोदाबाग वार्ड" },
    { num: "5", name: "समान वार्ड" },
    { num: "6", name: "नेहरू नगर वार्ड" },
    { num: "7", name: "किला चौक वार्ड" },
    { num: "8", name: "रतहरा वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Rewa",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Rewa Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Rewa",
    parliamentaryConstituency: "Rewa",
    pincode: "486001"
  })),

  // Rural: Raipur Karchuliyan Block (Rewa)
  ...[
    { gp: "Raipur Karchuliyan", village: "Raipur", tehsil: "Raipur Karchuliyan" },
    { gp: "Ramnai", village: "Ramnai", tehsil: "Raipur Karchuliyan" },
    { gp: "Barahadih", village: "Barahadih", tehsil: "Raipur Karchuliyan" }
  ].map(r => ({
    state: "Madhya Pradesh",
    division: "Rewa",
    district: "Rewa",
    areaType: "RURAL",
    tehsil: r.tehsil,
    developmentBlock: "Raipur Karchuliyan",
    gramPanchayat: r.gp,
    village: r.village,
    assemblyConstituency: "Gurh",
    parliamentaryConstituency: "Rewa",
    pincode: "486114"
  })),

  // --- BHOPAL DISTRICT ---
  // Urban: Bhopal Municipal Corporation Wards
  ...[
    { num: "1", name: "बैरागढ़ वार्ड" },
    { num: "2", name: "गांधी नगर वार्ड" },
    { num: "25", name: "एमपी नगर वार्ड" },
    { num: "32", name: "अरेरा कॉलोनी वार्ड" },
    { num: "45", name: "शाहपुरा वार्ड" },
    { num: "50", name: "कोलार रोड वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Bhopal",
    district: "Bhopal",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Bhopal Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Govindpura",
    parliamentaryConstituency: "Bhopal",
    pincode: "462001"
  })),

  // --- JABALPUR DISTRICT ---
  // Urban: Jabalpur Municipal Corporation Wards
  ...[
    { num: "1", name: "रानी दुर्गावती वार्ड" },
    { num: "5", name: "मदन महल वार्ड" },
    { num: "12", name: "सिविल लाइंस वार्ड" },
    { num: "20", name: "गोरखपुर वार्ड" },
    { num: "30", name: "विजय नगर वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Jabalpur",
    district: "Jabalpur",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Jabalpur Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Jabalpur Paschim",
    parliamentaryConstituency: "Jabalpur",
    pincode: "482001"
  })),

  // --- GWALIOR DISTRICT ---
  ...[
    { num: "1", name: "महाराज बाड़ा वार्ड" },
    { num: "15", name: "फूलबाग वार्ड" },
    { num: "25", name: "सिटी सेंटर वार्ड" },
    { num: "35", name: "थाटीपुर वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Gwalior",
    district: "Gwalior",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Gwalior Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Gwalior East",
    parliamentaryConstituency: "Gwalior",
    pincode: "474001"
  })),

  // --- INDORE DISTRICT ---
  ...[
    { num: "1", name: "राजवाड़ा वार्ड" },
    { num: "10", name: "पलासिया वार्ड" },
    { num: "20", name: "विजय नगर वार्ड" },
    { num: "30", name: "भंवरकुआं वार्ड" }
  ].map(w => ({
    state: "Madhya Pradesh",
    division: "Indore",
    district: "Indore",
    areaType: "URBAN",
    localBodyType: "MUNICIPAL_CORPORATION",
    localBody: "Indore Municipal Corporation",
    wardNumber: w.num,
    wardName: w.name,
    assemblyConstituency: "Indore-1",
    parliamentaryConstituency: "Indore",
    pincode: "452001"
  }))
];

async function seedMasterData() {
  const mongoUri =
    process.env.MONGODB_URI ||
    "mongodb+srv://infosystem:Rajd2003@cluster0.u0le37x.mongodb.net/test?retryWrites=true&w=majority";

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB for master data seeding...");

  // 1. Seed Departments
  console.log("Seeding departments...");
  const deptMap = new Map();
  for (const d of DEPARTMENTS) {
    const doc = await Department.findOneAndUpdate(
      { name: d.name },
      { $set: d },
      { upsert: true, new: true }
    );
    deptMap.set(d.name, doc._id);
  }
  console.log(`✅ ${DEPARTMENTS.length} departments seeded/updated.`);

  // 2. Seed Designations
  console.log("Seeding designations...");
  let desigCount = 0;
  for (const des of DESIGNATIONS) {
    const payload = { ...des };
    if (des.departmentName && deptMap.has(des.departmentName)) {
      payload.departmentId = deptMap.get(des.departmentName);
    }
    await Designation.findOneAndUpdate(
      { title: des.title },
      { $set: payload },
      { upsert: true, new: true }
    );
    desigCount++;
  }
  console.log(`✅ ${desigCount} designations seeded/updated.`);

  // 3. Seed Location Master Data
  console.log("Seeding location master data...");
  let locCount = 0;
  for (const loc of LOCATION_SEEDS) {
    const matchQuery = {
      state: loc.state,
      district: loc.district,
      areaType: loc.areaType
    };
    if (loc.areaType === "RURAL") {
      matchQuery.developmentBlock = loc.developmentBlock;
      matchQuery.gramPanchayat = loc.gramPanchayat;
      matchQuery.village = loc.village;
    } else {
      matchQuery.localBody = loc.localBody;
      matchQuery.wardNumber = loc.wardNumber;
    }

    await LocationMaster.findOneAndUpdate(
      matchQuery,
      { $set: loc },
      { upsert: true, new: true }
    );
    locCount++;
  }
  console.log(`✅ ${locCount} geographical locations seeded/updated.`);

  // 4. Also synchronize existing Constituency and Ward models for backward compatibility
  console.log("Syncing Constituency and Ward models...");
  const uniqueConstituencies = [
    { name: "Satna", code: "AC-222", district: "Satna" },
    { name: "Rampur Baghelan", code: "AC-223", district: "Satna" },
    { name: "Nagod", code: "AC-221", district: "Satna" },
    { name: "Maihar", code: "AC-226", district: "Maihar" },
    { name: "Rewa", code: "AC-218", district: "Rewa" },
    { name: "Govindpura", code: "AC-154", district: "Bhopal" },
    { name: "Jabalpur Paschim", code: "AC-100", district: "Jabalpur" }
  ];

  for (const c of uniqueConstituencies) {
    const constDoc = await Constituency.findOneAndUpdate(
      { name: c.name, district: c.district },
      { $set: { ...c, state: "Madhya Pradesh" } },
      { upsert: true, new: true }
    );

    // Sync corresponding wards
    const relevantWards = LOCATION_SEEDS.filter(
      l => l.areaType === "URBAN" && l.assemblyConstituency === c.name
    );
    for (const rw of relevantWards) {
      await Ward.findOneAndUpdate(
        { constituencyId: constDoc._id, wardNumber: rw.wardNumber },
        {
          $set: {
            wardNumber: rw.wardNumber,
            name: rw.wardName,
            constituencyId: constDoc._id
          }
        },
        { upsert: true }
      );
    }
  }
  console.log("✅ Constituency and Ward models synchronized.");

  await mongoose.disconnect();
  console.log("🎉 Master data seeding completed successfully!");
}

if (require.main === module) {
  seedMasterData().catch(err => {
    console.error("Seeding error:", err);
    process.exit(1);
  });
}

module.exports = { seedMasterData };
