import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Key material comes from AI_CONFIG_SECRET if set, else JWT_SECRET. */
function secretKey(): Buffer {
  const secret = process.env.AI_CONFIG_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET (or AI_CONFIG_SECRET) must be set to store the API key securely');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
