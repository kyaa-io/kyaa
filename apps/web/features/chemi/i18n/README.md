# CHEMI-W1-I18N

COM-DT-03: `locales/{lang}/chemi.json` is the Korean source plus eleven language key scaffolds. Empty strings explicitly mean translation pending; these catalogs are not connected to display UI. Future consumers must fall back to the Korean source for empty translations. Narrative tables and character dialogue belong in `content/chemi/`, separately from these screen keys. Character transliterations await the approved language table; no invented names are included.

Existing app catalogs use hashed TypeScript messages. This namespace stays isolated under the W1-owned directory; no existing catalog or language selector changes. The existing helper-copy scan covers TSX screens, not these JSON data files.

`koreanDateLineState` provides data only: show for non-Korean locale or a device zone other than Asia/Seoul; compute midnight using the shared KST helper, server time and elapsed duration. Less than an hour uses minutes; otherwise hours, rounded up. Fortune and game templates are separate. Device timezone is never stored. Result dates should use the selected language format while retaining this KST basis line.

Menu keys retain HOME and MY in every locale. Chemi naming and other navigation integration remain with the owning UI task.
