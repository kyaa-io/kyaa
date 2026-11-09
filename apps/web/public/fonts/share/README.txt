Noto Sans JP / SC / TC, weight 800 (SIL Open Font License 1.1, https://openfontlicense.org).
Subsets of only the glyphs in the shared-Passport link-preview headline of each language
(apps/web/features/community-stamps/ui/shared-passport-copy.ts, key "title"), cut with Google Fonts' `text=` option on 2026-11-09.
If a headline changes, cut the subset again; apps/web/app/share/passport.png/title-font.test.ts fails until every glyph is in the file.
Thai is a picture instead (public/images/share/passport-title-th.png, Noto Sans Thai 800 shaped with PIL + raqm), see title-font.ts.
