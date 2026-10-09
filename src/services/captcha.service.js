const crypto = require("crypto");

// In-memory store for mathematical CAPTCHA challenges with automated TTL cleanup
const captchaStore = new Map();
const CAPTCHA_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Periodic cleanup of expired challenges
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [challengeId, entry] of captchaStore.entries()) {
    if (entry.expiresAt < now) {
      captchaStore.delete(challengeId);
    }
  }
}, 60 * 1000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Generate a new server-side mathematical CAPTCHA challenge
 * Returns { challengeId, question }
 * Never returns the expected answer in the client payload!
 */
function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 20) + 1; // 1 to 20
  const num2 = Math.floor(Math.random() * 15) + 1; // 1 to 15
  const isAddition = Math.random() > 0.3; // mostly addition

  let question = "";
  let answer = 0;

  if (isAddition) {
    question = `${num1} + ${num2} = ?`;
    answer = num1 + num2;
  } else {
    // Ensure positive outcome
    const larger = Math.max(num1, num2);
    const smaller = Math.min(num1, num2);
    question = `${larger} - ${smaller} = ?`;
    answer = larger - smaller;
  }

  const challengeId = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;

  captchaStore.set(challengeId, {
    answer: String(answer),
    expiresAt,
    used: false,
  });

  return {
    challengeId,
    question,
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
}

/**
 * Verify mathematical CAPTCHA solution
 * Single-use, rejects expired or reused challenges
 */
function verifyCaptcha(challengeId, userAnswer) {
  if (!challengeId || userAnswer === undefined || userAnswer === null) {
    return { valid: false, reason: "CAPTCHA चुनौती अथवा उत्तर गायब है।" };
  }

  const record = captchaStore.get(challengeId);

  if (!record) {
    return { valid: false, reason: "अमान्य अथवा समय समाप्त CAPTCHA चुनौती। कृपया पुनः प्रयास करें।" };
  }

  if (record.used) {
    captchaStore.delete(challengeId);
    return { valid: false, reason: "यह CAPTCHA चुनौती पहले ही उपयोग की जा चुकी है।" };
  }

  if (Date.now() > record.expiresAt) {
    captchaStore.delete(challengeId);
    return { valid: false, reason: "CAPTCHA चुनौती की समय सीमा समाप्त हो गई है।" };
  }

  // Mark as used immediately to prevent replay
  record.used = true;
  captchaStore.delete(challengeId);

  const cleanUserAnswer = String(userAnswer).trim();
  const isMatch = cleanUserAnswer === record.answer;

  if (!isMatch) {
    return { valid: false, reason: "गणितीय CAPTCHA का उत्तर गलत है। कृपया पुनः प्रयास करें।" };
  }

  return { valid: true };
}

module.exports = {
  generateCaptcha,
  verifyCaptcha,
};
