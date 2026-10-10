# Pemantauan API dan perpindahan key

Buka **Koneksi AI → Pemantauan**. Tab ini menampilkan panggilan penyedia, respons berhasil/gagal, token input/output/penalaran yang tersedia, waktu respons, status koneksi, dan maksimal 100 kejadian terakhir. Token dicatat dari `usageMetadata` Gemini dan evaluator. Panggilan berhasil belum berarti isi kuis lolos validasi.

Untuk cadangan, tambahkan key dan isi identitas proyek Google yang sebenarnya di setiap koneksi. Key dalam proyek yang sama harus menggunakan nilai proyek yang sama. Key tanpa identitas proyek dianggap berada dalam satu kelompok bersama. Aktifkan **Model & Cadangan → Gunakan key cadangan**.

Key invalid dikarantina otomatis di pool, sehingga tidak dipilih lagi sampai status direset atau kredensial diganti. Error izin membatasi key pada model terkait; masalah billing membatasi seluruh akses key. Error 429 menjeda kelompok proyek untuk model terkait; batas biaya proyek menjeda semua model. Model cadangan hanya dicoba otomatis bila **Izinkan model cadangan** aktif. Error permintaan dan jaringan menghentikan rotasi. Pool membatasi percobaan hingga tiga, termasuk bila pemanggil meminta lebih banyak. Permintaan grounded mengikuti batas dan pengaturan khusus layanan yang sudah ada.

Statistik dan karantina runtime berada dalam memori: refresh sesi lokal atau restart server menghapusnya. Mengunci vault lokal menghapus catatan sesi. Reset status tidak menghapus statistik, tetapi membuka kembali pembatasan key dan jeda kelompok proyek. Jangan gunakan reset untuk mengatasi kuota yang masih habis.

Mode lokal memantau aktivitas koneksi perangkat; mode vault server mengembalikan metadata melalui endpoint sesi yang membutuhkan login. Pembaruan otomatis dilakukan setiap lima detik hanya ketika jendela dan tab Pemantauan terbuka serta halaman terlihat. Endpoint publik tidak mengekspos catatan penggunaan vault. Prompt, respons teks, dan nilai key tidak disimpan dalam riwayat pemantauan.

Belum ada sinkronisasi Cloud Monitoring, kuota tersisa resmi, estimasi biaya, atau pencabutan key di Google. Hal tersebut memerlukan konfigurasi proyek, izin IAM dan kredensial server tambahan. Karantina aplikasi tidak mencabut key pada akun Google. Key hosting tunggal tanpa vault server tidak memiliki dashboard catatan ini; gunakan koleksi lokal atau vault server.

Verifikasi: `npm run lint`, `npm run test:monitor`, `npm run test:keys`, dan `npm run build`. Pengujian menggunakan key fiktif dan respons tiruan, tanpa panggilan Google.
