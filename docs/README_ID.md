<div align="center">

<img src="../assets/icon.png" alt="Ikon BJ-Core" width="96" />

# BJ-Core — Panduan Pemakaian (Bahasa Indonesia)

**Konverter Batch Gambar WMF / EMF ke PDF Vektor di Windows**  
*Pilih satu folder → seluruh gambar `.wmf`, `.emf`, `.wmz`, dan `.emz` langsung berubah menjadi file PDF vektor 1:1 yang tajam.*

[English (Default)](../README.md) · **Bahasa Indonesia** · [Basa Sunda](README_SU.md) · [Changelog](../CHANGELOG.md)

<br />

<img src="../assets/screenshot.png" alt="Tampilan Utama BJ-Core" width="100%" />

</div>

---

## 1. Cara Pasang (Instalasi)

Pilih salah satu cara berikut dari halaman [**GitHub Releases**](https://github.com/Asikraam/BJ-Core/releases/latest):

### Opsi A — Installer 1-Klik (Direkomendasikan)
1. Unduh file **`BJ-Core-Setup-v1.0.0-win-x64.exe`**.
2. Klik dua kali file tersebut. Aplikasi otomatis terpasang dan membuat shortcut **BJ-Core** di Desktop serta Start Menu.
3. Jika muncul jendela *Windows protected your PC (SmartScreen)*, klik **More info** lalu klik **Run anyway**.

### Opsi B — Versi Portable (Tanpa Instal)
1. Unduh file **`BJ-Core-v1.0.0-win-x64-Portable.zip`**.
2. Ekstrak folder ZIP tersebut ke lokasi mana saja (misalnya Flashdisk atau `D:\Tools\BJ-Core`).
3. Jalankan **`BJ-Core.exe`** secara langsung.

### Opsi C — Pasang Cepat Lewat PowerShell (1 Baris Perintah)
Buka PowerShell lalu tempel perintah berikut:
```powershell
$r = Invoke-RestMethod "https://api.github.com/repos/Asikraam/BJ-Core/releases/latest"; $u = ($r.assets | Where-Object { $_.name -like "*Setup*.exe" } | Select-Object -First 1).browser_download_url; $f = "$env:TEMP\BJ-Core-Setup.exe"; Invoke-WebRequest $u -OutFile $f; Start-Process $f
```

---

## 2. Langkah-Langkah Pemakaian (Step-by-Step)

### Langkah 1 — Buka BJ-Core & Cek Status Font
- Buka aplikasi **BJ-Core** dari Desktop atau Start Menu.
- Perhatikan pojok kanan atas: tunggu hingga indikator berubah menjadi **`Font Windows: ... siap`** (berwarna hijau). Artinya seluruh font Windows sudah dimuat ke memori agar teks gambar CAD tidak bergeser saat dijadikan PDF.

### Langkah 2 — Masukkan Folder Sumber Gambar
Ada dua cara memasukkan folder berisi file `.wmf`, `.emf`, `.wmz`, atau `.emz`:
1. **Drag & Drop (Tarik & Lepas):** Tarik langsung folder kerja dari Windows Explorer ke bagian atas jendela **BJ-Core**.
2. **Tombol Browse:** Klik tombol **`Browse...`** di samping kolom **Folder Sumber**, lalu pilih folder tempat file WMF/EMF disimpan.

Begitu folder dipilih:
- Kolom **Folder Tujuan** otomatis terisi `<Folder Sumber>\PDF_Output` (bisa diganti manual jika ingin menyimpan ke tempat lain).
- Tabel **Antrean & Log File** langsung menampilkan daftar seluruh file yang ditemukan beserta jumlah totalnya.

### Langkah 3 — Atur Opsi Konversi
- **`[x] Proses Subfolder`**: Centang jika di dalam folder utama terdapat subfolder (misalnya `Detail\`, `Potongan\`, `Lampiran\`). Struktur folder di dalam `PDF_Output` akan dibuat persis mengikuti struktur folder aslinya.
- **`[ ] Gabungkan semua PDF (pdf-lib)`**: Centang jika selain menghasilkan PDF per gambar, kamu juga ingin mendapatkan **1 file PDF gabungan** berisi seluruh halaman gambar secara berurutan (nama file bawaan: `BJ-Core_Gabungan.pdf`, bisa diubah sesuai kebutuhan).

### Langkah 4 — Jalankan Konversi Batch
1. Klik tombol biru **`Convert ke PDF`**.
2. Pantau proses secara langsung melalui tabel dan baris status di bagian bawah:
   - Setiap baris memperlihatkan perubahan status (`Menunggu` → `Proses...` → `OK`), waktu pengerjaan dalam milidetik (`ms`), serta ukuran kanvas gambar.
   - Baris paling bawah menampilkan *progress bar*, persentase selesai, dan **ETA** (estimasi sisa waktu).
   - Jika ingin menghentikan proses di tengah jalan, klik tombol **`Batal`**.

### Langkah 5 — Buka Folder Hasil PDF
- Setelah status di kiri bawah bertuliskan **`Selesai`**, klik tombol **`Buka Folder Hasil`**.
- Windows Explorer akan langsung membuka folder `PDF_Output` tempat seluruh file PDF vektor tersimpan.

---

## 3. Arti Status pada Tabel Antrean

| Status | Warna | Arti & Tindakan |
| :--- | :--- | :--- |
| **`Menunggu`** | Abu-abu | File sudah masuk antrean dan siap dikonversi. |
| **`Proses...`** | Biru | File sedang dikonversi ke PDF vektor. |
| **`OK`** | Hijau | Berhasil dikonversi ke PDF vektor 1:1 dan seluruh font yang dipakai tersedia di Windows. |
| **`Font Fallback`** | Oranye | PDF berhasil dibuat, tetapi ada font di dalam file WMF/EMF yang belum terpasang di PC Windows (nama font yang kurang ditampilkan di kolom *Keterangan*). Pasang file `.ttf` font tersebut di `C:\Windows\Fonts` jika bentuk huruf harus 100% identik. |
| **`Skip`** | Oranye | File dilewati karena rusak atau bukan file metafile WMF/EMF yang valid. |
| **`Gagal`** | Merah | Terjadi kesalahan saat membaca atau menulis file (cek pesan di kolom *Keterangan*). |

> **Tip Filter Cepat:** Gunakan tab **`Semua`**, **`Sukses`**, **`Peringatan/Skip`**, atau **`Gagal`** di kanan atas tabel untuk menyaring file tertentu setelah memproses ratusan gambar sekaligus.

---

Lisensi [Apache-2.0](../LICENSE) © 2026 Aswal Ikraam Aritonang.
