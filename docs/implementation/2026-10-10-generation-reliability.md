# Checkpoint perbaikan pembuatan kuis — 10 Oktober 2026

## Temuan yang terbukti

- `classifyApiError(new TypeError('Failed to fetch'), model)` menghasilkan pesan umum yang dilaporkan pengguna. Sebelum perbaikan, status HTTP 401/403/404/500/503/504 tanpa angka atau label pada teks juga salah menjadi `GENERATION_FAILED` (502). Ini membuktikan bug klasifikasi, belum membuktikan penyebab transport pada perangkat pengguna.
- Jalur aktif tamu/akun memakai `generateQuizBatch`, sedangkan pengujian generator lama memakai `generateQuizWithGemini`. Jalur aktif sebelumnya hanya menaruh skema dalam prompt, tanpa `responseMimeType`/`responseJsonSchema` di konfigurasi API.
- `nextQuizBatch` dengan `questionType: single_choice`, distribusi `{essay: 2}`, dan tanpa soal sebelumnya memilih `single_choice`. Tipe yang tidak tercantum dalam distribusi seharusnya berjumlah nol.
- Satu permintaan nyata dengan key `.env`, model default, satu soal benar/salah, dan pencarian web ditolak Google dengan HTTP 429 `RESOURCE_EXHAUSTED`. Respons tidak menyertakan metrik kuota atau waktu pemulihan. Tidak dilakukan permintaan nyata tambahan. Key ini belum dapat diasumsikan sama dengan key ruang tamu/akun pengguna.
- Preflight Google menerima origin situs dan seluruh nama header SDK, termasuk `x-server-timeout`; pemeriksaan ini tidak menemukan bukti penolakan CORS pada endpoint Google dari lingkungan pengujian.

## Perubahan

- Perbaiki pemilihan tipe dan jumlah batch berdasarkan distribusi eksplisit; konfigurasi lama tanpa distribusi tetap didukung.
- Kirim skema sesuai tipe dan jumlah soal pada model terdaftar yang mendukung format terstruktur; pertahankan jalur teks Gemma/model kustom. Skema dan pencarian web didukung untuk keluarga Gemini 3 menurut [dokumentasi Google](https://ai.google.dev/gemini-api/docs/structured-output#structured_outputs_with_tools).
- Bedakan status HTTP, kegagalan fetch browser, timeout, respons kosong, terpotong, dan dihentikan provider. Pembatalan pengguna tetap menjadi pembatalan.
- Hentikan pengulangan respons invalid/kosong/terpotong/terblokir serta error tidak terklasifikasi. Percobaan ulang hanya untuk gangguan provider/transport yang dikenali atau pergantian key yang memenuhi pengaturan.
- Terapkan perubahan bersama ke frontend lokal/tamu dan sumber Supabase Edge; regenerasi engine Edge. Tambahkan pengujian jalur aktif ke workflow Pages.

## Bukti verifikasi

- `workspace-generation-test.ts`: tujuh tipe dengan/tanpa pencarian, isi konfigurasi API, Gemma/model kustom, distribusi esai tanpa entri pilihan ganda, klasifikasi HTTP/network, timeout/pembatalan, penghentian output bermasalah. Handler akun dan engine Edge hasil build diuji dengan fixture autentikasi/database/provider terisolasi; respons terpotong tidak diulang dan checkpoint kembali pending.
- Lulus regresi `workspace-ai-test.ts`, `quiz-types-test.ts`, `gemini-quota-test.ts`, dan `workspace-test.ts`.
- Lulus pemeriksaan TypeScript, build frontend Pages, dan build aplikasi/Node/Worker. Tes provider tiruan tidak memakai kuota Google.

## Batas dan status rilis

Pembuatan kuis nyata setelah perbaikan belum terverifikasi karena penolakan kuota Google. Penyebab koneksi di browser pengguna belum diketahui dari pesan lama yang umum. Perubahan tersimpan di workspace dan belum dipublikasikan; situs online dan fungsi Supabase yang sudah berjalan memerlukan rilis baru sebelum menggunakan perbaikan ini. Tidak mengubah key, akun, model pilihan/default, atau data pengguna. Aturan anti-loop yang sudah terpasang dipertahankan.
