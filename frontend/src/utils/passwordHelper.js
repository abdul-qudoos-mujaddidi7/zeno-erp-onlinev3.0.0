/**
 * Password Helper Utility
 * 
 * IMPORTANT: This is a client-side password utility for local demonstration.
 * In production, ALWAYS hash passwords on the server-side using bcrypt or similar.
 * Passwords should NEVER be transmitted or stored unhashed.
 */

/**
 * Simple hash function for client-side password storage (FOR DEMO ONLY)
 * In production, use server-side bcrypt or similar
 * 
 * @param {string} password - The password to hash
 * @returns {Promise<string>} - The hashed password
 */
export async function hashPassword(password) {
  // For production: send to server for bcrypt hashing
  // This is a simple client-side hash for local storage only
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hashArray = Array.from(new Uint8Array(buffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify a password against a hash
 * 
 * @param {string} password - The password to verify
 * @param {string} hash - The hash to compare against
 * @returns {Promise<boolean>} - Whether the password matches
 */
export async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * Validate password strength
 * 
 * @param {string} password - The password to validate
 * @returns {object} - Validation result with score and feedback
 */
export function validatePasswordStrength(password) {
  let score = 0;
  const feedback = [];

  if (!password) {
    return { score: 0, valid: false, feedback: ['Password is required'] };
  }

  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('At least 8 characters required');
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add numbers');
  }

  if (/[!@#$%^&*]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add special characters (!@#$%^&*)');
  }

  const strength = score <= 2 ? 'Weak' : score <= 4 ? 'Fair' : score <= 5 ? 'Good' : 'Strong';
  const valid = score >= 5;

  return {
    score,
    strength,
    valid,
    feedback: feedback.length > 0 ? feedback : ['Password is strong']
  };
}

/**
 * Generate a temporary password
 * 
 * @returns {string} - A randomly generated password
 */
export function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const all = uppercase + lowercase + numbers + special;

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = password.length; i < 12; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Password requirements documentation
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: true,
  specialChars: '!@#$%^&*'
};
