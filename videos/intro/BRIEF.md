---
workflow: general-video
flow: automation
storyboard: yes
message: "TemanNetra membaca uang Rupiah lewat kamera dan mengucapkannya — asisten suasana untuk pengguna tunanetra"
destination: youtube
aspect: 1920x1080
language: id
audience: juri kompetisi / pengguna teknologi assistif di GitHub
length: ~45s
angle: problem-solution
narration: no
---

## Intent

Video pengantar proyek TemanNetra: pembaca nominal uang Rupiah berbasis kamera
untuk pengguna tunanetra dan low-vision, sepenuhnya di browser (YOLOv8n ONNX di
onnxruntime-web, GitHub Pages, tanpa server). Tanpa narasi — informasi dibawa
teks kinetis Bahasa Indonesia di atas music bed. Nada: tenang, jujur, mudah
dibaca (assistive, bukan hype). Produk berkomitmen "silence beats a wrong
answer" — video tidak mengklaim akurasi yang belum diukur.

## Assets

- ../frontend/public/logo.svg — logo mark QA-verified (aktor: card, note, coin, pupil, rays, lines, glint)
- ../frontend/motion/motion_spec.md — tabel koreografi logo 1300 ms + easing tokens (out3/in3/back/inout)
- ../assets/note-100k.jpg, note-20k.jpg, note-10k.jpg — hasil deteksi nyata dengan bounding box + label confidence
- ../frontend/src/index.css — design system "Operate": cobalt #1a3fd1 accent, ink #0e1116, bg #eef0f4, note colors per denominasi

## Customizations

- Logo scene 1 memainkan koreografi 1300 ms asli (ease tokens sama: out3/in3/back) lalu resolve ke lockup.
- Scene deteksi memakai foto deteksi asli repo, bukan mockup.

## Notes

- Semua copy di layar Bahasa Indonesia (brand commitment).
- Tidak ada klaim akurasi/latensi — prototype status jujur.
- Tanpa musik berhak cipta; music bed opsional (lihat STORYBOARD).
