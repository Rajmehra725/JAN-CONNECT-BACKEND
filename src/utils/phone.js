/**
 * Canonical phone number normalization and validation for Jan Connect
 * Ensures consistent 10-digit mobile number identity across the entire application.
 */

function normalizePhoneNumber(input) {
  if (input === null || input === undefined) {
    return { isValid: false, normalized: '', error: 'मोबाइल नंबर रिक्त है' };
  }

  let str = String(input).trim();

  // If scientific notation e.g. 9.87654321e+09 or 9.87654321E9
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // Fallback
    }
  }

  // Remove common punctuation/separators (spaces, hyphens, parentheses, plus)
  let digits = str.replace(/\D/g, '');

  // Strip international country code prefix +91 or 91
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // Strip leading 0
    digits = digits.slice(1);
  } else if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // Validate exactly 10 digits
  if (digits.length !== 10) {
    return {
      isValid: false,
      normalized: digits,
      error: `अमान्य मोबाइल नंबर [${str}]: 10 अंक होने चाहिए (वर्तमान में ${digits.length} अंक हैं)`
    };
  }

  // In India, mobile numbers generally start with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      isValid: false,
      normalized: digits,
      error: `मोबाइल नंबर 6, 7, 8 या 9 से प्रारंभ होना चाहिए: [${digits}]`
    };
  }

  return {
    isValid: true,
    normalized: digits,
    formatted: `+91 ${digits}`
  };
}

module.exports = {
  normalizePhoneNumber
};
