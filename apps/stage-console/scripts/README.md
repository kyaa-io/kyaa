# Local show asset import

Requires Python 3, LibreOffice, and Poppler (`pdftoppm`) on the Mac. The importer finds tools on PATH and in the usual macOS application/Homebrew locations. It does not install anything, modify source files, or replace an existing output directory.

```sh
python3 apps/stage-console/scripts/prepare-assets.py \
  --pptx '/absolute/path/replacement.pptx' \
  --html '/absolute/path/current-show/sources/personal.html' \
  --video '/absolute/path/current-show/intro.mp4' \
  --passport-image '/absolute/path/passport.png' \
  --home-image '/absolute/path/home.png' \
  --out '/absolute/path/app-user-data/shows/new-unique-revision'
```

All six flags are required. A successful run prints the absolute `manifest.json` path. An existing output path or a missing/duplicate required PPT title fails the import. Reordered slides are matched by exact semantic title instead of the old slide number. Conversion uses an isolated LibreOffice profile so open user documents are preserved. It validates the exported page count, prepares the entire bundle beside the destination, then publishes atomically with an exclusive macOS rename. Failed preparation does not replace the current show. The caller should switch the active bundle only after successful import and manifest validation.

The bundle contains `manifest.json`, `slides/slide-XX.png` (1920px longest side), `thumbnails/slide-XX.png` (480px longest side), `intro.mp4`, adapted `personal.html`, and byte-preserved `sources/event.pptx` / `sources/personal.html`. The provided original HTML is self-contained. The retained HTML cues preserve their original `slideData` speech arrays. Before LIVE, the first HTML slide is followed by the supplied fixed PNG images: passport, home, and the same home screen for participation / WeNa introduction. The former pre-LIVE videos and separate performance cue are omitted. Presentation and native renderers use `/assets/<relative asset>` URLs.

The HTML adapter is idempotent. It calls the original `setPresentation(true)` and `showSlide(index)` functions and retains the original video error handlers. It accepts only same-origin messages from its parent:

```js
{ type: 'kyaa-stage', action: 'slide', index: 0 } // zero based 0–15
{ type: 'kyaa-stage', action: 'media', operation: 'play' } // play, pause, restart
```

It sends `{type:'kyaa-stage-media',event,index,playing,position}` for original video play, pause, ended, error and timeupdate events; `ready` and rejected playback send only type/event/index. Media commands affect every video on the current HTML slide. Reports do not identify individual videos and do not include a cue ID: a receiver must validate the iframe source/origin and correlate the current HTML cue/slide before accepting them. HTML media reports must not automatically advance cues. Only the standalone intro's native ended event may follow its `nextOnEnd:'pre-01'` cue.

PPT thumbnails are regenerated on every import. HTML screenshot thumbnails are optional; the importer does not launch a browser or create them. iPad/HDMI/audio, active TikTok streams and 390px/1440px visual checks require separate end-to-end rehearsal.

Targeted checks:

```sh
python3 -m unittest discover -s apps/stage-console/scripts -p 'test_*.py' -v
```
