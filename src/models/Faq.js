const mongoose = require('mongoose');

const FAQ_CATEGORIES = [
  'ACCOUNT_LOGIN',
  'PROFILE_UPDATE',
  'MEMBER_REGISTRATION',
  'DIRECTORY_DESIGNATION',
  'COMPLAINT_MANAGEMENT',
  'COMPLAINT_STATUS',
  'NOTIFICATIONS',
  'TECHNICAL_SUPPORT',
  'GENERAL'
];

const faqSchema = new mongoose.Schema(
  {
    faqId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    questionHi: {
      type: String,
      required: [true, 'हिंदी प्रश्न अनिवार्य है'],
      trim: true,
      maxlength: 300
    },
    questionEn: {
      type: String,
      required: [true, 'English question is required'],
      trim: true,
      maxlength: 300
    },
    answerHi: {
      type: String,
      required: [true, 'हिंदी उत्तर अनिवार्य है'],
      trim: true,
      maxlength: 3000
    },
    answerEn: {
      type: String,
      required: [true, 'English answer is required'],
      trim: true,
      maxlength: 3000
    },
    keywords: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    alternativePhrases: [
      {
        type: String,
        trim: true
      }
    ],
    category: {
      type: String,
      enum: FAQ_CATEGORIES,
      default: 'GENERAL',
      index: true
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true
    },
    usageCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

faqSchema.index({ category: 1, isActive: 1 });
faqSchema.index({ keywords: 1 });

module.exports = mongoose.model('Faq', faqSchema);
module.exports.FAQ_CATEGORIES = FAQ_CATEGORIES;
