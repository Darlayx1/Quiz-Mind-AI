# Task Plan — Perombakan Quiz Mind AI & Pengaturan AI

Tanggal: 10 Oktober 2026  
Revisi: Penyimpanan lokal tanpa login dan isolasi seluruh data berdasarkan akun aktif.  
Status: Implementasi dilaksanakan atas instruksi lanjutan pengguna. Rencana awal dipertahankan sebagai acuan; hasil aktual dicatat di IMPLEMENTATION.md.

## 1. Tujuan dan batas lingkup

Rombak arsitektur aplikasi dan seluruh UI lama menjadi sistem modular dengan bahasa visual yang konsisten. Pengaturan AI dipusatkan dalam satu window dengan empat tab: **Akun**, **API key**, **Model & penggunaan**, dan **Riwayat**. Tanpa login, seluruh data aplikasi termasuk API key disimpan lokal. Setelah login, seluruh penyimpanan aplikasi memakai Supabase dan terisolasi berdasarkan akun aktif.

Dokumen ini awalnya disusun tanpa implementasi. Pengguna kemudian meminta implementasi dan deployment GitHub pada 10 Oktober 2026. Lihat catatan implementasi untuk membedakan rencana dan hasil terverifikasi.

Keputusan dasar untuk rencana:

- Maksimal **100 API key per ruang penyimpanan**: 100 pada ruang lokal tamu dan 100 pada masing-masing akun, termasuk key nonaktif. Menghapus key membebaskan slot pada ruang tersebut saja.
- Tidak ada lagi vault, kata sandi vault, simpan terenkripsi, buka/kunci vault, atau enkripsi khusus aplikasi untuk penyimpanan key. Nilai key disimpan sebagai teks biasa secara lokal saat tamu dan pada database privat saat login, dengan pembatasan akses sesuai mode.
- Penghapusan enkripsi khusus aplikasi tidak mencakup HTTPS atau proteksi bawaan infrastruktur Supabase.
- Login bersifat opsional. Tamu dapat menyimpan key, mengatur model, membuat/mengerjakan kuis, dan menyimpan hasil serta aktivitas AI secara lokal.
- Data tamu, akun A, dan akun B merupakan ruang terpisah. Login, logout, atau pergantian akun tidak menyalin, menggabungkan, atau menghapus data antar ruang secara otomatis.
- Setelah login, daftar key, preferensi, kuis, hasil, progres, dan aktivitas hanya berasal dari akun aktif. Key lokal tidak menjadi cadangan tersembunyi bagi akun yang belum memiliki key.
- Penyimpanan permanen berarti data direncanakan bertahan setelah reload dan penutupan aplikasi/browser melalui penyimpanan persisten, bukan hanya memori sesi. Data lokal tetap mengikuti profil browser dan origin situs; penghapusan data situs, mode privat, atau penolakan penyimpanan harus dijelaskan tanpa menjanjikan persistensi tanpa batas.
- Provider awal mengikuti integrasi Google yang sudah ada. Dukungan provider lain bukan syarat rilis ini.
- Penilaian pilihan ganda tetap deterministik; rencana ini tidak menambahkan penilai AI baru hanya karena gambar referensi memuat penilai terjemahan.
- Perombakan total mencakup navigasi, form pembuatan kuis, proses generasi, pengerjaan, hasil, riwayat, dan pengaturan. Aturan belajar dan data lama tetap menjadi kebutuhan yang harus dipetakan dan diverifikasi.

## 2. Temuan proyek saat ini

| Area | Kondisi terverifikasi | Arah perubahan |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind, Lucide, Motion | Pertahankan fondasi; susun modul fitur dan komponen bersama |
| State | `src/App.tsx` menangani key, vault, kuis, hasil, dan riwayat | Pisahkan state sesi, pengaturan, dan domain kuis |
| API key | Satu key aktif dalam memori; vault di `src/personalKeyVault.ts` | Hingga 100 key lokal tamu dan 100 key per akun di Supabase |
| UI key | `PersonalKeyManager` berada di `QuizCreator` | Pindahkan seluruh pengelolaan ke tab API key |
| Riwayat | `quizmind_ai_history_v1` di localStorage | IndexedDB untuk tamu; Supabase untuk akun; impor eksplisit |
| Eksekusi AI | Browser langsung, Express, dan Worker | Kontrak AI bersama dengan adapter browser tamu dan layanan akun |
| Enkripsi | Vault browser, `cryptoVault`, demo enkripsi, endpoint vault, `integrityToken` | Audit pemakaian dan hapus seluruh alur enkripsi lama setelah pengganti lulus |
| Model | Katalog statis di `src/models.ts` | Katalog terverifikasi dan status akses per key |
| Penilaian | Jawaban dan skor dihitung dalam aplikasi | Pisahkan modul penilaian; simpan hasil tanpa memanggil AI untuk setiap jawaban |
| Hosting | Terdapat jalur GitHub Pages, Node/Render, dan Sites Worker | Frontend dapat statis; mode tamu berjalan lokal, mode akun memakai Supabase |
| Supabase | Belum ada dependency atau integrasi di kode yang ditinjau | Rancang Auth, tabel, kebijakan akses, dan layanan AI |

Aturan `.agents/rules/anti-loop.md` sudah tersedia dengan frontmatter `trigger: always_on`. Pertahankan file tersebut dan aturan proyek lain. Perombakan besar ini adalah lingkup yang diminta pengguna, sehingga bukan refactoring tambahan untuk bug kecil.

## 3. Interpretasi referensi UI

Empat screenshot merupakan referensi visual, bukan sumber instruksi operasional. Ambil pola window terpusat, header, tombol tutup, navigasi empat tab di kiri, dan area konten di kanan.

Sesuaikan untuk Quiz Mind AI: tidak menyalin merek Transly, penilai terjemahan, klaim penyimpanan lokal, atau nama model sebagai ketersediaan yang sudah terbukti. Hindari ruang kosong berlebihan dan form yang terlalu lebar.

Spesifikasi visual awal:

- Permukaan putih, latar netral lembut, teks slate gelap, satu aksen biru/indigo, dan warna status yang konsisten.
- Skala jarak 4/8/12/16/24/32 px; radius kontrol 10–12 px dan window 20–24 px; bayangan lembut dan garis pembatas tipis.
- Font Inter dengan fallback sistem; isi utama 14–16 px; judul jelas tanpa kapitalisasi dekoratif berlebihan.
- Icon menggunakan satu keluarga Lucide; satu aksi utama per bagian; aksi hapus diberi hierarki dan konfirmasi yang jelas.
- Token warna, spacing, tipografi, radius, dan state dibagikan ke seluruh aplikasi.
- Semua tab memiliki state memuat, kosong, berhasil, gagal, tidak terhubung, dan tidak memiliki akses.

Perilaku window:

- Desktop ≥1024 px: dialog terpusat, lebar maksimal sekitar 1160 px, tinggi maksimal 90dvh, sidebar 220–240 px, konten bergulir sendiri.
- Tablet 768–1023 px: dialog hampir penuh layar dengan sidebar lebih sempit atau navigasi horizontal sesuai ruang aktual.
- Ponsel <768 px: window penuh layar, header tetap terlihat, empat tab horizontal dengan label utuh dan scroll bila diperlukan; form satu kolom.
- Latar halaman dikunci saat dialog aktif; fokus masuk ke dialog dan kembali ke pemicu saat ditutup; dukung Escape, keyboard, pembaca layar, dan reduced motion.
- Jangan menutup atau mengganti tab diam-diam ketika form belum tersimpan. Dialog tambah/edit key ditampilkan sebagai subview dalam window agar tidak menumpuk modal.
- Membuka atau menutup pengaturan tidak mereset kuis maupun menghentikan timer. Perubahan model/key berlaku pada operasi berikutnya; operasi berjalan memakai snapshot pengaturan saat dimulai.
- Tampilkan sumber data yang aktif pada window: **Lokal · perangkat ini** untuk tamu atau **Akun · email pengguna** saat login. Status ini konsisten pada keempat tab; status sinkronisasi hanya berlaku untuk mode akun.
- Pergantian identitas penyimpanan saat kuis/form aktif memerlukan pilihan simpan pada ruang asal, selesaikan, atau batalkan; jangan memindahkan kuis aktif ke ruang tujuan. Aturan ini berbeda dari membuka/menutup window pengaturan.

## 4. Isi empat tab

| Tab | Fitur utama | Perilaku yang harus jelas |
|---|---|---|
| Akun | Mode lokal tanpa login, masuk, daftar, verifikasi email, lupa/reset kata sandi, profil, keluar | Login opsional, sumber data aktif, pemisahan tamu/akun, dan impor lokal atas tindakan pengguna |
| API key | Tambah/edit/hapus, label, provider, aktif/nonaktif, uji akses, prioritas, cari/filter, pagination | Counter `n/100`, nilai tersamarkan, status uji, waktu uji terakhir, dan slot yang tersisa |
| Model & penggunaan | Model pembuat kuis, key otomatis/spesifik, grounding sesuai kemampuan model, kebijakan fallback, batas percobaan, ringkasan penggunaan | Preferensi dan statistik mengikuti ruang aktif; akses model berbeda dari status key; penggunaan aktual berbeda dari kuota provider |
| Riwayat | Riwayat kuis, hasil dan percobaan pengerjaan, aktivitas AI, cari/filter, detail, ekspor, hapus | Data lokal ketika tamu, data akun ketika login, status penyimpanan, model diminta/aktual, kegagalan, dan penggunaan |

Detail API key:

- Setiap item menampilkan label, provider, akhiran key, prioritas, status aktif, status uji, dan jumlah operasi berhasil/gagal.
- State uji: belum diuji, sedang diuji, akses tersedia, kredensial ditolak, kuota/rate limit, model tidak tersedia, atau gangguan jaringan/layanan. Jangan menyamakan gangguan sementara dengan key tidak valid.
- Uji akses dilakukan atas tindakan pengguna; tidak menguji seluruh 100 key ketika window dibuka. Jelaskan bila pengujian memerlukan permintaan yang memakai kuota.
- Penghapusan key yang dipilih secara spesifik meminta pengguna memilih pengganti atau kembali ke otomatis dalam transaksi yang konsisten.
- Urutan dapat diubah dengan kontrol naik/turun yang dapat digunakan lewat keyboard; drag bukan satu-satunya cara.
- Nilai penuh tidak dikembalikan dalam daftar atau otomatis diisi pada form edit. Penggantian memakai input key baru; perubahan label tidak membutuhkan pembacaan nilai lama.
- Cegah duplikasi key dalam ruang yang sama menggunakan fingerprint: dihitung lokal untuk tamu dan di server untuk akun. Fingerprint bukan enkripsi penyimpanan. Key yang sama boleh dimiliki ruang berbeda, tanpa berbagi status/prioritas/statistik.
- Counter dan batas `n/100` hanya menghitung ruang aktif. Akun kosong menampilkan 0/100 meskipun ruang lokal memiliki key.

Detail model dan penggunaan:

- Tampilkan model yang sudah diverifikasi dari sumber provider dan pemeriksaan akses. Jangan menganggap nama model dalam screenshot atau katalog lama pasti tersedia.
- Dalam mode otomatis, pilih key aktif dari ruang penyimpanan aktif yang sesuai provider, prioritas, dan cooldown. Dalam mode spesifik, kegagalan key tidak otomatis berpindah kecuali pengguna mengaktifkan fallback secara eksplisit. Tidak ada fallback antar tamu dan akun atau antar akun.
- Model cadangan harus diizinkan secara eksplisit. Jangan memindahkan keluarga model atau mematikan grounding diam-diam.
- Ringkasan berisi jumlah permintaan, berhasil/gagal, token bila dilaporkan provider, dan waktu respons. Data yang tidak tersedia ditampilkan sebagai “tidak tersedia”, bukan nol.
- Estimasi biaya hanya ditampilkan bila harga terverifikasi dan bertanggal; tidak diklaim sebagai tagihan atau sisa kuota provider.
- Preferensi sederhana disimpan otomatis dengan debounce dan indikator menyimpan/tersimpan/gagal. Tambah, ganti, dan hapus key memakai aksi eksplisit.

## 5. Arsitektur target

Pisahkan empat lapisan: komponen UI, modul fitur, layanan/domain, dan akses data/provider. React component tidak menangani pemilihan key, retry, atau query kredensial secara langsung.

Struktur konseptual yang direncanakan, belum dibuat:

| Modul | Tanggung jawab |
|---|---|
| `app` | Shell, navigasi, sesi, pembukaan pengaturan |
| `features/ai-settings` | Window dan empat tab |
| `features/auth` | Alur akun dan status sesi |
| `features/api-keys` | Form, daftar, status akses, dan prioritas |
| `features/quiz` | Pembuatan, pengerjaan, penilaian, dan hasil |
| `features/history` | Riwayat kuis dan aktivitas AI |
| `shared/ui` | Button, field, dialog, badge, empty state, pagination |
| `lib/storage` | Kontrak repository bersama, pemilihan ruang aktif, adapter IndexedDB dan Supabase, migrasi lokal |
| `lib/supabase` | Client, tipe database, repository akun |
| Adapter AI lokal | Eksekusi browser dengan key lokal, checkpoint/progres lokal, pencatatan lokal |
| Layanan AI Supabase | Validasi sesi akun, resolusi key/model, job akun, pencatatan, dan retry |

### 5.1. Dua mode penyimpanan persisten

| Data | Tanpa login: ruang tamu lokal | Login: ruang akun aktif |
|---|---|---|
| API key dan metadata | IndexedDB, nilai tanpa enkripsi khusus aplikasi | Metadata Supabase dan kredensial pada schema privat |
| Preferensi AI/kuis/tampilan aplikasi | IndexedDB | Supabase, terikat ID pengguna |
| Kuis, jawaban, bookmark, progres/timer | IndexedDB; deadline timer disimpan untuk reload | Supabase; deadline/progres terikat akun |
| Hasil dan percobaan pengerjaan | IndexedDB | Supabase |
| Aktivitas/statistik AI | IndexedDB | Supabase |
| Job/checkpoint generasi | IndexedDB, eksekusi selama browser aktif | Supabase, layanan eksekusi akun |
| Draft yang dinyatakan tersimpan | IndexedDB | Supabase; form belum tersimpan tetap memori akun |
| Profil/identitas akun | Tidak membuat akun Supabase otomatis untuk tamu | Supabase Auth dan profil pemilik |

IndexedDB menjadi database lokal utama agar key, riwayat besar, dan transaksi tidak bergantung pada kapasitas localStorage. Pisahkan metadata key dari nilai kredensial di object store lokal; UI daftar hanya menerima metadata. Namespace lokal, misalnya `quizmind:guest:v2`, memiliki versi schema dan migrasi. Kredensial lokal memang dapat dibaca oleh browser pemilik; penyamaran UI tidak diklaim sebagai enkripsi.

Mode tamu tidak mengunggah key, kuis, preferensi, progres, atau aktivitas ke Supabase dan tidak membuat pengguna anonim Supabase. Key yang diperlukan dikirim langsung ke provider untuk operasi AI melalui adapter browser. Pertahankan jalur browser yang sudah ada dan verifikasi kompatibilitasnya sebelum memensiunkan jalur lama.

Mode akun memakai Supabase sebagai satu-satunya penyimpanan persisten data aplikasi akun; tidak menyalin data/key akun ke ruang tamu atau cache persisten browser. Cache tampilan di memori dipisahkan menurut ID akun dan dibersihkan saat identitas berubah. Persistensi token sesi Auth untuk memulihkan login adalah mekanisme autentikasi, bukan tempat menyimpan key atau data kuis akun.

Pemilihan repository dilakukan sekali berdasarkan konteks penyimpanan aktif. Semua operasi tambah/edit/hapus, autosave, ekspor, pencatatan, serta resolusi key melewati kontrak yang sama dan selalu membawa identitas ruang asal. Jangan membuat pengecualian storage langsung di komponen UI.

### 5.2. Alur operasi AI

**Tamu:** baca key/preferensi lokal → buat ID operasi dan checkpoint lokal → panggil provider dari browser → simpan kuis, progres, hasil, serta aktivitas ke IndexedDB. Operasi AI tetap membutuhkan koneksi provider; kuis tersimpan dapat dikerjakan tanpa koneksi. Menutup browser menghentikan eksekusi, bukan menghapus data. Setelah reload, job yang belum selesai ditandai terinterupsi dan dilanjutkan hanya atas tindakan pengguna; jangan mengulang request provider secara otomatis.

**Akun:**

1. Pengguna masuk melalui Supabase Auth.
2. Frontend membaca profil, metadata key, preferensi, dan riwayat milik akun.
3. Frontend mengirim konfigurasi kuis, ID key opsional, dan ID operasi; tidak mengirim seluruh daftar kredensial.
4. Layanan AI memverifikasi pengguna, mengambil key miliknya, memvalidasi model/konfigurasi, lalu memanggil provider.
5. Hasil, progres, dan aktivitas disimpan pada akun asal; frontend hanya menampilkannya jika akun itu masih aktif.
6. Penilaian pilihan ganda tetap dihitung tanpa permintaan AI tambahan dan disimpan sebagai percobaan pengerjaan tersendiri.

Gunakan Supabase Edge Functions sebagai pintu layanan **mode akun**. Generasi panjang harus memakai job persisten dengan batch yang dijadwalkan secara durabel, bukan satu fungsi yang dibiarkan berjalan tanpa batas. Tetapkan ukuran batch, timeout, deadline total, dan batas eksekusi setelah memeriksa batas runtime dan beban sampai 100 soal pada task T01/T08. Job mencatat progres, lease eksekusi, pembatalan, dan status terminal; respons HTTP awal mengembalikan ID job. Adapter lokal menggunakan validasi, kebijakan model, dan batas retry yang sama tanpa layanan penyimpanan akun.

Jalur Node/Express dan Worker lama dipensiunkan dari kontrak AI setelah kedua mode pengganti lulus. Jalur provider browser tetap diperlukan untuk tamu dan dipindahkan ke adapter terstruktur. Hosting frontend dapat dipertahankan; jangan menerbitkan ulang aplikasi dalam tahap perencanaan ini.

### 5.3. Logika sesi dan perpindahan ruang

| Kejadian | Sumber data/aksi yang diwajibkan |
|---|---|
| Aplikasi dibuka, sesi sedang dipulihkan | State `initializing`; tahan pembacaan/penulisan domain sampai identitas pasti, hindari tampilan data tamu sesaat |
| Tidak ada sesi setelah pemulihan selesai | Aktifkan ruang tamu lokal; seluruh penyimpanan menuju IndexedDB |
| Login ke akun A berhasil | Tutup konteks tamu, bersihkan tampilan/cache lama, muat hanya data A dari Supabase |
| Akun A belum memiliki data | Tampilkan state kosong/default milik A; jangan memakai key/preferensi lokal sebagai pengganti |
| Logout eksplisit berhasil | Lepas listener/cache/key akun dari memori; aktifkan kembali data tamu lokal sebelumnya, tanpa menyalin data A |
| Pergantian A → B | Hentikan akses konteks A; muat B setelah identitas terverifikasi; data A tetap tersimpan di A |
| Sesi kedaluwarsa atau gagal diverifikasi | State `reauth_required`; hentikan operasi akun dan minta masuk ulang atau keluar ke lokal secara eksplisit; jangan memindahkan data ke tamu |
| Supabase tidak terhubung ketika akun aktif | Tetap pada ruang akun; tampilkan gagal/pending yang jujur, tahan perubahan di memori ruang asal bila perlu; jangan menulis fallback ke IndexedDB |
| Penyimpanan lokal ditolak/penuh | Tampilkan belum tersimpan dan opsi ekspor/coba kembali; jangan mengklaim simpan permanen berhasil atau mengunggah ke akun diam-diam |

Setiap request, autosave yang tertunda, subscription, dan job menangkap ID ruang serta versi konteks sesi sejak awal. Saat sesi berganti, batalkan request/timer yang bisa dibatalkan, lepaskan subscription, kosongkan nilai key/form sensitif, dan abaikan hasil terlambat untuk UI akun baru. Hasil yang sudah diproses hanya boleh ditulis ke ruang asal; callback tidak boleh menggunakan akun yang kebetulan aktif saat selesai.

Perubahan Auth lintas tab mengikuti state machine yang sama. Broadcast perubahan data lokal menginvalidasi cache tamu; transaksi IndexedDB menegakkan batas 100 pada penambahan serentak lintas tab. Pemulihan progres kuis menggunakan deadline waktu asli, tidak memperpanjang timer setelah reload atau perpindahan ruang.

### 5.4. Impor yang disengaja, bukan penggabungan saat login

Data tamu tetap berada di perangkat ketika pengguna masuk. Sediakan **Impor data lokal ke akun ini** di tab Akun/Riwayat, hanya setelah pengguna memilihnya. Preview menampilkan akun tujuan, jumlah key, preferensi, kuis, hasil, dan aktivitas yang dipilih.

Impor memvalidasi versi dan relasi, menghilangkan duplikasi di ruang tujuan, membuat pemetaan ID lokal ke ID akun, dan menghitung slot tersisa sampai 100. Key yang tidak muat tidak dihapus atau ditimpa; pengguna memilih subset. Preferensi akun tidak ditimpa tanpa pilihan pengguna dan referensi key spesifik harus dipetakan ke key akun hasil impor.

Impor memiliki ID unik, checkpoint, dan laporan keberhasilan per kelompok data; metadata dan kredensial key ditulis secara atomik. Jika sesi berganti, hentikan penjadwalan impor berikutnya, jangan memindahkan target ke akun baru. Data sumber lokal dipertahankan; penghapusan lokal adalah aksi tersendiri setelah keberhasilan diperiksa. Tidak ada ekspor otomatis akun ke ruang tamu pada logout.

## 6. Supabase dan model data

Bagian ini berlaku untuk ruang akun. Tamu memakai entitas setara dalam IndexedDB, dengan identitas ruang lokal dan tanpa record pengguna/database Supabase.

Target project: `https://btsvqhlfkkgwkqsezzoq.supabase.co`.

Konfigurasi publik untuk tahap implementasi:

- `VITE_SUPABASE_URL`: URL project di atas.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_0_-VQxC-t2qEMzJTy63SkQ_-BYp-ZQM`.

Publishable key mengidentifikasi aplikasi, bukan pengguna atau hak administrasi. Identitas pengguna berasal dari Supabase Auth. Secret administratif hanya digunakan pada layanan tepercaya bila diperlukan. [Dokumentasi API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

| Entitas yang direncanakan | Data utama |
|---|---|
| `profiles` | ID pengguna, nama, waktu pembuatan/perubahan |
| `api_keys` | ID, pemilik, label, provider, akhiran, fingerprint, prioritas, aktif, status uji, cooldown |
| `private.api_key_credentials` | Referensi key dan nilai teks biasa; tidak diekspos melalui API database publik |
| `ai_preferences` | Pemilik, model, mode pemilihan key, ID key spesifik, fallback, grounding, batas percobaan, versi |
| `quizzes` | Pemilik, konfigurasi, konten kuis tervalidasi, model diminta/aktual, sumber, tanggal |
| `quiz_attempts` | Pemilik, kuis, jawaban, bookmark, durasi, skor, hasil, waktu selesai |
| `ai_jobs` | Pemilik, ID operasi unik, snapshot preferensi, progres/batch, lease, deadline, status |
| `ai_activity` | Pemilik, job, tahap/percobaan, key referensi, model, status, error tersanitasi, token dan durasi |
| `data_imports` | Pemilik, identitas data lama, status dan hasil impor agar tidak duplikat |

Kebijakan akses dan integritas:

- Terapkan grants dan RLS per operasi pada tabel yang diekspos; pemilik hanya mengakses data akunnya. Pengunjung tanpa sesi tidak mengakses data pribadi di Supabase, tetapi tetap dapat memakai data lokalnya. Uji allow/deny untuk dua akun dan pengunjung. [Dokumentasi RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Nilai API key disimpan tanpa enkripsi khusus aplikasi di schema privat. Layanan hanya mengambil kredensial setelah memverifikasi pemilik; jangan mencatat key dalam log, riwayat, atau error.
- Fungsi yang menggunakan akses administratif wajib memeriksa pemilik secara eksplisit; akses administratif melewati RLS. Autentikasi layanan memakai JWT sesi pengguna, bukan publishable key sebagai JWT. [Dokumentasi autentikasi Edge Functions](https://supabase.com/docs/guides/functions/auth).
- Batas 100 ditegakkan secara atomik di database: kunci satu baris pemilik selama transaksi, hitung jumlah, lalu insert metadata dan kredensial bersama. Semua jalur penambahan, termasuk impor, mengikuti mekanisme ini; larang insert langsung yang melewatinya.
- ID key/model dari frontend divalidasi di server. Relasi key, kuis, attempt, dan aktivitas tidak boleh lintas pemilik.
- Tambahkan index untuk pemilik, tanggal, status, prioritas, serta ID operasi unik. Simpan waktu dalam UTC dan tampilkan sesuai zona waktu pengguna.
- Satu kuis dapat memiliki banyak percobaan pengerjaan; menghapus key tidak menghilangkan riwayat kuis yang sudah tercatat.
- Semua mutasi akun, termasuk autosave progres/draft dan impor, ditautkan ke pengguna terverifikasi. Kegagalan jaringan/auth tidak mengalihkan mutasi ke penyimpanan tamu.

Status project remote, validitas publishable key, tabel, dan konfigurasi Auth belum diuji. URL dan key menjadi input rencana; pemeriksaan remote masuk ke task implementasi awal. Perubahan schema/deployment memerlukan akses pengelolaan project, yang tidak diberikan oleh publishable key saja.

## 7. Kebijakan eksekusi dan anti-loop

- Pisahkan kegagalan input, kredensial, akses model, kuota, gangguan sementara, dan timeout.
- Input salah tidak diulang. Kredensial ditolak tidak diulang pada key yang sama. Key/model alternatif hanya dipilih untuk alasan yang sesuai dan dalam kebijakan pengguna.
- Batas percobaan dapat dipilih 1–3; batas tersebut dipakai bersama oleh retry, fallback key, dan fallback model untuk satu operasi/batch, bukan dikalikan di setiap lapisan.
- Untuk generasi bertahap, jumlah batch dibatasi oleh rencana job. Batch sukses bukan retry; batch tanpa progres berhenti setelah batas percobaan, dan job selalu memiliki deadline total.
- Gunakan cooldown untuk rate limit; jangan mengasumsikan key berbeda memiliki kuota terpisah karena beberapa key bisa berasal dari project provider yang sama.
- Timeout harus membatalkan request bila SDK mendukung; bila hasil provider tidak dapat dibatalkan, tandai hasil terlambat dan cegah penulisan ganda. Tombol batal menghentikan penjadwalan batch berikutnya.
- ID operasi, lease, dan checkpoint mencegah klik ganda, refresh, polling, atau worker restart membuat pekerjaan baru tanpa sengaja. Jangan menjanjikan exactly-once billing dari provider.
- Resolusi key dan pencatatan memakai ruang asal operasi. Batas retry tidak membolehkan mencoba key dari ruang lain saat ruang aktif kehabisan key/kuota.
- Aktivitas memakai log tersanitasi. Setelah kegagalan berulang, UI menampilkan penyebab dan tindakan selanjutnya tanpa mencoba terus-menerus.
- Saat implementasi/debugging, patuhi aturan agen: maksimal tiga percobaan per masalah, RCA setelah dua kegagalan identik, dan hentikan percobaan otomatis setelah tiga gagal. Ini berbeda dari konfigurasi retry produk.

## 8. Backlog implementasi

Seluruh checkbox masih kosong. Dependency menentukan urutan; task berikutnya dimulai setelah kriteria tahap sebelumnya terpenuhi.

### T01 — Audit dan kontrak perilaku

- [ ] Petakan UI lama, kontrak API, seluruh konsumen vault/integrity token, deployment, dan data lokal.
- [ ] Catat kebutuhan kuis yang wajib dipertahankan: 1–100 soal, sembilan kesulitan, dua mode, timer/tanpa batas, bahasa, instruksi, grounding, pembahasan, dan ekspor.
- [ ] Verifikasi katalog/capability provider, akses Supabase, redirect Auth, serta batas runtime/job.
- [ ] Petakan semua jenis penyimpanan: key, preferensi, kuis, jawaban/progres, hasil, aktivitas, job, draft, dan checkpoint impor; definisikan state pemulihan/login/logout/ganti akun.
- **Selesai bila:** matriks lama→baru, dua mode penyimpanan, keputusan runtime, daftar migrasi, dan skenario regresi tertulis. Tidak ada model yang diklaim tersedia berdasarkan screenshot.

### T02 — Spesifikasi desain dan prototipe

- [ ] Buat wireframe seluruh layar aplikasi dan empat tab pada desktop, tablet, dan ponsel.
- [ ] Tetapkan token desain, komponen bersama, state, alur tambah/edit key, serta tampilan daftar 100 key.
- **Dependency:** T01.
- **Selesai bila:** prototipe mencakup tamu/akun masuk/keluar, sumber data aktif, 0/1/100 key, riwayat kosong/berisi, impor eksplisit, gagal simpan/sesi kedaluwarsa, dan navigasi keyboard.

### T03 — Fondasi modul aplikasi

- [ ] Pisahkan shell, fitur, domain kuis, repository, dan UI bersama sesuai arsitektur target.
- [ ] Tetapkan kontrak bertipe untuk sesi, preferensi, metadata key, job, dan riwayat; pisahkan data jarak jauh dari form lokal.
- [ ] Buat kontrak repository dan adapter IndexedDB/Supabase, namespace lokal berversi, serta konteks ruang/versi sesi untuk seluruh operasi.
- **Dependency:** T01–T02.
- **Selesai bila:** pemilihan repository konsisten untuk seluruh data; state `initializing` menahan mutasi; hasil dari konteks lama tidak masuk konteks baru; build dan pemeriksaan tipe lulus.

### T04 — Database dan pembatasan akses

- [ ] Buat migrasi schema, relasi, index, grants/RLS, schema kredensial privat, serta transaksi batas 100.
- [ ] Rancang lifecycle hapus key, pengaturan key spesifik, hapus kuis, dan aktivitas terkait.
- [ ] Buat schema/migrasi IndexedDB dan transaksi batas 100 key tamu, termasuk perubahan serentak lintas tab dan penanganan kapasitas/penolakan storage.
- **Dependency:** T01.
- **Selesai bila:** di masing-masing ruang, key ke-100 diterima dan ke-101 ditolak termasuk pada insert serentak; pengunjung/akun lain ditolak dari data akun; nilai penuh tidak muncul di daftar metadata; data tamu bertahan setelah browser ditutup/dibuka.

### T05 — Tab Akun

- [ ] Implementasikan daftar, masuk, verifikasi email, reset kata sandi, profil, pemulihan sesi, dan keluar.
- [ ] Bersihkan cache dan state milik akun sebelumnya saat keluar/berganti akun.
- [ ] Terapkan login opsional, pemulihan sesi, perpindahan ruang, Auth lintas tab, serta state masuk ulang tanpa fallback penyimpanan diam-diam.
- **Dependency:** T03–T04.
- **Selesai bila:** tamu dapat menggunakan aplikasi penuh tanpa login; sesi bertahan setelah reload; A/B/tamu terisolasi; logout mengembalikan data lokal sebelumnya; tidak ada perpindahan data otomatis.

### T06 — Window pengaturan

- [ ] Implementasikan header, empat tab, sidebar/horizontal tabs, scroll konten, dan subview form.
- [ ] Terapkan fokus, Escape, proteksi form belum tersimpan, safe area, dan reduced motion.
- [ ] Tampilkan indikator Lokal/Akun dan status penyimpanan sesuai mode pada semua tab.
- **Dependency:** T02–T03.
- **Selesai bila:** empat tab dapat dipakai pada 320–1920 px tanpa overflow halaman; pembukaan pengaturan tidak mereset sesi kuis.

### T07 — Tab API key

- [ ] Implementasikan tambah/edit/hapus, aktif/nonaktif, prioritas, search/filter, pagination, counter, dan uji akses.
- [ ] Gunakan repository lokal atau layanan akun untuk operasi kredensial; tangani duplikasi, batas 100, serta penghapusan key yang sedang dipilih di ruang asal.
- **Dependency:** T04–T06.
- **Selesai bila:** key tamu bertahan pada perangkat/browser yang sama; key akun tersimpan lintas perangkat; keduanya terisolasi; key nonaktif dilewati; edit label tidak mengekspos nilai penuh; gagal simpan tidak menampilkan keberhasilan palsu.

### T08 — Layanan AI dan job persisten

- [ ] Implementasikan provider adapter, validasi, resolusi key/model, retry bersama, cooldown, pembatalan, dan pencatatan.
- [ ] Implementasikan penjadwalan job/batch durabel, checkpoint, lease, deadline, validasi hasil, dan pencegahan duplikasi.
- [ ] Implementasikan adapter provider browser untuk tamu, checkpoint/aktivitas lokal, dan pemulihan job terinterupsi atas tindakan pengguna; jangan mengunggah data tamu ke Supabase.
- **Dependency:** T03–T04–T07.
- **Selesai bila:** kedua mode menghasilkan 1, 5, dan 100 soal dengan jumlah tepat; gangguan/restart dapat dipulihkan atau berakhir jelas; request tidak berulang tanpa batas; model aktual dan grounding tercatat; pergantian akun tidak mengalihkan job/key/hasil.

### T09 — Tab Model & penggunaan

- [ ] Implementasikan katalog terverifikasi, pemilihan model/key, fallback eksplisit, grounding, batas percobaan, dan autosave.
- [ ] Tampilkan ringkasan penggunaan berdasarkan data aktivitas, dengan nilai tidak tersedia yang jujur.
- **Dependency:** T05–T08.
- **Selesai bila:** pilihan bertahan setelah reload di ruang asal, statistik tidak bercampur, operasi berjalan memakai snapshot, dan kegagalan tidak memicu perubahan model atau ruang penyimpanan tersembunyi.

### T10 — Tab Riwayat dan impor

- [ ] Implementasikan riwayat kuis/attempt, aktivitas AI, filter, pagination, detail, ekspor, dan penghapusan.
- [ ] Migrasikan riwayat lama dari localStorage ke IndexedDB tamu tanpa menghapus sumber sebelum verifikasi.
- [ ] Sediakan impor eksplisit lokal→akun untuk key, preferensi, kuis, hasil, dan aktivitas: preview, pemetaan ID, batas 100, validasi versi, deduplikasi, checkpoint, hasil impor, dan retry yang tidak menduplikasi.
- [ ] Untuk API key lama, minta pengguna memasukkan kembali nilai key; ciphertext tidak dapat dipindahkan menjadi key tanpa dekripsi. Tidak membangun kembali UI vault.
- **Dependency:** T04–T05–T08.
- **Selesai bila:** riwayat tamu bertahan setelah reload/penutupan browser; data akun konsisten setelah reload/perangkat lain; login tidak mengimpor otomatis; impor kedua tidak menggandakan data; key spesifik dipetakan benar; data lokal tidak dihapus otomatis; impor tertunda tidak berpindah target saat sesi berubah.

### T11 — Perombakan seluruh UI dan penghentian arsitektur lama

- [ ] Terapkan desain baru pada navigasi, pembuatan kuis, progres generasi, runner, hasil, dan ekspor.
- [ ] Form kuis menampilkan ringkasan konfigurasi AI serta pintasan ke pengaturan; hapus pengelolaan key/model yang duplikat.
- [ ] Ganti akses data lama, lalu hapus vault, demo keamanan enkripsi, endpoint encrypt/decrypt, auto-lock vault, dan dependency `ENCRYPTION_SECRET` setelah audit konsumen selesai.
- [ ] Tinjau `integrityToken`: jangan mengganti enkripsi dengan base64 atau mengklaim proteksi skor; tentukan kebutuhan integritas melalui kontrak data dan validasi layanan.
- [ ] Perbarui dokumentasi dan workflow hosting untuk URL/publishable key Supabase serta hapus kontrak server AI lama yang sudah tidak dipakai.
- [ ] Dokumentasikan aturan penyimpanan tamu/akun, persistensi lokal, impor eksplisit, dan perilaku gagal koneksi; pertahankan adapter AI browser sebagai jalur tamu.
- **Dependency:** T06–T10.
- **Selesai bila:** seluruh layar memakai sistem desain baru; alur lama tidak lagi tersedia; timer, penilaian, ekspor, dan data pengguna lolos regresi.

### T12 — Verifikasi dan kesiapan rilis

- [ ] Jalankan pemeriksaan tipe/build, tes domain/provider yang relevan, tes database, dan alur browser.
- [ ] Lakukan pengujian lintas viewport/browser, keyboard, fokus, kontras, zoom 200%, dan performa daftar.
- [ ] Verifikasi environment, redirect Auth, CORS, akses privat, pencatatan tanpa key, dan rencana rollback versi aplikasi/migrasi.
- [ ] Uji matriks tamu→A→B→tamu, reload, tutup/buka browser, dua tab, sesi kedaluwarsa, Supabase offline, storage penuh, autosave tertunda, hasil AI terlambat, dan impor saat sesi berubah.
- **Dependency:** T01–T11.
- **Selesai bila:** seluruh kriteria penerimaan di bawah lulus dengan bukti; status rilis dipisahkan dari status implementasi. Publikasi adalah tahap tersendiri.

## 9. Kriteria penerimaan akhir

1. Tepat empat tab pengaturan dengan label dan perilaku yang konsisten.
2. Window desktop dan tampilan penuh layar ponsel berfungsi pada lebar 320, 375, 768, 1024, 1440, dan 1920 px, tanpa overflow horizontal halaman.
3. Masuk/daftar/reset/keluar bekerja; ruang tamu, akun A, dan akun B sepenuhnya terisolasi untuk seluruh jenis data, termasuk key, preferensi, progres, hasil, dan aktivitas.
4. Hingga 100 key dapat disimpan pada ruang lokal tamu dan masing-masing akun; key ke-101 ditolak oleh transaksi IndexedDB/database akun, termasuk dua penambahan bersamaan pada posisi 99/100.
5. Tambah/edit/hapus/uji/prioritas/aktif/nonaktif key bekerja; membuka window tidak memicu 100 panggilan uji.
6. Tidak ada lagi alur penyimpanan terenkripsi khusus aplikasi, password vault, unlock, lock, atau demo enkripsi.
7. Nilai key tidak masuk bundle, URL, log, analytics, riwayat, daftar metadata, atau akses akun lain.
8. Tanpa login, key, preferensi, kuis, jawaban/progres, hasil, aktivitas, dan checkpoint tersimpan lokal setelah reload/penutupan browser. Setelah login, semuanya tersimpan pada akun asal dan terbaca di perangkat lain setelah penyimpanan berhasil.
9. Percobaan, fallback, batch, timeout, dan pembatalan memiliki batas; klik ganda dan refresh tidak membuat job duplikat.
10. Jumlah soal tepat, kedua mode/timer tetap sesuai, dan hasil penilaian serta ekspor lolos regresi.
11. Riwayat lama dapat dimigrasikan lokal; data lokal dapat diimpor ke akun atas tindakan pengguna tanpa duplikasi, melebihi batas key, referensi key salah, atau penghapusan data sumber otomatis.
12. UI menjelaskan status memuat/kosong/gagal/tersimpan dan tidak mengklaim akses, kuota, biaya, atau keberhasilan tanpa bukti.
13. Pemeriksaan tipe, build frontend, tes akses database, tes operasi key, dan alur browser lulus. Tes tiruan dan pengujian provider nyata dilaporkan terpisah.
14. Login ke akun kosong tidak menampilkan/menggunakan data atau API key tamu. Logout memulihkan ruang lokal sebelumnya tanpa menyalin data akun ke lokal; login berikutnya memulihkan data akun yang sesuai.
15. Mode tamu tidak membuat record akun/kuis/key/aktivitas di Supabase. Mode akun tidak menyimpan data domain atau key akun pada penyimpanan persisten tamu/browser.
16. Pemulihan sesi, auth lintas tab, request terlambat, autosave, dan impor tertunda tidak menyebabkan pembacaan/penulisan lintas ruang.
17. Kegagalan jaringan/auth pada akun tidak menjadi fallback lokal; storage lokal penuh/ditolak tidak menjadi upload akun otomatis. Status belum tersimpan ditampilkan dengan jelas.
18. Kedua mode memungkinkan pengerjaan kuis tersimpan; pemulihan timer memakai deadline asli. Job tamu terinterupsi tidak memanggil provider kembali otomatis setelah reload.

## 10. Checkpoint dan catatan pelaksanaan

Simpan checkpoint setiap task: lingkup perubahan, hipotesis bila ada kegagalan, bukti pengujian, keterbatasan, dan langkah selanjutnya. T01–T12 belum dijalankan dalam tahap ini.

Pengujian provider nyata memakai kuota pengguna dan dilakukan terbatas pada skenario yang diperlukan; jangan menguji 100 key secara massal untuk membuktikan batas penyimpanan. Tes batas 100 menggunakan database/test fixture tanpa kredensial provider nyata.

Perencanaan ini selesai ketika dokumen revisi tersimpan permanen di workspace, mencakup empat tab, arsitektur dua mode, seluruh penyimpanan lokal tanpa login termasuk API key, isolasi data akun aktif, batas 100 per ruang, penghapusan vault, transisi sesi, impor eksplisit, dependensi task, dan kriteria penerimaan. Perubahan workspace hanya berupa dokumen rencana; sistem penyimpanan aplikasi belum diimplementasikan.
