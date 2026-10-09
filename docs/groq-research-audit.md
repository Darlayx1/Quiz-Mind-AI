# Groq Web Search dan audit generasi kuis

Tanggal: 9 Oktober 2026. Status: perbaikan kontrak dan regresi terverifikasi; Groq belum terverifikasi live.

## Root cause dan bukti

Penyebab upstream respons Groq kosong belum dapat ditentukan tanpa GROQ_API_KEY. Key tidak tersedia di environment maupun setelah dotenv memuat .env. Tidak ada request Groq live yang dikirim. Jangan menyimpulkan bahwa reasoning high atau 8192 token sudah terbukti menyebabkan kegagalan produksi.

Bug implementasi yang terbukti melalui inspeksi dan mock deterministik:

- `groqService.ts` sebelumnya menggabungkan finish_reason length, content null, dan teks kosong menjadi WEB_SEARCH_EMPTY. Respons terpotong kini menghasilkan WEB_SEARCH_TRUNCATED.
- Teks riset disimpan ke options.research sebelum validasi. Sekarang hanya jawaban final nonkosong dengan finish_reason stop yang disimpan; reasoning dan executed_tools tidak digunakan sebagai riset.
- Riset tidak dihitung dalam attemptBudget dan memakai default pool tiga percobaan. Sekarang maksimum dua panggilan riset; panggilan pertama dan satu retry transient dihitung bersama generasi dalam batas tiga panggilan per batch melalui aiService.
- Groq memaksa web aktif meskipun enableGrounding false. Normalisasi, generator, dan checkbox kini menghormati pilihan mode tanpa web yang eksplisit.
- Gemini bisa melanjutkan tanpa web setelah grounding gagal. Jalur tersebut ditutup, termasuk ketika allowGroundingFallback tersimpan bernilai true. Model tanpa dukungan web menolak permintaan web sebelum mengirim API.
- Batch Gemini berikutnya sebelumnya mematikan grounding tanpa meneruskan hasil riset pertama. Sekarang setiap batch web meminta dan memverifikasi metadata grounding; query semua batch digabungkan.
- UI menampilkan cuplikan body respons non-JSON. Body tersebut tidak lagi ditampilkan.
- Log error JSON.parse penyimpanan key mencetak error mentah yang dapat memuat cuplikan input. Log kini memakai pesan tetap tanpa data mentah.

## Hipotesis awal

| Hipotesis | Hasil |
| --- | --- |
| H1: token habis akibat reasoning/browser | Belum terverifikasi live. Groq mendokumentasikan bahwa reasoning tinggi dapat memperpanjang sesi browser dan konsumsi token. |
| H2: content null meski tool dieksekusi | Direproduksi dalam mock; ditolak tanpa memakai reasoning/tool output sebagai pengganti. Kejadian produksi belum diketahui. |
| H3: parameter tidak kompatibel | tool_choice required dan model gpt-oss-20b didukung dokumentasi; tidak ditemukan alasan menghapus parameter. Parameter produksi dipertahankan. |
| H4: klasifikasi terminal/error salah | Terbukti: truncation disamakan dengan empty; diperbaiki dan diuji. |
| H5: attempt budget tidak konsisten | Terbukti: riset di luar budget; diperbaiki dan diuji termasuk retry generasi setelah retry riset. |
| H6: parsing kontrak respons | Final answer tetap message.content sesuai dokumentasi. Tidak ada ekstraksi spekulatif dari reasoning/executed_tools. |

Sumber resmi: [Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search), [API Reference](https://console.groq.com/docs/api-reference).

## Files changed

| File | Alasan |
| --- | --- |
| src/server/groqResearch.ts | Builder request produksi bersama diagnosis, validator, klasifikasi dan metadata allowlist. |
| src/server/groqService.ts | Validasi sebelum cache, mode web eksplisit, retry maksimal satu, budget dan diagnostik aman. |
| src/server/providerClient.ts | Abort saat membaca JSON tetap dipropagasikan sebagai abort. Pesan provider mentah tetap tidak ditampilkan. |
| src/keyPool.ts | Respons riset kosong/terpotong/belum final menghentikan retry generik berbasis status 502. |
| src/server/aiService.ts | Tidak beralih provider setelah kegagalan operasi web; tidak menonaktifkan grounding batch Gemini; agregasi query. |
| src/server/geminiService.ts | Grounding wajib berhasil, metadata wajib tersedia, batas retry grounding, deteksi truncation, counter hanya menghitung panggilan yang diizinkan. |
| src/quizConfig.ts | Menghormati enableGrounding false pada Groq. |
| src/components/QuizCreator.tsx | Checkbox dan ringkasan mengikuti mode web yang dipilih. |
| src/App.tsx | Menghapus cuplikan respons non-JSON dan pesan error yang selalu menyebut Gemini. |
| src/api.ts | Mempertahankan kode error pada respons mode key pribadi. |
| src/clientKeyStorage.ts | Menghindari log objek error mentah yang dapat memuat key. |
| scripts/groq-research-diagnostic.ts | Diagnosis bertahap yang menggunakan builder request produksi. |
| scripts/provider-test.ts | Regresi riset, budget, isolasi request, timeout/cancel, diagnostik dan grounding Gemini. |
| scripts/generation-ui-test.ts | Kontrak error client, lock submit ganda/pemulihan, redaksi key, pemeriksaan kontrak sumber UI. |
| scripts/multi-key-test.ts | Ekspektasi kebijakan fail-closed grounding yang baru. |
| scripts/model-test.ts | Referensi grounding dalam fixture dan penolakan web pada Gemma. |
| scripts/client-storage-test.ts | Memverifikasi log tidak mencetak cuplikan key/error mentah. |
| package.json | test:providers juga menjalankan tes kontrak client. |
| docs/groq-research-audit.md | Temuan, checkpoint dan batas verifikasi. |

Perubahan pengguna yang sudah ada pada `.github/workflows/pages.yml`, `scripts/assessment-api-test.ts`, dan AGENTS.md dipertahankan. Aturan `.agents/rules/anti-loop.md` sudah ada dan dilestarikan; frontmatter YAML scalar valid, trigger always_on, dan referensi AGENTS.md diperiksa. Tidak ada konflik dengan kebijakan tugas ini.

## Fix summary dan kebijakan API

- WEB_SEARCH_EMPTY: jawaban final tidak berisi teks yang dapat digunakan; tidak diulang tanpa bukti baru.
- WEB_SEARCH_TRUNCATED: finish_reason length; tidak diteruskan atau disimpan.
- WEB_SEARCH_TIMEOUT: deadline riset/HTTP 504; paling banyak satu retry teknis.
- WEB_SEARCH_RATE_LIMITED: HTTP 429; tidak diulang, cooldown pool memakai retry-after.
- WEB_SEARCH_UNAVAILABLE: kegagalan layanan sementara atau respons terminal bukan jawaban final.
- HTTP 400/401/402/403/404 mempertahankan kontrak error konfigurasi/key/provider; tidak diulang dalam riset.
- Retry riset dimiliki KeyPool saja. Tidak ada loop retry kedua di luar pool. Maksimum dua request riset dan tiga panggilan total pada batch pertama melalui aiService; batch berikutnya memakai riset Groq yang sudah valid.
- Tidak ada penggantian model riset, reasoning effort, atau token budget secara tersembunyi. Produksi tetap gpt-oss-20b, high, 8192; generasi tetap parameter model semula.
- Diagnosis live berhenti bila baseline berhasil atau error permanen/rate limit. Varian A medium hanya setelah empty/truncation; Varian B 16384 hanya setelah Varian A masih terpotong. Maksimum tiga request; tidak ada brute force/varian model tanpa bukti.
- Diagnostik hanya memuat model, status, kode aman, finish reason yang dikenal, panjang konten, keberadaan tools, token numerik, durasi, timeout/rate limit. HTTP 200 dengan output tidak valid dibedakan dari status error aplikasi.

## Audit findings

| Prioritas | Temuan | Status |
| --- | --- | --- |
| P1 | Error riset tidak akurat, budget riset terpisah, cache sebelum validasi | Diperbaiki. |
| P1 | Gemini fallback tanpa web dan label grounding tanpa metadata nyata | Diperbaiki; grounded response tanpa query/referensi ditolak. |
| P1 | Key pribadi tersimpan plaintext dalam localStorage | Risiko tersisa. Terbukti dari saveStoredClientKeys. Mengubahnya memerlukan migrasi/kebijakan auto-load; direkomendasikan menggunakan vault terenkripsi atau vault server. Tidak diubah spekulatif. |
| P1 | Log parser storage dapat memuat cuplikan data sensitif | Diperbaiki, regression test lulus. |
| P2 | Riset Gemini diulang per batch | Untuk menjaga konteks setiap batch. Optimasi riset bersama memerlukan pemisahan tahap riset Gemini dari generasi; ditunda agar tidak melakukan refactor besar. |
| P2 | Semantik/faktualitas teks riset | Validasi menjamin teks final dan terminal lengkap, bukan kebenaran semua klaim. Akurasi sumber nyata belum dapat dinilai lewat mock. |
| P2 | Evaluasi AI | Validasi rubrik, bukti substring, score 0/0.5/1, cache per pool/snapshot/revision, review flags, provider dan batas tiga attempt diuji. Tidak ada bug baru terbukti yang memerlukan perubahan evaluator. |
| P3 | Warning build Vite __dirname dan SQLite experimental | Tidak menghalangi build/test; di luar perbaikan utama. |

Mixed quiz: tipe dan jumlah diverifikasi; request memiliki objek research sendiri; pertanyaan duplikat ditolak; kuis tidak dikembalikan bila salah satu batch gagal. Vault server: enkripsi disk, CSRF, HttpOnly cookie, sesi, konflik revision, ekspor terenkripsi dan penolakan plaintext response diuji. Validasi key memakai batas panjang/nonwhitespace/duplikat serta probe provider untuk validitas akun; prefix tidak dianggap bukti key valid. UI: guard request aktif, fieldset disabled, alert error, dan finally memulihkan loading diperiksa.

Log `Format koleksi key tidak valid (maksimal 100 key)` berasal dari negative test yang disengaja pada scripts/client-storage-test.ts: fixture keys bukan array. Test lulus dan storage gagal secara aman. Pesan kini tetap muncul tanpa stack/error mentah.

## Test results

| Pemeriksaan | Hasil |
| --- | --- |
| npm run lint | PASS |
| npm run test:providers | PASS, termasuk generation-ui-test |
| npm run test:quiz-types | PASS, tujuh tipe dan evaluator |
| npm run test:keys | PASS, termasuk log redaction |
| npm run build | PASS client, Node server dan Worker |
| node --import tsx scripts/model-test.ts | PASS |
| node --import tsx scripts/gemma-resilience-test.ts | PASS |
| node scripts/smoke-test.mjs | PASS |
| node --import tsx scripts/assessment-api-test.ts | PASS, endpoint Node/Worker, tanpa external calls |
| node --import tsx scripts/groq-research-diagnostic.ts | SKIP, key Groq tidak tersedia |
| node --import tsx scripts/assessment-live-test.ts | FAIL saat generasi Gemini: POOL_UNAVAILABLE 503; health scope gemini-3.8-flash menunjukkan dua kegagalan layanan sementara. Evaluasi live belum tercapai. Tidak diulang tanpa bukti baru. |
| Pemeriksaan browser manual | Tidak dijalankan. Tes client menjalankan API mode pribadi yang dibundle dengan mock dan memeriksa kontrak sumber UI; bukan interaksi browser nyata. |

Regresi mencakup riset sukses, length, null, kosong, retry gagal/sukses, rate limit/retry-after, HTTP 504, TimeoutError dari abort signal nyata, invalid key/request, fail-closed web, mode tanpa web, anggaran bersama, isolasi riset antarbatch/request, kontrak error UI, lock submit, pemulihan dan redaksi diagnostik.

## Checkpoint iterasi dan final verdict

Iterasi utama 1: inspeksi menemukan klasifikasi/cache/budget yang salah; perubahan minimal mempertahankan parameter produksi; regresi memperlihatkan error tepat dan tidak ada generasi setelah riset gagal. Ekspektasi test lama yang mengizinkan fallback tanpa web diperbarui sesuai keputusan produk. Satu iterasi perbaikan akar implementasi selesai; tidak menjalankan iterasi tuning parameter Groq tanpa kredensial.

API efficiency: Groq memakai satu riset bersama per request yang berhasil, termasuk kuis campuran; paling banyak satu retry transient. Rate limit tidak menghasilkan request tambahan. Token produksi tidak dinaikkan tanpa bukti. Gemini grounded melakukan riset tiap batch supaya tidak memakai konteks web yang hilang.

Final verdict: siap ditinjau dan diuji dengan kredensial Groq; belum layak dinyatakan berhasil penuh di produksi. Kontrak kegagalan dan suite offline terverifikasi. Akar upstream WEB_SEARCH_EMPTY tetap belum terverifikasi live; Gemini live sedang gagal layanan dan evaluator live belum teruji. Jalankan diagnosis Groq dengan key yang tersedia sebelum menyatakan masalah produksi selesai.
