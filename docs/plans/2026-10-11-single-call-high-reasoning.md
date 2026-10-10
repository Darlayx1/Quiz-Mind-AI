# Task plan: satu panggilan AI per generate kuis, penalaran high

Tanggal: 11 Oktober 2026
Status: rencana implementasi; belum mengubah fungsi aplikasi.
Revisi: v2 — kontrak Supabase, ketahanan terhadap kegagalan, migrasi, dan gerbang rilis diperkuat.

## Tujuan dan kontrak keberhasilan

Setiap operasi generate kuis yang valid mengirim satu permintaan ke model AI untuk menghasilkan seluruh kuis. Seluruh konfigurasi yang didukung tetap berlaku: jumlah 1–100 soal, satu atau campuran tujuh tipe, tingkat kesulitan, bahasa, materi belajar, instruksi tambahan, bobot, kredit parsial, waktu, dan mode tampilan.

Penalaran wajib `high` pada seluruh model pembuat kuis. Ketentuan ini dikirim melalui parameter API yang sesuai, bukan hanya instruksi di prompt. Model yang tidak dapat memenuhi ketentuan tersebut ditolak dengan pesan yang jelas; tidak diam-diam diturunkan ke medium/low atau diganti model.

Satu panggilan berarti satu permintaan generate dari aplikasi ke penyedia model untuk satu operationId. Validasi awal atau pembatalan sebelum pengiriman boleh menghasilkan nol panggilan. Setelah pengiriman, kegagalan, timeout, respons terpotong, atau soal tidak lengkap tidak boleh memicu panggilan kedua. Pengguna dapat memulai operasi baru secara eksplisit.

Google Search bawaan dapat bekerja di dalam permintaan AI yang sama. Pencarian Parallel tetap merupakan permintaan terpisah ke layanan pencarian; jumlah permintaan jaringan tidak disamakan dengan jumlah panggilan model pembuat kuis. Tidak ada panggilan model tambahan untuk merangkum sumber. Evaluasi jawaban setelah kuis dikerjakan adalah operasi terpisah, bukan bagian dari generate kuis.

## Temuan dasar

- `src/server/quizPipeline.ts`: `nextQuizBatch` membatasi batch menjadi 5 soal atau 2 soal esai/Gemma.
- `src/server/geminiService.ts`: jalur aktif melakukan generate lalu audit kualitas AI, dan belum mengirim pengaturan penalaran eksplisit.
- `src/workspace/ai.ts`: ruang tamu dan akun mengulang proses sampai jumlah soal lengkap; ruang tamu juga memiliki retry per batch.
- `supabase/functions/quiz-ai/index.ts`: ruang akun menjalankan satu batch per request, dengan retry dan checkpoint batch.
- `src/server/aiService.ts` dan generator lama: jalur server juga membagi soal per tipe/batch dan memiliki fallback/retry.
- `src/questionValidation.ts`: skema sekarang berorientasi satu tipe; validator lokal sudah tersedia untuk tujuh tipe.
- Pengujian alur lokal membuktikan 10 pilihan ganda membutuhkan 4 panggilan, sedangkan 10 esai membutuhkan 10 panggilan, sebelum retry.
- `qm_claim_job` pada migrasi terbaru mengizinkan claim ulang setelah lease 180 detik berakhir; lease saja belum menjamin satu pengiriman AI sepanjang umur operasi.
- `qm_commit_job` lama menerima status dari pemanggil dan handler mengembalikan kegagalan ke `pending`; desain ini perlu diperketat agar operasi yang sudah dikirim tidak kembali dapat dijalankan.
- Watcher akun membatasi proses pada 165 detik dan generator pada 180 detik. Nilai ini belum selaras dengan batas request idle 150 detik Supabase.
- Workflow `.github/workflows/pages.yml` menerbitkan frontend Pages; tidak ditemukan langkah deploy Supabase pada workflow tersebut. Build frontend tidak otomatis memperbarui fungsi Edge atau database.

Temuan ini berasal dari workspace. Paket hosting, migrasi yang sudah terpasang, versi fungsi Edge produksi, dan performa produksi belum diperiksa; jangan menyamakan sumber lokal dengan keadaan server aktif.

## Dampak khusus pada Supabase

| Komponen | Pembaruan yang diperlukan | Bukti keberhasilan |
| --- | --- | --- |
| Edge Function `quiz-ai` | Satu generate konfigurasi penuh, high, tanpa audit kedua/retry; aksi start/status/cancel dengan protokol versi baru | Spy transport membuktikan paling banyak satu request model per operationId |
| Engine `_shared/quiz-engine.ts` | Dibangun ulang dari generator bersama, bukan diedit manual | Artefak build sesuai revisi sumber dan tes kontrak lulus |
| Postgres `qm_ai_jobs` | Penanda reservasi pengiriman permanen, tahap operasi, versi kebijakan, fingerprint konfigurasi, hasil/error | Claim serentak hanya memberi satu hak pengiriman; lease kedaluwarsa tidak membuka hak kedua |
| RPC claim/checkpoint/commit/cancel | Transisi atomik, validasi kepemilikan dan token eksekusi, larangan reset penanda | Tes SQL pada database nyata membuktikan aturan tetap berlaku saat race/crash |
| Auth, RLS, akses credential | Aksi status/cancel hanya untuk pemilik; mutasi sensitif service-only | Akun B/anon tidak dapat melihat atau mengubah operasi/key akun A |
| Penyimpanan riwayat akun | Hasil hanya masuk riwayat satu kali setelah kuis lengkap tervalidasi | Refresh/ambil hasil berulang tidak menggandakan riwayat atau menimpa revisi workspace lain |
| Operasional | Deploy migrasi dan fungsi Edge terpisah dari frontend; pantau batas resource | Identitas build/policy pada server dan frontend cocok sebelum fitur diaktifkan |

Tidak perlu menghapus akun, key, riwayat, atau membuat proyek Supabase baru. Perubahan struktur/RPC dilakukan melalui migrasi tambahan; migrasi lama tidak ditulis ulang. Dampak biaya tidak diasumsikan turun: panggilan model berkurang, tetapi high dapat menaikkan token dan protokol status dapat menambah baca database. Ukur keduanya.

## Keputusan arsitektur yang wajib diikuti

### A. Invariant pengiriman, bukan sekadar counter di memori

Untuk operasi baru dengan policy `single-call-high-v1`, hak mengirim model hanya dapat dikonsumsi sekali. Simpan `dispatch_reserved_at` dan `model_call_count` (0 atau 1) secara atomik **sebelum** membuka koneksi ke provider. Counter tersebut menyatakan hak pengiriman yang dikonsumsi, bukan bukti provider telah menerima request; metrik transport dicatat terpisah.

Gunakan tahap konseptual berikut, dipetakan ke kolom `phase` atau status tambahan yang kompatibel:

`accepted -> preparing -> dispatch_reserved -> generating -> validating -> completed`

Cabang terminal: `failed_preflight`, `failed_after_dispatch`, `cancelled`, `unknown_after_dispatch`. Tidak ada transisi dari tahap setelah reservasi ke tahap sebelum reservasi. Pembatalan sebelum reservasi tidak menghabiskan panggilan; setelah reservasi hak sudah dikonsumsi walaupun pengiriman belum terbukti.

Claim, reservasi, dan commit mengunci row/compare-and-set dengan owner serta token eksekusi. Jangan mempertahankan transaksi database terbuka selama menunggu AI. Simpan konfigurasi kanonis, model, key terpilih, dan fingerprint; operationId yang sama dengan konfigurasi berbeda ditolak.

Proses mati tepat setelah reservasi boleh menghasilkan nol request provider dan kehilangan kemampuan melanjutkan. Proses mati setelah provider merespons dapat kehilangan hasil. Pilihan ini sengaja memprioritaskan **maksimum satu pengiriman**, bukan menjanjikan exactly-once success yang tidak dapat dibuktikan lintas database dan provider.

Lease membantu membatasi proses aktif, tetapi tidak menghapus penanda reservasi. Watcher/reconciler hanya menandai operasi terlantar atau mengambil hasil yang memang tersedia; tidak pernah memanggil model kembali. Commit terlambat setelah cancel atau token berubah ditolak. Kegagalan menyimpan status key tidak boleh membuang kuis valid atau memicu generate ulang; penyimpanan hasil dan efek samping ditangani terpisah.

### B. Akun memakai alur start–status–result

Desain dasar untuk akun: request start menerima konfigurasi, mengklaim operasi, menjadwalkan pekerjaan, lalu segera mengembalikan `202` dengan operationId dan policyVersion. Status dan hasil dibaca melalui aksi terautentikasi yang tidak memiliki jalur dispatch model. Request start duplikat hanya mengembalikan status/hasil operasi yang sama.

Jika memakai `EdgeRuntime.waitUntil`, jadwalkan pekerjaan dari handler setelah state accepted tersimpan. Hak dispatch tetap diambil secara atomik saat worker siap mengirim; worker duplikat berhenti saat reservasi sudah ada. Mulai tidak dijalankan ulang oleh polling. Model dipanggil satu kali, hasil disimpan, dan klien mengambilnya terpisah.

Polling awal dibatasi, misalnya 2 detik lalu meningkat hingga 5–10 detik dengan jitter; satu polling aktif, tidak overlap, berhenti pada status terminal, logout, atau perubahan scope. Saat tab tersembunyi kurangi polling dan ambil status saat kembali. Jangan memakai loop polling cepat sebagai pengganti progress nyata. Realtime hanya opsi jika akses dan biaya terverifikasi; tidak wajib menambah sistem baru.

Disconnect/refresh pada request start atau polling bukan pembatalan proses akun. Tombol cancel mengirim aksi pembatalan eksplisit; worker mengamati state cancel dan menghentikan request provider sebisanya. Hindari mengaitkan lifetime background worker dengan requestSignal yang selesai setelah respons 202. Cancel tidak menjamin provider belum menagihkan pekerjaan yang sudah dimulai.

Ruang tamu tetap dapat mengirim langsung ke provider, satu request atau satu stream, dengan state IndexedDB dan reservasi yang tahan refresh. Gunakan transaksi lokal dan koordinasi antartab agar operationId sama tidak terkirim dua kali. Setelah tab ditutup saat request berjalan, tampilkan status tidak pasti; jangan otomatis mengirim ulang. Browser tidak dijanjikan memiliki pemulihan background yang setara server.

### C. Batas hosting menjadi keputusan berbasis bukti

Menurut [batas Supabase](https://supabase.com/docs/guides/functions/limits), request idle timeout adalah 150 detik; umur worker Free 150 detik dan paket berbayar 400 detik, CPU 2 detik per request, memori 256 MB. [Background task](https://supabase.com/docs/guides/functions/background-tasks) dapat membebaskan request awal, tetapi tetap tunduk pada batas worker. Streaming/heartbeat HTTP tidak memperpanjang umur worker.

Sebelum implementasi transport akun ditutup, verifikasi paket proyek dan pilih budget dengan cadangan untuk auth, riset web, validasi, dan commit. Jangan menetapkan semua timeout sama atau berasumsi paket berbayar. Jika ada konfigurasi yang terbukti membutuhkan lebih dari batas worker, pilih runner berdurasi memadai setelah keputusan infrastruktur dibuat, dengan Supabase tetap menjadi penyimpan status/hasil; atau laporkan konfigurasi itu belum dapat dipenuhi. Jangan memecah kuis, menurunkan high, atau mengurangi jumlah soal untuk menyembunyikan batas.

100 soal adalah target rentang produk, bukan jaminan semua kombinasi selalu selesai. Ukuran output diperkirakan dari tipe/rubrik/panjang materi dan data pengukuran, dengan margin serta cap provider. Estimasi durasi tidak boleh dijadikan kepastian. Preflight hanya menolak batas yang diketahui; ketidakpastian dicatat dan kegagalan tetap ditangani dalam satu panggilan.

### D. Validasi lengkap tanpa panggilan perbaikan

Gunakan discriminator `type` dan hanya varian yang diminta pada skema agar ringkas. Validasi setelah parsing menghitung semua soal sebelum sanitasi yang dapat membuang item: jumlah total tepat, jumlah per tipe tepat, setiap item valid, tidak ada duplikasi. Jangan mengambil sebagian soal, memotong item berlebih, atau mengisi dummy agar tampak sukses. Hasil gagal boleh disimpan sebagai diagnostik terbatas, tetapi tidak masuk riwayat sebagai kuis selesai.

Generate, validasi lokal, dan penyimpanan merupakan tiga tahap berbeda. Retry database yang aman/idempoten boleh dilakukan secara terbatas bila tidak memanggil AI lagi; tetap mengikuti circuit breaker proyek. Pembatalan, MAX_TOKENS, error JSON, dan gagal penyimpanan diberi kode berbeda. Periksa SDK/proxy/adapter agar tidak ada retry generate tersembunyi.

### E. Kompatibilitas dan privasi operasional

Tambahkan `generationPolicyVersion`/`apiProtocolVersion` pada operasi dan respons. Kebijakan satu panggilan/high ditetapkan server, tidak dapat ditimpa maxAttempts/model fallback dari frontend lama. Jangan meminta key atau prompt penuh saat mengambil status. Status publik untuk owner hanya berisi tahap, waktu, error aman, dan hasil yang diizinkan; service credential/lease token tetap internal.

Riwayat lama tetap dapat dibaca. Job batch lama diberi policy legacy dan ditandai perlu operasi baru eksplisit saat cutover; jangan backfill call count nol dan menganggapnya belum pernah memanggil AI. Untuk input evaluasi/key test yang terpisah, pastikan refactor tidak memanggil generator/audit sebagai efek samping tanpa aksi pengguna.

## Tahapan dengan keluaran dan gerbang keputusan

| Tahap | Keluaran konkret | Syarat lanjut |
| --- | --- | --- |
| P0 — audit runtime | Daftar jalur generate, kemampuan model, paket/limit hosting, versi produksi, baseline request/token/durasi | Kemampuan high dan batas runtime diketahui; akses yang belum tersedia ditandai, bukan diasumsikan |
| P1 — kontrak bersama | Skema seluruh kuis, policy immutable, error/status model, fixture lengkap | Tes konfigurasi tunggal/campuran dan budget output lulus |
| P2 — migrasi Postgres | Migrasi additive, RPC reservasi/commit/status/cancel, isolasi owner | Tes race dan RLS membuktikan reservasi tidak dapat direset atau diclaim ulang |
| P3 — generator | Satu adapter dispatch, high, validasi lokal; semua jalur lama diarahkan | Spy request transport membuktikan cap satu, termasuk failure paths |
| P4 — integrasi tamu/akun | State antartab, protokol 202/status, penyimpanan riwayat, pembatalan | Refresh, timeout, polling, dan concurrent start tidak menghasilkan panggilan kedua |
| P5 — build dan pengujian | Frontend/Edge dari revisi sama, tes kontrak SQL/transport/build, smoke terukur | Tidak ada regresi kritis; batas yang belum terverifikasi terdokumentasi |
| P6 — cutover | Migrasi kemudian backend, verifikasi capability, frontend, aktifkan policy | Versi cocok, job lama ditangani, metrics/cancel/status berfungsi |

Tidak ada perubahan aplikasi atau deploy dalam revisi rencana ini. Tahapan di atas adalah pekerjaan berikutnya.

## Tugas implementasi

### 1. Tetapkan kebijakan panggilan dan kemampuan model

- [ ] Buat satu kebijakan bersama untuk seluruh jalur generate: maksimum satu panggilan dan penalaran high.
- [ ] Petakan dukungan model yang terdaftar, termasuk Gemini dan Gemma 4; kirim `thinkingConfig.thinkingLevel: HIGH` pada model yang mendukungnya.
- [ ] Tangani model kustom dan model lama dengan kemampuan terverifikasi. Jangan menggunakan permintaan probe AI tambahan sebagai preflight generate.
- [ ] Tolak kombinasi model/fitur yang tidak didukung sebelum panggilan jika kemampuan telah diketahui; penolakan provider setelah pengiriman tetap mengakhiri operasi.
- [ ] Pertahankan model pilihan pengguna. Pemilihan satu key yang tersedia dilakukan sebelum pengiriman, tanpa percobaan key/model/provider alternatif setelah panggilan dilakukan.

### 2. Buat prompt dan skema untuk seluruh kuis

- [ ] Kirim konfigurasi lengkap serta seluruh distribusi tipe dalam satu prompt.
- [ ] Buat skema gabungan dengan penanda `type` eksplisit dan varian skema per tipe yang diminta, menggunakan subset JSON Schema yang didukung provider.
- [ ] Terapkan jumlah soal tepat, instruksi spesifik semua tipe aktif, pembahasan, kunci jawaban, dan rubrik esai di dalam respons yang sama.
- [ ] Pertahankan pemisahan instruksi dari materi pengguna dan sumber web yang tidak dipercaya.
- [ ] Sesuaikan anggaran output berdasarkan jumlah dan jenis soal, ruang untuk thinking high, serta batas model. Jangan sekadar menggunakan batas 8192 token saat ini untuk semua konfigurasi.
- [ ] Uji kebutuhan 100 soal dan materi panjang. Jika kombinasi melampaui batas provider yang diketahui, laporkan keterbatasan sebelum pengiriman; jangan diam-diam membagi menjadi beberapa panggilan atau mengurangi jumlah soal.

### 3. Ubah generator menjadi satu permintaan

- [ ] Hapus pemanggilan audit kualitas AI kedua dari alur generate. Instruksi untuk memeriksa jawaban, ambiguitas, dan rubrik dimasukkan ke permintaan pertama.
- [ ] Jalankan validasi lokal sesudah respons: JSON, tipe, jumlah total dan distribusi, duplikasi, opsi/kunci, pasangan, urutan, rubrik, bobot, dan kutipan.
- [ ] Jangan menganggap pemeriksaan dalam prompt sebagai audit AI independen. Hentikan penambahan metadata `qualityReviews` baru yang mengklaim pemeriksaan terpisah.
- [ ] Jika respons tidak lengkap/invalid/terpotong, akhiri operasi dengan pesan spesifik; tidak ada repair JSON melalui AI atau generate soal tambahan.
- [ ] Pastikan SDK tidak mengulang pengiriman otomatis; verifikasi jumlah request aktual pada transport, bukan hanya jumlah pemanggilan fungsi aplikasi.
- [ ] Ganti atau arahkan generator server lama ke implementasi yang sama agar tidak tersisa jalur dengan batching, review, retry, atau fallback tambahan.

### 4. Terapkan pada ruang tamu dan akun

- [ ] Ganti loop batch di ruang tamu dengan satu operasi generate konfigurasi lengkap.
- [ ] Ubah handler Supabase agar memproses dan menyimpan kuis lengkap dalam satu operasi.
- [ ] Persist status sebelum request model dikirim agar request ulang dengan operationId yang sama tidak mengirim ke model lagi.
- [ ] Implementasikan migrasi additive dan RPC reservasi permanen sesuai keputusan A; harden RPC lama agar tidak dapat mengembalikan operasi reserved menjadi dispatchable melalui `pending`.
- [ ] Terapkan protokol akun start/status/result sesuai keputusan B; status/result tidak boleh memiliki jalur generate.
- [ ] Tangani klik ganda, request HTTP ulang, refresh, timeout klien, lease kedaluwarsa, pembatalan, dan koneksi terputus. Hasil yang sudah tersimpan dikembalikan tanpa generate ulang.
- [ ] Jika status pengiriman tidak pasti setelah crash, tandai untuk pemeriksaan atau operasi baru eksplisit; jangan mengirim ulang otomatis. Satu panggilan tidak dapat menjamin hasil selalu dapat dipulihkan saat proses mati setelah pengiriman.
- [ ] Sesuaikan deadline klien, fungsi Edge, dan lease database untuk satu permintaan besar dengan high reasoning; jangan membuat proses tanpa batas atau menaikkan timeout melampaui batas hosting.
- [ ] Pertahankan isolasi data/key akun, penyimpanan lokal, riwayat, dan pembatalan pengguna.
- [ ] Pertahankan riwayat lama. Job parsial lama tidak otomatis dilanjutkan dengan kebijakan baru; beri pilihan memulai operasi baru tanpa menghapus data pengguna.

### 5. Pertahankan web dan perbarui tampilan

- [ ] Google Search disertakan pada satu request generate jika aktif dan didukung model.
- [ ] Untuk Parallel, gunakan hasil pencarian sebagai bukti di satu request model; kegagalan pencarian sebelum request model mengikuti kebijakan web pengguna.
- [ ] Setelah request AI dikirim, kegagalan grounding tidak boleh menghasilkan request ulang tanpa web.
- [ ] Perbarui pengaturan dan teks terkait batch, maksimum percobaan, fallback key, dan resume agar sesuai satu panggilan. Pengaturan retry evaluator yang terpisah tidak ikut dimatikan tanpa kebutuhan.
- [ ] Tampilkan penalaran High sebagai ketentuan tetap untuk generate, termasuk model kustom yang kompatibel.
- [ ] Gunakan status proses yang jujur; jangan menampilkan hitungan soal yang belum dihasilkan. Tampilkan hasil setelah respons lengkap lolos validasi lokal.
- [ ] Catat jumlah panggilan, durasi, model, tingkat penalaran yang diminta, input/output/thinking token bila tersedia, dan status akhir tanpa mencatat key. Jangan mengklaim tingkat penalaran terukur jika provider hanya menerima parameter.

### 6. Verifikasi dan persiapan rilis

- [ ] Perbarui tes jalur aktif, server lama, tipe soal, ruang tamu, akun, dan engine Edge.
- [ ] Gunakan fixture provider dan hitung request transport: tepat satu untuk operasi valid, nol untuk penolakan preflight, tidak lebih dari satu untuk kegagalan setelah pengiriman.
- [ ] Uji 1, 10, dan 100 soal; tujuh tipe tunggal dan campuran; web aktif/nonaktif; Google/Parallel; model terdaftar dan kustom; konfigurasi bahasa, kesulitan, rubrik, bobot, waktu, dan materi.
- [ ] Periksa parameter high pada semua request model yang diterima. Model tidak kompatibel menghasilkan pesan eksplisit tanpa penurunan penalaran.
- [ ] Uji respons invalid/kurang/berlebih/duplikat, MAX_TOKENS, kuota, auth, network, timeout, cancel, dan retry HTTP/operationId; tidak ada panggilan AI tambahan tersembunyi.
- [ ] Uji idempotensi akun dengan konkurensi dan lease kedaluwarsa, serta checkpoint ruang tamu setelah refresh.
- [ ] Jalankan pemeriksaan TypeScript, tes regresi yang relevan, build aplikasi/Pages, dan regenerasi engine Edge melalui sumber bersama.
- [ ] Lakukan smoke test nyata yang terukur pada konfigurasi representatif setelah akses provider tersedia. Catat jumlah request dan durasi; jangan menjanjikan pengurangan waktu sebelum pengukuran.
- [ ] Siapkan frontend dan fungsi Supabase dari revisi yang sama. Publikasi adalah tahap tersendiri setelah implementasi terverifikasi.
- [ ] Uji migrasi berurutan dari seluruh migrasi workspace, bukan hanya skema database kosong. Jangan mengklaim race terbukti hanya dari provider/mock database.
- [ ] Tambahkan regression test jalur generate aktif ke CI; workflow Pages saat ini belum mencakup semua bukti yang dibutuhkan untuk perubahan ini.

## Matriks pengujian kritis

| Skenario | Hasil yang wajib | Request model maksimum |
| --- | --- | --- |
| 10 pilihan ganda, 10 esai, campuran tujuh tipe | Distribusi tepat, high, kuis lengkap | 1 |
| 1/100 soal dan materi panjang | Sukses lengkap atau batas provider yang jelas; tanpa batch tersembunyi | 1, atau 0 saat preflight menolak |
| Model tidak mendukung high/fitur web | Pesan kompatibilitas; tidak turun penalaran/model | 0 jika diketahui sebelum dispatch; selain itu 1 |
| Dua start bersamaan dengan operationId sama | Satu reservasi; pemanggil lain mendapat status yang sama | 1 total |
| operationId sama dengan konfigurasi berbeda | Konflik tanpa mengubah konfigurasi tersimpan | 0 tambahan |
| Refresh/poll/reconnect/lease kedaluwarsa setelah reserve | Ambil status/hasil atau unknown; tidak dispatch ulang | 0 tambahan |
| Worker mati sebelum reserve | Dapat melanjutkan preparasi hanya bila reservasi belum ada | 1 sepanjang umur operasi |
| Worker mati setelah reserve sebelum send | Unknown/terminal; tidak mengirim ulang | 0 atau 1 total; tidak bisa dipastikan tanpa bukti transport |
| Worker mati setelah respons AI sebelum commit | Recovery penyimpanan bila hasil tersedia, selain itu unknown | 0 tambahan |
| Cancel sebelum/selama/setelah dispatch | Owner-only, respons terlambat tidak mengaktifkan ulang operasi | 0 sebelum reserve, maksimum 1 setelahnya |
| Output kurang/lebih/invalid/duplikat/MAX_TOKENS | Error spesifik; tidak repair atau top-up | 1 |
| HTTP 429/401/5xx/network/timeout provider | Terminal; tidak pindah key/model | 1 |
| Gagal status key/commit setelah respons valid | Hasil tidak didaur ulang lewat generate; penyimpanan idempoten | 0 tambahan |
| Akun berbeda/anon mengambil status atau cancel | Ditolak, tidak bocor data/key | 0 |
| Start ganda dengan ID berbeda dari tab/klik yang sama | Koordinasi klien dan batas operasi aktif mencegah start tidak sengaja; klik baru eksplisit membuat operasi baru | 1 per operasi yang sah |
| Frontend lama/backend baru dan sebaliknya | Capability/protocol guard menolak generate yang tidak kompatibel | 0 untuk operasi baru yang ditolak |

Uji parameter high juga mencakup Gemma 4 yang kompatibel dan model kustom terverifikasi; gunakan tes terparameterisasi untuk semua entri model. Tes kombinasi konfigurasi memakai cakupan pairwise plus kasus batas, tanpa mengklaim seluruh kemungkinan kombinasi telah diuji.

## Rilis Supabase, observabilitas, dan pemulihan

1. Inventaris versi produksi, job aktif/legacy, dan snapshot skema; siapkan migration/checklist tanpa mengambil atau memindahkan key pengguna.
2. Siapkan migrasi additive dan backend baru dengan gate aktivasi, serta kontrak capability. Uji di lingkungan terisolasi dengan sumber/build identik.
3. Saat cutover, hentikan start baru sementara dan biarkan job lama selesai dalam batas waktu atau tandai sebagai legacy sesuai statusnya. Hindari dua versi worker saling mengambil operasi yang sama.
4. Terapkan migrasi, deploy fungsi `quiz-ai` dan engine baru, verifikasi policy/versi/build dari server, lalu deploy frontend yang kompatibel. Deployment Pages saja tidak cukup.
5. Aktifkan policy setelah smoke start/status/cancel/result, auth/RLS, dan satu request transport terverifikasi. Klien lama tidak boleh dapat memulai operasi dengan kontrak batch lama setelah aktivasi.
6. Jika rilis bermasalah, nonaktifkan start baru melalui gate; status/result/cancel tetap tersedia. Jangan rollback penanda reservasi atau mengembalikan fungsi batch yang dapat mengirim ulang job yang sama. Riwayat dipertahankan dan migrasi korektif lebih diutamakan daripada rollback data.

Observabilitas minimum: operationId, policy/build version, fase dan durasi tiap tahap (auth/DB/research/provider/validasi/commit), key ID internal tanpa secret, dispatch reservation, request model aktual saat dapat diukur, finishReason, kode error, ukuran respons, serta input/output/thinking token yang tersedia. Simpan ringkas dan batasi retensi diagnostik; tidak perlu log prompt penuh, materi privat, atau pemikiran internal model.

Bandingkan baseline dengan implementasi memakai tipe/jumlah/materi/model/web yang sama. Ukur jumlah request, tingkat keberhasilan kelengkapan, p50/p95 durasi jika sampel cukup, token, DB reads/polling, dan kegagalan idle/worker timeout. Target deterministik: satu dispatch maksimum, high selalu diminta, distribusi tepat, dan nol dispatch saat status/result dipanggil. Target latency baru ditetapkan setelah baseline; peningkatan ke high tidak diklaim pasti mempercepat.

## Kriteria selesai

1. Semua jalur generate yang didukung menggunakan satu permintaan AI per operationId dan high reasoning.
2. Tidak ada batching, audit AI kedua, retry otomatis, repair AI, atau fallback setelah pengiriman.
3. Kuis sukses memiliki jumlah dan distribusi tipe persis sesuai konfigurasi serta lolos validasi lokal.
4. Fitur web bekerja dalam kontrak yang dijelaskan; metadata sumber tetap jujur.
5. Timeout, cancel, kegagalan, klik ganda, dan resume tidak menghasilkan panggilan kedua untuk operasi yang sama.
6. Tes transport, regresi, dan build lulus; batas provider/hosting dilaporkan berdasarkan bukti.
7. Migrasi/RPC Supabase teruji terhadap konkurensi, lease kedaluwarsa, crash, ownership, dan klien lama; reservasi tidak dapat direset lewat jalur lama.
8. Akun dapat memantau/mengambil hasil tanpa menjaga satu koneksi HTTP panjang; background tetap dibatasi umur worker sebenarnya.
9. Deploy frontend, Edge, dan migrasi diverifikasi terpisah; rollback operasional tidak membuka pengiriman kedua.

## Dampak yang perlu dipahami

Satu panggilan menghilangkan waktu tunggu antarbatch dan audit kedua, tetapi high reasoning dapat memperpanjang satu respons. Jumlah soal besar, esai panjang, dan web tetap dapat lambat atau mencapai batas output/hosting. Target ini mengatur jumlah panggilan dan tingkat penalaran; tidak menjamin setiap konfigurasi selesai lebih cepat atau selalu berhasil.

Validasi lokal tidak membuktikan seluruh isi faktual benar. Audit AI independen akan hilang; pemeriksaan di dalam satu prompt tidak boleh dilabeli sebagai audit terpisah.

## Referensi kemampuan provider

- Thinking Gemini: https://ai.google.dev/gemini-api/docs/generate-content/thinking
- Thinking Gemma 4: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
- Skema gabungan/structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Tools bawaan dalam satu API call: https://ai.google.dev/gemini-api/docs/tools
- Batas runtime Supabase: https://supabase.com/docs/guides/functions/limits
- Background task dan lifecycle: https://supabase.com/docs/guides/functions/background-tasks
- Diagnosis request lambat/idle timeout: https://supabase.com/docs/guides/troubleshooting/edge-function-takes-too-long-to-respond

## Batas pekerjaan saat ini

Permintaan saat ini adalah memperkuat task plan dan menjelaskan dampak Supabase. Checklist implementasi di atas belum dieksekusi. Tidak ada perubahan fungsi aplikasi, migrasi aktual, kredensial, data akun, atau deployment. Aturan anti-loop proyek tetap berlaku pada implementasi.
