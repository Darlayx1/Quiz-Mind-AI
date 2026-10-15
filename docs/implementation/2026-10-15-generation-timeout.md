# Pembuatan kuis: respons lama dan diagnosis timeout

Issue: `generation-slow-response-generic-error`.

Pengguna melaporkan pesan umum kegagalan Gemini pada mode tamu dan akun ketika respons lama. Pemeriksaan produksi kemudian menemukan lima operasi dengan pesan umum yang sama, termasuk sepuluh soal menjodohkan/esai; sebagian gagal dalam 3–6 detik sehingga timeout bukan satu-satunya masalah.

Temuan terverifikasi:

- `Request timed out.`, HTTP 408, `TypeError: terminated`, kode socket dalam `cause`, dan stream JSON yang terputus sebelumnya jatuh ke `GENERATION_FAILED`.
- Generator memiliki AbortSignal 180 detik, tetapi opsi HTTP SDK belum menetapkan timeout maupun header batas waktu penyedia secara eksplisit.
- Deadline akun 145 detik sebelumnya dapat disimpan sebagai `cancelled`. Klien polling juga mengganti kode kegagalan server menjadi `GENERATION_FAILED`.
- Permintaan nyata sepuluh soal menjodohkan ditolak HTTP 400 dengan skema yang memuat batas tepat `minItems: 10, maxItems: 10` pada daftar soal. Permintaan yang sama dengan kedua batas luar dihapus berhasil, dengan sepuluh soal valid dalam 21.537 detik. Batas dan validasi butir di dalam skema tetap berlaku.
- Canary sepuluh soal pilihan ganda HIGH berhenti dengan `MAX_TOKENS` setelah 65.224 detik pada batas lama 10.096 token. Setelah anggaran diperbesar, canary berhasil dalam 91.190 detik: 11.754 token penalaran dan 3.065 token keluaran. Satu panggilan per canary, tanpa retry.
- Browser memakai SDK terkunci 2.27.0, tetapi Edge membundel SDK 2.4.0. Build Edge sekarang mengambil versi dari lockfile, dan dependensi langsung dipatok pada versi yang sama.

Perubahan:

- Tetapkan timeout HTTP SDK 180 detik sesuai batas generator yang sudah ada; tetap satu permintaan dan tanpa retry otomatis saat koneksi terputus.
- Klasifikasikan timeout, gateway, dan koneksi streaming, termasuk penyebab bertingkat. Jangan tampilkan pesan error mentah yang mungkin berisi kredensial.
- Simpan deadline akun sebagai kegagalan dengan kode `TIMEOUT` dan HTTP 504; teruskan diagnosis melalui polling. Pembatalan pengguna tetap berlaku.
- Bangun ulang generator bersama untuk Supabase dari sumber yang sama.
- Hindari batas jumlah pada array luar yang memperberat kompilasi skema Gemini. Jumlah tepat tetap diwajibkan dalam prompt dan ditolak oleh validator lokal jika tidak sesuai; tidak ada pemotongan jawaban atau regenerasi tersembunyi.
- Naikkan anggaran token Gemini terstruktur menjadi 32.768–65.536 agar penalaran HIGH dan jawaban lengkap mendapat ruang. Anggaran Gemma/model tidak terstruktur tetap menggunakan perhitungan sebelumnya. Batas maksimum bukan jumlah token yang otomatis dikonsumsi.

Catatan intervensi: diagnosis timeout memerlukan dua intervensi karena kode numerik DOMException sempat menutupi nama `TimeoutError`. Penyederhanaan skema dan anggaran token masing-masing diuji dengan hipotesis terpisah dan membuahkan hasil pada intervensi pertama. Tidak ada pengulangan panggilan identik tanpa bukti baru.

Verifikasi lokal menggunakan fixture tanpa permintaan AI eksternal:

- `npm run test:generation`: stream tertunda, header deadline, error socket/timeout/gateway, satu dispatch, komposisi tujuh tipe soal, kualitas, dan privasi reasoning.
- `node --import tsx scripts/workspace-generation-test.ts`: timeout sinkron/latar belakang akun, metadata polling, pembatalan klien/database, dan jalur tamu.
- `npm run lint`, `npm run build:edge`, dan `npm run build`.
- `npm run test:quality`, `npm run test:parallel`, `node --import tsx scripts/workspace-ai-test.ts`, dan `node --import tsx scripts/quiz-types-test.ts`.

Kriteria keberhasilan lokal: error transport yang dikenali tidak berubah menjadi pesan umum; timeout akun bukan pembatalan; respons tertunda yang valid tetap menjadi kuis; tidak ada pengiriman model berulang akibat timeout.

Deployment backend: `quiz-ai` versi 10 berstatus ACTIVE. Autentikasi pengguna tetap diperiksa dengan `auth.getUser`; pengaturan gateway sebelumnya dipertahankan. Tidak ada migrasi basis data, perubahan data pengguna, atau deployment ulang relay pencarian.

Batasan: canary nyata menggunakan jalur generator bersama dengan key development, bukan sesi akun pengguna. Jalur akun teruji melalui fixture handler, status polling, dan pemeriksaan akses pada endpoint aktif. Tidak ada klaim bahwa semua kegagalan produksi berasal dari satu penyebab; lonjakan permintaan penyedia 503 juga terlihat di log dan berada di luar kendali aplikasi. Batas generator tetap 180 detik dan batas operasi akun tetap 145 detik. Batas platform: https://supabase.com/docs/guides/functions/limits . Dokumen resmi mengenai kompleksitas skema: https://ai.google.dev/gemini-api/docs/structured-output .
