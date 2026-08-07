# Feature Opportunities

This branch should prioritize Windows-native file-manager improvements.

## Candidate Work

- Richer mapped network drive display and error states.
- Better progress messaging for long local transfers.
- More archive formats and safer extraction previews.
- More metadata panels for media and document files. (Properties now covers PDF, audio tags, MP4-family video, and Office package props via `get_file_metadata`; further preview-pane surfaces remain open.)
- Better keyboard navigation through dual-pane workflows.
- Optional saved layouts for tabs, panes, columns, and preview visibility.
- Stronger installer smoke coverage for NSIS and MSI. (Nightly + manual
  workflow: `.github/workflows/installer-smoke.yml`.)

## Non-Goals

- Provider-backed browsing or mount management.
- Linux-only desktop integration work.
- macOS or Linux release artifacts.
