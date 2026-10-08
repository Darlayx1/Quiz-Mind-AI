import { randomBytes, scryptSync } from 'node:crypto';
if (!process.stdin.isTTY) throw new Error('Jalankan dari terminal interaktif untuk memasukkan kata sandi tanpa ditampilkan.');
process.stdout.write('Kata sandi pemilik vault (minimal 12 karakter): ');
process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
let password = '';
process.stdin.on('data', chunk => {
  for (const char of chunk) {
    if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false); process.stdin.pause();
      if (password.length < 12 || password.length > 1024) { process.stderr.write('\nKata sandi harus 12–1.024 karakter.\n'); process.exit(1); }
      const salt = randomBytes(16), hash = scryptSync(password,salt,64); password = '';
      process.stdout.write('\nSimpan sebagai VAULT_PASSWORD_HASH di secret hosting:\n' + 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex') + '\n');
      process.exit(0);
    } else if (char === '\u007f' || char === '\b') password = password.slice(0,-1);
    else if (char >= ' ') password += char;
  }
});
