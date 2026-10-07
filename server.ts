import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQuizWithGemini } from './src/server/geminiService.js';
import { encryptData, decryptData, maskSecret } from './src/server/cryptoVault.js';
import { QuizConfig } from './src/types/quiz.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production' || __dirname.endsWith('dist-server');
const staticDir = path.resolve(__dirname, __dirname.endsWith('dist-server') ? '../dist' : 'dist');

app.use(express.json({ limit: '15mb' }));

// =========================================================================
// API ROUTES
// =========================================================================

/**
 * Health Check & Status Keamanan API Key
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const masked = maskSecret(process.env.GEMINI_API_KEY);

  res.json({
    status: 'ok',
    version: '1.0.0',
    model: 'gemini-3.8-flash',
    features: {
      deepThinking: true,
      googleSearchGrounding: true,
      serverSideProxy: true,
      aes256GcmVault: true,
    },
    security: {
      hasApiKey: hasKey,
      maskedKey: hasKey ? masked : 'Belum diisi di .env',
      gitProtected: true, // .env terproteksi di .gitignore
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint Utama: Buat Kuis dengan Gemini 3.8 Flash + Deep Thinking + Google Grounding
 */
app.post('/api/generate-quiz', async (req: Request, res: Response) => {
  try {
    const {
      topic,
      studyMaterial,
      difficulty = 'intermediate',
      questionCount = 5,
      timeLimitMinutes = 10,
      language = 'id',
      enableGrounding = true,
    } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Topik kuis tidak boleh kosong.',
      });
    }

    const countNum = Math.min(Math.max(Number(questionCount) || 5, 1), 20);
    const validDifficulty = ['beginner', 'intermediate', 'advanced', 'expert'].includes(difficulty)
      ? difficulty
      : 'intermediate';

    const config: QuizConfig = {
      topic: topic.trim(),
      studyMaterial: typeof studyMaterial === 'string' ? studyMaterial.trim() : undefined,
      difficulty: validDifficulty as any,
      questionCount: countNum,
      timeLimitMinutes: Math.max(Number(timeLimitMinutes) || 10, 1),
      language: language === 'en' ? 'en' : 'id',
      enableGrounding: Boolean(enableGrounding),
    };

    const quiz = await generateQuizWithGemini(config);

    // Enkripsi hash checksum verifikasi integritas kuis
    const integrityToken = encryptData(JSON.stringify({ quizId: quiz.id, createdAt: quiz.createdAt }));

    return res.json({
      success: true,
      quiz,
      integrityToken,
    });
  } catch (error: any) {
    console.error('Error saat membuat kuis:', error);
    let errorMessage = error?.message || 'Terjadi kesalahan sistem saat menghubungi model Gemini.';
    if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
      errorMessage = 'Server Gemini sedang mengalami lonjakan permintaan sementara (503 High Demand). Silakan klik "Buat Kuis" kembali dalam beberapa saat.';
    } else if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      errorMessage = 'Batas kuota permintaan tercapai sementara waktu. Silakan coba kembali dalam beberapa detik.';
    }
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * Endpoint Keamanan Vault: Enkripsi teks dengan AES-256-GCM
 */
app.post('/api/vault/encrypt', (req: Request, res: Response) => {
  try {
    const { text, secret } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Field "text" wajib diisi.' });
    }
    const encrypted = encryptData(text, secret);
    return res.json({ success: true, encrypted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint Keamanan Vault: Dekripsi teks dengan AES-256-GCM
 */
app.post('/api/vault/decrypt', (req: Request, res: Response) => {
  try {
    const { encrypted, secret } = req.body;
    if (!encrypted || typeof encrypted !== 'string') {
      return res.status(400).json({ error: 'Field "encrypted" wajib diisi.' });
    }
    const decrypted = decryptData(encrypted, secret);
    return res.json({ success: true, decrypted });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: 'Dekripsi gagal atau kunci salah.' });
  }
});

// Pastikan semua rute /api/* yang tidak cocok selalu mengembalikan format JSON, bukan HTML Vite
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
});

// =========================================================================
// VITE DEV SERVER / STATIC ASSETS HANDLER
// =========================================================================
async function startServer() {
  if (isProduction) {
    app.use(express.static(staticDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuizMind AI] Server aktif di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal memulai server:', err);
  process.exit(1);
});
