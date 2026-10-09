const multer = require('multer');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const MediaAsset = require('../models/MediaAsset');
const { successResponse, errorResponse } = require('../utils/response');

// Memory storage for multer
const storage = multer.memoryStorage();

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed mimetypes: images and PDF
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('केवल JPG, PNG, WEBP अथवा PDF फाइलें स्वीकार्य हैं।'));
    }
  }
});

/**
 * Upload buffer to Cloudinary
 */
function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

/**
 * POST /api/v1/uploads
 * Upload a media file (profile photo, complaint evidence, notice attachment, etc.)
 */
async function uploadMedia(req, res) {
  try {
    if (!req.file) {
      return errorResponse(res, 'कोई फ़ाइल अपलोड नहीं की गई।', 400);
    }

    if (!isCloudinaryConfigured()) {
      return errorResponse(
        res,
        'Cloudinary सेवा वर्तमान में कॉन्फ़िगर नहीं है। कृपया .env में CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, और CLOUDINARY_API_SECRET सेट करें।',
        'CLOUDINARY_NOT_CONFIGURED',
        503
      );
    }

    const { purpose = 'GENERAL', relatedRecordType = 'GENERAL', relatedRecordId } = req.body;

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'jan-connect',
      resource_type: req.file.mimetype === 'application/pdf' ? 'raw' : 'image'
    });

    const mediaAsset = new MediaAsset({
      cloudinaryAssetId: result.asset_id || result.public_id,
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: result.resource_type || 'image',
      format: result.format || (req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg'),
      fileSize: req.file.size,
      uploadedById: req.user._id,
      relatedRecordType,
      relatedRecordId: relatedRecordId || null,
      purpose,
      accessClassification: 'RESTRICTED'
    });

    await mediaAsset.save();

    return successResponse(res, {
      assetId: mediaAsset._id,
      url: result.secure_url,
      publicId: result.public_id,
      format: mediaAsset.format
    }, 'फ़ाइल सफलतापूर्वक अपलोड हो गई।', 201);
  } catch (error) {
    return errorResponse(res, `अपलोड विफल: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/uploads/status
 * Check if Cloudinary service is ready
 */
async function getUploadStatus(req, res) {
  const configured = isCloudinaryConfigured();
  return successResponse(res, {
    configured,
    maxFileSize: '5MB',
    supportedFormats: ['jpg', 'png', 'webp', 'pdf']
  }, configured ? 'Cloudinary सेवा सक्रिय है।' : 'Cloudinary क्रेडेंशियल्स अनुपलब्ध हैं।');
}

module.exports = {
  uploadMiddleware,
  uploadMedia,
  getUploadStatus
};
