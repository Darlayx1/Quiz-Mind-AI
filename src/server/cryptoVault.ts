import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Mendapatkan derived key 256-bit (32 bytes) dari secret string.
 */
function getDerivedKey(salt: Buffer, secret?: string): Buffer {
  const masterKey = secret || process.env.ENCRYPTION_SECRET;
  if (!masterKey || masterKey.length < 32 || /quizmind-ai-super-secret|default-quizmind/.test(masterKey))
    throw new Error('ENCRYPTION_SECRET harus berupa secret acak khusus minimal 32 karakter.');
  return crypto.scryptSync(masterKey, salt, 32);
}

/**
 * Enkripsi teks menggunakan AES-256-GCM
 * Output format: base64(iv + authTag + ciphertext)
 */
export function encryptData(plainText: string, customSecret?: string): string {
  try {
    const salt = crypto.randomBytes(16);
    const key = getDerivedKey(salt, customSecret);
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
    const payload = Buffer.concat([Buffer.from([2]), salt, iv, authTag, encrypted]);
    return payload.toString('base64');
  } catch (err) {
    throw new Error('Gagal mengenkripsi data secara aman');
  }
}

/**
 * Dekripsi data terenkripsi AES-256-GCM
 */
export function decryptData(encryptedBase64: string, customSecret?: string): string {
  try {
    const raw = Buffer.from(encryptedBase64, 'base64');

    if (raw.length < 1 + 16 + IV_LENGTH + AUTH_TAG_LENGTH || raw[0] !== 2) {
      throw new Error('Panjang payload enkripsi tidak valid');
    }

    const salt = raw.subarray(1, 17);
    const key = getDerivedKey(salt, customSecret);
    const iv = raw.subarray(17, 17 + IV_LENGTH);
    const authTag = raw.subarray(17 + IV_LENGTH, 17 + IV_LENGTH + AUTH_TAG_LENGTH);
    const cipherText = raw.subarray(17 + IV_LENGTH + AUTH_TAG_LENGTH);

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
