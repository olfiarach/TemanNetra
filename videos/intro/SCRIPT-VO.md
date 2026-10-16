# Skrip voice-over — video pengantar TemanNetra (±36 detik)

Narasi Bahasa Indonesia, direkam manual. Video saat ini **tanpa audio**, jadi VO ini
adalah satu-satunya suara: kalimat di bawah sudah dihitung agar muat di durasi tiap
frame pada tempo santai (~2,1 kata/detik). Jangan menambah kalimat tanpa memanjangkan
frame — penanda waktu di kolom terakhir adalah batas keras.

Aturan isi (dari README + PRODUCT.md, jangan dilanggar saat improvisasi):

- **Jangan klaim akurasi, kecepatan, atau validasi.** Tidak ada angka evaluasi di repo.
- Kata "hasil deteksi nyata" boleh (itu faktanya); "akurat", "presisi", "cepat" tidak.
- Semua istilah produk memakai ejaan layar: *TemanNetra*, *Rp100.000*, *YOLO*, *browser*.

| # | Frame | Jendela bicara | Baris | Kata | Selesai maks. |
|---|---|---|---|---|---|
| 1 | Logo | 0,9 – 3,9 s | TemanNetra. Pemindai uang Rupiah di browser ponsel. | 7 | 3,9 s |
| 2 | Hook | 4,6 – 8,5 s | Bayangkan harus mencari uang receh, tanpa bisa melihat nominalnya. | 9 | 8,5 s |
| 3 | Cara kerja | 9,5 – 14,3 s | Semuanya jalan di browser. Data kamera tidak pernah keluar dari ponsel. | 11 | 14,3 s |
| 4 | Bukti deteksi | 15,6 – 23,4 s | Deteksi membaca tujuh nominal, dari seribu sampai seratus ribu rupiah. Yang di layar ini hasil deteksi nyata. | 18 | 23,4 s |
| 5 | Prinsip | 24,3 – 29,9 s | Nominal diumumkan hanya setelah tiga frame sepakat. Lebih baik hening daripada salah. | 13 | 30,0 s |
| 6 | CTA | 30,4 – 35,6 s | Kode dan demonya ada di GitHub. Masih prototype, bukan alat memastikan uang. | 12 | 35,6 s |

Total ±70 kata / 36 detik.

## Per frame

### 1 — Logo (0–4 s) · transisi: cut
Teks di layar: *TemanNetra* + *Pemindai uang Rupiah di browser* · meta: KAMERA · DETEKSI · SUARA

> TemanNetra. Pemindai uang Rupiah di browser ponsel.

Mulai **setelah** mark selesai menggambar (logo jadi pada ±1,3 s) — jeda itu yang membuat
logo terasa "mendarat" dulu. Nada: tenang, seperti menyebut nama. Titik setelah
"TemanNetra" harus terdengar.

### 2 — Hook (4–9 s) · blur-crossfade
Teks di layar: *TemanNetra **membacakan** nominalnya.* + *Cukup tunjukkan uang ke kamera ponsel — nominal Rupiah diucapkan dalam Bahasa Indonesia.*

> Bayangkan harus mencari uang receh, tanpa bisa melihat nominalnya.

Ini satu-satunya kalimat yang berbicara ke pengalaman pengguna, bukan ke produk. Beri
tekanan di **"tanpa bisa melihat"**; sisanya datar. Jangan menyebut TemanNetra di sini —
nama sudah muncul di frame 1 dan muncul lagi di layar.

### 3 — Cara kerja (9–15 s) · blur-crossfade
Teks di layar: tiga node (Kamera → YOLOv8n ONNX → Suara + Getar) + catatan privasi.

> Semuanya jalan di browser. Data kamera tidak pernah keluar dari ponsel.

Dua kalimat pendek, satu tarikan napas di antaranya. Kata **"tidak pernah"** adalah
klaim privasi produk — ucapkan jelas, jangan ditelan.

### 4 — Bukti deteksi (15–24 s) · blur-crossfade
Teks di layar: tiga foto deteksi nyata + chip Rp20.000 0,90 · Rp100.000 0,98 · Rp10.000 0,89.

> Deteksi membaca tujuh nominal, dari seribu sampai seratus ribu rupiah. Yang di layar ini hasil deteksi nyata.

Kalimat kedua sengaja pendek dan setelah jeda 0,4 s — biarkan mata membaca chip-nya.
Jangan membaca angka confidence (0,90 / 0,98) dengan suara; itu untuk mata, dan
membacakannya terdengar seperti klaim akurasi.

### 5 — Prinsip (24–30 s) · blur-crossfade
Teks di layar: *Lebih baik hening daripada salah bilang.* + aturan tiga frame + tiga badge.

> Nominal diumumkan hanya setelah tiga frame sepakat. Lebih baik hening daripada salah.

Kalimat pertama menjelaskan mekanismenya, kalimat kedua mengulang teks besar di layar —
itu disengaja: pengulangan ini yang menutup bagian produk. Turunkan tempo di kalimat
kedua, dan berhenti tepat sebelum cut ke frame 6.

### 6 — CTA (30–36 s) · color-dip
Teks di layar: *github.com/olfiarach/TemanNetra* + demo + *PROTOTYPE AKADEMIK — BUKAN ALAT VERIFIKASI UANG*

> Kode dan demonya ada di GitHub. Masih prototype, bukan alat memastikan uang.

Nada terakhir: jujur, bukan jualan. Baris status di layar sudah menyampaikan hal yang
sama dalam teks — jadi tidak perlu mengeja URL; cukup kata "GitHub".

## Cara merekam

- Mono, 48 kHz, WAV/FLAC. Rekam 6 file terpisah (satu per frame) — jauh lebih mudah
  diselaraskan daripada satu take 36 detik.
- Sisakan 0,3–0,5 s hening di awal dan akhir tiap file; jangan potong rapat.
- Ruangan tanpa gema, jarak mikrofon konstan. Level bicara normal, tanpa kompresi.
- Kalau ada take yang salah: ulangi seluruh kalimat, jangan potong di tengah kalimat.

## Setelah direkam

Video ini belum punya trek audio sama sekali. Kalau file VO-nya diberikan, langkah
berikutnya: taruh sebagai satu `<audio>` di `index.html` (track terpisah dari visual),
lalu **satu frame yang VO-nya lebih panjang dari jendelanya dipanjangkan** — durasi asli
suara selalu menang atas perkiraan, dan itu berarti menggeser `data-start` frame
sesudahnya plus memperbarui `STORYBOARD.md` dan `BRIEF.md`.
