# QuizMind AI: Generator Kuis Berpikir Mendalam & Terverifikasi Fakta

Platform kuis interaktif modern yang memanfaatkan model **Gemini 3.8 Flash** dengan kemampuan **berpikir mendalam (deep thinking)** serta **Google Search Grounding** untuk menghasilkan soal-soal berkualitas tinggi, bebas halusinasi, dan dilengkapi verifikasi sumber rujukan faktual.

> [!IMPORTANT]
> **Keputusan Kunci yang Dikonfirmasi**:
> - **Mode Kuis**: Kuis interaktif dengan timer real-time, penilaian instan, kartu navigasi soal, dan lembar pembahasan dengan sumber grounding Google.
> - **Sumber Pembuatan Kuis**: Fleksibel melalui input teks topik bebas maupun unggah dokumen/catatan materi (teks/catatan kuliah/ringkasan).
> - **Keamanan API & Git**: API key dikelola di sisi server Express via file `.env` yang dilindungi `.gitignore` serta dienkripsi menggunakan AES-256-GCM untuk memastikan keamanan berlapis saat repositori dipush ke GitHub.
> - **Gaya Tampilan Antarmuka**: Modern Clean akademis profesional yang lapang tanpa kotak bertumpuk (*zero-pill discipline* dan pemisah garis modern yang lega).

---

## 1. Overview & Core Concept

- **Apa yang Dibangun**: Aplikasi kuis fullstack terintegrasi yang memungkinkan pendidik, siswa, dan pembelajar umum membuat kuis komprehensif secara otomatis dari topik apa pun atau bahan bacaan yang diunggah. AI memproses soal dengan penalaran tingkat tinggi dan memvalidasi keakuratan fakta melalui web search grounding langsung dari Google.
- **Target Pengguna**: Siswa, mahasiswa, guru, dosen, dan pembelajar mandiri yang membutuhkan instrumen evaluasi akurat dan materi latihan berkualitas tinggi.
- **Nilai Tambah Utama**: Soal tidak hanya memiliki kunci jawaban, melainkan disertai penalaran mendalam langkah-demi-langkah (*deep reasoning explanation*) dan kutipan tautan/sumber fakta langsung dari web berkat integrasi Google Grounding.

---

## 2. User Experience & Visual Design

### A. Alur Pengguna (User Flows)
1. **Konfigurasi Kuis**: Pengguna memilih mode input (Topik Bebas atau Unggah Catatan Teks), menentukan jumlah soal (3, 5, 10, atau 15), memilih tingkat kesulitan (Pemula, Menengah, Mahir, Olimpiade), batas waktu per soal (atau waktu total), dan preferensi bahasa (Bahasa Indonesia / English).
2. **Generasi Berpikir Mendalam**: Saat tombol "Buat Kuis AI" ditekan, sistem menampilkan visualisasi proses reasoning berlapis (*Menganalisis topik → Menjalankan Google Grounding → Penalaran mendalam → Merumuskan opsi & distractor realistis*).
3. **Pengerjaan Interaktif**:
   - Tampilan soal satu-per-satu yang lapang dan fokus.
   - Countdown timer interaktif dengan peringatan visual halus.
   - Matriks navigasi nomor soal yang responsif.
   - Penandaan soal ragu-ragu (*bookmark for review*).
4. **Hasil & Evaluasi Komprehensif**:
   - Skor instan, persentase akurasi, dan waktu pengerjaan.
   - Pembahasan mendalam untuk setiap nomor soal.
   - Tautan sumber fakta (*Google Search Grounding citations*) untuk tiap jawaban kunci.
   - Fitur Retake Kuis dan Simpan Riwayat (*localStorage*).
   - Ekspor lembar soal dan kunci jawaban (Cetak / Unduh Format Laporan).

### B. Desain Visual & Tata Letak
- **Arah Estetika**: *Modern Clean Academic* — dominasi ruang putih/krem lembut (`#F8FAFC` dan `#FFFFFF`), border hairline halus (`#E2E8F0`), dan tipografi bersih yang berwibawa.
- **Palet Warna (Aturan 60-30-10)**:
  - 60% Kanvas Netral: Latar belakang bersih yang lega dan tidak sesak (`slate-50` / `white`).
  - 30% Struktur & Teks: Teks slate gelap yang tajam (`slate-900`, `slate-700`) dan pembatas garis minimalis.
  - 10% Aksen Aksi: Biru royal akademis (`blue-600` / `indigo-600`) untuk CTA utama dan indikator aktif.
- **Zero-Pill & Tipografi**:
  - Metadata (tingkat kesulitan, jumlah soal, waktu) ditampilkan sebagai teks bebas kapsul dengan pemisah tipografis (`·` dan `/`).
  - Dilarang membungkus teks statis dalam badge kapsul berwarna-warni yang berlebihan.
  - Skala font proporsional dengan `tabular-nums` untuk angka timer dan nomor soal.
- **Adaptasi Perangkat**:
  - Desktop: Tata letak dua kolom fungsional (Ringkasan/Pengaturan di panel sisi, kanvas soal utama di tengah).
  - Mobile: Optimal untuk jangkauan ibu jari (thumb zone) dengan sticky bottom navigation untuk aksi Selanjutnya/Selesai.

---

## 3. Keputusan Produk & Trade-Offs

- **Model AI: `gemini-3.8-flash`**:
  - *Pendekatan*: Menggunakan `@google/genai` dengan konfigurasi penalaran `thinkingConfig` dan `tools: [{ googleSearch: {} }]`.
  - *Alasan*: Menawarkan latensi cepat dengan kualitas reasoning setara model pro, serta dukungan resmi Google Search Grounding untuk menjamin keabsahan kunci jawaban.
- **Arsitektur Server-Side Proxy Express**:
  - *Pendekatan*: Semua pemanggilan Gemini API dijalankan di backend Node.js/Express (`/api/generate-quiz`).
  - *Alasan*: Sesuai standar keamanan sistem; API key tersimpan di `process.env.GEMINI_API_KEY` dan tidak pernah bocor ke bundel JavaScript browser.
- **Keamanan & Kesiapan GitHub**:
  - *Pendekatan*:
    1. Konfigurasi `.gitignore` ketat untuk mengecualikan `.env`, `.env.local`, dan file kredensial.
    2. Modul `crypto` (AES-256-GCM) untuk pengamanan hashing/enkripsi payload internal.
    3. Penyediaan file `.env.example` yang jelas untuk pengguna lain saat melakukan `git clone`.

---

## 4. Arsitektur Teknis & Strategi Data

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Client                        │
│                                                             │
│  ┌────────────────────┐  ┌───────────────────────────────┐  │
│  │   Quiz Creator     │  │      Interactive Runner       │  │
│  │  - Topik / Catatan │  │  - Countdown Timer            │  │
│  │  - Tingkat / Format│  │  - Navigasi Nomor Soal        │  │
│  │  - Unggah Dokumen  │  │  - Lembar Hasil & Pembahasan  │  │
│  └─────────┬──────────┘  └───────────────▲───────────────┘  │
└────────────┼─────────────────────────────┼──────────────────┘
             │ POST /api/generate-quiz     │
             ▼                             │
┌─────────────────────────────────────────────────────────────┐
│                 Express Backend (server.ts)                 │
│                                                             │
│  ┌────────────────────────┐   ┌──────────────────────────┐  │
│  │   Env & Key Vault      │   │   Payload Sanitizer      │  │
│  │  - AES-256 Protection  │   │  - Strict Schema Parser  │  │
│  │  - .env (Server-only)  │   │  - Grounding Extraction  │  │
│  └───────────┬────────────┘   └─────────────▲────────────┘  │
│              │                              │               │
│              ▼                              │               │
│  ┌──────────────────────────────────────────┴────────────┐  │
│  │                Google GenAI SDK Client                │  │
│  │  - Model: gemini-3.8-flash                            │  │
│  │  - Thinking: Enabled (Deep Reasoning)                 │  │
│  │  - Tools: [{ googleSearch: {} }] (Search Grounding)   │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │    Google Gemini API Cloud   │
               │  - Web Search Grounding      │
               │  - Deep Thinking Reflection  │
               └──────────────────────────────┘
```

### Data Model Soal & Kuis:
```typescript
interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

interface Question {
  id: string;
  question: string;
  options: string[]; // 4 Opsi (A, B, C, D)
  correctAnswerIndex: number;
  explanation: string; // Penjelasan penalaran mendalam
  groundingSources: GroundingSource[]; // Sumber web Google Grounding
}

interface Quiz {
  id: string;
  title: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  createdAt: string;
  timeLimitMinutes: number;
  questions: Question[];
}
```

---

## 5. Rencana Langkah Implementasi

1. **Konfigurasi Full-Stack & Keamanan Server**:
   - Siapkan `server.ts` dengan Express, pembacaan `.env` aman, modul utilitas enkripsi internal AES-256-GCM, dan integrasi `@google/genai` resmi.
   - Konfigurasi skrip `package.json` (`dev`, `build`, `start`) dan proxy Vite ke Express.
   - Amankan `.gitignore` dan buat dokumentasi repositori `.env.example` serta `README.md` siap push ke GitHub.
2. **Endpoint AI dengan Deep Thinking & Grounding**:
   - Implementasikan endpoint `/api/generate-quiz` yang memanggil `gemini-3.8-flash` dengan `thinkingConfig` dan `googleSearch: {}`.
   - Ekstrak grounding metadata (web citations) dan parse respons menjadi struktur kuis yang valid dan tahan galat.
3. **Komponen Frontend & Antarmuka Modern Clean**:
   - Buat `TopBar` minimalis 3-zona sesuai standar desain.
   - Komponen Form Pembuat Kuis (input topik, textarea catatan materi, filter tingkat kesulitan, durasi timer).
   - Tampilan Loading Interaktif yang menampilkan status berpikir mendalam dan pencarian grounding Google secara real-time.
   - Komponen Interactive Quiz Runner dengan timer, kartu soal yang lega, dan penanda ragu-ragu.
   - Komponen Lembar Hasil & Pembahasan dengan tautan sumber grounding Google dan penalaran AI.
   - Penyimpanan riwayat kuis lokal (*localStorage*) dan fitur cetak/ekspor.
4. **Verifikasi & Build**:
   - Jalankan `compile_applet` untuk memastikan TypeScript dan build sistem 100% lulus tanpa error.
