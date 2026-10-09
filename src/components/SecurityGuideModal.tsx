import React, { useState } from 'react';
import { isCloudActive } from '../api.js';
import { Button } from './Button.js';
import {
  ShieldCheck,
  Lock,
  GitBranch,
  X,
  Copy,
  Check,
  Terminal,
  KeyRound,
  FileCode,
} from 'lucide-react';

interface SecurityGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  maskedKey: string;
  personalMode: boolean;
}

export const SecurityGuideModal: React.FC<SecurityGuideModalProps> = ({
  isOpen,
  onClose,
  maskedKey,
  personalMode,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [testText, setTestText] = useState('Data Ujian & Kunci Jawaban Rahasia');
  const [encryptedOutput, setEncryptedOutput] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleTestEncrypt = async () => {
    try {
      setIsEncrypting(true);
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(testText));
      setEncryptedOutput(btoa(String.fromCharCode(...new Uint8Array(ciphertext))));
      setDecryptedOutput(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)));
    } catch (err) {
      setDecryptedOutput('Uji enkripsi memerlukan HTTPS atau localhost.');
    } finally {
      setIsEncrypting(false);
    }
  };

  const gitCommands = [
    'git init',
    'git add .',
    'git status   # Pastikan .env TIDAK muncul (sudah terlindungi oleh .gitignore)',
    'git commit -m "feat: generator kuis gemini 3.8 flash berpikir mendalam & google grounding"',
    'git branch -M main',
    'git remote add origin https://github.com/USERNAME/quizmind-ai.git',
    'git push -u origin main',
  ].join('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 sm:p-8 flex flex-col max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Pusat Keamanan & Kesiapan GitHub
              </h2>
              <p className="text-xs text-slate-500">
                {personalMode ? 'Penggunaan kunci pribadi di browser' : 'Arsitektur proteksi API key dan enkripsi AES-256-GCM'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Server-Side API Key & Gitignore */}
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span>Privasi API Key</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              {isCloudActive() ? 'Vault server menyimpan koleksi key terenkripsi pada disk persisten. Browser hanya menerima metadata dan status. Login, cookie HttpOnly, serta token keamanan melindungi akses. Penggantian key tidak memerlukan build ulang. Kelola pencabutan dan kuota melalui Google AI Studio.' : personalMode ? 'Key pribadi dikirim langsung ke Google Gemini (Google AI Studio). Vault menyimpan koleksi terenkripsi AES-256-GCM di browser dengan satu kata sandi melalui PBKDF2-SHA-256. Kata sandi tidak disimpan. Reload, tombol Kunci, atau 15 menit tanpa aktivitas mengunci sesi. Ekspor cadangan terenkripsi untuk pemulihan. Enkripsi tidak melindungi key aktif dari skrip berbahaya atau perangkat terkompromi.' : 'Kunci server dapat disimpan dalam secret GEMINI_API_KEY di hosting. Pengelola API key mendukung vault browser terenkripsi serta vault server dengan login pemilik dan disk persisten.'}
            </p>
            <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
              <span className="text-slate-500">{personalMode ? 'Status kunci pribadi:' : 'Status kunci server:'}</span>
              <span className="font-semibold text-emerald-700">{maskedKey}</span>
            </div>
          </div>

          {!personalMode && <>
          {/* Section 2: Git & GitHub Safe Push */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">
              <GitBranch className="w-4 h-4 text-indigo-600" />
              <span>Langkah Push Aman ke GitHub</span>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              File <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">.gitignore</code> mengecualikan file secret dan database vault untuk membantu mencegah kredensial masuk ke repository. File yang sudah terlanjur dilacak Git perlu ditangani terpisah:
            </p>

            <div className="relative bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
              <pre>{gitCommands}</pre>
              <button
                onClick={() => copyToClipboard(gitCommands, 1)}
                className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedIndex === 1 ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 3: Interactive AES-256-GCM Vault Demo */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-900 mb-2">
              <Lock className="w-4 h-4 text-blue-600" />
              <span>Uji Coba Enkripsi Lokal AES-256-GCM</span>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Demo ini berjalan di browser dengan key acak sementara. Data demo tidak dikirim ke server dan tidak disimpan.
            </p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="Ketik teks untuk diuji enkripsinya..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 outline-none"
                />
                <Button
                  label={isEncrypting ? 'Memproses...' : 'Uji Enkripsi'}
                  variant="primary"
                  size="sm"
                  onClick={handleTestEncrypt}
                  disabled={isEncrypting}
                />
              </div>

              {encryptedOutput && (
                <div className="space-y-2 text-xs bg-white p-3 rounded-lg border border-slate-200 font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">
                      Payload Terenkripsi (AES-256-GCM Base64):
                    </span>
                    <span className="text-blue-700 break-all select-all">
                      {encryptedOutput}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">
                      Hasil Dekripsi Terverifikasi:
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      {decryptedOutput}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          </>}
        </div>

        {/* Footer */}
        <div className="pt-6 mt-6 border-t border-slate-200 flex justify-end">
          <Button
            label="Tutup Panduan"
            variant="outline"
            size="md"
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
};
