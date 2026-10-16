---
format: 1920x1080
duration: 45s
message: "TemanNetra membaca uang Rupiah lewat kamera dan mengucapkannya"
arc: Logo → Hook → Cara kerja → Bukti → Prinsip → CTA
audience: juri kompetisi / pengguna teknologi assistif di GitHub
mode: collaborative
---

## Frame 1 — Logo

- scene: Koreografi logo asli 1300 ms (card → note → lens → rays → lines), lalu lockup + wordmark
- duration: 4s
- poster: 3s
- transition_in: cut
- status: animated
- voiceover: (tanpa narasi; music bed mulai di sini)
- src: compositions/frames/01-logo.html

Stage gelap ink #0e1116. Logo.svg asli memainkan tabel koreografi persis
dari motion_spec.md — easing tokens out3/in3/back/inout — lalu "TemanNetra"
fade-in di bawah mark, tagline kecil "Pemindai uang Rupiah di browser".

## Frame 2 — Hook

- scene: Kalimat masalah besar — "Tunjuk uang, hp bilang nominalnya"
- duration: 5s
- transition_in: blur-crossfade
- status: animated
- voiceover: (tanpa narasi)
- src: compositions/frames/02-hook.html

Teks kinetis besar: "Bayangkan mencari uang receh" → swap → "dengan uang yang
tak bisa dilihat" → resolve: "TemanNetra membacakan nominalnya." Accent cobalt
#1a3fd1 di kata kunci. Blueprint: kinetic-type-beats (statement build).

## Frame 3 — Cara kerja

- scene: Diagram alur kamera → model → suara, satu garis penghubung
- duration: 6s
- transition_in: blur-crossfade
- status: animated
- voiceover: (tanpa narasi)
- src: compositions/frames/03-alur.html

Tiga node diagram dari arsitektur README: Kamera → "YOLOv8n @416, onnxruntime-web"
→ "Suara + getar". Node pop bertahap (spring-pop-entrance), connector SVG
path-draw antara node, sub-teks kecil "Semua di browser. Data kamera tak pernah
meninggalkan ponsel." di bawah.

## Frame 4 — Bukti deteksi

- scene: Foto deteksi asli (100k, 20k, 10k) dengan bounding box + label, kamera pan
- duration: 9s
- transition_in: blur-crossfade
- status: animated
- voiceover: (tanpa narasi)
- src: compositions/frames/04-bukti.html

Tiga foto deteksi asli repo disusun panel miring, kamera melintasi satu per satu
(multi-phase-camera push): "Rp100.000 — Seratus ribu rupiah" dst. Label "hasil
deteksi nyata" kecil di bawah. Blueprint: device-surface-showcase / pan-stations.

## Frame 5 — Prinsip

- scene: Prinsip produk — "Hening lebih baik daripada salah bilang"
- duration: 6s
- transition_in: blur-crossfade
- status: animated
- voiceover: (tanpa narasi)
- src: compositions/frames/05-prinsip.html

Quote besar: "Lebih baik hening daripada salah bilang." — sub: "Nominal diumumkan
hanya setelah 3 frame konsekutif cocok. Satu lembar saja." Blueprint: titlecard-reveal.

## Frame 6 — CTA

- scene: End card — logo mini + URL repo + status prototype
- duration: 6s
- transition_in: color-dip
- status: animated
- voiceover: (tanpa narasi; music bed fade-out)
- src: compositions/frames/06-cta.html

"github.com/olfiarach/TemanNetra" besar, mark mini di atasnya, baris status
"Prototype akademik — bukan alat verifikasi uang" kecil (kejujuran produk).
Card chain: statement → URL → lockup.
