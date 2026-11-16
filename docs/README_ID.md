<div align="center">

<img src="../assets/icon.png" alt="Ikon BJ-Core" width="96" />

# BJ-Core

**Konversi batch gambar WMF / EMF ke PDF vektor di Windows**  
*Pilih folder, langsung jadi satu PDF tajam per gambar. Garis, arsiran, clipping, dan teks tetap vektor, 1:1 dengan metafile aslinya.*

[English](../README.md) · **Bahasa Indonesia** · [Changelog](../CHANGELOG.md)

<br />

<img src="../assets/screenshot.png" alt="Jendela utama BJ-Core" width="100%" />

</div>

---

## ✨ Kenapa BJ-Core?

- **Vektor masuk, vektor keluar:** Setiap `.wmf`, `.emf`, `.wmz`, dan `.emz` diputar ulang jadi path PDF, bukan screenshot. Zoom 6400% pun garis tetap tajam.
- **Font Windows ikut tertanam:** Semua font terpasang dimuat sekali saat aplikasi dibuka, lalu ditanam sebagai subset TrueType, jadi kop gambar dan dimensi tidak bergeser. Font yang hilang ditandai sebelum konversi.
- **Satu folder sekaligus:** Tarik folder, centang **Proses Subfolder**, klik **Convert ke PDF**. Struktur folder output di `PDF_Output` sama dengan sumbernya, dan bisa digabung jadi satu PDF.
- **Dibuat untuk drafter:** Jendela utilitas bergaya Windows 11 dengan tabel antrean (status, durasi, keterangan per file), tab filter, ETA, dan tombol **Batal**.

---

## 📦 Unduh & Pasang

Ambil dari [**GitHub Releases**](https://github.com/Asikraam/BJ-Core/releases/latest):

| File | Untuk Siapa |
| :--- | :--- |
| `BJ-Core-Setup-v1.0.0-win-x64.exe` | **Direkomendasikan**: installer 1-klik (shortcut Desktop & Start Menu) |
| `BJ-Core-v1.0.0-win-x64-Portable.zip` | **Portable**: ekstrak di mana saja lalu jalankan `BJ-Core.exe` |

**Pasang via 1 perintah PowerShell:**
```powershell
$r = Invoke-RestMethod "https://api.github.com/repos/Asikraam/BJ-Core/releases/latest"; $u = ($r.assets | Where-Object { $_.name -like "*Setup*.exe" } | Select-Object -First 1).browser_download_url; $f = "$env:TEMP\BJ-Core-Setup.exe"; Invoke-WebRequest $u -OutFile $f; Start-Process $f
```

> **Muncul "Windows protected your PC"?** Aplikasi open-source tanpa sertifikat code-signing berbayar memicu SmartScreen. Klik **More info** → **Run anyway**, atau cocokkan checksum SHA-256 di halaman release.

---

## 🚀 Cara Pakai

1. Buka **BJ-Core**, tunggu indikator `Font Windows: ... siap` berwarna hijau.
2. Klik **Browse...** pada *Folder Sumber* atau tarik folder ke panel atas. Daftar file langsung muncul di tabel.
3. *(Opsional)* Ubah *Folder Tujuan* (default `<Folder Sumber>\PDF_Output`), centang **Gabungkan semua PDF**.
4. Klik **Convert ke PDF**. Setelah selesai, klik **Buka Folder Hasil**.

Status di tabel: `OK` (sukses), `Font Fallback` (sukses, tapi ada font yang tidak terpasang dan diganti), `Skip` (bukan metafile valid), `Gagal` (error konversi).

---

## 🛠️ Jalankan dari Source

```powershell
git clone https://github.com/Asikraam/BJ-Core.git
cd BJ-Core
npm install
npm start
```

`npm test` menjalankan uji konversi batch; `npm run build` membuat Setup `.exe` + Portable `.zip` di `release/`.

---

Lisensi [Apache-2.0](../LICENSE) © 2026 Aswal Ikraam Aritonang.
