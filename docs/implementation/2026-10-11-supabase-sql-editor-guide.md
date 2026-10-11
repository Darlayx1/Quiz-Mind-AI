# Panduan pemeriksaan penyimpanan akun produksi

## Hasil audit yang sudah tersedia

- `.env`, nilai bawaan frontend, workflow Pages, dan `supabase/config.toml` menunjuk proyek `btsvqhlfkkgwkqsezzoq`; tidak ditemukan perbedaan URL atau public key lokal terhadap konfigurasi produksi. Nilai kredensial privat tidak dicetak.
- Frontend dan Edge memakai HTTPS/Data API. Tidak ditemukan koneksi PostgreSQL langsung atau pool aplikasi; ukuran pool PostgREST/Supavisor dan konfigurasi efektif produksinya tidak tersedia di repository.
- Client Supabase frontend dibuat sekali pada modul. Client Edge menggunakan service role di runtime server, dengan persistensi sesi dan refresh otomatis dinonaktifkan.
- RPC pemuatan dan metadata mempunyai batas operasi 20 detik; seluruh pemuatan workspace dibatasi 30 detik. Event akun yang sama dan permintaan muat ulang bersamaan tidak menambah pemuatan ganda. Tidak ada retry otomatis untuk pemuatan workspace.
- SQL migrasi menggunakan transaksi dan commit. RPC pemuatan melakukan insert workspace jika perlu kemudian membaca satu baris melalui primary key `user_id`. Walaupun operasinya sederhana, insert konflik dapat menunggu transaksi yang belum selesai. Fungsi impor/key juga mengunci baris workspace dengan `FOR UPDATE`.
- Panggilan AI terjadi di luar transaksi RPC. Lease pekerjaan selama 180 detik adalah data status, bukan transaksi PostgreSQL terbuka selama 180 detik.
- Pemeriksaan pembatalan Edge tiap 2 detik mempunyai penjaga untuk mencegah overlap dan pembersihan interval. Polling frontend berjalan berurutan sekitar 2,5–3 detik. Beban ini tetap dapat meningkat dengan jumlah pengguna; ukur koneksi/log produksi sebelum menyimpulkan pool penuh.
- Client database Edge belum menyediakan timeout fetch eksplisit untuk semua operasi. Pembatalan browser tidak membuktikan transaksi server langsung berhenti. Ini kandidat hardening setelah kondisi server diketahui, bukan bukti penyebab timeout login.
- Deployment backend hanya menerapkan satu migrasi terbaru dan tetap melanjutkan jika pemasangan migrasi gagal. Status sukses Pages tidak membuktikan migrasi backend lengkap. Perbaikan deployment permanen perlu menghentikan proses saat migrasi gagal dan memeriksa urutan/versi migrasi, tanpa menjalankan ulang seluruh migrasi sembarangan.
- Dalam pengujian akun produksi sebelumnya, sesi berhasil tersedia lalu tahap database timeout. Endpoint Auth merespons; dua endpoint resource Data API timeout. Ini membuktikan tahap kegagalan, belum menentukan apakah bottleneck berada di gateway, PostgREST, koneksi, atau query PostgreSQL.

## Jaminan skrip diagnostik

File: `supabase/diagnostics/account-storage-health.sql`.

Skrip dimulai dengan `BEGIN READ ONLY`, menjalankan satu SELECT terhadap katalog/statistik, dan diakhiri `ROLLBACK`. `SET LOCAL` hanya membatasi transaksi diagnostik: statement 5 detik, lock 2 detik. Tidak ada pemanggilan RPC workspace, penghentian proses, perubahan role/pool, atau pembacaan isi workspace/key. Definisi fungsi penuh tidak dikembalikan; hanya properti dan hash sumber. Daftar transaksi dibatasi 50 baris.

Skrip berhasil dijalankan pada PostgreSQL sementara PGlite. Hasil menunjukkan `transaction_read_only = on`, batas 5s/2s aktif, dan jumlah baris fixture tidak berubah. Verifikasi ini tidak memakai database produksi dan tidak membuktikan produksinya sehat.

## Langkah SQL Editor

1. Masuk ke https://supabase.com/dashboard dengan akun administrator Anda.
2. Pilih proyek dengan ID `btsvqhlfkkgwkqsezzoq`; cocokkan ID pada URL dashboard, bukan hanya nama tampilannya.
3. Buka **SQL Editor**, kemudian buat query baru (**New query**).
4. Buka file diagnostik lokal dan salin seluruh isinya, dari komentar awal sampai `rollback;`.
5. Tempel ke editor. Gunakan role administrator/default `postgres` bila pilihan role ditampilkan. Role ini diperlukan untuk melihat statistik lintas koneksi; jangan mengubah izin role.
6. Klik **Run** sekali. Skrip tidak menjalankan kuis atau memanggil AI.
7. Cari hasil SELECT pada kolom **account_storage_health**. Salin JSON lengkap dari sel tersebut. Bila editor hanya menampilkan “Success. No rows returned”, atau error, kirim pesan persisnya; jangan melepas pembungkus read-only untuk memaksa hasil.
8. Sertakan waktu eksekusi dan apakah aplikasi akun sedang mengalami timeout pada saat yang sama. Satu snapshot setelah gangguan berhenti dapat melewatkan transaksi yang sebelumnya terblokir.

Jika query gagal karena timeout/koneksi, pesan itu juga merupakan bukti. Jangan mengulang terus-menerus. SQL Editor bisa memakai jalur berbeda dari Data API; SQL Editor berhasil tidak otomatis berarti PostgREST pulih.

## Hasil yang perlu dikirim

Kirim seluruh JSON `account_storage_health` atau pesan error lengkap. Field paling penting:

- `transaction_read_only`, `diagnostic_statement_timeout`, `diagnostic_lock_timeout`.
- `max_connections`, `reserved_superuser_connections`, `reserved_connections`, `total_connections_all_databases`, `current_connections`, `active_connections`, `idle_in_transaction`, `role_connection_counts`.
- `waiting_or_long_transactions`: `pid`, `role`, `application`, `state`, `wait_type`, `wait_event`, `transaction_age`, `query_age`, `blocked_by`.
- `workspace_table_exists`, `key_table_exists`, `load_function_exists`, `authenticated_can_load`, `authenticated_can_read_keys`, `workspace_rls`, `keys_rls`, `policies`, `load_function_properties`.
- `saved_role_database_settings`: hanya konfigurasi tersimpan yang diizinkan, tidak mencakup rahasia. Array kosong berarti tidak ditemukan override tersimpan, bukan timeout nol atau tanpa batas. Ukuran pool yang tidak muncul harus diperiksa melalui konfigurasi/log administrator.

Jika tersedia, buka **Logs / Logs Explorer** proyek dan filter permintaan `/rest/v1/rpc/qm_load_workspace` dan `/rest/v1/qm_api_keys` pada waktu gangguan. Kirim waktu, status HTTP, durasi, request ID, kode error (`PGRST000/002/003`, `57014`, `55P03`, `40P01`, dll.), dan pesan ringkasnya. Sertakan pesan koneksi/lock terkait di log PostgreSQL. Hapus header Authorization, token, cookies, request body dan nilai API key; skrip diagnostik sendiri tidak mengembalikannya.

## Cara hasil akan menentukan perbaikan

| Bukti | Arah perbaikan |
| --- | --- |
| `blocked_by` terisi / lock wait | Petakan blocker, cari operasi pemiliknya, kurangi durasi atau urutan lock, dan pastikan transaksi diselesaikan. Hentikan hanya proses yang benar-benar teridentifikasi setelah tindakan aman ditentukan. |
| Idle transaction tua / koneksi mendekati kapasitas | Identifikasi produsen koneksi/permintaan. Perbaiki lifecycle dan paralelisme; gunakan batas idle transaction sesuai role setelah dampaknya diperiksa. |
| `PGRST003` | Permintaan menunggu pool PostgREST; cocokkan dengan jumlah koneksi, transaksi, dan kapasitas. Perbaiki penyebab penahanan koneksi sebelum menyesuaikan ukuran pool. |
| `PGRST000/002`, query editor cepat, tidak ada blocker | Audit konektivitas PostgREST dan schema cache; lakukan pemulihan layanan yang ditargetkan setelah log diperiksa. |
| `57014` | Statement timeout: tentukan query/lock yang lambat; periksa plan/index/payload dan kurangi pekerjaannya. |
| Schema/izin yang diperlukan tidak ada | Pasang migrasi/grant yang memang kurang, dengan RLS dan pemisahan akun tetap berlaku. |
| Resource REST tidak merespons tetapi tidak terlihat query/koneksi PostgREST | Audit gateway/Data API dan log routing. Keberhasilan Auth atau OPTIONS saja tidak membuktikan resource REST sehat. |

Satu kondisi bisa memiliki beberapa penyebab. Jangan menyimpulkan pool penuh dari angka koneksi saja: batas `max_connections` bersifat seluruh server, sedangkan pool PostgREST bisa lebih kecil, dan ada koneksi cadangan.

## Syarat menyatakan pulih

Setelah perbaikan berbasis bukti, uji sesi produksi yang sama: pemuatan workspace dan metadata selesai, halaman/riwayat akun terbuka, reload tetap berhasil, serta pergantian akun dan logout tetap terisolasi. Pastikan log tidak lagi menunjukkan bottleneck yang ditemukan dan durasi permintaan membaik. Pengujian simpan hanya memakai data uji yang disepakati. Sampai pemeriksaan itu berhasil, status tetap **belum terbukti pulih**.

## Rujukan

- https://www.postgresql.org/docs/current/sql-set-transaction.html
- https://docs.postgrest.org/en/stable/references/connection_pool.html
- https://supabase.com/docs/guides/database/postgres/timeouts
# Pembaruan pemeriksaan langsung

Pemeriksaan SQL telah dijalankan oleh agen melalui sesi administrator dashboard. Penyebab terkonfirmasi: konflik versi pada `qm_save_workspace` menggunakan `40001`, yang memicu retry tanpa henti di PostgREST 14.18. Patch produksi mengubahnya menjadi `PT409` dan mempertahankan pemeriksaan pemilik, CAS, izin, dan RLS. Pada 14:01 UTC, hasil skrip lengkap menunjukkan 14 koneksi total, 8 pada database aktif, nol transaksi idle dan nol blocker; izin load/read akun tersedia. Bukti tersimpan pada `evidence/2026-10-11-storage-health.json`. Pengujian ulang UI akun masih tertahan masalah DNS browser Codex, sehingga pemulihan akun menyeluruh belum dinyatakan berhasil. Langkah manual di bawah tetap tersedia sebagai panduan pemeriksaan selanjutnya.

