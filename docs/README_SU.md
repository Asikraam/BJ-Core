<div align="center">

<img src="../assets/icon.png" alt="Ikon BJ-Core" width="96" />

# BJ-Core — Pituduh Cara Maké (Basa Sunda)

**Konverter Batch Gambar WMF / EMF kana PDF Véktor dina Windows**  
*Pilih hiji folder → sakumna gambar `.wmf`, `.emf`, `.wmz`, jeung `.emz` langsung robah jadi file PDF véktor 1:1 anu lénglang tur teu pecah.*

[English (Default)](../README.md) · [Bahasa Indonesia](README_ID.md) · **Basa Sunda** · [Changelog](../CHANGELOG.md)

<br />

<img src="../assets/screenshot.png" alt="Tampilan Utama BJ-Core" width="100%" />

</div>

---

## 1. Cara Masang Aplikasi

Pilih salah sahiji cara di handap tina kaca [**GitHub Releases**](https://github.com/Asikraam/BJ-Core/releases/latest):

### Pilihan A — Installer 1-Klik (Pangpraktisna)
1. Undeur (download) file **`BJ-Core-Setup-v1.0.0-win-x64.exe`**.
2. Klik dua kali file éta. Aplikasi bakal langsung dipasang sarta nyieun jalan pintas (*shortcut*) **BJ-Core** dina Desktop jeung Start Menu.
3. Upami kaluar peringatan *Windows protected your PC (SmartScreen)*, klik **More info** teras klik **Run anyway**.

### Pilihan B — Vérsi Portable (Teu Kedah Dipasang)
1. Undeur file **`BJ-Core-v1.0.0-win-x64-Portable.zip`**.
2. Ékstrak ZIP éta ka folder mana waé (contona kana Flashdisk atawa `D:\Tools\BJ-Core`).
3. Jalankeun **`BJ-Core.exe`** langsung.

### Pilihan C — Masang Gancang via PowerShell (1 Baris Paréntah)
Buka PowerShell teras témpélkeun paréntah ieu:
```powershell
$r = Invoke-RestMethod "https://api.github.com/repos/Asikraam/BJ-Core/releases/latest"; $u = ($r.assets | Where-Object { $_.name -like "*Setup*.exe" } | Select-Object -First 1).browser_download_url; $f = "$env:TEMP\BJ-Core-Setup.exe"; Invoke-WebRequest $u -OutFile $f; Start-Process $f
```

---

## 2. Tahapan Cara Maké (Léngkah demi Léngkah)

### Léngkah 1 — Buka BJ-Core & Pariksa Status Font
- Buka aplikasi **BJ-Core** tina Desktop atawa Start Menu.
- Tingali juru katuhu luhur: antosan dugi ka tulisanana robah jadi **`Font Windows: ... siap`** (warna héjo). Éta tandana sakumna font Windows parantos siap dina mémori supados téks gambar CAD henteu gésér nalika dijadikeun PDF.

### Léngkah 2 — Pilih Folder Sumber Gambar
Aya dua cara pikeun ngasupkeun folder anu eusina file `.wmf`, `.emf`, `.wmz`, atawa `.emz`:
1. **Sered & Léos (Drag & Drop):** Sered langsung folder gambar tina Windows Explorer ka bagian luhur jandéla **BJ-Core**.
2. **Tombol Browse:** Klik tombol **`Browse...`** di gigireun kolom **Folder Sumber**, teras pilih folder tempat nyimpen file WMF/EMF.

Sabada folder dipilih:
- Kolom **Folder Tujuan** otomatis kaeusian ku `<Folder Sumber>\PDF_Output` (tiasa diganti manual upami hoyong disimpen di folder sanés).
- Tabél **Antrean & Log File** langsung némbongkeun daptar file anu kapanggih katut jumlah totalna.

### Léngkah 3 — Atur Pilihan Konvérsi
- **`[x] Proses Subfolder`**: Céntang upami di jero folder utama aya subfolder deui (contona `Detail\`, `Potongan\`, `Lampiran\`). Susunan folder di jero `PDF_Output` bakal dijieun sarua persis jeung folder aslina.
- **`[ ] Gabungkan semua PDF (pdf-lib)`**: Céntang upami salian ti PDF masing-masing gambar, anjeun ogé hoyong **1 file PDF gabungan** anu ngahijikeun sadaya kaca gambar sacara ngaruntuy (ngaran file bawaan: `BJ-Core_Gabungan.pdf`, tiasa diganti).

### Léngkah 4 — Jalankeun Konvérsi Batch
1. Klik tombol bulao **`Convert ke PDF`**.
2. Ilikan jalanna prosés dina tabél jeung baris status di handap:
   - Unggal baris némbongkeun parobahan status (`Menunggu` → `Proses...` → `OK`), lila waktu prosés dina milidetik (`ms`), sarta ukuran gambar.
   - Baris panghandapna némbongkeun *progress bar*, perséntase, jeung **ETA** (kira-kira waktu nu nyésa).
   - Upami hoyong ngeureunkeun prosés di tengah jalan, klik tombol **`Batal`**.

### Léngkah 5 — Buka Folder Hasil PDF
- Saatos status di juru kénca handap robah jadi **`Selesai`**, klik tombol **`Buka Folder Hasil`**.
- Windows Explorer bakal langsung muka folder `PDF_Output` tempat nyimpen sadaya hasil PDF véktor.

---

## 3. Harti Status dina Tabél Antrean

| Status | Warna | Harti & Pituduh |
| :--- | :--- | :--- |
| **`Menunggu`** | Kulawu | File parantos asup kana daptar antrean sarta siap dikonvérsi. |
| **`Proses...`** | Bulao | File keur dikonvérsi jadi PDF véktor. |
| **`OK`** | Héjo | Hasil dikonvérsi jadi PDF véktor 1:1 sarta sakumna font anu dipaké aya dina Windows. |
| **`Font Fallback`** | Konéng kolot | PDF parantos jadi, nanging aya font dina jero file WMF/EMF anu teu acan dipasang dina PC Windows (ngaran font nu kurang ditulis dina kolom *Keterangan*). Pasang heula file `.ttf` font éta kana `C:\Windows\Fonts` upami wangun aksarana kedah 100% sarua. |
| **`Skip`** | Konéng kolot | File diliwat margi ruksak atawa sanés file metafile WMF/EMF anu bener. |
| **`Gagal`** | Beureum | Aya gangguan nalika maca atawa nulis file (pariksa kateranganana dina kolom *Keterangan*). |

> **Tip Nyaring Daptar File:** Anggo tab **`Semua`**, **`Sukses`**, **`Peringatan/Skip`**, atawa **`Gagal`** di luhureun tabél katuhu pikeun milah file saatos ngolah ratusan gambar sakaligus.

---

Lisénsi [Apache-2.0](../LICENSE) © 2026 Aswal Ikraam Aritonang.
