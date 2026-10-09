const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const v1Router = require('./routes/index');
const { generalLimiter } = require('./middleware/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

// Security headers
app.use(helmet());

// Allowed CORS origins
const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman) or matching origin
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('CORS नीति द्वारा अवरुद्ध उत्पत्ति: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-captcha-id',
    'x-captcha-answer'
  ]
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// General rate limiter
app.use(generalLimiter);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'जन कनेक्ट बैकएंड एपीआई सेवा सक्रिय है।',
    apiDocs: '/api/v1/health',
    disclaimer: 'यह एक स्वतंत्र नागरिक सेवा प्रबंधन पोर्टल है।'
  });
});

// API v1 prefix (and backwards-compatible /api alias)
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
