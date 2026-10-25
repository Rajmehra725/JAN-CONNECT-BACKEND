const mongoose = require('mongoose');

const botQueryLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    detectedLanguage: {
      type: String,
      enum: ['HI', 'EN', 'MIXED'],
      default: 'HI'
    },
    status: {
      type: String,
      enum: ['ANSWERED', 'CLARIFYING', 'UNANSWERED', 'HANDED_OFF'],
      default: 'UNANSWERED',
      index: true
    },
    confidence: {
      type: Number,
      default: 0
    },
    matchedFaqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faq',
      default: null,
      index: true
    },
    matchedCategory: {
      type: String,
      default: ''
    },
    clarificationOptionsShown: [
      {
        faqId: String,
        question: String
      }
    ],
    sessionId: {
      type: String,
      trim: true,
      default: ''
    },
    ipHash: {
      type: String,
      trim: true,
      default: ''
    },
    userAgent: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

botQueryLogSchema.index({ createdAt: -1 });
botQueryLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('BotQueryLog', botQueryLogSchema);
