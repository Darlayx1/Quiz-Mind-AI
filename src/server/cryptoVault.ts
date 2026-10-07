import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;
const SALT = 'quizmind-ai-fixed-salt-v1';

/**
 * Mendapatkan derived key 256-bit (32 bytes) dari secret string.
 */
function getDerivedKey(secret?: string): Buffer {
  const masterKey = secret || process.env.ENCRYPTION_SECRET || process.env.GEMINI_API_KEY || 'default-quizmind-vault-key-32b-str';
  return crypto.scryptSync(masterKey, SALT, 32);
}

/**
 * Enkripsi teks menggunakan AES-256-GCM
 * Output format: base64(iv + authTag + ciphertext)
 */
export function encryptData(plainText: string, customSecret?: string): string {
  try {
    const key = getDerivedKey(customSecret);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Satukan iv (12B) + authTag (16B) + ciphertext
    const payload = Buffer.concat([iv, authTag, encrypted]);
    return payload.toString('base64');
  } catch (err) {
    console.error('Enkripsi gagal:', err);
    throw new Error('Gagal mengenkripsi data secara aman');
  }
}

/**
 * Dekripsi data terenkripsi AES-256-GCM
 */
export function decryptData(encryptedBase64: string, customSecret?: string): string {
  try {
    const key = getDerivedKey(customSecret);
    const raw = Buffer.from(encryptedBase64, 'base64');

    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Panjang payload enkripsi tidak valid');
    }

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const cipherText = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Dekripsi gagal:', err);
    throw new Error('Gagal mendekripsi payload (integritas atau kunci tidak cocok)');
  }
}

/**
 * Menyamarkan string sensitif untuk log / response aman (misal API Key)
 */
export function maskSecret(secret?: string): string {
  if (!secret) return 'TIDAK TERPASANG';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
