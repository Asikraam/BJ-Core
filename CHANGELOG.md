# Changelog

All notable changes to BJ-Core are documented here.

## [1.0.0] — 2026-11-17

Initial public release.

### Added
- Batch conversion of `.wmf`, `.emf`, `.wmz` and `.emz` to vector PDF via `emf-converter` (`pageSize: 'drawing'`, `gdiAntialias`, `exactRasterOps`, renderer-side image resampling).
- Windows system fonts loaded once at startup and embedded as TrueType subsets; `[FONT]` warning and `Font Fallback` status when a drawing names a face that is not installed.
- Recursive folder scan with natural sort and a mirrored `PDF_Output` tree.
- Optional merge of every generated PDF into one file via `pdf-lib`.
- Windows 11–style light UI: folder drag-and-drop, auto output path, live file queue table (name, type, status, duration, notes) with filter tabs, progress bar with ETA, cancel, and open-output-folder.
- 1-click NSIS installer and portable ZIP for Windows x64.
- Windows CI (typecheck, build, batch conversion test).
