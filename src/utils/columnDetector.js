/**
 * Universal Column Detection & Multi-Person Spreadsheet Expander Engine
 *
 * Supports arbitrary Excel (.xlsx, .xls) and CSV headers in Hindi & English,
 * automatic fuzzy header matching, customizable mapping, multi-person row expansion
 * (e.g. Sarpanch, Secretary, GRS on one row), and canonical designation mapping.
 */

// Canonical dictionary of single-person headers (clean alphanumeric & devanagari)
const HEADER_DICTIONARY = {
  nameCol: [
    'name', 'fullname', 'membername', 'candidatename', 'naam', 'nam', 'personname',
    'नाम', 'पूरानाम्', 'पूरानाम', 'सदस्यकानाम', 'सदस्यनाम', 'व्यक्तिकानाम', 'कार्यकर्ताकानाम', 'कार्यकर्तानाम', 'नागरिककानाम'
  ],
  phoneCol: [
    'phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobileno',
    'contact', 'contactnumber', 'contactno', 'cell', 'cellphone', 'whatsapp',
    'मोबाइल', 'मोबाइलनंबर', 'मोबाइलनं', 'फोन', 'फ़ोन', 'फोननंबर', 'फोननं', 'संपर्क', 'सम्पर्क', 'दूरभाष', 'संपर्कनंबर'
  ],
  roleCol: [
    'role', 'userrole', 'भूमिका', 'उपयोगकर्ताभूमिका', 'पदकीभूमिका'
  ],
  designationCol: [
    'designation', 'position', 'post', 'title', 'responsiblity',
    'पद', 'पदनाम', 'दायित्व', 'पदकानाम', 'वर्तमानपद'
  ],
  categoryCol: [
    'category', 'designationcategory', 'वर्ग', 'श्रेणी', 'पदश्रेणी'
  ],
  departmentCol: [
    'department', 'dept', 'ministry', 'office', 'विभाग', 'संबंधितविभाग', 'कार्यालय'
  ],
  stateCol: [
    'state', 'province', 'राज्य', 'प्रदेश'
  ],
  districtCol: [
    'district', 'dist', 'zila', 'zilla', 'जिला', 'ज़िला', 'जनपदजिला'
  ],
  divisionCol: [
    'division', 'div', 'संभाग', 'कमिश्नरी'
  ],
  blockCol: [
    'block', 'developmentblock', 'tehsil', 'tahsil', 'janpad', 'janpadpanchayat',
    'विकासखंड', 'ब्लॉक', 'तहसील', 'जनपद', 'जनपदपंचायत'
  ],
  panchayatCol: [
    'grampanchayat', 'panchayat', 'gp', 'ग्रामपंचायत', 'पंचायत', 'ग्रामपंचायतकानाम'
  ],
  villageCol: [
    'village', 'gram', 'gaon', 'गांव', 'ग्राम', 'मजरा', 'ग्रामकानाम'
  ],
  localBodyCol: [
    'localbody', 'ulb', 'municipality', 'nagarnigam', 'nagarpalika', 'nagarparishad',
    'निकाय', 'शहरीनिकाय', 'नगरनिगम', 'नगरपालिका', 'नगरपरिषद'
  ],
  wardCol: [
    'ward', 'wardnumber', 'wardno', 'wardnum', 'वार्ड', 'वार्डनंबर', 'वार्डक्रमांक', 'वार्डनं'
  ],
  wardNameCol: [
    'wardname', 'वार्डकानाम', 'वार्डनाम'
  ],
  constituencyCol: [
    'assembly', 'assemblyconstituency', 'ac', 'vidhansabha', 'constituency',
    'विधानसभा', 'विधानसभाक्षेत्र', 'विस'
  ],
  parliamentaryConstituencyCol: [
    'parliamentary', 'parliamentaryconstituency', 'pc', 'loksabha', 'लोकसभा', 'संसदीयक्षेत्र'
  ],
  voterIdCol: [
    'voterid', 'voter', 'epic', 'epicno', 'मतदातापहचानपत्र', 'मतदातापत्र', 'वोटरआईडी'
  ],
  addressCol: [
    'address', 'residentialaddress', 'पता', 'निवास', 'वर्तमानपता', 'निवासस्थान'
  ]
};

// Known multi-person civic roles in Panchayat / Municipal sheets
// Listed in order of specificity (more specific prefixes first)
const CIVIC_MULTI_PERSON_ROLES = [
  {
    key: 'upsarpanch',
    aliases: ['upsarpanch', 'उपसरपंच', 'उप-सरपंच'],
    defaultDesignation: 'उप-सरपंच (ग्राम पंचायत)',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'उप-सरपंच (Up-Sarpanch)'
  },
  {
    key: 'sarpanch',
    aliases: ['sarpanch', 'सरपंच', 'mukhiya', 'मुखिया'],
    defaultDesignation: 'सरपंच (ग्राम पंचायत)',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'सरपंच (Sarpanch)',
    negatives: ['उपसरपंच', 'upsarpanch']
  },
  {
    key: 'secretary',
    aliases: ['secretary', 'sachiv', 'सचिव', 'पंचायतसचिव', 'grampanchayatsecretary'],
    defaultDesignation: 'ग्राम पंचायत सचिव',
    category: 'ADMINISTRATIVE_OFFICIAL',
    roleLabel: 'पंचायत सचिव (Secretary)'
  },
  {
    key: 'grs',
    aliases: ['grs', 'rozgarsahayak', 'रोजगारसहायक', 'ग्रामरोजगारसहायक'],
    defaultDesignation: 'ग्राम रोजगार सहायक (GRS)',
    category: 'ADMINISTRATIVE_OFFICIAL',
    roleLabel: 'रोजगार सहायक (GRS)'
  },
  {
    key: 'panch',
    aliases: ['wardpanch', 'वार्डपंच', 'पंच'],
    defaultDesignation: 'पंच (ग्राम पंचायत)',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'पंच (Panch)',
    negatives: ['सरपंच', 'sarpanch', 'उपसरपंच', 'upsarpanch', 'पंचायत', 'panchayat']
  },
  {
    key: 'patwari',
    aliases: ['patwari', 'पटवारी'],
    defaultDesignation: 'पटवारी',
    category: 'ADMINISTRATIVE_OFFICIAL',
    roleLabel: 'पटवारी (Patwari)'
  },
  {
    key: 'councillor',
    aliases: ['councillor', 'parshad', 'पार्षद'],
    defaultDesignation: 'पार्षद',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'पार्षद (Councillor)'
  },
  {
    key: 'vice_president',
    aliases: ['upadhyaksh', 'उपाध्यक्ष', 'vicepresident'],
    defaultDesignation: 'उपाध्यक्ष',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'उपाध्यक्ष (Vice President)'
  },
  {
    key: 'president',
    aliases: ['adhyaksh', 'अध्यक्ष', 'president'],
    defaultDesignation: 'अध्यक्ष',
    category: 'ELECTED_REPRESENTATIVE',
    roleLabel: 'अध्यक्ष (President)',
    negatives: ['उपाध्यक्ष', 'upadhyaksh']
  }
];

/**
 * Clean a string by lowercasing and removing spaces & punctuation
 */
function cleanKey(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_()[\]{}:;.,\/\\|+=*&^%$#@!~`"'?<>]/g, '');
}

/**
 * Detect column mappings and multi-person pairs from sheet headers
 */
function detectColumnsAndMultiPerson(headers, customMapping = {}) {
  const cleanHeaders = headers.map(h => ({
    original: h,
    cleaned: cleanKey(h)
  }));

  // 1. Detect Multi-Person Column Pairs (e.g. Sarpanch Name, Sarpanch Mobile, Secretary Name, Secretary Mobile)
  const detectedMultiPersonPairs = [];
  const claimedHeaders = new Set();

  for (const roleDef of CIVIC_MULTI_PERSON_ROLES) {
    let roleNameCol = null;
    let rolePhoneCol = null;

    for (const h of cleanHeaders) {
      if (claimedHeaders.has(h.original)) continue;

      const hasNegative = roleDef.negatives && roleDef.negatives.some(neg => h.cleaned.includes(cleanKey(neg)));
      if (hasNegative) continue;

      const containsRole = roleDef.aliases.some(alias => h.cleaned.includes(cleanKey(alias)));
      if (containsRole) {
        const isPhone = HEADER_DICTIONARY.phoneCol.some(p => h.cleaned.includes(p));
        const isName = HEADER_DICTIONARY.nameCol.some(n => h.cleaned.includes(n)) || (!isPhone && (h.cleaned.includes('नाम') || h.cleaned.includes('name')));

        if (isPhone && !rolePhoneCol) {
          rolePhoneCol = h.original;
          claimedHeaders.add(h.original);
        } else if (isName && !roleNameCol) {
          roleNameCol = h.original;
          claimedHeaders.add(h.original);
        }
      }
    }

    if (roleNameCol || rolePhoneCol) {
      detectedMultiPersonPairs.push({
        roleKey: roleDef.key,
        roleLabel: roleDef.roleLabel,
        defaultDesignation: roleDef.defaultDesignation,
        category: roleDef.category,
        nameCol: roleNameCol,
        phoneCol: rolePhoneCol
      });
    }
  }

  // A sheet is considered multi-person if it has at least 1 verified person pair where both name and phone (or 2 distinct role pairs) are found
  const isMultiPersonSheet = detectedMultiPersonPairs.length >= 2 ||
    (detectedMultiPersonPairs.length === 1 && detectedMultiPersonPairs[0].nameCol && detectedMultiPersonPairs[0].phoneCol && !customMapping.nameCol);

  // 2. Standard Single-Person Column Detection
  const standardMapping = {};
  for (const [field, candidates] of Object.entries(HEADER_DICTIONARY)) {
    if (customMapping[field]) {
      standardMapping[field] = customMapping[field];
      continue;
    }

    const match = cleanHeaders.find(h => {
      return candidates.some(c => h.cleaned === c || h.cleaned.includes(c));
    });

    standardMapping[field] = match ? match.original : null;
  }

  // Fallback for simple 2-column sheets if name or phone not detected
  if (headers.length === 2 && !isMultiPersonSheet) {
    if (!standardMapping.nameCol && !standardMapping.phoneCol) {
      standardMapping.nameCol = headers[0];
      standardMapping.phoneCol = headers[1];
    } else if (!standardMapping.nameCol) {
      standardMapping.nameCol = headers.find(h => h !== standardMapping.phoneCol) || headers[0];
    } else if (!standardMapping.phoneCol) {
      standardMapping.phoneCol = headers.find(h => h !== standardMapping.nameCol) || headers[1];
    }
  }

  return {
    headers,
    isMultiPerson: isMultiPersonSheet,
    multiPersonPairs: detectedMultiPersonPairs,
    standardMapping
  };
}

/**
 * Expand raw sheet rows into normalized candidate member records
 */
function expandRowsToCandidates(rawRows, detectionResult, customMapping = {}) {
  const { isMultiPerson, multiPersonPairs, standardMapping } = detectionResult;
  const mapping = { ...standardMapping, ...customMapping };
  const expanded = [];

  rawRows.forEach((row, rowIdx) => {
    const rowNumber = rowIdx + 2; // Excel row numbering (1-based header + 1-based data)

    // Shared location fields common to the entire row
    const commonLocation = {
      state: mapping.stateCol && row[mapping.stateCol] ? String(row[mapping.stateCol]).trim() : 'Madhya Pradesh',
      district: mapping.districtCol && row[mapping.districtCol] ? String(row[mapping.districtCol]).trim() : '',
      division: mapping.divisionCol && row[mapping.divisionCol] ? String(row[mapping.divisionCol]).trim() : '',
      areaType: mapping.areaTypeCol && row[mapping.areaTypeCol]
        ? (String(row[mapping.areaTypeCol]).toUpperCase().includes('URBAN') || String(row[mapping.areaTypeCol]).includes('शहरी') ? 'URBAN' : 'RURAL')
        : 'RURAL',
      tehsil: mapping.tehsilCol && row[mapping.tehsilCol] ? String(row[mapping.tehsilCol]).trim() : '',
      developmentBlock: mapping.blockCol && row[mapping.blockCol] ? String(row[mapping.blockCol]).trim() : '',
      gramPanchayat: mapping.panchayatCol && row[mapping.panchayatCol] ? String(row[mapping.panchayatCol]).trim() : '',
      village: mapping.villageCol && row[mapping.villageCol] ? String(row[mapping.villageCol]).trim() : '',
      localBody: mapping.localBodyCol && row[mapping.localBodyCol] ? String(row[mapping.localBodyCol]).trim() : '',
      wardNumber: mapping.wardCol && row[mapping.wardCol] ? String(row[mapping.wardCol]).trim() : '',
      wardName: mapping.wardNameCol && row[mapping.wardNameCol] ? String(row[mapping.wardNameCol]).trim() : '',
      assemblyConstituency: mapping.constituencyCol && row[mapping.constituencyCol] ? String(row[mapping.constituencyCol]).trim() : '',
      parliamentaryConstituency: mapping.parliamentaryConstituencyCol && row[mapping.parliamentaryConstituencyCol] ? String(row[mapping.parliamentaryConstituencyCol]).trim() : '',
      address: mapping.addressCol && row[mapping.addressCol] ? String(row[mapping.addressCol]).trim() : '',
      voterId: mapping.voterIdCol && row[mapping.voterIdCol] ? String(row[mapping.voterIdCol]).trim().toUpperCase() : ''
    };

    // Case 1: Multi-Person Spreadsheet (e.g. Sarpanch + Secretary + GRS in one row)
    if (isMultiPerson && multiPersonPairs.length > 0) {
      multiPersonPairs.forEach(pair => {
        const rawName = pair.nameCol ? String(row[pair.nameCol] || '').trim() : '';
        const rawPhone = pair.phoneCol ? String(row[pair.phoneCol] || '').trim() : '';

        // If either name or phone is present for this person
        if (rawName || rawPhone) {
          expanded.push({
            rowNumber,
            personTag: pair.roleLabel,
            fullName: rawName,
            rawMobile: rawPhone,
            designation: pair.defaultDesignation,
            designationCategory: pair.category,
            department: pair.category === 'ADMINISTRATIVE_OFFICIAL' ? 'पंचायत एवं ग्रामीण विकास' : '',
            role: 'CITIZEN',
            ...commonLocation,
            originalRow: row
          });
        }
      });
      return;
    }

    // Case 2: Standard Single-Person Row (with possible delimiter splitting inside cells)
    const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '').trim() : String(Object.values(row)[0] || '').trim();
    const rawPhone = mapping.phoneCol ? String(row[mapping.phoneCol] || '').trim() : String(Object.values(row)[1] || '').trim();

    const rawDesignation = mapping.designationCol ? String(row[mapping.designationCol] || '').trim() : '';
    const rawCategory = mapping.categoryCol ? String(row[mapping.categoryCol] || '').trim().toUpperCase() : '';
    const rawDepartment = mapping.departmentCol ? String(row[mapping.departmentCol] || '').trim() : '';
    const rawRole = mapping.roleCol ? String(row[mapping.roleCol] || '').trim().toUpperCase() : 'CITIZEN';

    // Check for multi-value delimiters inside name or phone cells (e.g. "राम / श्याम")
    const splitRegex = /[\/;,|\n]+/;
    const nameParts = rawName.split(splitRegex).map(s => s.trim()).filter(Boolean);
    const phoneParts = rawPhone.split(splitRegex).map(s => s.trim()).filter(Boolean);

    if (nameParts.length > 1 || phoneParts.length > 1) {
      const count = Math.max(nameParts.length, phoneParts.length);
      for (let i = 0; i < count; i++) {
        expanded.push({
          rowNumber,
          personTag: `व्यक्ति ${i + 1}`,
          fullName: nameParts[i] || nameParts[0] || rawName,
          rawMobile: phoneParts[i] || phoneParts[0] || rawPhone,
          designation: rawDesignation,
          designationCategory: rawCategory,
          department: rawDepartment,
          role: rawRole,
          ...commonLocation,
          originalRow: row
        });
      }
    } else {
      expanded.push({
        rowNumber,
        personTag: '',
        fullName: rawName,
        rawMobile: rawPhone,
        designation: rawDesignation,
        designationCategory: rawCategory,
        department: rawDepartment,
        role: rawRole,
        ...commonLocation,
        originalRow: row
      });
    }
  });

  return expanded;
}

/**
 * Match a recognized designation string to existing MongoDB Designation master records
 */
function matchDesignationToMaster(rawDesignation, masterDesignations = []) {
  if (!rawDesignation || !rawDesignation.trim()) {
    return {
      title: '',
      designationId: null,
      category: '',
      departmentId: null
    };
  }

  const clean = cleanKey(rawDesignation);

  // Exact or contains match on master title / titleHi
  const match = masterDesignations.find(d => {
    const tEn = cleanKey(d.title);
    const tHi = cleanKey(d.titleHi);
    return clean === tEn || clean === tHi || tEn.includes(clean) || tHi.includes(clean) || clean.includes(tEn) || clean.includes(tHi);
  });

  if (match) {
    return {
      title: match.titleHi || match.title,
      designationId: match._id,
      category: match.category || 'OTHER',
      departmentId: match.departmentId || null
    };
  }

  // Safe fallback: never use 'POLITICAL', keep raw string and categorize as 'OTHER' or derive
  let safeCat = 'OTHER';
  if (/sarpanch|सरपंच|विधायक|mla|mp|सांसद|पार्षद|councillor|mayor|महापौर/i.test(rawDesignation)) {
    safeCat = 'ELECTED_REPRESENTATIVE';
  } else if (/सचिव|secretary|collector|कलेक्टर|तहसीलदार|tehsildar|ceo|पटवारी|सहायक/i.test(rawDesignation)) {
    safeCat = 'ADMINISTRATIVE_OFFICIAL';
  }

  return {
    title: rawDesignation.trim(),
    designationId: null,
    category: safeCat,
    departmentId: null
  };
}

module.exports = {
  HEADER_DICTIONARY,
  CIVIC_MULTI_PERSON_ROLES,
  cleanKey,
  detectColumnsAndMultiPerson,
  expandRowsToCandidates,
  matchDesignationToMaster
};
