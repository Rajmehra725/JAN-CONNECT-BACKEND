/**
 * Smart FAQ Matcher Utility
 * Provides normalized bilingual (Hindi / English) keyword matching,
 * token similarity, confidence calculation, and clarification options.
 */

const HINDI_STOPWORDS = new Set([
  'का', 'के', 'की', 'को', 'में', 'से', 'पर', 'ने', 'है', 'हैं', 'था', 'थी', 'थे',
  'हो', 'होगा', 'होगी', 'होते', 'क्या', 'कहाँ', 'कैसे', 'क्यों', 'कब', 'किसे',
  'यह', 'वह', 'इस', 'उस', 'और', 'या', 'तो', 'भी', 'तक', 'द्वारा', 'कृपया',
  'मुझे', 'मेरा', 'मेरी', 'मेरे', 'हम', 'हमारा', 'आप', 'आपका', 'आपकी'
]);

const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'what', 'how', 'when', 'where', 'why', 'who', 'which', 'can', 'could',
  'do', 'does', 'did', 'i', 'my', 'me', 'we', 'our', 'you', 'your', 'please'
]);

/**
 * Detect language of query: 'HI', 'EN', or 'MIXED'
 */
function detectLanguage(text) {
  if (!text) return 'HI';
  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

  if (hindiChars > 0 && englishChars === 0) return 'HI';
  if (englishChars > 0 && hindiChars === 0) return 'EN';
  if (hindiChars >= englishChars) return 'HI';
  return 'EN';
}

/**
 * Normalize and tokenize text
 */
function tokenize(text) {
  if (!text) return [];
  // Lowercase, remove punctuation
  const cleaned = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'।॥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').filter(token => {
    return token.length > 1 && !HINDI_STOPWORDS.has(token) && !ENGLISH_STOPWORDS.has(token);
  });
}

/**
 * Calculate Jaccard similarity between two token sets
 */
function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Match a query against an array of Faq documents
 * @param {string} userQuery
 * @param {Array} faqs
 * @returns {Object} result: { matchedFaq, confidence, status, language, clarificationOptions }
 */
function matchFaq(userQuery, faqs) {
  if (!userQuery || !faqs || !faqs.length) {
    return {
      status: 'UNANSWERED',
      confidence: 0,
      matchedFaq: null,
      clarificationOptions: [],
      language: 'HI'
    };
  }

  const lang = detectLanguage(userQuery);
  const queryTokens = tokenize(userQuery);
  const rawClean = userQuery.toLowerCase().trim();

  const scoredFaqs = faqs.map(faq => {
    let score = 0;

    // 1. Exact or Substring match on Question
    const qHi = (faq.questionHi || '').toLowerCase();
    const qEn = (faq.questionEn || '').toLowerCase();

    if (qHi === rawClean || qEn === rawClean) {
      score = Math.max(score, 1.0);
    } else if (qHi.includes(rawClean) || qEn.includes(rawClean) || rawClean.includes(qHi) || rawClean.includes(qEn)) {
      score = Math.max(score, 0.85);
    }

    // 2. Alternative phrases match
    if (Array.isArray(faq.alternativePhrases)) {
      for (const phrase of faq.alternativePhrases) {
        const pClean = phrase.toLowerCase().trim();
        if (pClean === rawClean) {
          score = Math.max(score, 0.95);
          break;
        } else if (pClean.includes(rawClean) || rawClean.includes(pClean)) {
          score = Math.max(score, 0.8);
        }
      }
    }

    // 3. Keywords overlap
    if (Array.isArray(faq.keywords) && faq.keywords.length > 0 && queryTokens.length > 0) {
      const kwSet = new Set(faq.keywords.map(k => k.toLowerCase().trim()));
      let matchCount = 0;
      for (const token of queryTokens) {
        if (kwSet.has(token)) {
          matchCount++;
        } else {
          // Check if any keyword contains this token or vice versa
          for (const kw of kwSet) {
            if (kw.includes(token) || token.includes(kw)) {
              matchCount += 0.7;
              break;
            }
          }
        }
      }
      const kwRatio = matchCount / Math.max(1, queryTokens.length);
      const kwScore = matchCount > 0 ? Math.min(0.95, 0.45 + (kwRatio * 0.45)) : 0;
      score = Math.max(score, kwScore);
    }

    // 4. Token Jaccard similarity with Questions
    const faqTokens = [...tokenize(faq.questionHi), ...tokenize(faq.questionEn)];
    const jSim = jaccardSimilarity(queryTokens, faqTokens);
    score = Math.max(score, jSim * 0.85);

    return {
      faq,
      score: Math.round(score * 100) / 100
    };
  });

  // Sort descending by score
  scoredFaqs.sort((a, b) => b.score - a.score);

  const topMatch = scoredFaqs[0];
  const CONFIDENCE_HIGH = 0.50;
  const CONFIDENCE_LOW = 0.25;

  if (topMatch && topMatch.score >= CONFIDENCE_HIGH) {
    return {
      status: 'ANSWERED',
      confidence: topMatch.score,
      matchedFaq: topMatch.faq,
      clarificationOptions: [],
      language: lang
    };
  }

  if (topMatch && topMatch.score >= CONFIDENCE_LOW) {
    // Return clarifying options from top 3 candidates
    const clarificationOptions = scoredFaqs
      .filter(item => item.score >= 0.25)
      .slice(0, 3)
      .map(item => ({
        faqId: item.faq.faqId,
        question: lang === 'HI' ? item.faq.questionHi : item.faq.questionEn,
        score: item.score
      }));

    return {
      status: 'CLARIFYING',
      confidence: topMatch.score,
      matchedFaq: topMatch.faq,
      clarificationOptions,
      language: lang
    };
  }

  return {
    status: 'UNANSWERED',
    confidence: topMatch ? topMatch.score : 0,
    matchedFaq: null,
    clarificationOptions: [],
    language: lang
  };
}

module.exports = {
  detectLanguage,
  tokenize,
  jaccardSimilarity,
  matchFaq
};
