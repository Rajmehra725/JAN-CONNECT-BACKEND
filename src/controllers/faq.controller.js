const Faq = require('../models/Faq');
const BotQueryLog = require('../models/BotQueryLog');
const { matchFaq, detectLanguage } = require('../utils/faqMatcher');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Hash IP address for privacy-safe analytics
 */
function hashIp(ip) {
  if (!ip) return '';
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET || 'salt')).digest('hex').slice(0, 16);
}

/**
 * POST /api/v1/bot/ask
 * Public endpoint to ask the Smart Jan Connect Bot
 */
async function askBot(req, res) {
  try {
    const { query, sessionId } = req.body;
    if (!query || !query.trim()) {
      return errorResponse(res, 'कृपया अपना प्रश्न लिखें। (Please enter your question)', 400);
    }

    const cleanQuery = query.trim();
    const activeFaqs = await Faq.find({ isActive: true }).lean();

    const matchResult = matchFaq(cleanQuery, activeFaqs);

    let answer = null;
    let category = null;

    if (matchResult.status === 'ANSWERED' && matchResult.matchedFaq) {
      answer = matchResult.language === 'HI' ? matchResult.matchedFaq.answerHi : matchResult.matchedFaq.answerEn;
      category = matchResult.matchedFaq.category;

      // Increment usage count asynchronously
      Faq.findByIdAndUpdate(matchResult.matchedFaq._id, { $inc: { usageCount: 1 } }).exec().catch(() => {});
    }

    // Log query in privacy-safe manner
    const log = new BotQueryLog({
      query: cleanQuery,
      detectedLanguage: matchResult.language,
      status: matchResult.status,
      confidence: matchResult.confidence,
      matchedFaqId: matchResult.matchedFaq ? matchResult.matchedFaq._id : null,
      matchedCategory: category || '',
      clarificationOptionsShown: matchResult.clarificationOptions,
      sessionId: sessionId || '',
      ipHash: hashIp(req.ip),
      userAgent: (req.get('user-agent') || '').slice(0, 200)
    });
    await log.save();

    return successResponse(res, {
      status: matchResult.status,
      confidence: matchResult.confidence,
      language: matchResult.language,
      answer,
      matchedFaq: matchResult.matchedFaq
        ? {
            faqId: matchResult.matchedFaq.faqId,
            question: matchResult.language === 'HI' ? matchResult.matchedFaq.questionHi : matchResult.matchedFaq.questionEn,
            category: matchResult.matchedFaq.category
          }
        : null,
      clarificationOptions: matchResult.clarificationOptions,
      fallbackSupport: {
        tawkEnabled: true,
        supportEmail: 'support@janconnect.in',
        portalHelpline: '181 (सीएम हेल्पलाइन मध्य प्रदेश)'
      }
    }, 'बॉट उत्तर प्राप्त हुआ।');
  } catch (error) {
    return errorResponse(res, `बॉट उत्तर प्राप्त करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/bot/faqs
 * Public endpoint to list enabled FAQs for quick browsing
 */
async function getPublicFaqs(req, res) {
  try {
    const { category } = req.query;
    const filter = { isActive: true };
    if (category && category !== 'ALL') filter.category = category;

    const faqs = await Faq.find(filter)
      .select('faqId questionHi questionEn answerHi answerEn category sortOrder')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    return successResponse(res, faqs, 'अक्सर पूछे जाने वाले प्रश्न (FAQ) सूची प्राप्त हुई।');
  } catch (error) {
    return errorResponse(res, `FAQ सूची प्राप्त करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/faqs
 * Super Admin list all FAQs (with pagination and search)
 */
async function getAdminFaqs(req, res) {
  try {
    const { category, search, isActive, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (category && category !== 'ALL') filter.category = category;
    if (isActive !== undefined && isActive !== 'ALL') filter.isActive = String(isActive) === 'true';
    if (search) {
      const reg = new RegExp(search.trim(), 'i');
      filter.$or = [
        { faqId: reg },
        { questionHi: reg },
        { questionEn: reg },
        { answerHi: reg },
        { answerEn: reg },
        { keywords: reg }
      ];
    }

    const [faqs, total] = await Promise.all([
      Faq.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Faq.countDocuments(filter)
    ]);

    return successResponse(res, {
      faqs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'प्रशासनिक FAQ सूची।');
  } catch (error) {
    return errorResponse(res, `FAQ सूची लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/faqs
 * Super Admin create a new FAQ
 */
async function createFaq(req, res) {
  try {
    const {
      faqId,
      questionHi,
      questionEn,
      answerHi,
      answerEn,
      keywords,
      alternativePhrases,
      category = 'GENERAL',
      sortOrder = 0,
      isActive = true
    } = req.body;

    if (!questionHi || !questionEn || !answerHi || !answerEn) {
      return errorResponse(res, 'हिंदी एवं अंग्रेजी प्रश्न तथा उत्तर अनिवार्य हैं।', 400);
    }

    const generatedId = (faqId || `FAQ-${Date.now().toString(36).toUpperCase()}`).trim().toUpperCase();

    const existing = await Faq.findOne({ faqId: generatedId });
    if (existing) {
      return errorResponse(res, `FAQ ID ${generatedId} पहले से मौजूद है।`, 409);
    }

    const faq = new Faq({
      faqId: generatedId,
      questionHi: questionHi.trim(),
      questionEn: questionEn.trim(),
      answerHi: answerHi.trim(),
      answerEn: answerEn.trim(),
      keywords: Array.isArray(keywords) ? keywords.map(k => k.trim()) : (keywords ? String(keywords).split(',').map(k => k.trim()) : []),
      alternativePhrases: Array.isArray(alternativePhrases) ? alternativePhrases.map(p => p.trim()) : [],
      category,
      sortOrder: Number(sortOrder) || 0,
      isActive: Boolean(isActive),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await faq.save();
    return successResponse(res, faq, 'नया FAQ सफलतापूर्वक जोड़ा गया।', 201);
  } catch (error) {
    return errorResponse(res, `FAQ जोड़ने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * PUT /api/v1/faqs/:id
 * Super Admin update existing FAQ
 */
async function updateFaq(req, res) {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return errorResponse(res, 'FAQ नहीं मिला।', 404);
    }

    const updateFields = { ...req.body, updatedBy: req.user._id };
    if (updateFields.keywords && typeof updateFields.keywords === 'string') {
      updateFields.keywords = updateFields.keywords.split(',').map(k => k.trim());
    }

    const updated = await Faq.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true, runValidators: true });
    return successResponse(res, updated, 'FAQ सफलतापूर्वक अद्यतित किया गया।');
  } catch (error) {
    return errorResponse(res, `FAQ अपडेट में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * DELETE /api/v1/faqs/:id
 * Super Admin delete FAQ
 */
async function deleteFaq(req, res) {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id);
    if (!faq) {
      return errorResponse(res, 'FAQ नहीं मिला।', 404);
    }
    return successResponse(res, null, 'FAQ सफलतापूर्वक हटा दिया गया।');
  } catch (error) {
    return errorResponse(res, `FAQ हटाने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/faqs/test
 * Super Admin test query matcher against FAQs
 */
async function testFaqMatcher(req, res) {
  try {
    const { query } = req.body;
    if (!query) {
      return errorResponse(res, 'परीक्षण प्रश्न आवश्यक है।', 400);
    }

    const allFaqs = await Faq.find().lean();
    const result = matchFaq(query.trim(), allFaqs);

    return successResponse(res, result, 'परीक्षण मिलान परिणाम।');
  } catch (error) {
    return errorResponse(res, `परीक्षण में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/faqs/unanswered
 * Super Admin view unanswered questions logged by users
 */
async function getUnansweredQueries(req, res) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: { $in: ['UNANSWERED', 'CLARIFYING'] } };

    const [logs, total] = await Promise.all([
      BotQueryLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      BotQueryLog.countDocuments(filter)
    ]);

    return successResponse(res, {
      unanswered: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'अनुत्तरित प्रश्नों की सूची।');
  } catch (error) {
    return errorResponse(res, `अनुत्तरित प्रश्न लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/faqs/analytics
 * Super Admin view bot usage metrics and accuracy
 */
async function getBotAnalytics(req, res) {
  try {
    const [
      totalQueries,
      answeredQueries,
      clarifyingQueries,
      unansweredQueries,
      topFaqs
    ] = await Promise.all([
      BotQueryLog.countDocuments(),
      BotQueryLog.countDocuments({ status: 'ANSWERED' }),
      BotQueryLog.countDocuments({ status: 'CLARIFYING' }),
      BotQueryLog.countDocuments({ status: 'UNANSWERED' }),
      Faq.find({ isActive: true }).sort({ usageCount: -1 }).limit(5).select('faqId questionHi usageCount category').lean()
    ]);

    const accuracyRate = totalQueries > 0 ? Math.round(((answeredQueries + clarifyingQueries * 0.5) / totalQueries) * 100) : 100;

    return successResponse(res, {
      totalQueries,
      answeredQueries,
      clarifyingQueries,
      unansweredQueries,
      accuracyRate,
      topFaqs
    }, 'बॉट विश्लेषण प्राप्त हुआ।');
  } catch (error) {
    return errorResponse(res, `बॉट विश्लेषण लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

module.exports = {
  askBot,
  getPublicFaqs,
  getAdminFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  testFaqMatcher,
  getUnansweredQueries,
  getBotAnalytics
};
