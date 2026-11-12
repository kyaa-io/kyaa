# DEV-TRAIN3-FIX

Base: 4e8168552088dff860fde94f3826e570fff06d66; input: 78656967e.

- Server flag test: original 09bd38d80 removed slot identity and replaced guide destination with approved creator destinations. Restore slot identity; preserve flag-off absence, flag-on presence, ranking order and exact href assertions, updated to approved Yuna destination.
- Shared Link: original 09bd38d80 directly imported next/link. Use shared hover-prefetch Link.
- Central dimensions: original 09bd38d80 added media query inside heading CSS. Move responsive value into globals.css, retaining 18/36px and 768px boundary.
- Crop: original bab8e6c8f deliberately made ifewknow portrait natural scale. Existing creator-image test requires 1, while stale policy test required 2.45. Preserve approved implementation and check natural scale plus actual 100px/160px image request scaling. No device DPR multiplier introduced.

The affected implementation files match the source commits exactly at input HEAD: these are source-branch contract integration omissions, not merge-resolution edits. Main has old guide banner, no component heading media query, and the old ifewknow crop. Main archived source existing targeted tests: 53 passed (3 files). Current Link contract separately applied to main because main has no such test: FAIL, 152 direct next/link imports. The integration includes the shared-Link migration, but the new banner escaped it.

Local verification commands are copied from supplied logs 01–11 and current workflow/gate source 12–17, executed directly without gate launcher or receipts. Logs retained beside this report. Dependencies installed with npm ci; security patches applied. Node 25.9.0 (project specifies 24.x). No browser verification or push performed.
