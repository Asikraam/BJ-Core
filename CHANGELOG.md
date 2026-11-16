# Changelog

All notable changes to **BJ PDF** (`BJ-Core`) are documented here.

## [1.2.0] — 2026-11-17

### Added
- **Double-Click Row to Open PDF (`Klik 2x buka PDF`)**: Double-clicking any completed row in the queue table immediately opens that specific `.pdf` file in the default PDF viewer (Edge / Adobe Reader).
- **Remember Last Folder & Settings (`localStorage`)**: Automatically saves and restores the last used source folder, output folder, recursive toggle, and merge toggle when reopening the app.

## [1.1.0] — 2026-11-17

### Added
- **Single-File & Multi-File Picker (`Pilih 1 File...`)**: Convert a single `.wmf`/`.emf`/`.wmz`/`.emz` file (or several selected files) in addition to full folders (`Pilih 1 Folder...`). Drag-and-drop automatically detects single files vs folders.
- **Drafter-Friendly UI & Numbered Workflow**: Simplified controls tailored for everyday CAD drafters (`1. Mulai Ubah ke PDF`, `Stop / Batal`, `2. Buka Folder Hasil PDF`).
- **Live RAM Usage Indicator**: Real-time memory readout (`RAM: ~... MB`) in the header and status bar.
- **Smart AutoCAD `.shx` Font Fallback**: Automatically maps common missing CAD stroke fonts (`simplex`, `romans`, `isocp`, `txt`, `monotxt`, `complex`) to clean installed technical fonts (`ISOCPEUR`, `Consolas`, `Arial`).
- **Native Windows `.ico` Icon (`BJ PDF`)**: Embedded multi-place `.ico` icon so the Windows taskbar, window titlebar, and desktop shortcut display the `BJ PDF` icon instead of the default Electron icon.

### Changed
- **5× Lower RAM Usage (~130 MB / 0.13 GB vs ~783 MB / 0.76 GB in `v1.0.0`)**: Replaced upfront full-file loading of all 800+ system fonts with lightweight SFNT `name`-table header indexing (~5 MB RAM) and on-demand binary caching for used fonts.
- **Higher Vector & Hatch Precision**: Upgraded `convertMetafileToPdf` to `dpiScale: 2` (with exact 1:1 physical page bounds in points), `maxCanvasDimension: 16384`, `maxRecords: 1,000,000`, and `fontSmoothing: 'cleartype'`.
- **Natural Conversational Sundanese Guide (`docs/README_SU.md`)**: Rewritten in everyday conversational Sundanese (*Sunda sapopoe / loma*).

## [1.0.0] — 2026-11-17

Initial public release.
