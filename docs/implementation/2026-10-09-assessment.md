# Checkpoint implementasi tipe soal dan Evaluasi AI

Tanggal: 9 Oktober 2026. Fitur utama telah diimplementasikan. Tidak dilakukan publikasi atau commit. Aturan `.agents/rules/anti-loop.md` dipertahankan.

## Perubahan tersedia

- Kontrak tujuh tipe, jawaban berbasis ID, validator runtime/schema, komposisi campuran, bobot, parsial dan timer per tipe.
- Generator Gemini/Gemma/Groq per tipe, maksimum 5 soal per batch (esai 2), lima opsi dan rubrik sebelum pengerjaan. Riset Groq dipakai ulang antar batch.
- Radio, checkbox, boolean tanpa default, teks dengan batas karakter, dropdown pasangan unik, urutan Naik/Turun dan konfirmasi.
- Penilaian objektif, alias isian lokal/hybrid, evaluator rubrik mandiri dan pengaturan di Koneksi AI. Poin dihitung aplikasi, bukti diperiksa terhadap jawaban, hasil bermasalah ditahan untuk tinjauan.
- Endpoint evaluator browser/Node/Worker, cache terikat pool dan snapshot, fallback evaluator terpisah, maksimum 3 panggilan per jawaban, abort/deadline dan provenance/usage bila tersedia.
- Autosave IndexedDB, deadline absolut, kepemilikan antar tab, submission disimpan sebelum API, resume checkpoint, hasil beberapa attempt, revisi manual dengan alasan, print dan ekspor.
- Migrasi history lama empat opsi, nilai historis dipertahankan; cadangan riwayat rusak dan ekspor pemulihan. Setting evaluator tidak mengubah format enkripsi yang ada.

## Keputusan implementasi terhadap backlog

`QuestionInput.tsx` menjadi renderer bersama; helper status bernama `questionState.ts`. Migrasi berada dalam `quizStorage.ts`, bukan file terpisah. Jawaban angka legacy tetap dapat dibaca melalui normalisasi tanpa menulis ulang skor historis.

Evaluasi aplikasi memakai satu soal per request dengan checkpoint tiap jawaban. Status/cancel/progres dikelola klien dan AbortSignal, memakai endpoint POST yang sama pada seluruh runtime. Tidak ditambahkan registry job durable/streaming/status/cancel server. Node memakai guard akun/CSRF/pool vault yang sudah ada; fingerprint menyertakan route agar evaluator dan generator tidak bertabrakan.

Respons generator yang tidak valid ditolak, bukan diperbaiki dengan panggilan otomatis tanpa hipotesis baru. Batch yang sudah valid belum dipersist sebagai draft generator yang dapat dilanjutkan setelah kegagalan batch berikutnya; resume berlaku untuk jawaban dan evaluasi. Rubrik dibekukan bersama kuis. Karakter maksimum isian 500/esai 5000, belum menjadi kontrol creator.

## Bukti pengujian

Lulus: TypeScript, suite tipe/scoring/migrasi/evaluator, key client/multi/server, provider, model, ketahanan Gemma, build Node/Worker, build Pages, smoke aset/API serta uji endpoint evaluator Node/Worker. Provider mock pembatalan diberi watchdog agar gagal dengan jelas dan menjaga Request tetap hidup seperti I/O nyata, mengatasi test yang sebelumnya berhenti dengan unsettled await.

Suite baru menguji tujuh schema, tepat lima opsi, false/jawaban pertama/kosong, pilihan kompleks 32 kombinasi, kredit parsial, rubrik/bukti invalid, output hilang/terpotong, cache/revisi, budget, fallback, migrasi idempotent, campuran Gemini/Groq serta alias tanpa key pada HTTP Node/Worker.

QA browser: mengisi ketujuh tipe, 7/7 terjawab, reload lalu memulihkan seluruh jawaban, pasangan satu-ke-satu dan urutan, konfirmasi submission, 5 poin objektif dan 2 pending tanpa skor final, manual 1 dan 0.5 menghasilkan 6.5/7 = 92.86, filter sebagian benar, distribusi 10 soal ke tujuh tipe, simpan evaluator, timer 5 detik mengumpulkan otomatis, desktop dan viewport ponsel 390×844. Tab Evaluasi AI juga diperiksa di aplikasi utama. Screenshot ada di `docs/qa/`.

Smoke nyata: Gemini 3.8 Flash menolak dua pengujian dengan 503. Analisis langsung satu request mengonfirmasi pesan provider high demand, bukan key salah. Percobaan alternatif terakhir dengan Gemini 3.5 Flash Lite berhasil membuat isian dan esai, kemudian masing-masing jawaban acuan mendapat 1/1 melalui evaluator. Model default aplikasi tetap sama. Tidak ada Groq key nyata untuk pengujian live.

## Batas verifikasi

Belum dilakukan kalibrasi evaluator dengan dataset jawaban manusia yang besar, QA screen reader/IME/print fisik, simulasi kuota IndexedDB penuh, serta pengujian browser nyata pada seluruh empat jalur deployment. Respons objektif tervalidasi dan integrasi mock bukan bukti semua soal/rubrik buatan AI selalu benar; hasil ambigu mempunyai jalur tinjauan. Tidak ada estimasi biaya mata uang atau dashboard batas kuota evaluasi tersendiri. Tidak dilakukan deploy.

## Pemeriksaan akhir

Diff harus tanpa secret, perubahan pengguna dipertahankan, serta build/regresi yang relevan lulus setelah perubahan terakhir. Backlog ditandai hanya untuk butir yang sudah terpenuhi; butir yang sebagian atau membutuhkan pengujian lebih luas tetap terbuka.
