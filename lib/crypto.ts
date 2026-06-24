/**
 * Mã hoá / giải mã dữ liệu nhạy cảm (cookies, session TikTok)
 * Dùng AES-256-GCM với key từ biến môi trường ENCRYPTION_KEY hoặc fallback mặc định.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    // Hash the key to ensure correct length for AES-256
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Fallback: project-specific key (only safe for local dev)
  return crypto.createHash('sha256').update('kolia-tiktok-crawl-local-dev-key').digest();
}

/**
 * Mã hoá chuỗi JSON → base64 an toàn
 */
export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Giải mã chuỗi base64 → JSON gốc
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
