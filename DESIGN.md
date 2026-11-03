---
id: '03'
slug: '03-fan-pulse-spectrum'
name: 'Fan Pulse Spectrum'
family: 'core'
palette: 'single-gradient-highlight'
font: 'pretendard'
source: "live rendered page"
observed-at: "2026-07-20"
ui-contract-updated: "2026-10-18"
theme: "light-only"
ui-font: "Pretendard Variable"
base-spacing: "4px"
radius-scale: "12px / 16px / 20px / pill"
---

# Design System: kyaa Fan Pulse Spectrum

<!-- Maintenance note (2026-09-05): This document describes the Fan Pulse
Spectrum foundation, not a verified 1:1 specification of every current byus.kr
screen. Shared tokens and FanAction implement core rules; typography and layout
also live in feature CSS modules. Check deployed source and rendered desktop /
mobile states before claiming full alignment. Preserve intentional surface-specific
differences when consolidating tokens and components. -->

## Current shared content contract (2026-10-09)

- A section reads in this order: heading with secondary navigation, description, filters, content. `FanSectionHeader` owns its `{ label, href }` action: the heading and action align in one wrapping row, and supporting copy sits below both. The title has a flexible 10rem basis; long translated actions wrap naturally. Never shrink the title to fit a translation.
- Section headings use 20px on mobile and 24px from 768px; item names use 16px/700, body copy 16px, metadata 13px. Related copy has 4–8px gaps, subgroups 16px, and major sections 32px/48px. Existing hero artwork/display type remains independent.
- Event catalog (`/events`) is a specific exception: following the 2026-10-27 feedback that 16px event titles looked too small beside 16px descriptions, use 20px/700 event titles and 16px body copy on mobile and desktop. Titles wrap without clipping. This exception does not change the shared 16px item-name or LIVE-row title roles.
- Event catalog starts 32px below the header on mobile and 64px from 768px, following the 2026-10-27 feedback that the page heading sat too close to the header. Its list and pagination share the header and footer content width.
- Creator summaries read image → name → audience metadata → actions. The name may wrap; stateful fan links stay actionable. Social marks remain 20px inside non-shrinking 44px targets and action groups wrap when necessary.
- Filters have 12px corners and quiet labels. Creator-role filters use equal-width columns sized by the longest localized label, with a five-character Korean minimum (`5em + 26px`) and 44px minimum height. A narrow viewport scrolls the whole strip horizontally without truncating labels; focus outlines remain visible. Status pills remain distinct from filters. Community translation belongs to the body, reactions share one row, and secondary/destructive actions live in the accessible More menu.
- All `APP_LOCALES` use the same composition. Use native language wrapping, flexible heights, and complete accessible labels; do not encode Korean/English-only layout branches. CMS content fallback and proper names retain their existing semantics.
- For shared composition changes, verify affected home/community screens at 390px and 1440px for every supported language, plus 360px and 768px for Korean, Japanese, Vietnamese and Thai. Read the locale list from current `APP_LOCALES` and cover new scripts/directions when supported. Include applicable guest/owner/loading/empty/error states, long names, keyboard menus, locale switching and fixed-navigation clearance. Scope local changes to their actual impact and reuse unchanged valid evidence.

### Compact community (2026-10-28)

- `/community` groups the shared 20/24px page heading, separator and 16px creator selector in one wrapping row. The selector and all links keep 44px targets. Fan page and LIVE remain secondary destinations. Remove the large creator box, repeated intro/board heading and redundant posting-prompt sidebar card so reading reaches the feed sooner.
- Community tabs use an 8px top/16px bottom margin; the feed controls and composer are separated by 16px. The media filter uses the shared 12px filter corners and preserves locale, creator and media context through tabs, sidebar links, post details and login. Photo/video-only results are filtered before server pagination; no visible matches use the existing recoverable empty state.
- Hot communities are the top five published creators with positive fan counts, sorted by count, then display order and slug; the visible subtitle states the fan-count criterion. This is not a recent-activity ranking. At 768px and above it occupies a 280px sidebar (260px below 1024px); below 768px it is a horizontal strip before the feed. DOM and keyboard order follow that mobile reading order. CreatorAvatar owns the 36px portraits; names wrap and count metadata stays 13px. Hide the list if no eligible creators exist.
- All shared fan-post cards place the timestamp after the media and body, at the right edge of the likes/comments footer. Keep its 13px metadata role, full localized timestamp and natural image ratios. At narrow widths the timestamp can wrap below actions without overlap; never shrink actions or clip time text. This also applies to fanpage feeds, legacy cheer cards and post details using PostCard. Legacy cheers retain their existing reaction and reply records; show the same likes/comments footer and disclose replies inline on request.
- Owners: `features/community/ui/community-screen.tsx`, `community.module.css`, the shared `FanHeading`, `FanPostFeed`, `PostCard` and `features/content-safety/ui/content.module.css`. Verification uses real components with synthetic data in `e2e/community-compact-local` and `e2e/post-layout-local`; screenshots are local fixtures, not production users.

### Content and navigation refinements (2026-10-04)

- Home previews only Passports whose creators are in the current published directory; the explicit Passport count and carousel use that same set. A directory failure shows a recoverable error and a collection link, never a misleading empty collection. The owned collection and historical records remain intact and accessible from MY/Passports. A managed announcement CTA describes and opens its actual destination; creator welcome banners may link directly to the creator home.
- Creator home is a summary. Full conversation, news and media belong to their named tabs; a personal fan activity card appears on home only. Nicknames wrap without competing with attendance, tier or growth controls. The creator's Fan board remains inside that creator's page, and detail, sign-in and back navigation preserve the originating board and language.
- Brand fan pages use the same Home/Board/Certification/Events/Leaderboard navigation, board Feed/Media/LIVE sections, home calendar, daily check-in and Passport flow as other fan pages. Creator roles describe the profile; they do not remove these shared journeys. Keep existing campaign, membership, ticket-policy and leaderboard eligibility gates, and show honest empty states when no content is registered. Preserve the brand's separate event booking action and natural-ratio official artwork. A first like is saved as a Stamp and attaches when the fan's Passport is issued.
- Passport totals include the owner's collected Stamps; do not repeat a narrower collection count without explaining its scope. The activity cards remain available for earning more Stamps. Distinguish an issued Passport or earned Stamp from its record-registration status, including a clear attention-needed state when registration cannot continue.
- Media uses a clear heading, official-channel links, type filters and a consistent content grid. Landscape video previews retain 16:9 framing. External portrait-video covers keep their natural ratio beside the title and metadata so faces and embedded text are preserved without a tall empty grid row. Missing covers use the shared 16:9 source/type fallback; source failures remain recoverable without hiding successful content.
- Fan-post replies open within the selected comment, with the target author, a short quote, and keyboard focus in the reply field. Keep the composer and its controls above fixed navigation when focusing. Use compact right-aligned Neutral submit and Text cancel actions (minimum 44×44px), separate top-level and per-comment drafts, and retain drafts on cancel or failure. Cancel returns focus to the originating reply action. A reply retained across comment pagination keeps its target context below the list.
- Community creator selection is the primary element in its switcher; Fan page and LIVE are secondary destinations. Auxiliary participation cards stack as concise rows on small screens. Composer visibility defaults to public for new posts, preserves the saved choice when editing, and uses a compact trigger with a responsive dialog/bottom sheet. Focus return, image limits, upload/error states and member-only permissions remain part of the interaction contract. Uploaded images have a quiet visible boundary.
- A selected post-like heart is filled red and paired with `aria-pressed`; failed requests restore the previous state. Certification cards distinguish open, preparing and ended work, and attempt numbers have an explicit localized label rather than a bare `#1`.
- The fan list becomes a leaderboard from 100 active fans. Count the deduplicated union of completed creator likes and issued Passport holders, while retaining the separate Passport count. Below 100, show recent fans; at 100 or more, show the top 100 and the signed-in fan's rank. Like-only fans participate with zero points until they earn points.
- The available leaderboard replaces the animated fan gathering. Overall, Quiz, LIVE (reservation/attendance), Missions and Verification filters rank the entire eligible fan population on the server. Only Overall includes score adjustments and zero-point fans; category lists show fans with positive points. Existing lifetime score, tie order and threshold stay unchanged. Use the shared circular `Avatar`; ranks 1–3 retain numbered gold, silver and bronze badges on mobile. Show activity earning rules without claiming fixed mission or verification rewards.
- MY favorites display the complete list by default (2026-10-30): no six-item disclosure. `my-screen.module.css` owns a full-width adaptive grid with two columns on narrow screens, 12px control corners, wrapping 16px/700 names and the existing portrait/pressed/check/focus treatment. Selection preserves list order and updates the existing activity panels.
- MY separates primary activity destinations from secondary history/request links. Settings is an index of aligned rows leading to query-addressable detail sections with Back navigation, retained locale and visible focus. Entering a detail focuses its heading; returning focuses the originating row. Logout and destructive account actions belong to account details. Authentication and resource restoration use loading states before showing account actions or a guest screen.
- Notifications use the shared Primary action for enabling browser notifications and a Neutral action for marking all read. Unread counts, dots and permission icons use the existing Spectrum Ink and subtle focus surface; status is also conveyed through labels and weight.
- These refinements reuse the existing kyaa brand. Public Weverse artist tabs and b.stage community/MY references informed separation of summaries, feeds, media and settings; they do not establish kyaa membership rules or authentication behavior. Source examples: [Weverse artist home](https://weverse.io/enhypen/highlight), [Weverse media](https://weverse.io/enhypen/media), [b.stage community](https://bigbang.bstage.in/community), [b.stage My Posts & Activity](https://bstage.in/article/bstage-tips-7-en/).

### Creator board and unified feed (2026-10-09)

- Creator pages have five primary destinations: Home, Board, Fan verification, Events and Fan leaderboard. Board contains Feed, Official media and LIVE. Keep the creator, language and originating board filter when entering details or signing in; legacy news, media, LIVE, lounge and cheer links resolve to their corresponding destination.
- Feed is one chronological conversation combining official posts, fan posts and existing cheers, with All, Official and Fan posts source filters. Pinned standard notices precede pinned welcome notices; an unpinned welcome notice follows its publication time. Use one existing composer in All and Fan posts. Each content type keeps only its supported reactions, comments and owner actions.
- The board navigation, filters and feed share the full `FanContentContainer` edges: 1440px maximum width and 16/32/40px responsive gutters. There is no secondary official-news column. Individual text and media retain readable widths inside the full-width feed. Creator home may retain its calendar beside the summary.
- Official media uses three columns on desktop, two on tablet and one on mobile. Keep a purposeful empty state with a filter reset or Feed destination; a failed source has a retry action while successful content remains visible. Official channels stay available above the grid.
- A new fan post shares the existing one-time first-comment reward eligibility with cheers and notice comments. Do not suggest a new score reward or retroactively reward existing fan posts. Existing content and reward history remain intact.

### Completion requires a visual finish review

- Image work must follow the repository-wide [image framing and review contract](docs/design/image-framing.md), including its role owners, deliberate-space exceptions, loaded mobile/desktop evidence and access-gap reporting. This applies to new screens and source replacements as well as existing UI.
- Apply the current user-approved design, then this current role contract. Historical observations and example prompts cannot override it. Reuse shared owners and keep approved hero/profile/display variants; do not normalize every surface into the same card. This document is a design contract, not a claim that an old checkout or production already implements it.
- Verify both behavior/accessibility and the actual composition. View the affected mobile and desktop screens at native display size with realistic normal content and varied representative images. Confirm a clear first focus and next action, readable title/body/metadata hierarchy, coherent information groups, optical icon alignment, face-legible crops, balanced density and deliberate section rhythm. Compare with the approved product direction and resolve visible disharmony before claiming visual completion.
- Reject unintended blank bands around image content, including letterboxing from fixed frames/minimum heights and excess space baked into the source. Inspect the source and the rendered image separately at mobile and desktop widths. Text/logo banners use their natural aspect ratio and a content-sized frame; do not stretch, crop essential text/logos, or hide empty space with blurred duplicates. Preserve deliberate composition, required padding and existing approved artwork treatments. If a fixed slot cannot show the complete content without empty bands, use suitable artwork or adjust that slot before passing visual review.
- Check translated and long content without shrinking type/targets or hiding meaningful information. Inspect active keyboard focus in Portal menus as well as the surrounding page, and inspect open dialogs for padding, clipping, safe-area and fixed-navigation conflicts. Focus ownership or automated accessibility passes alone do not prove visible focus or aesthetic quality.
- Keep evidence tied to the changed screen, width, locale and state. Loading-only captures, repeated identical portraits or isolated component fixtures cannot certify a whole page. Report functional checks and visual judgment separately; disclose incomplete states and unresolved material issues. No score or token check guarantees beauty.

## Brand copy (2026-10-13)

- The approved slogan is `Kyaa. Every Fan Moment Counts.` in every locale. Home displays `Kyaa.` with `Every Fan Moment Counts.` immediately beside it as a smaller 13px slogan, baseline-aligned with an 8px gap and natural wrapping on narrow screens (2026-10-21 user request); the old LIVE tagline is removed. Keep the full slogan for the default page/share title, installed app name, and guide footers. Preserve the existing kyaa wordmark artwork.
- Current partner banner copy uses `NCHIVE × Kyaa` and `WELCOME TO KYAA`. Internal identifiers, legacy URLs, and historical records retain their existing names.
- The connect introduction and Passport artwork use Kyaa. Preserve the whole book, stamps and outro copy with contained video framing; the wide layout places copy beside the film on its paper canvas. Keep playback, skip, replay and reduced-motion behavior. New Membership artwork has a new content-addressed URL; issued artwork remains available.
- Approved collectible display artwork (2026-10-18) uses 14 carved ink Stamps and 11 fan tier seals in `images/{stamps,passport/tiers}/ink-v1/*.webp`. Lossless WebP decodes pixel-identically to the approved 512px PNG masters. Preserve transparency and use `object-fit: contain` without inherited crop/scale; serve these precompressed assets without a second lossy transform. Dates, points, tier names and localized meaning remain live UI content. Historical credential v2 PNGs, issuance/metadata URLs, the representative Passport and unrelated mission artwork remain available. Editable SVG and PNG masters live in `docs/design/assets/ink-v1`; reproduce exports with `node scripts/prepare-ink-collectibles.mjs`.
- The v2 `passport.png` is the standalone representative Passport illustration. The functional Passport canvas remains the fully opened nine-slot record book with its data-driven Stamp overlays and latest-nine semantics; do not place a nine-item grid over the representative illustration's six embossed slots or reduce visible records to match it.
- MY keeps owned Passports, points, tickets and entry history for unpublished fan pages, while hiding public participation links and requests that would lead to an unavailable page.

## Intent

The system is an image-first fan utility: editorial artist imagery creates emotion, while quiet product surfaces make reservation, login, discovery, and Passport tasks immediately understandable. Current approved role contracts below guide new UI. Historical extraction notes describe their original evidence, not current deployment status.

## Color

Use a White and Near Black shell with a `single-gradient-highlight` strategy. Reserve the filled pink-to-violet Spectrum Relay for the current surface's single most important next action. Google, Passport, and repeated LIVE-row context actions may reuse the relay as a 1px outline with a high-contrast solid Spectrum Ink label; neutral utility surfaces must not compete with artist photography.

## Typography

Use Pretendard Variable throughout product UI. Apply the exact hierarchy, weight, line-height, and tracking rules documented below; countdown numerals use a monospace stack with tabular figures.

## Image

Use face-legible, editorial, full-color artist photography. Preserve the approved hero crop and Home's inset square favorite artwork within a Gallery Gray field from 768px. Below 768px, Home favorite artwork fills its square frame while preserving the registered crop. The `/celebrities` directory uses full-bleed portraits: 5:4 for approved cover crops on mobile and square from 768px; mobile full-image (`contain`) sources use their natural ratio, retaining the registered image source and focal position. Role filters use 12px rounded rectangles with at least 44px touch targets; search and sort render at the same 14px label size. Use only the fully opened identity-and-stamp Passport asset.

## Surfaces

Use 12px controls, 16px collections, and a 20px hero with 1px neutral hairlines and short two-layer micro-shadows. Avoid dark utility cards, glassmorphism, nested cards, and decorative color surfaces.

## Interaction

Maintain 44px minimum targets, a 3px Near Black `focus-visible` outline, 160ms control feedback, and 240ms object or layout transitions. Adjacent icon-only actions, including Home celebrity social links, use optically centered 20×20px visible marks inside separate 44×44px targets with no inter-target gap. Never overlap or shrink the targets to achieve visual density. Collapse transitions for reduced-motion users.

## Locked Contract

Preserve the Korean copy, artist identities, live data, Google login treatment, opened Passport lifecycle copy, and responsive panel behavior. The global fan information architecture is `HOME · 커뮤니티 · 최애 · MY` on desktop and mobile: HOME routes to `/`, 커뮤니티 to `/community`, 최애 to `/celebrities`, and MY to `/my`. Passport, benefits, notifications, and settings are MY sub-surfaces and keep MY active. Focused login, onboarding, verification, attendance, and survey flows may use the compact Focus Header. The hero remains the sole dominant visual surface, while the active surface's one most important next action may use the gradient-filled Primary treatment.

The Home hero is an independently managed carousel of published home banners, ordered by the administrator's saved order with stable ID ties. Publishing LIVE occurrences does not add hero slides; the LIVE calendar and upcoming list retain their independent schedules. A creator may have at most one published regular-broadcast banner. Banner artwork, copy and destination are localized for Korean and English. Mobile uses the registered mobile artwork, falling back only to the same language's desktop artwork with contain. The existing Elina participation guide remains the final slide. With more than one item the carousel advances horizontally every 6 seconds; hover, keyboard focus and pointer interaction pause it. Reduced-motion users receive no autoplay or large translation. Hidden slides are inert. Keep existing geometry, controls and typography except for the user-approved welcome spacing and inline home slogan refinements documented here.

All Home hero status badges (UPCOMING, LIVE, and SPECIAL EXHIBITION) share one component and use the user-selected Magic UI Shimmer Button perimeter light: pale pink-white glint on a dark solid surface, original 3s alternating travel and 6s rotation, with existing 28px height and 12px type. Only the visible active badge animates; offscreen/hidden slides pause and reduced-motion keeps the static outline.

The Home hero viewport has a 1.5px Spectrum outline with a pink-white-violet highlight circling it every 8 seconds (2026-10-28 user request). This decorative layer preserves the existing 20px corners, artwork, layout and click/drag targets. It pauses with carousel autoplay, including hover, keyboard focus, pointer interaction, manual pause and offscreen/hidden state; reduced-motion keeps only the static outline.

Scheduled LIVE countdowns share a vivid pink accent (`#be185d`), with a pale pink fill (`#fff1f7`) and fine pink border on MY and badge variants. Calendar text variants keep their compact unboxed layout. On Home photography, use pale pink text (`#ffd0e6`) on a dark translucent pill. A 7px dot and expanding halo pulse every 1.8s while a future LIVE is visible and active; the time text stays steady. Hidden/inactive countdowns and elapsed scheduled starts do not pulse, and reduced-motion disables both dot and halo animation. Keep existing KST date/countdown semantics and server-confirmed LIVE status.


## 1. Visual Theme & Atmosphere

Fan Pulse Spectrum is a bright, image-first fan utility interface. A full-color KARA hero supplies nearly all of the page's visual intensity; the surrounding product UI stays white, neutral, and deliberately quiet. The composition pairs editorial entertainment imagery with disciplined product surfaces: generous whitespace, black display type, hairline borders, short micro-shadows, and one pink-to-violet conversion accent. The result should feel like a polished global fan platform rather than a promotional microsite or a dense dashboard.

The page uses asymmetry only at desktop scale. The main content owns the visual narrative while a narrower sticky context panel handles logged-out actions. Below 1024px, that panel disappears and the experience becomes a single-column feed with a fixed four-item bottom navigation. Color is concentrated in photography, the primary reservation action, and restrained Spectrum outlines on repeated LIVE-row actions; utility cards do not compete with the hero.

### Key Characteristics

- Image-first editorial hierarchy with one dominant 2:1 desktop hero.
- White canvas, near-black text, soft neutral surfaces, and almost invisible borders.
- One controlled pink-to-violet filled gradient reserved for the primary conversion CTA; repeated LIVE-row actions may reuse the same relay only as a 1px outline.
- Rounded but not bubbly: 12px controls, 16px collections, 20px hero, full pills only for status and primary action.
- Large negative space between sections; dense information is organized inside compact rows rather than scattered labels.
- Product utility and fandom emotion remain separate: photography carries emotion, cards carry tasks.

## 2. Color Palette & Roles

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| Page background | Canvas White | `#FFFFFF` / `oklch(100% 0 0)` | Page, header, primary cards, context panel cards |
| Primary text | Near Black | `oklch(18% 0 0)` | Headings, active navigation, key labels, focus rings |
| Secondary text | Muted Ink | `oklch(48% 0 0)` | Subtitles, metadata, supporting instructions |
| Subtle surface | Soft Gray | `oklch(97.5% 0 0)` | Quiet hover states and low-emphasis controls |
| Media field | Gallery Gray | `#F6F6F5` | Framed artist-photo fields inside the favorite collection |
| Structural line | Hairline | `oklch(90% 0 0)` | Navigation capsule and bottom navigation dividers |
| Card line | Micro Hairline | `oklch(93% 0 0)` | Cards, artist media fields, social buttons, live rows |
| Strong line | Warm Gray | `oklch(76% 0 0)` | Reserved for stronger internal guides; use sparingly |
| Primary action | Spectrum Relay | `linear-gradient(125deg, oklch(68% 0.22 18), oklch(62% 0.25 340), oklch(56% 0.22 285))` | The current visible surface's single most important next action |
| Action text | On Action White | `#FFFFFF` | Text and icons on the gradient CTA |
| Status accent | Live Pink Line | `rgb(255 95 191 / 78%)` | UPCOMING status outline only |
| Highlight outline | Spectrum Relay | Same gradient as Primary action | 1px border on Google, Passport, and repeated LIVE-row context actions |
| Highlight action text | Spectrum Ink | `oklch(45% 0.22 315)` | Solid accessible label, icon, and arrow on outlined highlight actions |

### Primary

- The interface is monochrome-first. White and Near Black define the product shell.
- The Spectrum Relay is a conversion signal, not a decorative background. It appears at most once as a filled action in each active main or inert-isolated overlay. Google, Passport, and repeated LIVE-row actions may reuse it as a restrained 1px outline, but every action within the same repeated collection uses the same outline treatment.
- Photography may be colorful, but no colored surface should be introduced merely to balance an image.

### Interactive

- Default interactive text inherits Near Black or Muted Ink according to hierarchy.
- `:focus-visible` uses a 3px Near Black outline with a 3px offset.
- Fine-pointer hover feedback runs for 160ms with `cubic-bezier(0.2, 0, 0, 1)`.
- The gradient CTA darkens all three stops on hover; outlined Spectrum actions receive a faint Spectrum-tinted White surface while preserving their outline; neutral controls shift toward `oklch(97.5% 0 0)`.

### Neutral Scale

- Canvas and card: `#FFFFFF`.
- Gallery field: `#F6F6F5`.
- Soft interaction surface: `oklch(97.5% 0 0)`.
- Hover surface: `oklch(94% 0 0)`.
- Muted text: `oklch(48% 0 0)`.
- Primary text: `oklch(18% 0 0)`.

### Surface & Overlay

- Main canvas: solid White; no page gradient or ambient color wash.
- Hero readability: two restrained black scrims, vertical and horizontal, fading to transparent before the image midpoint.
- Text on hero photography uses a short `0 1px 3px` dark text shadow.
- Passport asset uses a soft object drop-shadow rather than a surrounding colored panel.

### Theme Modes

#### Light Mode

- Background: Canvas White.
- Surface: Canvas White with a Micro Hairline and short micro-shadow where separation is necessary.
- Text: Near Black plus Muted Ink.
- Accent: Spectrum Relay on the primary hero CTA.
- Notes: this is the only observed and supported appearance mode.

#### Dark Mode

- Not observed and not implemented. Do not infer or auto-generate a dark palette from this document.

### Shadows & Depth

- Card micro-shadow: `0 1px 2px oklch(18% 0 0 / 0.05), 0 4px 12px oklch(18% 0 0 / 0.03)`.
- Hero CTA shadow: `0 5px 8px rgb(58 18 55 / 22%)`.
- Passport image: `drop-shadow(0 8px 14px rgb(23 25 28 / 7%))`.
- Borders provide the primary separation; shadows confirm depth but never create floating islands.

## 3. Typography Rules

### Font Family

- Primary: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
- Google login control: `"Google Sans", Roboto, Arial, sans-serif`.
- Numeric countdown: `ui-monospace, SFMono-Regular, Menlo, monospace` with tabular figures.
- OpenType features: use `font-variant-numeric: tabular-nums` for changing timer values.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hero event title | Pretendard Variable | `48px` desktop / `32px` mobile | `850` | `1.02` | `-0.04em` | White overlay title, maximum `15ch` |
| Shared section heading | Pretendard Variable | `24px` from 768px / `20px` mobile | Standard `850`, editorial `800`, personal `700` | Shared role leading | Shared role tracking | Description is optional; preserve the MY page-specific breakpoint and leading |
| Context-card heading | Pretendard Variable | `20px` | `850` | `1.2` | `-0.03em` | “곧 만날 최애”, “최애의 Fan Passport” |
| Item / creator name | Pretendard Variable | `16px` | `700` | Shared item leading | Shared role tracking | Image → name → audience metadata → actions; names may wrap |
| Body copy | Pretendard Variable | `16px` | `400` | Shared body leading | `0` | Preserve readable translated content |
| Metadata | Pretendard Variable | `13px` | Role-specific `400–550` | Shared metadata leading | `0` | Quieter than the item name |
| Live-row title | Pretendard Variable | `16px` | `700` | Shared item leading | Shared role tracking | Allow wrapping without clipping the title |
| Section subtitle | Pretendard Variable | `14px` | `550` | `1.5` | `0` | Muted Ink, sentence-style Korean |
| Primary CTA | Pretendard Variable | `15px` | `800` | Normal | `0` | Compact, direct verb phrase |
| Status label | Pretendard Variable | `12px` | `800` | Normal | `0.04em` | Uppercase only for UPCOMING |
| Passport value line | Pretendard Variable | `14px` | `750` | `1.45` | `0` | Centered and concise |
| Passport supporting line | Pretendard Variable | `13px` | `550` | `1.5` | `0` | Muted Ink |
| Countdown | UI monospace | `14px` | `750` | Normal | `-0.02em` | Stable width; never use proportional numerals |

### Principles

- Use weight contrast before introducing additional size tiers.
- Korean headings are short, assertive noun phrases; subtitles explain value in one sentence.
- Home Hero event titles use `{celebrity name} LIVE` and do not repeat the associated brand name. CMS titles and brand context remain unchanged for LIVE lists and detail screens.
- Do not use the Bricolage wordmark font for UI copy. The custom wordmark remains an image asset.
- Keep hero text high-contrast and left aligned; keep Passport empty-state copy centered.

## 4. Component Stylings

### Buttons and Links

- Primary CTA: at most one visible per active main or inert-isolated overlay; some surfaces need none. Use a 320px maximum width, 48px minimum height, full pill radius, Spectrum Relay fill, White text, Pretendard Variable 15px/800, optically centered label, and optional 18px leading/trailing icons. Labels are short verbs describing the immediate next action. Put necessary preconditions or destination details in helper copy 8px below at 13px/550 and connect it with `aria-describedby`.
- Google login: 90% of card width, 52px minimum height, full pill radius, White fill, 1px Spectrum Relay outline, solid Spectrum Ink label, authentic multicolor G mark, centered label.
- Passport CTA: label `Fan Passport 발급받기`; 90% of card width, 52px minimum height, full pill radius, White fill, 1px Spectrum Relay outline, solid Spectrum Ink label, centered label and right arrow.
- Creator summaries: inset 12px below the media field, then show a wrapping 16px/700 name, quieter 13px audience metadata, and a separate action group. Use a 4–8px gap within related copy and allow actions to wrap without shrinking their 44px targets.
- LIVE state: show a blinking red dot plus `LIVE 진행중` / `LIVE NOW` only for an active LIVE, a static muted dot plus `LIVE 예정` / `UPCOMING LIVE` for a scheduled LIVE, on LIVE surfaces. Home creator cards instead show an outlined heart with `입덕하기` / `Become a fan` in the action group, linking to the existing creator fan-verification detail page (`/c/{slug}`) with the current locale; this is navigation, not a saved-favorite toggle. Disable dot animation for reduced-motion users.
- Celebrity social controls: keep the icon group together in the action area after identity and audience metadata; allow the group to wrap. Use optically centered 20×20px brand marks inside separate 44×44px targets and `0px` gap between adjacent targets. Do not render visible YouTube, TikTok, or Instagram labels. Preserve accessible names in the links.
- Mobile/tablet context actions: below 1024px, keep the existing state-appropriate activity summary and authentication or Passport action in the normal content flow. Reuse the service/passport action roles; do not force duplicate CTAs or invent a destination for unavailable content.
- Section secondary links: minimum 44px interaction height, 13px/550, Muted Ink, unboxed chevron treatment. Other text-action roles retain their shared typography.
- Icon-only controls: use 20×20px visible icons inside 44×44px targets with Lucide-style 1.75–2px strokes. The Header language switch is the deliberate exception: use a 24×24px visible glyph inside the same 44×44px target. Adjacent icon-only controls use `0px` group gap while each target remains distinct and non-overlapping. Do not apply this compact rule to controls with visible text.
- Repeated LIVE-row actions: use the highlighted Secondary treatment rather than Primary or Neutral. Apply the same White fill, 1px Spectrum Relay outline, and Spectrum Ink label/icons to every action in the collection regardless of reservation or replay state. At desktop use a 184×48px outlined pill with a 14px/750 centered label and balanced 18px leading/trailing icons; below 768px reduce the same action to a separate 44×44px icon target.
- LIVE detail action rail: treat its title as a Page heading, not a Hero overlay title. Use 24px/800 on desktop and 20px/800 on mobile, 14px/550 schedule labels, 14px/750 schedule values, 24px between information groups, and 8px between the Primary and its 13px/550 helper.
- Avoid parallel primary actions. The hero ends at “라이브 예약하기”; detailed information belongs downstream.

### Cards and Containers

- Collection card: White, 16px radius, 24px desktop padding / 20px mobile padding, Micro Hairline, card micro-shadow.
- Utility card and live row: White, 12px radius, Micro Hairline, card micro-shadow.
- Hero: 20px radius, no card shadow; depth comes from the photograph and internal scrim. Home's shared carousel viewport has a 1px Spectrum Relay perimeter (2026-10-27 banner-boundary feedback), overlaid without changing artwork geometry or blocking controls and swipe gestures.
- Desktop context cards stack with a 16px gap and remain visually quieter than the hero.
- Nested colored cards are prohibited. Inner separation should use a media field, spacing, or a hairline.

### Inputs and Interactive Controls

- No form input was observed on this page.
- Controls use an explicit 3px Near Black focus outline with 3px outer offset. The shared ContentActions/PostCard More menu items use a 3px inset outline (`-3px` offset) to stay inside the compact popup; report-dialog fields and actions keep the default outer offset. Portal content owns its product font and focus styling independently of the page frame.
- Touch targets remain at least 44px even when the visible icon or label is smaller.

### Navigation

- Header: sticky White shell using the current shared header geometry, with 88px desktop height from 1024px. Preserve the compact mobile header and avoid duplicating historical extraction heights in new CSS.
- Wordmark: 80px rendered image inside an 88×44px link target.
- Desktop navigation from 1024px: White pill, 44px height, subtle border, active item in Near Black/800 and inactive items in Muted Ink/600.
- Desktop optical correction: navigation is translated upward by 1px to align Pretendard with the wordmark.
- Below 1024px, hide the desktop pill and retain brand plus header actions.
- Below 1024px, show a fixed 64px four-column bottom navigation with a thin top line and a 2px active indicator.
- Desktop and mobile use the same four product destinations: `HOME`, `커뮤니티`, `최애`, `MY`. Do not replace them with section anchors or separate mobile-only labels.
- `/passports`, `/stamps`, `/benefits`, `/notifications`, and `/settings` are MY sub-routes and render MY as the current top-level destination.

### Image Treatment

- Hero uses full-bleed high-resolution KARA photography with `object-fit: cover` and a slightly right-shifted focal position.
- Home favorite cards use a nested gallery composition from 768px: a square `#F6F6F5` field contains the shared `min(84%, 240px)` square portrait. Below 768px, the portrait and preview fill the square frame, retaining the same registered crop. The `/celebrities` directory fills its entire media area, 5:4 below 768px and square from 768px. Both use the shared per-creator framing. Mobile directory images requiring `contain` use a content-sized frame instead of 5:4 letterboxing; never promote an unapproved crop to cover.
- Favorite portraits are direct, colorful, face-legible editorial crops: blue KARA group styling, warm gold Elina close-up, cool dark Changha close-up.
- Upcoming LIVE avatars reuse the corresponding artist imagery in circular 64px desktop / 56px mobile crops.
- Passport uses a transparent, fully opened identity-and-stamp-book asset with `object-fit: contain`; it is never shown as a closed burgundy cover.

### Distinctive Components

- Status Rail: UPCOMING outline pill plus date on one horizontal rail; the countdown sits below in monospace. Scheduled LIVE events use `D-{days} HH:MM:SS`, omitting the day prefix when less than 24 hours remain, and update once per second. Active events and countdowns that reach zero show `LIVE NOW`.
- Favorite Gallery Collection: one rounded outer collection with image-led items; each item reads portrait → emphasized name → fan count → fan-detail and social actions. Keep real YouTube, TikTok, and Instagram marks in full-size targets.
- Logged-out Live Card: heading and subtitle at the top, centered calendar-heart line icon, centered explanatory copy, Google login CTA at the bottom.
- Fan Passport Card: title/subtitle, opened Passport asset, lifecycle value copy, and login CTA in one quiet vertical composition.
- Upcoming LIVE Row: circular avatar, identity/title/date block, right-aligned reservation metadata on tablet/desktop, and a 44px chevron action.

## 5. Layout Principles

### Spacing System

- Base unit: `4px`.
- Repeated spacing values: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`.
- Adjacent icon-only action groups are the deliberate exception to the positive spacing scale: use `0px` between separate 44×44px targets and center a 20×20px icon in each target.
- Major content sections use the shared 32px mobile / 48px wider-screen gap.
- Shared section headers use a 16px bottom gap. The optional secondary link wraps below when a 20rem title column and the action do not fit.
- Dense components use 12–24px internal gaps; avoid arbitrary intermediate spacing.

### Grid & Container

- Maximum product width: `1440px`.
- HOME, event catalog, LIVE list, LIVE calendar, creator directory and MY share that outer width, including horizontal gutters of `16px` below 768px, `32px` from 768px, and `40px` from 1280px. Page headings and first content edges align with the header and footer; do not add narrower nested page containers. Control density with rows and columns inside this shared shell.
- Reading and focused task widths remain separate: settings fields 720px; certification and quiz 760px (quiz result 690px); login 440px or gateway 960px; onboarding 1120px; legal reading 760px; LIVE mission 880px and survey 800px; Passport issuance presentation 1320px. Dialog widths are independent of page width.
- At 1440px with the always-visible side panel: 40px page insets, `944px` main column, 32px gutter, `384px` context panel.
- At 1024–1279px: main column plus 360px context panel with a 24px gap.
- At 768px: 32px page insets and a single 704px content column.
- At 390px: 16px page insets and a 358px content column.
- Desktop hero ratio: `16:8`; mobile hero ratio: `4:5`.

### Whitespace Philosophy

- Whitespace is the primary neutralizing force against colorful artist imagery.
- After implementation, review spacing/alignment/type separately at the same viewport, locale, content and state before and after. Keep related title/description closer than separate actions; choose existing role tokens, not equal gaps to fill a frame. Preserve purposeful bottom-aligned card actions and approved image safety space. Record changed properties and values, then verify actual mobile/desktop composition alongside behavior and accessibility.
- Creator welcome banners center the natural-height reading group on desktop: category → title 16px, title → description 12px, description → CTA 32px. Mobile and the narrow-sidebar layout use 16px/8px/24px. Keep the existing image framing, carousel height and type scale; these are welcome-role values, not global spacing defaults.
- Major sections use the 32px/48px rhythm; judge the whole-page density with real content and do not fill gaps with decorative copy or badges.
- Left alignment governs discovery and live information. Center alignment is reserved for empty states and authentication prompts.
- The right context panel stays sticky and task-focused rather than becoming a second scrolling content feed.

### Border Radius Scale

- Micro: `10px` for compact social buttons.
- Standard control: `12px`.
- Collection card: `16px`.
- Hero: `20px`.
- Authentication CTA: `14px`.
- Pill: `999rem` for navigation capsule, status, and primary CTA.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | White or Gallery Gray, no shadow | Header, page canvas, artist media field |
| Ring | 1px Hairline or Micro Hairline | Navigation, social controls, CTA outlines |
| Card | Micro Hairline plus two-layer micro-shadow | Favorite collection, context cards, live rows |
| Hero | Full-bleed image plus internal black scrim | Primary live feature only |
| Focus | 3px Near Black outline with 3px offset | Keyboard focus on every link and button |

### Depth Principles

- Use borders before shadows and micro-shadows before floating elevation.
- The hero is visually dominant without an external shadow.
- Image objects may use a soft drop-shadow, but their containing surface remains White.
- Footer: keep navigation links at 13px/550 inside full 44px targets. Use 48px top and 16px bottom padding on desktop, 40px top and 16px bottom padding on mobile, and create hierarchy with grouped whitespace rather than taller link rows.
- Keep the three service groups separate from a full-width horizontal social row. On mobile, the service navigation uses two group columns and the longer guide group spans both columns with its links in two columns; from 768px, use three compact service columns.
- Social marks render at 20×20px, centered inside separate 44×44px targets. Business and policy metadata stays at 13px and wraps naturally instead of shrinking.
- The footer remains normal-flow content and owns no viewport height, bottom-navigation clearance, or safe-area padding. `FanAppFrame`, `FocusFlowFrame`, standalone login, and standalone page layouts own the clearance required by their navigation and viewport context.
- No glassmorphism, backdrop blur, ambient colored glow, or broad decorative shadow was observed.

## 7. Do's and Don'ts

### Do

- Let one strong artist image lead each viewport.
- Keep utility surfaces white and separate them with hairlines and micro-shadows.
- Use the filled Spectrum Relay only for the active surface's single primary next action. A page may have no filled Primary. Repeated LIVE-row actions use the approved Spectrum-outline Secondary treatment consistently; other repeated card actions and secondary exploration stay Neutral or Text.
- Keep title and explanatory subtitle together as a reusable section-heading pair.
- Preserve 44px minimum interaction targets and visible keyboard focus.
- Use real social brand marks and face-legible, high-quality artist photography.
- Present Passport as an opened record system with empty stamp capacity.

### Don't

- Do not add colored card backgrounds to “balance” the hero.
- Do not place multiple gradients, dark feature cards, or competing primary CTAs on the same screen.
- Do not use a closed leather Passport, pocket graphic, or heavy burgundy surface in this system.
- Preserve the inset portrait composition on Home. Only the creator directory uses the approved full-bleed portrait variant; banner, Passport and circular-avatar treatments are separate.
- Do not introduce nested cards, oversized shadows, glass panels, or ornamental divider lines.
- Do not hide secondary information behind tiny hit areas or use icons below 44px without a larger target.
- Do not fabricate dark mode rules from the light-only implementation.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile | `< 768px` | 16px page inset, 20px headings, 4:5 hero, horizontal 288px favorite cards, 56px live avatars, desktop nav hidden |
| Tablet | `768–1023px` | 32px page inset, 24px headings, 2:1 hero, three visible favorite cards in the horizontal snap rail, 64px live avatars, compact header and bottom navigation |
| Desktop | `1024–1279px` | Desktop header navigation appears; side context panel is visible and sticky; bottom navigation disappears; no panel toggle |
| Wide desktop | `≥ 1280px` | 40px page inset, 384px context panel, 32px column gap; social controls remain icon-only |

### Touch Targets

- Standalone links and buttons maintain at least 44×44px interaction areas; inline prose links keep readable native line flow. Never shrink icon targets to fit a translation.
- Adjacent icon-only actions maintain independent 44×44px hit areas with `0px` visual gap; hit areas must meet edge-to-edge but never overlap.
- The visible icon remains 20×20px. Text-bearing actions, navigation labels, and isolated icon controls keep their component-specific spacing.
- Bottom navigation divides the viewport into four equal-width targets with 64px minimum height.
- Horizontal favorite cards use scroll snap and hide the scrollbar without disabling native touch scrolling.

### Responsive Layout Strategy

- Desktop behavior: two-column shell with a 944px content column and sticky 384px context panel at 1440px.
- Tablet behavior: single content column, compact header and bottom navigation; the side context and desktop header navigation are hidden below 1024px.
- Mobile behavior: compact header, no desktop nav or side panel, horizontal favorite rail, fixed bottom navigation.
- Desktop context: keep the right activity panel visible without a header toggle or collapse state. The main column retains its two-column width; mobile activity summaries remain in the content flow.
- Live metadata: reservation count is hidden on mobile, leaving avatar, content, and action columns.
- Reduced motion: all transitions are reduced to `0.01ms`, and smooth scrolling is disabled.

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Spectrum Relay gradient.
- Background: `#FFFFFF`.
- Heading text: `oklch(18% 0 0)`.
- Body text: `oklch(48% 0 0)`.
- Border or ring: `oklch(90–93% 0 0)`.
- Media field: `#F6F6F5`.
- Status accent: `rgb(255 95 191 / 78%)`.

### Quick Summary

Build a white, image-first K-pop fan product with Pretendard typography, a dominant full-color editorial hero, and at most one pink-to-violet filled gradient CTA per active surface. Repeated LIVE-row actions may reuse that relay as a consistent 1px outline; keep all other utility surfaces neutral with 1px hairlines, 12/16/20px radii, and short two-layer micro-shadows. Use the shared 32px/48px section spacing and compact heading/optional-description groups with quiet secondary navigation. On wide screens, split the page into a large content column and a narrow sticky logged-out context panel. Below 1024px remove that panel and use fixed bottom navigation; below 768px use the existing horizontal snap collection where appropriate.

### Example Component Prompts

- Hero: “Create a 2:1 desktop live hero with full-bleed high-resolution artist photography, a restrained left-and-bottom black scrim, a clearly defined outlined UPCOMING rail, 48px white event title, monospace countdown, and one 320×48px spectrum-gradient reservation pill.”
- Card: “Create a White favorite collection with a 16px outer radius, 24px padding, micro hairline and short two-layer shadow. Place three square Gallery Gray media fields inside; use the shared min(84%, 240px) inset portrait, then a wrapping 16px/700 name, 13px fan count and a separate action group with three 44px social controls and 20px brand marks.”
- Navigation: “Reuse the shared sticky White header with an 80px kyaa wordmark, a 44px hairline pill navigation optically shifted upward by 1px, and 44px language/menu controls. Use a 24px visible language glyph inside its 44px target. Hide the pill below 1024px.”
- Passport: “Create a quiet White Passport utility card with a 20px/850 title, 14px subtitle, fully opened identity-and-stamp asset, centered two-line lifecycle copy, and a 90%-width 52px outlined login CTA.”
- Live row: “Create a 112px White live row with a 64px circular artist avatar, wrapping 16px/700 title and 13px metadata stack, plus a right-aligned 184×48px Spectrum-outline Secondary booking pill. Apply the same outline treatment to every action in the collection. Below 768px use a 44px icon-only action without turning repeated rows into filled Primary buttons.”

### Ready-to-Use Prompt

Using the kyaa Fan Pulse Spectrum design system, turn the supplied product scenario into a responsive fan-platform screen. Preserve the White/Near Black shell, Pretendard hierarchy, 4px spacing scale, 12/16/20px radius ladder, hairline-plus-micro-shadow surfaces, face-legible editorial imagery, and at most one filled Spectrum Relay primary CTA per active surface. Repeated LIVE-row actions may use the same relay as a consistent 1px outline. Use a wide content column plus sticky context panel at desktop, a single column with fixed bottom navigation below 1024px, and the existing horizontal snap collection below 768px where appropriate. Do not introduce dark cards, extra filled or decorative gradients, glassmorphism, nested cards, or decorative color surfaces.

### Iteration Guide

1. Establish the screen’s main task and visual focus before adding secondary modules; a utility screen does not need a hero or filled CTA.
2. Translate scenario information into title/subtitle pairs, compact rows, or one neutral utility card.
3. Check that colored surfaces do not compete with artist photography.
4. Verify 44px targets, 3px focus outlines, and mobile in-flow activity access.
5. Confirm that new components reuse shared roles and tokens, then apply the separate visual finish criteria below. Token compliance alone is insufficient.

## Optional Appendix: Interaction Patterns

- Scroll behavior: header remains sticky; context panel is sticky from 1024px; mobile/tablet use a fixed bottom navigation.
- Hover behavior: neutral controls receive a subtle gray fill; artist media fields rise by 2px and strengthen their border; Passport artwork rises by 6px; the primary gradient darkens.
- Click behavior: login and reservation actions route downstream. The desktop activity panel is always visible and has no fold/unfold control.
- Animation tone: restrained and product-like, 160ms for control feedback and 240ms for layout/object transitions.
- Reduced motion: transitions collapse to effectively instant and smooth scrolling is removed.

## Optional Appendix: Content & Messaging Patterns

- Headline pattern: short identity or value phrase, often mixing Korean with a familiar English product noun, e.g. “최애의 Fan Passport”.
- Subtitle pattern: one direct benefit sentence ending in `-보세요` or `-하세요`.
- CTA language: explicit task plus outcome, e.g. “라이브 예약하기”, “Google로 계속하기”, “Fan Passport 발급받기”.
- Lifecycle copy: enumerate meaningful fan actions before promising the stored value, e.g. “팬 인증부터 라이브 예약, 출석, 후기까지”.
- Voice and tone: warm and encouraging, but never cute, overly promotional, or verbose.

## Optional Appendix: Historical Observed Pages (2026-07-20)

- `http://127.0.0.1:5173/candidates/03-fan-pulse-spectrum`: desktop 1440×1100, tablet 768×1024, and mobile 390×844 rendered states; logged-out context panel open and collapsed; hover-capable controls.

## Optional Appendix: Historical Evidence Notes (2026-07-20; not current rules)

- Observed: the live rendered page exposes no root variables on `:root`; reusable tokens are scoped to `[data-fan-pulse-home]` and were read from the loaded stylesheet.
- Observed: at 1440px the hero is 944×472px, the favorite collection is 944px wide, and the open context panel is 384px wide.
- Observed: the favorite media field is about 287px square with about 48px padding, yielding an artwork ratio near 66.5%.
- Observed: the browser reported no runtime page errors during extraction; console output contained only Vite and React development messages.
- Inferred rule: color is intentionally budgeted—photography plus one primary gradient—because neutral utility surfaces preserve visual rest beside the hero.
- Inferred rule: the side panel is contextual rather than foundational because it is removed entirely below 1024px without replacing the main content flow.

## Shared fan UI implementation (updated 2026-10-04)

The current consolidation covers Home section headers, LIVE catalog headers,
LIVE calendar page title, MY page/section headings, and shared FanAction controls.
The migrated roles follow the current shared content contract; this does not
claim that all screens or all local CSS have been migrated.

- `apps/web/app/globals.css` owns semantic `--fan-*` typography and action tokens,
  alongside existing color, spacing, radius, focus, and motion tokens.
- `FanHeading` separates semantic `as` (`h1` / `h2` / `h3`) from visual `variant`.
  Standard headings are 20px / 24px at 48rem, weight 850. Editorial headings retain
  weight 800. MY page headings retain their 40rem breakpoint and inherited leading;
  personal section headings use 20px / 24px at 48rem, weight 700.
- `FanSectionHeader` owns title, optional description, optional `{ label, href }`
  action and their spacing. Its heading row wraps the flexible 10rem title and
  14px secondary action together, with supporting copy below and a 16px bottom gap. Standard/editorial retain their shared
  minimum header height; personal headers have no minimum height.
- Do not add local heading selectors or arbitrary style/className overrides to
  these migrated roles. Add an intentional, reusable variant in the shared module
  only when the existing roles cannot express the product requirement.
- `FanAction` continues to own primary, neutral, text, service and passport
  behavior. Its central dimensions remain 44px base, 48px primary, 52px service /
  passport, and 18px icons. Existing service-specific typography is preserved.
- Home hero typography, Passport artwork, profile identity, calendar controls and
  non-migrated screens remain intentional separate owners, not silently normalized.
- `fan-design-system.contract.test.ts` guards token resolution and migrated CSS
  ownership; component tests guard heading semantics, optional content and links.
  Run these checks plus the affected screen tests when changing shared properties.
  Desktop/mobile rendering verification remains necessary; source checks alone do
  not certify visual parity with production.

- `LiveStatusIndicator` owns `density="comfortable" | "compact"`. Catalog rows
  select compact density rather than overriding the shared badge's min-height in
  a screen stylesheet; this keeps dev and production CSS ordering equivalent.
- The `Fan design system` GitHub workflow runs the shared-role and migrated-screen
  tests on relevant pull requests and main pushes without production credentials.
  Repository branch-protection settings are separate; this workflow does not itself
  make the check mandatory for merges.


### Calendar phase one ownership

- `components/fan-calendar/calendar-parts.tsx` owns month controls, KST labels,
  and the numeral-only today ring for full and embedded calendars. Callers keep
  their existing links or local month state; these primitives do not own fetching.
- `globals.css` owns `--fan-calendar-*` type roles. Metadata stays at 12px and
  event titles at 14px; desktop density must not introduce 9px overrides.
- The full calendar retains its mobile agenda, tablet two-column layout and
  desktop seven-column month grid, multi-celebrity filters and inline +N expansion.
  Titles use two lines; the full accessible detail-link title remains intact.
- Celebrity calendar placement: outside the hero, after the upcoming LIVE section
  in DOM/mobile order. At 1024px+, the same single instance occupies the 360px
  right content rail above Passport. No duplicate hidden calendar or hero overlay.
  The September 6 feedback extends this single-calendar placement to notice,
  LIVE, and benefit tabs, including empty notice states. Tab navigation targets
  the content below the hero and retains keyboard focus with a sticky-header offset.
  Full-calendar event chips use soft pastel surfaces inspired by TimeTree/Amie;
  the compact month and nearby schedule list follow the approved Fantastical reference.
- The mini calendar preserves direct first-LIVE links and month/locale/celebrity
  context in “open calendar.” Today is a numeral ring, not a reservation border.
  Single-event reserved/unreserved/unknown states have distinct non-color markers
  and a complete legend. Multiple-event dates show a neutral count rather than
  borrowing the first LIVE's reservation state. Full multi-event selection is
  deferred, not claimed complete by this visual pass.
- No date-selection panel, month/list toggle, new reservation flow or API change
  is part of phase one. Validate 360/390/768/1024/1440px before promoting changes.

## Utility surfaces and truthful copy (2026-09-05)

The UI/copy guide is implemented as an opt-in extension, not a replacement of
Fan Pulse Spectrum. `fan-ui/fan-surface` owns neutral utility canvases and static
section cards; `--color-utility-canvas` and `--color-surface-focus` are shared
roles. HOME, artist heroes and Passport artwork retain their existing treatment.
Do not introduce a parallel hard-coded blue palette from the guide's example hexes.

- Creator directory: maximum three equal-width columns, left-aligned partial row,
  two columns at 768px and one below. The later shared portrait contract applies:
  full-bleed approved cover, 5:4 below 768px and square from 768px (mobile
  `contain` sources use their natural ratio), preserving registered framing and every face rather than reverting to the historical 4:3 contain layout.
  Use published summaries only, no invented biographies or popular/recommended claims.
  Default order remains the published order. Search, ordering and ownership filters stay.
- MY (updated 2026-09-10, slide 58): profile then a shared favorite selector,
  with attained fan tier/progress and that creator’s raffle ticket balance as the
  two primary panels. Reserved LIVE and recent activity follow; totals appear
  once as a quiet summary. Within LIVE, active precedes scheduled, then start time,
  with other reservations in a disclosure. First-reaction-only
  relationships remain distinct from owned Passports. Tier targets use FAN_TIERS;
  remaining points come from the existing summary, not a new score calculation.
- Passport collection cards stay at most 380px even for one record. Technical
  issuance details remain on detail; successful issuance is not a list warning.
- Repeated peer cards share content-driven row heights, comparable facts and
  bottom action baselines. Long names, translated labels and optional statuses
  must not move one card's action independently. Preserve full identifying names,
  image framing and touch targets; do not hide overflow or shrink typography to
  force alignment. Independent panels and single-column rows need not share a
  global fixed height. Follow `docs/design/card-layout.md`; its real-browser
  regression runs in the Fan design system CI alongside semantic contracts.
- Korean labels use 패스포트, 팬 점수, 스탬프, 티켓 and 디지털 기념품 without merging
  their underlying concepts. Authentication, failed reads and empty states differ.
- Mission pages preserve a locale-aware LIVE return link, use the public LIVE title
  when available, and distinguish loading/errors from an empty eligible list.
  An empty eligible list does not prove the LIVE has no configured missions.

Deferred pending evidence: creator biography editing, Fans metric provenance,
contractual official/appearance claims, benefit claimability aggregation, detailed
activity-type enrichment, and cross-site notification/benefit copy changes.
These must not be inferred from the visual guide or added as fabricated data.

Verification boundary: responsive public directory checks live in
`e2e/public/ui-guide.spec.ts`; owned MY/Passport visual checks require a test
account or isolated auth/API fixtures. Passing fixtures is not proof of a live
production account or of benefit eligibility logic.


## Fan hub density refinement (2026-09-05)

- Utility pages reuse the white `--color-canvas` via `--color-utility-canvas`;
  gray remains a media or hover field, not an alternate whole-page theme.
- Directory cards have one semantic link covering image, introduction, status,
  and action. Korean actions use the creator name plus `만나보기`. Introductions
  use the first complete published sentence; no line-clamp or invented biography.
- MY uses two restrained bordered panels for selected-creator fan tier and raffle
  tickets (updated 2026-09-10, slide 58). Supporting LIVE and recent activity use
  open sections below these panels. The same creator selection controls tier,
  tickets, current mission and existing benefit progress; it does not save a
  representative badge. Recent activity shares the desktop supporting row.
  Without supporting content, primary sections share available width instead of
  leaving a left-aligned 800px island. Mobile remains a linear task sequence.
- MY LIVE uses truthful KST date tiles, not an inferred creator/event photo; its
  DTO has no image association. Creator images belong only to owned creator rows.
- Creator home leads with next LIVE plus creator-context portrait. News and
  benefits retain their dedicated tabs, loading/error states, and compact home
  empty states. Independent desktop columns prevent the calendar height from
  stretching content rows. The calendar remains below the hero in the home tab.
- These refinements do not modify published content, personal history, or access
  rules. Verification of local rendering is not production deployment proof.

MY notification preferences live beside unread notifications in the profile header,
with visible labels and 44px targets. Mobile wraps the same utility group below
the identity; no separate full-width settings row appears below activity records.

### Growing creator roster
The editorial first three are centrally configured in `apps/web/server/content/creator-discovery.ts` (Changha, Elina, Yuna). Priority is conveyed only by order: all creators share the same card size, image treatment and information rules on each discovery surface. No secondary group heading, divider, compact tier on home cards. Display the existing CMS fan count below each name using the shared compact Fans format. Additional creators use individual-platform audience stored in CMS as an approximate order signal; do not sum platforms. Explicit directory sorts/search remain neutral. For group photos, crop around the complete member group with every face visible; do not fit the entire venue into the card. Personal MY records are unchanged.

Home favorites preserve the existing portrait-card size and image/social treatment in a single horizontal snap rail at every breakpoint. Desktop shows three equal cards (Changha/Elina/Yuna first); mobile keeps the existing card width. Use banner-style circular arrows at the left/right media edges for viewport-sized movement, disabled at boundaries, synchronized with native touch/trackpad scrolling and resize, with reduced-motion support. Do not show the bottom page count or pagination capsule. Portraits use a 240 × 240 CSS-pixel square (shrinking only when needed inside narrower cards), object-fit cover with creator focal points; Xin uses a 1.6× bottom-centered crop within the same square, retaining all five members while reducing venue and crowd space. Directory remains a normal grid. Generated list/gallery concepts were not selected.

Creator portrait selection and crop requirements: [프로필 사진 규약](docs/design/creator-profile-photo-guidelines.md). Visible tattoos are excluded from final profile crops; use another source if a complete face-preserving crop cannot remove them.

### September 6 remaining feedback

Passport collection photos use a more compact desktop crop. Fan Score and Stamp
numbers link to the existing Passport activity ledger and Stamp Book with stable
fragment targets. The Passport artwork carries its real STAR, issue date and
short Fan ID; the creator portrait links to the creator fan page. MY totals link
to their existing collections or in-page sections, and an unavailable collection
must not receive a fabricated destination. Completion rewards use aligned plain
text for earned score, total and level, without a duplicate floating score badge.

Fan-facing unspent creator balances use 응모권 / Raffle tickets. Applied amounts
use 응모 수 / Entries. Admission tickets and internal accounting identifiers retain
their existing meaning. Balances remain creator-specific.

Utility calendar, ticket, gift and radio icons use direct AnimateIcons Lucide
imports. Hover and keyboard focus trigger one bounded cycle. Active radio may
repeat a short cycle every seven seconds only while visible on a fine-pointer
device. Reduced motion, hidden documents and offscreen icons remain static;
all timers and observers are removed on unmount. Home hero shimmer is unchanged.

LIVE mission entry uses a public visibility boolean, independent of owner
completion or attendance. The read mirrors published, non-legacy, localized
missions in the half-open visibility window. False disables entry with the inline
reason 현재 참여 가능한 미션이 없어요. / No missions are available right now.
Unknown read results retain a link to check the authenticated list and never
claim there are no missions. No question or owner payload is exposed publicly.

### Creator directory portrait contract

`/celebrities` and Home favorites share `CreatorPortrait` and registered crops.
Directory keeps its responsive grid and existing full-card links, using the
`full-bleed` variant to fill a 5:4 media area below 768px for approved cover crops
and a square from 768px, without a gray frame. On mobile, full-image (`contain`)
sources keep their natural aspect ratio instead of acquiring blank side bands. Home keeps the default `min(84%, 240px)` square inset portrait from 768px; below 768px, the same square crop fills the Home card frame. Shared per-creator
cover crops preserve faces, all group
members and tattoo exclusion. Do not use contain letterboxing, route-local crop
copies or hover zoom on these portraits. Passport badges remain outside the crop.
Banner and circular-avatar treatments remain separate. See the directory section
of [프로필 사진 규약](docs/design/creator-profile-photo-guidelines.md) for replacement
and desktop/mobile verification requirements.

### 원형 크리에이터 프로필
- 팬 화면의 원형 사진은 `CreatorAvatar` 공용 컴포넌트 사용. 시각 옵션은 `size`만 허용하며 원형 마스크·개인/그룹 크롭·실패 시 실루엣은 공용으로 관리한다.
- 등록·교체·24px/64px 검수는 `docs/design/creator-profile-photo-guidelines.md`의 원형 프로필 공용 구현 규약을 따른다. 호출부에서 내부 이미지 CSS를 덮어쓰지 않는다.

### 모바일 LIVE 캘린더 — 2026-09-06 후속 피드백

앞선 calendar phase-one의 목록 전용 모바일 범위를 확장한다. 1024px 미만에서는
기존 월 이동 헤더 아래 7열 날짜 선택 달력을 제공하고, 선택된 셀럽의 일정이 있는
날짜에 점을 표시한다. 점은 예약 여부가 아니라 LIVE 존재를 뜻하며 실제 예약 상태는
아래 상세 일정에 유지한다. 날짜 선택은 아래 목록을 좁히고 전체 보기로 되돌릴 수 있다.
셀럽 필터 변경 시 날짜 선택을 해제하며 월 이동 링크는 셀럽/언어를 보존한다.
PC의 기존 월간 상세 달력에는 모바일 날짜 선택이 적용되지 않는다.

2026-09-10 후속 승인: 홈 상단의 팬 활동 버튼과 패널 접기·펼치기를 제거한다.
PC 오른쪽 활동 요약은 항상 표시하고 모바일 본문 활동 요약과 MY 경로는 유지한다.
모바일 달력은
사용자가 날짜를 선택하면 선택 날짜·LIVE 건수를 알리고 해당 결과 제목이 보이도록
이동한다. 화면 크기 변경만으로 포커스를 옮기지 않으며 reduced motion을 존중한다.
PC 날짜 셀의 다건 전환과 전체 보기 dialog는 유지한다.

사용자 승인으로 Weverse 공식 공지 27504와 Blip App Store 캘린더 이미지를
모바일 시각 레퍼런스로 채택했다. 필터는 박스 대신 가로 한 줄의 아바타 칩으로,
달력은 32px 선택 날짜 원과 단색 LIVE 점으로 정리한다. 오늘은 테두리 원,
선택 날짜는 서비스 색 채움으로 구분한다. 아래 일정은 부드러운 회색 영역 위
흰 카드로 배치하고 시간 13px / 제목 16px / 셀럽 13px의 위계를 유지한다.
여러 색 점의 의미를 새로 만들지 않으며 기존 예약·방송 상태는 카드에 유지한다.
공식 출처와 원본 이미지는 artifacts/feedback-2026-09-06/calendar/benchmark에 보관한다.

### Shared creator photography — 2026-09-10

All creator identity-photo consumers use `CreatorImage` with source and framing registered in `creator-image-config.ts`. `CreatorPortrait` and `CreatorAvatar` keep their existing square/circle masks and sizing APIs. MY, LIVE detail/calendar, Passport photos and calendar collage use the same renderer; fanpage banners use `CreatorHeroPicture` and the same registry with separate responsive composition. Source replacement and crop stay coupled. A later CMS upload must be honored without inheriting a previous photo's zoom. Keep event artwork, benefits and user avatars separate. Park Myungho uses the approved user-provided suit portrait, about50% crown-to-chin height in square/circular photos; preserve shape-specific framing in wide/vertical surfaces.

## Contextual content translation (2026-10-09)

Content translation uses the selected app locale. Show the text action directly below the affected content, aligned to its text edge, with muted 13px utility type and a 44px minimum target; preserve keyboard focus, loading/error feedback, and the original toggle. Hide the action entirely for language-free content and confidently matching source text. Ignore URLs, email addresses, and mentions for detection. Korean, Japanese (with kana), and Thai use script dominance; longer Latin-script text uses conservative language ranking. Short/ambiguous text, mixed scripts, and indistinguishable Chinese variants retain manual translation. Detection is local and never triggers translation API requests on reading. Changes to text, revision, locale, or account invalidate visible translated state.

### Incremental Home and community updates — 2026-10-19

Home previews ten public fan posts or root cheers per page across published creators below the managed hero banner, for guests and signed-in fans at every breakpoint. Ready photo/video posts come first, then newest within each group (2026-10-31 media-first approval). The banner always leads the fan-board preview in both DOM and visual order. Apply the verified viewer’s existing block relationships before selecting each page, exclude members-only content even for its owner, and preserve source text. Keep existing navigation and banners. Community creator selection preserves the selected tab and locale; its popup follows the shared focus, touch-target and viewport rules. Fan score summaries expose existing scores and next-stage targets without changing score policy.

### RUN&MUSIC winner notice (2026-10-30)

The approved compact notice at `/connect/runmusic/notice` pairs the intact official 3:1 banner with the title, prize counts and email date on desktop; mobile stacks the same natural-ratio banner above that concise summary. The list uses prize filters, masked-email search and 24-row pagination (four desktop/two mobile columns). Public data contains masked emails only: 104 winners, excluding three approved test-domain entries, with 15 yogurt and 89 Starbucks winners. This notice does not change historic draw records. Local screenshots validate 390/1440px, filters, search reset and page navigation.

### Compact home fan-board preview — 2026-10-31

Use two equal columns from 768px with 8px row / 16px column gaps, 12px card corners and 8px content padding. Show ten items per page (five rows on desktop). Use uniform 104px rows with 80px square thumbnails at every breakpoint; below 768px use one column and 8px row gaps. Preserve the existing 16px body, 13px metadata, shared section heading and 44px minimum actions. Show at most two body lines; align metadata at the bottom. Following the 2026-10-31 request for uniform, denser cards, home preview thumbnails use cover with a horizontally centered, upper-quarter focal position inside an 80px square with 8px corners. This crop is scoped to the home preview; full post imagery remains intact. Keep board and author metadata on one line, with the source text retained in the DOM; body previews retain two lines at 16px/22px. Fixed height is an explicit exception for this preview role, not a global card rule. Text-only posts have no fabricated image. Place localized previous/next arrow buttons and the current page below the list; disable unavailable directions. Fetch only ten items plus a next-page sentinel on the server, preserving public visibility, block and WAVE exclusions. The legacy three-item RPC remains available for old clients during rollout. Preserve loaded same-owner content on return refresh; clear it for page/owner transitions and community mutations. This structural compression reflects the user's general UI preference without shrinking readable text or touch targets.

## 2026-11-02 모임 웹 전환 범위

`KYAA_GROUPS_ENABLED`로 활성화되는 모임·관련 MY 화면은 승인된 `outputs/kyaa-fanpage-implementation-20261101/DESIGN.md`의 최신 계약을 따른다. 기존 HOME과 gate-off 페이지의 계약은 유지한다.

- 캔버스·읽기·입력·보유량·패스포트 표면: 흰색. 경계 `#EEECEF` 또는 구조 경계 `#E4E1E6`, 입력 경계 `#8A8A8A`.
- 선택·초점 `#D11B62`, 선택 글자 `#AD1457`, 선택 배경 `#FFF0F6`. 일반 정보 아이콘은 중립색, 보라는 원본 아트와 Spectrum 끝색에 한정한다.
- 주요 행동은 기존 접근성 보정 Spectrum `#D9194C → #B91A93 → #6042D5`. 탭·필터는 채워진 주요 행동과 구분한다.
- 모임 정보 밀도와 제목/간격/반응형은 `features/groups/ui/groups.module.css`, 전역 탐색은 기존 `fan-shell`, 지갑은 `features/group-wallet/ui/wallet.module.css`가 소유한다. 공통 버튼 정렬은 `FanAction`을 재사용한다.
- PC와 모바일의 실제 렌더·긴 이름·빈 상태·오류·권한별 검사 근거는 `docs/design/groups-production-coverage.json`과 작업 로그에서 구분한다. 매핑만으로 시각 검수 통과로 간주하지 않는다.

- 모임 지갑 출석은 기존 `CalendarDayNumber`로 현재 KST 월을 보여준다. 실제 출석 기록에만 도장과 10P/30P를 표시하며, 7일 보너스는 20P 추가 정책을 유지한다. `wallet.module.css`가 7열 간격·핑크 도장·오늘 테두리를 소유한다. 관리자 행사 지원의 참석/후기 수는 `group-admin.module.css`의 2열 요약으로 표시한다.

### 모임 운영 전환: Pencil 원본 구성 보존 (2026-11-02)

`outputs/kyaa-fanpage-implementation-20261101/kyaa-fanpage.pen`의 승인된 화면 구성을 운영 UI 기준으로 유지한다. 기능 추가를 이유로 원본의 정보 순서·대표 이미지 비율·주요 행동 위치를 다른 구성으로 바꾸지 않는다. 실제 데이터·권한·로딩·오류·다국어·200% 확대에 필요한 대응은 해당 구조 안에서 처리한다.

- 탐색: 지정된 2026-11-02 HTML에 따라 소개와 사진 배너 다음에 실제 회원 수 순의 주목할 페이지 최대 3개를 표시하고, 이어서 목록과 내 페이지·출석·개설 신청을 배치한다. PC 배너는 960×480px, 행동은 Spectrum 그라데이션이다. 모바일 분류와 정렬은 한 줄, 검색은 다음 줄에 놓는다. PC 카드 아바타 64px/패딩16px, 모바일은 압축 행과 구분선이다. 목록은 PC 3열이며 이름과 회원 수를 표시한다. 목록 수는 실제 전체 개수이고 첫 20개 이후 더 보기로 이어진다.
- MY `R3Nnz/BdXrj`: PC는 본문과 240px 우측 MY 메뉴, 패스포트는 책 좌측·실제 발급 도장과 CTA 우측. 모바일은 책→도장→CTA→3개 잔액→지갑/출석 순서. 존재하지 않는 책·도장·포인트를 시안 수치로 채우지 않는다.
- 지갑 `CFdD7/IMzcm`과 출석 `U3Bip/g9zuQV`은 분리한다. 지갑은 잔액→교환→내역, 출석은 실제 연속 출석과 7일 도장·단일 CTA. PC 도장 7열, 모바일 4+3열. 일일10P와7일 연속 추가20P는 현재 지급 상태와 구분한다.
- 캡슐 `EqCqG/mC9VD`은 분홍 stage 안 기계와 흰 제어 패널, 횟수 선택과 단일 실행 CTA. 추첨 `mF4bM`은 경품·응모·활동 보조 영역. 모임에서 진입한 경우 실제 모임 헤더와 활동 탭을 유지한다. 전역 캡슐 풀을 특정 모임 소유로 표현하지 않는다.
- 페이지 운영 `AuwgA`는 공통 헤더88px/ADMIN띠60px/페이지 식별44px/상단 운영 탭/회원 표와288px 선택 상세. 플랫폼 신청·신고 `jzqEs/kITlr`는 compact 목록 선택→단일 상세 심사이며 항목별 긴 폼을 반복하지 않는다.
- 공통 PC 헤더는 높이88px, 탐색366×46px, 포인트88×44px과 #FAFAFA 배경, 실제 포인트→언어→알림→프로필 순서다. 모바일은 높이68px, 알림→언어 순서와 하단 탐색65px을 원본 Export에 맞춘다. 활성 탭은 pink와 현재 위치 의미를 함께 제공한다.

원본 비교 전에 받은 기능·접근성 점수는 원본 충실도 합격 근거로 재사용하지 않는다. 위 변경 화면은 실제390px/1440px와 확대 상태를 다시 대조한다.
- 탐색 필터는 원본의 한 줄 구성을 유지하도록 해당 영역에만 13px/8px 10px 패딩/최소44px 컨트롤을 적용한다. 폭이나 확대율 때문에 부족하면 필터를 줄바꿈하며 마지막 종류를 검색창 뒤에 가리지 않는다.

- 탐색 대표 배너·출석 CTA는 원본의 #D9194C → #B91A93 → #6042D5 그라데이션과 15px/21px/800 라벨을 사용한다. 대표 배너 CTA는160px, 더 보기의 라벨과 화살표는 한 묶음으로 중앙 정렬한다. 적용 범위는 탐색 화면이며 기존 gate-off 버튼 색은 유지한다.

- 브랜드 홈 `aq3i8/qXdjj`: PC 식별 영역 위24px, 제목28px/1.4/700·설명16px/1.4·탭56px, 대표 이미지72px/간격20px, 본문2열은24px 간격과320px 소식 영역, 본문 최소높이644px을 사용한다. 행사는180px 이미지·24px 간격·정보12px 간격, 소식은20px 패딩·16px 제목 행과 이동 화살표다. 모바일은48px 식별 이미지·전체 폭 가입 버튼·96px 행사 이미지·한 열 소식 순서다.
- 개설 신청 `HQQqP`: 상단 경로62px, 본문 앞24px, 폼760px/패딩28px/반경24px, 제목과 설명8px, 사진104px·옆20px, 입력48px·소개96px, 제출168×48px을 원본에서 가져왔다. 내용 없는 신청 내역은 숨기되 조회 오류·실제 내역은 표시한다. 모바일은 폼패딩20px과 줄바꿈으로 대응한다.

- 취미 홈 `CvUym`: PC 탭 높이56px, 회원·랭킹의 아이콘은 문구 뒤, 게시글 미리보기는40px 행·14px 본문·공지700/일반400으로 구분한다. 가입 행동은 공통 Pencil CTA 그라데이션을 사용하고, 우측 내 활동의 이동 화살표는 문구 바로 뒤에 배치한다.

- 출석 `U3Bip/g9zuQV`: 기존 `/images/community-stamps/daily-checkin.png`가 승인 원본과 동일하므로 이 화면에서 사용한다. 소개 제목과 연속 출석 수를 분리하고 PC 소개160px·112px 도장·7열150px 카드·320×48px 행동을 적용한다. 모바일은 제목 아이콘·4+3열124px 카드·전체 폭48px 행동, PC 화면 최소 높이900px(헤더 포함)으로 맞춘다. 경로 제목은 PC18px/모바일20px이며 기존 보상·중복방지·시작일 제한 로직은 유지한다.

- 모임 MY `R3Nnz/BdXrj`: PC 본문 최대1440px·우측264px·간격56px·상단 경로62px, 패스포트 제목→설명 카드→지갑 순서를 사용한다. 패스포트 카드 제목24px, 활동 제목18px, PC 행동320×48px·모바일 전체 폭48px을 유지한다. 가입·댓글·출석 도장은 승인된 기존 community-stamps PNG를 사용하되 실제 획득 기록과 선택한 발급 패스포트에만 노출한다. 기존 최애 MY에는 적용하지 않는다.

- 플랫폼 개설 심사 `jzqEs`: 모임 개설 신청에만 전체 폭 관리자 셸을 적용한다. 104px 어두운 헤더·32px 본문 패딩·400px 목록·24px 열 간격·24px 상세 패딩을 원본 Export에서 가져왔다. 대기 탭에는 접수·검토 중·보완 요청, 처리 완료에는 승인·반려를 포함한다. 상세는160px 항목명과20px 간격, 96px 사유 입력, 320×48px 승인 행동과44px 반려 행동으로 구성한다. 모바일은20px 패딩·단일 열이다. 실제 신청 데이터만 표시하며 승인 대상 크리에이터와 반려 사유 검증, 조회 전용 관리자 제한을 유지한다. 검토 시작·보완 요청은 추가 처리에 보존한다. `group-admin.module.css`와 `GroupAdminShell`이 이 화면만 소유하며 기존 운영 관리자 셸에는 적용하지 않는다.

- 모임 관리자 홈 `w4p3t`는 `/admin/groups/overview`에 대응한다. 기존 플랫폼 관리자 인증을 통과한 뒤에만 표시하고, 모임 출시 플래그가 꺼져 있으면 경로를 제공하지 않는다. 기존104px 관리자 헤더 아래32px 패딩·240px 왼쪽 메뉴·24px 간격, 오른쪽3개 검토 항목을 원본처럼 배치한다. 항목은20px 외부 패딩·12px 행 패딩·44px 아이콘 영역·16px 제목·13px 설명이다. 새 집계 수를 만들지 않고 기존 신청·공식 행사·신고·관리 기록 경로로 연결한다. 모바일은20px 패딩·상단2열 메뉴·단일 열 항목으로 줄인다.

- 모임 팬 홈 모바일 `Ov8dx`의 영상 미리보기는 한 개의 카드가 본문 전체 폭을 사용한다. `CreatorMediaPanel`의 `.compactPreview .previewGrid`가 767px 이하에서 한 열을 소유하며, 일반 참여 미디어의 두 열 규칙에 덮이지 않도록 한다. 기존 최애 화면의 그리드는 유지한다.

- 팬 홈 `dan0e`는 상단 이미지80px·20px 간격, 접속 현황72px·12×16px 패딩·현재/오늘 각각240px 지표와 설명을 사용한다. `Ov8dx`에서는 기존 한 줄 숫자 요약을 유지한다. 수치는 실제 presence 응답만 사용하며 아티스트 공개 설정을 우회하지 않는다. PC 본문 간격24px·우측312px/패딩20px으로 맞추고, 기존 최애 레이아웃에는 적용하지 않는다.

- 팬 홈 `dan0e` 제목 옆 즐겨찾기 별은44px 터치 영역·22px 아이콘으로 기존 모임 bookmark API에 연결한다. `GroupBookmarkAction`을 더보기 메뉴와 공유하며 저장 상태·쓰기 실패·비로그인 비활성 상태를 유지한다. `Ov8dx`에서는 별을 제목에 중복 노출하지 않고 더보기 메뉴에서 제공한다.

- 활동 허브 `M1oOtS/dIlgE`는 팬 인증·이벤트·미션·추첨의 목적별 카드와 컬렉션 링크를 먼저 제공한다. PC2열/16px 간격/24px 패딩, 모바일1열/16px 패딩이다. `activity` 쿼리로 선택한 기존 목록을 열고 돌아올 때 탭·언어를 보존한다. 비밀방·활동에서는 원본의 간단한 헤더(PC44px 이미지·20px 제목, 모바일 제목만)를 사용하고 접속 현황은 홈에만 표시한다.

- 비밀방 목록 `Msd7H/sPifp`의 방 카드는 PC24px·모바일16px 패딩, 16px 내부 간격, 16px/24px 제목을 적용한다. 열린 방은 대화 아이콘과 최근 메시지·읽지 않은 수를 표시하고, 서버가 입장을 허용하지 않은 방은 미리보기·읽지 않은 수를 숨긴다. 입장 조건 카드와 동일 데이터 비교는 후속 검증 대상이다.

- 비밀방 입장 조건 카드와 빈 대화 문구를 추가했다. 조건은 실제 방의 최소 등급에서 표시하며 여러 등급이면 방 이름을 병기한다. 확인 버튼은 인증·등급 이동을 펼치고 모바일에서 전체 폭44px 높이를 사용한다. dev 두 팬페이지에는 Gold 방 두 개씩을 추가했다. 실제 인증 계정의 동일 읽지 않은 수·메시지 상태 비교는 아직 남아 있다.

- 비밀방 접근 실패는 HTTP401 로그인,403 가입,404 페이지 목록,그 외 재시도로 구분한다. 기존 서버 권한을 유지하며 접근 오류를 빈 대화 상태로 표시하지 않는다. 로그인 복귀 경로는 원래 팬페이지의 비밀방과 언어를 보존한다.

### Custom social sign-in preparation · 2026-11-02

Kakao/WeChat sign-in is gated off by default. Enabled provider buttons reuse the existing 90%-width, minimum 52px, White outlined pill treatment and 3px Near Black focus outline, with provider names in each locale; they do not alter the Google artwork. The focused email-link step uses the existing 440px task width, 20px mobile / 24px desktop section heading, 16px explanatory text, 14px field labels, 48px fields with 16px input text, 12px corners and 16px related-control gaps. Errors are associated with inputs and announced. Existing-account sign-in links live in Settings → Account and reuse `FanAction` with 32px mobile / 48px desktop section spacing; notification consent is a separate surface. OAuth account linking keeps the same DID and embedded EVM wallet. Actual browser verification and release evidence must distinguish local fixtures from live enabled authentication.

- 비밀방 대화 `EU2Nf`는 선택한 방의 제목·방 전환 메뉴·380px 스크롤 대화 영역·48px 입력창으로 분리한다. PC24px·모바일16px 대화 패딩,20px 메시지 간격을 사용한다. 내 메시지는 서버가 인증된 회원 ID와 작성자를 비교해 결정하고 오른쪽 연분홍 말풍선으로 표시한다. 전송 실패 상태와 조회 오류를 분리해 새 조회가 실패 안내를 지우지 않게 한다. 참여 회원·아티스트 표시와 읽기 전용 운영자 발언은 후속 구현이며 원본 완전 일치로 판정하지 않는다.

- 비밀방 대화의 아티스트 표시는 `group_artist_bindings`에 근거하며 공개 아바타 URL을 재사용한다. 참여 회원은 해당 방의 읽기·작성 기록이 있고 현재 입장 가능한 회원 중 차단 관계와 아티스트를 제외한 최대20명이다. PC288px 보조 영역·32px 간격·24px 패딩, 모바일 아래 단일 열·16px 패딩을 사용한다. 기존 인증·방 접근 판정 이후에만 이 정보를 반환한다. 실제 dev 인증 fixture와 전체 원본 비교는 별도 검증 대상이다.

### Regional social sign-in preparation · 2026-11-02

Extend the fixed sign-in registry to LINE, Facebook and Naver while preserving the existing Google, Apple, Kakao and WeChat positions. Enabled LINE/Facebook/Naver methods live in a default-collapsed “Other ways to sign in” group; omit its trigger when all three are disabled. The disclosure has `aria-expanded`/`aria-controls`, a persistent hidden panel and native keyboard behavior. Reuse the current outlined sign-in button role with 16px group spacing and the existing mobile/desktop widths. Settings → Account reuses its existing account-link section for all five methods. All five remain off under Cognito; no additional social providers are in this preparation scope. Native LINE uses SDK `line` and linked-account type `line_oauth`; provider email does not bypass OTP verification.
- 읽기 전용 비밀방 `aWY6S`는 기존 입장 조건을 충족한 같은 페이지 운영진·아티스트만 입력할 수 있다. 서버가 메시지 조회마다 `canSend`를 반환하고 UI는 명시적인 false를 우선한다. 권한 회수 후 조회 실패가 이어져도 입력을 다시 열지 않는다. 원본의 대화·입력 크기와 공통 컴포넌트를 유지한다. PC1440·모바일390 로컬 fixture의 읽기 전용/운영자 입력 상태를 확인했으며, 실제 dev 인증 계정 검증은 남아 있다.

- 행사 참여 `VEfCi`/`qbarG`의 제목·상태·일정·장소는 동일 요약 영역에 배치한다. 원본 사진은 PC300×200·모바일96×64 contain, PC24px·모바일16px 패딩과 간격을 사용한다. 1440/768/390px에서 원본 비율·인물 잘림 없이 확인했다. 모임 내비게이션을 유지하고 QR은 참가 확정 후 버튼을 열 때 조회한다. 현장 미션·후기 행동 카드와 모든 행사 상태의 원본 일치는 아직 후속 범위다.

- 행사 참여의 행동은 원본 `VEfCi`/`qbarG`처럼 티켓·현장 미션·후기의 3열(모바일1열)로 구성한다. PC카드 최소232px/24px 패딩, 모바일16px 패딩, 카드 간격16px, 내부12px, 버튼 최소48px와 중앙 아이콘·문구 묶음을 사용한다. 서버의 ticketAvailable/canReview와 참가 상태로 행동을 제한한다. 현장 QR은 기존 카메라·이미지 업로드를 재사용하되 같은 origin·같은 모임의 미션 상세 경로만 허용하고 쿼리/해시 유입을 차단 또는 제거한다. 스캔은 미션으로 이동할 뿐 출석·보상을 자동 지급하지 않는다. 카메라 실기기 검증과 모든 행사 상태 비교는 아직 남아 있다.

- 행사 승인 대기·신청 마감·행사 취소(`HNDKv`/`XIfOn`/`Q8M9AR`)는 아이콘과 제목·설명·행사 이동으로 구분한다. 상태 카드 PC24px/모바일16px 패딩,16px 간격,제목24px/모바일20px,본문16px·1.5줄높이를 사용한다. 취소 상태를 승인 대기보다 우선하며 확정 참가자의 마감 이후 티켓 행동은 유지한다. 1440px 승인 대기와390px 취소·대기 로컬 화면을 직접 확인했다. 전체 행사 상태 및 실제 dev 인증 계정 검증은 미완료다.

- QR 티켓 `b97Jl`은 원본처럼 왼쪽 아이콘 제목, 중앙 QR, 행사명, 참가자 순서다. 카드 최대640px/32px 패딩/20px 모서리, 모바일16px 패딩, QR194px, 행사명16/24px, 참가자14/21px를 사용한다. 승인 대기·마감·취소·체크인 완료 상태 카드도 세로형·동일 폭/패딩으로 원본 구조를 맞췄다(앞선 가로형 상태 규칙 대체). 완료 피드백은48px 연녹색 배경의 체크 아이콘과 미션/후기 행동을 제공하되 서버의 후기 자격을 유지한다. 참가자 이름은 기존 본인 티켓 권한 검사 뒤에만 반환하며 없으면 생략한다. PC1440/모바일390의 로컬 화면을 원본 Export와 비교했다. 실제 카메라 인식·실제 dev 계정의 티켓은 미검증이다.

- 추첨 상세 `mF4bM`의 경품 이미지 슬롯은 원본 491.42×328px과 같은 3:2 비율이며 화면 폭에 맞춰 줄어든다. `group-raffle/raffle.module.css`가 소유하고, 고정 280/220px 높이·추가 분홍 배경을 제거한다. 상품 전체와 로고는 contain으로 보존하며 이미지가 없으면 슬롯을 만들지 않는다.
- 추첨 상세는 별도 중복 섹션 제목 없이 경품 이미지와 추첨 제목으로 시작한다. PC 경품 열491.42px·열간32px·보조 영역288px,1024px미만은 경품→응모→보조 영역으로 쌓는다. `GroupActivityFrame`의 기본 행사·미션 배치는 유지한다.

### 2026-11-02 local review — current Pencil header and featured carousel
User-selected source nodes `uTQNU`, `C1QkP`, `koi97`, `FP2ON`, `xzfqF`, `n325b`, `qADEF` supersede earlier header/banner geometry in the groups-enabled shell. Source extracted through Pencil `Export(..., "html-css", ..., {includeLayerIds:true})`. Header: HOME / 모임 / 최애 / MY with icons and active pink underline; account actions move language and notifications into a menu. Desktop header 88px, nav 488×64px; mobile header 68px. Carousel source `pjusn` / `tbCyx`: desktop slide 960×480px, 24px next-slide gap, bottom gradient with white action; mobile slide 300×349px, 200px photograph and dark copy region, 12px gap. Carousel CSS is copied from export inline declarations with source-node comments; responsive resets, runtime image binding, semantic HTML and interactions are explicit adaptations. No autoplay. Language dialog: desktop 960px/3 columns/32px padding; mobile 358px/2 columns/20px padding with scroll containment. Production gate-off shell remains unchanged; this work is local-only pending user review, no new dev or production deployment.
Header icon/font fidelity correction: uTQNU SVG path geometry (including phosphor coins-fill) is copied into pencil-header-icon.tsx, replacing approximate package icons in the groups header/account menu. Exact exported PretendardUI650.ttf and PretendardUI850.ttf are bundled under public/fonts/pencil and used at font-weight:400 as declared by the export, with synthesis disabled. Desktop navigation icon size is24px; point/menu icons20px. This overrides previous variable-font approximation only in the groups-enabled shell.

### I591ou artist-home reproduction (2026-11-02, local review)

- Source: `outputs/kyaa-fanpage-implementation-20261101/kyaa-fanpage.pen`, node `I591ou`, inspected with Pencil CLI. This change is under local review, not evidence of deployment.
- Creator home keeps a 312px unpadded aside and 32px column gap. The passport heading precedes the artwork; its final action is a text link. The video preview is borderless with 16px thumbnail corners, 8px title spacing and a bottom-left LIVE badge. Board titles use 16px regular text, 52px minimum rows and a compact Spectrum writing action.
- Local server root selects the NCHIVE fixture. Source images are copied unchanged from the Pencil assets; sample presence, posts, passport and live status are not production facts. Other explicit fixture routes remain available.

- 2026-11-02 artist-home follow-up: passport artwork fills the card content width (278px in the 312px desktop aside), replacing its 180px cap. Keep the entire book, portrait and stamps together at their natural ratio.

- 2026-11-02 account identity: keep points, avatar and menu trigger in the desktop header; show the provided profile image and nickname as the first account-menu item instead. Long nicknames wrap in the menu, including on mobile.

### 2026-11-02 팬 페이지 표·사이드바 정렬
사용자 지정 MApsZ, CSYpc, Z46DUz, QEXS7, qIhmn을 갱신하고 I591ou와 로컬 구현에 적용한다. 표 제목은 왼쪽, 작성자·작성일·조회·추천은 헤더와 본문 모두 중앙 정렬한다. 메타 열 너비는 112/96/64/64px, 셀 좌우 여백은 8px이다. 사이드바 이동 행은 최소 64px, 상하 여백 12px, 아이콘과 화살표 20px, 열 간격 12px이다. 제목 아래와 행 사이 8px, 그룹 사이와 구분선 위아래는 24px이다. 긴 문구는 줄바꿈하고 행 높이가 늘어난다. 팬등급과 추첨에도 이동 화살표를 표시한다.

### 2026-11-02 전체 Pencil 로컬 속성 대조

- 현재 원본 `kyaa-fanpage.pen` 239개 최상위 항목(제품 화면·상태215, 시스템·참고24)을 Pencil CLI로 확인했다. 기존205개 연결표는 최신 원본의 완전한 검수 근거가 아니다. `docs/design/groups-production-coverage.json`의 항목별 로컬 경로·미검증 상태를 기준으로 추적한다.
- `Nev5n` 공통 팬 헤더와 최신 화면을 우선하여 게시판·비밀방·활동에도 팬 정체성 및 접속 현황을 유지한다. 위의 간단한 헤더/접속 현황은 홈에만 표시 규칙을 대체한다. `CreatorGroupHeader`가 공통 소유자이다.
- `W0Xri/X7FfJ` 게시판은 흰 인기글 영역, 분홍 댓글 수, 본문 첫 줄 제목, PC20/모바일5 목록,44px 페이지 이동,288px 활동 레일을 사용한다. 기존 본문 저장 계약과 업로드 허용 범위를 유지한다. `KJKkH/wCL5S` 첨부는 원본 비율·이전/다음·썸네일·전체 보기로 연결한다.
- `R3Nnz/BdXrj` MY는 프로필 헤더, 패스포트·지갑, 최애 목록, 활동·획득 도장 순서이다. 패스포트 펼침 이미지는 원본 장식 이미지이며 실제 획득 도장과 구분한다. `CFdD7/IMzcm` 지갑의 수량·교환 후 잔액은 기존 지갑 계산을 사용한다.
- `KUEOR/XCSLO/F0pbG9/G5Sebj` 프로필은 MY 이동과 분리한400px(모바일358px) 패널이며 QR96, 스캔120 아이콘을 사용한다. 원본의 연결 전 QR 표시는 발급·촬영 성공을 뜻하지 않는다. `ykQWh/zcRQc` 메시지는320px 탐색·24px 간격, 실제 설정 저장과 로컬 전용 첨부 미리보기를 구분한다.
- `EqCqG/mC9VD/S38b4C` 캡슐은 데스크톱560px·모바일180px 기계와 실제 응모권/커밋된 결과 영수증을 사용한다. 없는 과거 기록·수령API를 구현했다고 표시하지 않는다.
- `zBRpr` 미션 허브는180px 출석 원본 이미지·사진/텍스트 미션·288px 참여 레일을 사용하며 기존 미션 상세를 별도로 유지한다. `ZwPUD` 컬렉션은556.27px 이미지·24px 간격·상품 선택·168×48px 행동이다. 원본 분류는 로컬 fixture에서 명시적으로 제공하고 서버 필드를 추측하지 않는다.
- 이 작업의 데이터·댓글·첨부 선택은 로컬 검증 fixture를 포함한다. 실제 서비스 반영이나 외부 API 연동 완료의 근거로 사용하지 않는다.

### 2026-11-02 Pencil 속성 마감 · 로컬 검증 범위

- 제목용 `Pretendard UI 550/650/850` 폰트는 해당 파일의 실제 굵기를 사용하고 합성 굵기를 만들지 않는다. 제목별 크기·행간은 원본 역할로 지정하며, 공통 GroupShell/관리자 셸은 `Pretendard Variable`을 기본 본문 서체로 사용한다. 정의되지 않은 CSS 변수를 글꼴 fallback 목록에 넣지 않는다.
- `XnL4z` 정렬 메뉴는 200px, 안쪽8px, 항목 사이4px, 모서리12px, 항목44px이다. 키보드 선택과 Esc 닫기를 제공한다. `QyrvD` 선택 행은 높이72px, 좌우20px, 모서리12px, 제목16/24와 오른쪽 분류13/21을 사용한다.
- `Urthu/wCL5S` 작성 화면은 로컬 전용 원본 첨부 예시를 표시한다. 일반 게시글의 기존 사진4개·WAVE 영상 정책은 변경하지 않는다. `X7FfJ`는 본문→사진→반응→댓글→다른 글 순서이며 큰 사진720×540 contain, 댓글 사진120×90, 영상 포스터140×248.89를 사용한다. 원본 영상 포스터를 실제 동영상 재생 성공으로 표시하지 않는다.
- 원본에만 있는 조회 수·상대 시각·댓글 첨부·순위 예시는 로컬 presentation/fixture로 제공한다. 원본의 선택·빈 상태·실패·처리 중·결과 패널145개는 명시적인 React 상태 패널이며, 결제·전송·권한 변경 등 서버 처리 완료의 증거가 아니다. 댓글 첨부 선택은 파일명 표시까지의 로컬 예시이며 실제 업로드는 포함하지 않는다.
- `kqlrO`는 서로 다른 관리자 화면을 나란히 배치한4480px 구성도다. 앱에서는 그 안의 개별 관리 화면으로 연결하며, 구성도 자체를 가로로 긴 서비스 화면으로 만들지 않는다.200px 정렬 팝업과640px 패널의 원본 크기는 컴포넌트 치수이며 브라우저 최소 폭을 뜻하지 않는다.
- 검증은 항목별 연결표에 원본 치수·390/1440 렌더, 측정한 속성, 키보드 동작 및 증거 파일을 기록한다. 화면 폭·여백·간격·모서리 검사와 실제 시각 검수를 구분한다. 전체 파일의 모든 중첩 노드에 대한 자동 픽셀 동일성 인증으로 확대하지 않는다.


### 2026-11-02 22:16 최신 Pencil 재추출 · localhost 전용 계약

이번 사용자 지정 원본은 `kyaa-fanpage.pen`의 330개 루트다. 이전 239/327개 기준보다 이 항목을 우선한다. 제품 화면·상태 291개, 디자인 시스템·설계 참고32개, 명시적 보관7개를 분리한다. 추출 HTML/CSS·노드 속성·323개 표시 루트 PNG는 `byus/work/fanpage-visual-diff-20261102/reextract-221612/`에 보존하고, 경로·검증 근거는 `docs/design/groups-production-coverage.json`에 연결한다.

- 전역 탐색은 HOME / 모임 / 덕질 / MY이며 팬페이지는 모임 활성 상태다. 팬페이지·취미·브랜드 내부 메뉴의 네 번째 항목은 캘린더다. 이름은 계정 메뉴 안에 두고 프로필/QR과 MY 이동을 구분한다. 모바일 상단은 알림과 언어 선택을 사용한다.
- 새 M/A/E/R/B 상세53개는 CLI Export HTML+CSS를 JSX로 직접 변환한 코드가 소유한다. 추출 노드 ID·원래 스타일을 유지하고 입력·선택·동작을 시맨틱 컨트롤에 연결한다. 비교 보드10개는 여러 대안 상태를 한 화면에 동시에 쌓지 않고 개별 상태로 제공한다.
- `AnIra/hSUpJ`: 댓글 아바타40/답글32, 가로 간격12, 답글 들여쓰기20, PC입력64·등록96×44. 모바일은 하단48px 입력과44px 전송 버튼, 답글 대상·취소를 사용한다. 댓글 좋아요·답글 접기·작성은 로컬 상태이며 별도 서버 저장 완료를 뜻하지 않는다.
- `EqCqG`: 기계는 가변 너비, 조작 영역320, 수량 선택은 세로이며 항목 폭272, 주 행동은 내용에 맞춘 높이45다. 예전560px 기계·376px 조작 영역 계약을 대체한다. `mC9VD`의336px 빈 헤더 잔여 공간은 재현하지 않는다.
- `Qp3M9`는 참가자 관리·공식 이벤트 신청·지원자료 화면이다. 일반 행사 생성폼으로 대체하지 않는다. 공식 신청은16px 간격의 두 행과8px label 간격을 사용한다. `z7s5v`는 상품·일정, 응모 규칙, 개설 전 확인의3단계 화면이며 기존 검증/요청 경로를 재사용한다. `QyrvD/z7s5v`의1064px 고정 폭은 제거하고 PC본문1360px을 채운다.
- 최신 변경된 행동·필터 가로 행은 `align-items:center`다. 패널 본문 또는 세로 행동 영역까지 일괄 가운데 정렬하지 않는다. `W0Xri`의 긴 제목은 PC에서 줄바꿈과 행 높이 확장을 허용한다. MY 바로가기 및 모바일 계정 도구도 같은 세로 정렬을 사용한다.
- 캘린더 원본에 명시된 기존 WEB 우선 지시를 따른다. 기존 캘린더·LIVE 예약·일반 일정 구독을 재사용하며 초안의 통합 예약폼은 만들지 않는다. 일정 fixture와 예시 출처는 실제 일정·공식 출처 보증이 아니다.
- 네이티브 날짜/파일 입력의 OS표시와 실제 API 계약에 없는 조회수·상대 시각·예시 인원 차이는 데이터/접근성 적응으로 구분한다. 이 로컬 검증은 실제 포인트 지급·신고/승인 처리·QR촬영·운영 배포를 포함하지 않는다. 원본 폭 및390/1440에서 렌더·해당 속성·상호작용·키보드·넘침을 검사하되 모든 중첩 DOM값의 완전한 자동 픽셀 동일성으로 확대하지 않는다.

### 2026-11-02 22:35 최신 재추출 · 작업 표시 방식 우선 적용

사용자의 재추출 요청에 따라 현재 원본은339개 루트로 갱신한다(제품299, 참고32, 상태 비교 묶음1, 보관7). 직전330개 대비 신규9·변경39·동일284·비표시 보관7이며, 신규8개 제품은 모바일 확인 시트다. 아래 LNwys 계약은 앞의 일반 페이지형 작업·960px 언어창·기존 독립 상태 카드 계약보다 우선한다.

- `LNwys/NqFPW/x9Cya/yf60n`: 조회·탐색은 페이지, 짧은 설정·초대·확인·전환은 PC 모달/모바일 시트, 인증·보완·후기는 PC 모달/모바일 전체 화면 작성이다. 긴 본문만 스크롤하고 제목과 하단 행동은 유지한다.
- M02/M04/A04/E01은 PC640px·모바일 전체 화면, A05/R01/R04/R05는 PC560px·모바일 하단 시트다. 모달 radius16, 시트는 위쪽 radius16 및24px 핸들 영역(36×4)을 사용한다. PC 본문24·모바일16, 간격16이다. 제목은 Pretendard Variable700, PC24/34·모바일20/28로 기존 UI850 제목 스타일과 구분한다.
- 헤더 외곽76px, 일반 하단 행동80px, 원본의 작은44px 행동이 있는 확인창은 하단76px이다. Export HTML의 content-box와 외곽 치수 중복은 border-box/100%로 보정한다. 원본 본문·버튼의 세부 스타일은 직접 추출해 유지한다.
- 언어 선택은 PC640px·2열, 모바일 전체 폭 하단 시트이며 선택 즉시 적용한다. 저장 버튼을 추가하지 않는다. 페이지 접속 공개와 MY 아티스트 공개 설정은560px 작업 모달/모바일 시트이며 기존 GET/PUT·권한 판단을 유지한다.
- native dialog 또는 기존 AccessibleOverlay가 배경 스크롤 잠금·초점 가두기·복귀·Escape를 담당한다. 작성창 닫기는 같은 창 안의 확인 단계로 바꿔 창을 중첩하지 않는다. 브라우저 이탈에는 native beforeunload 보호를 적용하고, 이탈 확정 시 현재 작성 초안만 정리한다. 원래 호출 경로·초점·스크롤 위치를 복원하며 실패 메시지와 첨부 상태는 작업 본문 안에서 입력을 보존한다.
- 새 확인16개는 호출 맥락(게시글 상세·작성·추첨·운영자 관리·행사) 위에 표시한다. 배경 참조31개는 별도 제품 화면으로 세지 않는다. 확인·초대·적립 등의 로컬 UI 콜백은 실제 서버 처리 완료를 뜻하지 않는다.
- 현재 추출 및 수정 근거: `byus/work/fanpage-visual-diff-20261102/reextract-223529/`. 변경41개 제품에 대해 작업16개, 확인/전환20개, 언어/공개설정5개로 나누어 원본 폭·390/1440·짧은 화면 높이·본문 스크롤·포커스·저장/취소를 검증한다. 바뀌지 않은284개 루트의 근거는 재사용한다.

현재 작업 본문의 가운데 정렬 테두리는 Export content-box 중복을 제거해 원본 외곽 크기로 복원한다(체크 행44px). 모바일 하단은 원본에 따라 취소88px+나머지 기본 행동이며, R05 가입 시트는 두 버튼169px를 유지한다. 원본에 호출 배경이 포함된 모바일 시트는 해당 배경도 표시한다. 네이티브 select/checkbox/date의 운영체제별 외형 차이는 허용하되 행·버튼 외곽과 간격은 원본을 따른다.

### 2026-11-03 cycle01 — current Pencil source and dev integration

The 23:43 KST CLI extraction supersedes the 339-root inventory: 342 roots, comprising 301 product screens/states, 33 references, one state reference and seven archives. Evidence is in `byus/work/pen-dev-loop-20261102/cycle-01/`. The user has authorized actual dev API/DB integration; production deployment remains excluded. Local fixture screenshots and actual service verification are recorded separately in the coverage ledger.

- Messages (`ykQWh`, `zcRQc`, `SBFKc`, `X7aUHx`): desktop rail 336px, search 48px; separate mobile list/conversation, header 72px, message padding 24px/16px, gap 16px, attachment 44px, input 48px, send 96px/44px. The social screen owns this layout and reuses authenticated DM media APIs.
- Rooms (`Msd7H`, `sPifp`): entry conditions precede unboxed 104px/158px rows. Collections (`ZwPUD`, `vkvq6`): photo 600×400px desktop and 358×238.67px mobile, content gap 40px/20px, action 240px/full width. Actual API data owns names, counts, permissions, available selections and destinations.
- Members retain real membership/ranking navigation and permissions. Remove duplicate panel padding, use search 320px and tabs 144px; source ranking rows are 79px. Source example tiers or owner labels must not replace real returned values.
- Shared detail identity wrappers use the group page container without inherited 70dvh minimum height. M01/M03 label width is 180px with 24px desktop gap and stacked 8px mobile gap. M02 textarea is 112px; application description is 144px with 16px padding; board comment input is 96px. A01 date fields use two columns with 16px gap, stacking on mobile.
- Native controls, actual data and preserved service actions may differ from fixture examples; each exception and missing API contract remains explicit. Render/geometry checks do not certify every nested pixel or physical camera behavior.

### Gift applications (2026-11-03, Pencil current-002 A06/A07)

Gift operator screens use the exported A06 registration properties (PC AbUp2 / mobile v0nqnh) and current-002 A07 status properties (PC fBPhw / mobile G4ayh). Owner: `features/groups/ui/group-gifts.module.css`. Main width is 960px at 1440, mobile horizontal padding 16px; content top spacing 32/16px, title 32/48px PC and 24/36px mobile at weight400, section titles 24/20px bold with normal line height. Form groups use20px separation,16px internal gaps; controls48px, multiline96px, radius12px, image container20px padding and12px gap. Primary action280px PC/full width mobile,48px tall. Status card uses20px vertical padding,12px gap,24/36px bold heading and16/24px reason. Shared header and black operation band retain real page name. Fulfillment is an enum select and upload/request/error states are interactive extensions of the exported form; successful requests preserve persisted revision/status. Only the application's current saved status is shown. Approved raffle selection and admin review use existing common controls. Uploaded images remain private until linked to a published visible raffle; replacing a gift revision preserves an already published image snapshot.

### 2026-11-03 current-002 — refreshed Pencil properties

Latest CLI HTML/PNG source: `byus/work/pen-dev-loop-20261102/reextract-current-002/` (342 roots; 92 changed, 243 unchanged, 7 archived). The requested source overrides earlier layout values only for these changes.

- MY R3Nnz/BdXrj: balances stack with12px gap and8px vertical row padding; label/use stack4px, 18px icon, amount right aligned without a unit space. `my-screen.module.css` owns this layout.
- Wallet CFdD7/IMzcm: desktop asset cards have16px padding,8px gap,14/21 label,28/35 balance and24px icon; mobile rows have12px vertical padding,16px list gap,22px icon,16/22 label and28/39 balance. Mobile history stacks description and value with4px gap and16px vertical padding. `wallet.module.css` applies the balance rules to both service data and local fixtures.
- Profile KUEOR/XCSLO: copy-link stays inside the QR block; a separate friend-add section has12px gap and a48px gradient scan action. Desktop backdrop starts at0 and panel is inset88px top/40px right. Real QR expiry, error, clipboard, permissions and request behavior remain authoritative.
- Event VEfCi/qbarG: action cards use1px #e4e1e6 border,12px radius,224px desktop minimum height and48px actions; descriptions flex to align actions.

Evidence: current-002/parent-render (390/1440), associated computed-style assertions, focused MY/profile/wallet tests. Actual values and allowed actions come from APIs; screenshots use explicitly identified fixtures. Physical camera scanning is not certified by browser fixtures.

### 2026-11-03 최신 Pencil 재추출 003

- 원본 `kyaa-fanpage.pen`을 CLI HTML+CSS로 다시 추출: 352개 루트, 직전 추출 대비 신규 10개·변경 33개·동일 302개·비렌더 7개. 캔버스 구역 안내도 변경 수에 포함된다.
- 알림 저장 실패(hKn1B/MDfpG)는 선택값을 유지하며 16/24px `#9F1239` 안내와 ‘다시 저장’을 표시한다. 초대 동의(f2Ojl/rvIf6)의 ‘나중에’는 닫기, 본문의 44px ‘초대 거절’은 실제 거절 요청이다.
- 행사 신청 전(bzBcV/pkZ5D)은 신청 전 배지와 48px 참가 신청, 모바일 전체 너비 버튼을 사용한다. 확정·대기·검토 가능 여부는 서버 응답을 따른다. 제목은 ‘행사 상세’, 모바일 모임 이미지 48px/제목 20/28px, PC 이미지 80px/제목 32/40px이다. 현재 실제 서비스 내비게이션의 활동 선택을 유지한다.
- MY의 알림·문의·설정, 패스포트·지갑·활동 목록 아이콘을 원본에 맞춘다. 실제 데이터와 유효한 QR을 유지한다.
- A08/A09는 `/pages/groups/[pageId]/events/[eventId]/support` 및 `view=history`에서 기존 참석·후기·정산 검토 API를 사용한다. 960px 본문, PC 32/48px·모바일 24/36px 제목, 20px 간격을 사용한다. 원본 1만원 산식은 명시된 예시이며 지급·정책 확정·새 원장 처리를 의미하지 않는다. 제출 설명/증빙 URL 입력은 기존 API를 위한 기능적 확장이다.
- 확인/결과 상태는 실제 성공·실패 조건에 연결한다. 서버에 없는 광고 전환 정책과 본인 신고 결과 조회를 완료된 기능처럼 표시하지 않는다.

### Activity proof, survey, review (2026-11-03, Pencil current-003)

`activity-evidence-task.tsx` and `activity-evidence.module.css` own M02 photo proof and event-review inputs. They reuse TaskPanel640px PC/fullscreen mobile, shared76px header and80px actions. Body padding24px PC/16px mobile,16px vertical gap,8px label gap,112px textarea and48px review-title input. Photo attachment has24px padding/16px gap,18/27px normal title and32px icon; optional review attachment uses20px/12px. Current003 A2DH4O/E5rm07 requires a ready photo and original-material confirmation: required label,14/21px helper, disabled action background#EFEFEF/text#777777. L3JHJe/iWg4L error uses#9F1239 outline/helper and re-selection while preserving the description. Successful attachment leaves the temporary upload cleanup pool only after acknowledged persistence. Photo/review history remains private; replacing a current image preserves immutable prior evidence.

M05 (`group-survey-form.tsx`) uses the persisted question and exactly3 options,60px option rows with8px separation,24px controls,112px optional-opinion textarea,20px form gaps and280px PC/full-width mobile action. The page uses the existing real group slug/public creator/header contract; generic mission cover/instruction/reward duplication is omitted for survey. Its fixed mobile navigation is hidden while answering, preserving the source form's unobstructed action. Submission/review forms send their viewed mission/submission revisions; stale state returns conflict and preserves current edits. Current statuses/reasons/rewards and previous revision records come from the API; no source policy example becomes a real reward promise.
- 후속 시각 검수: 행사 신청 전과 A08/A09의 주 행동은 PC 280px, 모바일 전체 너비다. 모바일 규칙을 PC로 확장하지 않는다. 행사 티켓·미션의 빈 접이식 컨테이너는 숨겨 불필요한 grid 간격을 없앤다.

### 2026-11-03 own report states · current-003
`/my/groups/reports` uses exported XlbOv/AYzQG state panels:640px maximum width,24px padding,16px gap,16px corner, #e8e8e8 outline,24/31px Pretendard UI850 title at exported weight400,48px actions with12px corners and14/20px UI650 labels. Source HTML declarations are adapted only for responsive width, semantic buttons and actual report data. Existing created date and expanded resolution/status are functional additions; private or removed targets have no link. Owner:`group-own-reports.module.css`. Source-state panels retain their dedicated640px reading column within the960px page body.

### Group calendars (2026-11-03, Pencil current-003)

`FI1kg` / `euRh2` / `I2EszZ` / `E8m4wq` explicitly require reuse of the existing WEB `/live/calendar` calendar, day list, month art, reservation/detail actions and responsive layout; the hobby frame is placement guidance rather than a replacement visual implementation. `GroupCalendarPanel` embeds `LiveCalendarScreen` under the actual group/creator header, hides other-creator filters and preserves the current group path, locale and query during month navigation. No new visual tokens are introduced. Creator-linked pages use their authorized LIVE identity and schedule slug; other groups use only their own authorized published/cancelled/ended event records. Group event entries retain explicit real event destinations and group identity rather than fabricating LIVE/creator/schedule records. Source example events and empty-state examples never replace API results. Native390px/1440px renders cover fan, hobby and brand with empty/occupied dates; existing WEB calendar regressions remain required.

2026-11-03 Pencil003 cRVyO: reduced-motion state uses the original160px contain capsule, #FFF5FA background, centered34px title line and26px description line. Existing120ms reduced reveal timing is preserved. Mobile qUpqC/HbVi5 and PRK1L/x3FJF confirmations use77px action region and45px primary button (15/21,800); other80px/compact76px action regions remain role-specific.

### Event create/publish/participation (2026-11-03, current-003)
A01 XwD8y/O1pP6 uses32/48px PC and24/36px mobile normal headings,20px form groups,8px labels,16/24px normal label text,48px inputs and96px textarea. Basic order is name,start/end,read-only Asia/Seoul,location,participation instructions; real required registration windows/capacity/approval/image/state remain additional settings rather than invented defaults. Existing schedule-time conversion makes wall time explicitly KST. A02 JhfMg/IybBO reuses actual event-save publication; source item text18/27px normal, actions160px PC/equal mobile with12px gap. E02 nlql7/uGGjp uses real review/check-in status,20px row padding,12px gaps and review action200px PC/full width mobile. Source example states are not substituted for actual API status. Missing linked-mission/cancellation-reason/attendance-request contracts remain explicitly partial; no fake submission, automatic check-in or reward policy is introduced.
- 79000 A01/A02 contract follow-up: the actual authorized paginated mission selector preserves omitted values and clears only on explicit no-link choice. Event editor form occupies the exported960px column rather than inheriting the shared720px form maximum. Cancellation uses source24px divider padding/16px gap/20px700 section title/96px textarea and280px PC/full mobile #9F1239 action. Reason is optional raw text (max1000); persisted reason display comes only from the server. No new reward/refund/check-in policy is implied.

### Profile QR camera access states (2026-11-03, current-003 ae7UT/P0nPX)
Profile QR scanning keeps the existing profile overlay and shared scanner/image-upload flow. Only confirmed unavailable platform capability (insecure context or missing getUserMedia) renders source `카메라 미지원`; only observed Permissions API camera=denied renders `카메라 권한 없음` with source browser-setting guidance/reopen action. Unsupported permission queries and generic library camera errors remain generic. State rows use12px vertical padding/8px gap/1px #E4E1E6 divider,18/27px normal titles,16/24px body and280px PC/full-width mobile retry. Existing profile width is preserved. Mocked390/1440 renders and unit tests cover both states without camera prompts/streams; physical camera capture remains unverified and excluded.

- 2026-11-03 · 컬렉션 상품 URL 조회 실패 `kgWAV`: 실제 상품 URL 조회가 실패한 경우에만 CLI003 원본의 아이콘24px·제목24/31px·본문16/24px·패딩24px·간격16px·반경16px·필드48px·주요 행동48px을 적용한다. 목록 조회 오류와 구분한다. 수동 이미지 URL은 검증 후 기존 `group_image` 업로드로 전환하고 ready 자산만 저장하며, 입력한 제목·판매처 URL과 실패한 저장의 요청 식별자를 보존한다. 원본은 `reextract-current-003/properties/kgWAV.json`; 실제390/1440 로컬 API fixture 검증은 `reextract-current-003/collection-import/checks.json`에 기록한다.

### 2026-11-03 MY 신고 내역 접근

원본 current003 `BdXrj`의 상단 3개 이동에 실제 서비스의 `접수한 신고` 링크를 더해 4개가 됐다. 767px 이하에서는 MY 프로필의 이동 버튼만 2열로 배치해 한 글자씩 줄바꿈되는 문제를 막는다. 버튼 최소 높이 44px와 기존 데스크톱 배치를 유지한다.

### 2026-11-03 비밀방 참여 회원

원본 current003 `EU2Nf`의 참여 회원은 36px 아바타와 회원 정보를 2열로 두고, 프로필 보기 행동을 정보 아래 같은 열에 놓는다. `roomParticipant`의 2열 grid와 `roomProfileAction`의 두 번째 열 배치로 좁은 회원 정보가 한 글자씩 줄바꿈되는 문제를 막는다. 목록 행 높이는 원본 CLI 실제 경계(PC 104px, 모바일 158px)를 유지한다. HTML 내보내기의 content-box 계산으로 추가되는 40px은 실제 Pencil 도형의 높이가 아니다.

- current003 탐색 정렬 버튼은 기존 Source menu를 유지하며 공통 select 배경 화살표를 제거하고 Lucide 화살표 1개만 표시한다. 버튼 접근성 이름은 현재 표시값과 일치한다. 실제 DEV 중복 표시 관찰 뒤390/1440 로컬 정렬 전환과44px hit area를 확인했다.

원본 current003의 추가 확인값을 비밀방에 적용한다: 목록 안내문 16px/normal(`WfS6E`, `xnacl`), PC 대화 열 안쪽 가로 여백 24px(`GAOT0`), PC 보내기 104×48px(`QN7qg`), 참여 회원 제목 16px/24px·700과 20px Users 아이콘(`QxYQ6`, `T5m4W8`). 대화 열 여백과 고정 전송 폭은 1024px 이상에만 적용하며 모바일의 기존 대화 경계를 유지한다.

### M03 current submission (2026-11-03, KUuyw/r5caXR)
Own current submission body/status is shown independently of older history length. Existing owner-scoped mission GET supplies all data; original text/whitespace, server rejection reason, actual completed rewardPoints and existing canSubmit permission are preserved. Current photo/text history uses the source unboxed hierarchy:32/48px PC or24/36px mobile heading,20px vertical gaps,8px status spacing,18/27px normal row titles and16/24px body. Native CLI PNGs show90.5px effective short-row height; exported HTML content-box must not add padding twice. Browser short rows91px with-.5px margin/half-pixel inset divider preserve that interval, while long text/actual photos grow naturally. Only rejected+canSubmit offers source `내용 보완하기` and retains existing revision-aware form. Previous revisions remain separate; no fake group reward-history/result destination is added. Survey/manager review flow and empty M01 stay unchanged.

### 2026-11-03 신청 검토·보완 작업 패널

원본 current003 `CDOu1`/`IrlP8`을 기존 `TaskPanel`로 연결한다. 실제 Pencil CLI 경계는 PC 640×763px(감사 문서의 560px 표기는 오기), 모바일 390×844px 전체 화면이다. 헤더 76px, PC 본문 607px·padding 24px, 모바일 본문 padding 16px, 하단 행동 80px, 설명 입력 96px, 증빙 선택 48px를 적용한다. 요약 제목 18px/27px·본문 16px/24px를 패널 범위에서 명시해 호출 화면의 문단 line-height가 새어들지 않게 한다. 실제 접수 상태와 보완 사유·저장된 설명은 신청자 데이터로 표시하며 예시 상태를 운영 상태로 만들지 않는다. 신청 유형·이름·증빙 주소는 기존 값을 그대로 제출하고, 보완 설명과 증빙만 이 패널에서 편집한다. 실패 재시도의 요청 ID·조회한 revision·초안 보존과 작성 취소 확인은 기존 API 및 공통 작업 패널 계약을 따른다.
- M01↔M03 view-flow correction: the actual mission Next route explicitly whitelists `view=conditions|submission` and defaults to conditions, including after a prior submission. Existing requirements/instructions remain reachable through source `내 제출 내역` / `미션 참여 조건` navigation; locale and appropriate existing query values stay on the same real mission path. A missing own submission falls back to conditions. Only acknowledged own submission POST navigates to submission; failure and manager review PATCH stay in place. This restores flow without claiming the still-separate full M01 template or M06 history/result implementation.

- 2026-11-03 · 팬 게시판 native 첨부 `R2Cts3`/`Urthu`/`wCL5S`/`BXOYV`: published fan group에 연결된 celebrity의 게시글만 서버 정책에 따라 사진10장 또는 영상1개를 허용하고 혼합 첨부를 금지한다. 기존 일반 대상4장·WAVE 행사 게이트는 유지한다. 원본의 사진104×104/영상104×138 썸네일, 모바일 입력48px·본문160px·첨부 행동48px·취소88px/등록 나머지 폭을 해당 작성기에만 적용한다. 첨부 썸네일 cover는 원본에 지정된 미리보기 역할에 한정하며 상세/확대 재생은 실제 비율을 보존한다. 정책 실패 시 기존 첨부를 자르지 않는다. 공개 영상의 optional-viewer 읽기는 별도 fan-post 범위이며 DM/WAVE/draft의 기존 인증 읽기는 유지한다. 실제390/1440 로컬 합성 파일 검증은 `work/pen-dev-loop-20261102/fan-board-media/render/{checks,edit-checks,guest-checks}.json`에 기록한다. 이 근거는 source 전체 페이지를 픽셀 단위로 일치시켰다는 의미는 아니다.

### 2026-11-03 모임 알림 저장 완료 안내

원본 current003 `M6GC6N`/`T4HZxl`의 저장 완료 설명(`cMAi3`, `I0EcQ`)은 실제 Pencil CLI 16px·line-height 1.5·높이 24px다. 실제 알림 설정 PUT 성공 뒤 기존 창 안에 이 문구를 16px/24px, #5d5d5d의 polite live status로 하나만 표시한다. 상태 비교 원본의 대기·성공·실패를 동시에 표시하지 않는다. 새 편집·다시 저장·닫기·재열기에는 완료 표시를 비우고, 모임·계정이 바뀌면 이전 창과 초안을 제거한다. 실패한 선택값 및 성공 뒤 재조회 실패 시 현재 창은 유지한다. 기존 TaskPanel·닫기 행동을 재사용한다.

### M03 earnings navigation (2026-11-03, current-004)

Fresh Pencil desktop CLI extraction is byte-identical to current-003; the older on-disk pen export is not the latest canvas. M03 `W1n8A`/`mshCT` connects the owned submission to the actual group earnings route, preserving locale without forwarding mission-only query parameters. The text action uses the exported 240px desktop/full-width mobile, minimum44px height,8px horizontal padding,12px radius and14/20px Pretendard UI650 label. Long translations may increase height. Global wallet and attendance destinations remain global. Local synthetic-fixture captures at1440/390 show240×44/358×44px actions with no horizontal overflow; this does not certify the destination API or DEV deployment.

### Survey revisit and submitted-history entry (2026-11-03, current-004)

Saved surveys with no further submission permission show the actual mission title and the source `hHsHw:q0NBD` / `jxGJk:BjYCo` already-answered explanation before the existing own-history action. Revisiting is not a fresh submission success. All12 locale strings retain16/24px explanation type; the page title uses32/48px desktop and24/36px mobile, with20px group spacing. Scoped selectors prevent the shared page paragraph rule from changing the source24px line height. Mission-overview submitted-history links explicitly select `view=submission`; participation links retain their existing view, and both preserve locale and other query/hash values. Actual component browser checks cover12 locales×390/1440, history navigation and earnings destination; examples are synthetic local API data.

### M06/M07 actual group earnings (2026-11-03, current-004)

`group-earnings-screen.tsx`, `group-earning-result.tsx` and `group-earnings.module.css` own the real list/detail routes. Direct Pencil CLI native geometry for `OtyQM/EGVrD/tTXMv/Tnes3` defines960px desktop and358px at390px body widths,20px group gaps,32/48px desktop or24/36px mobile headings,18/27px row titles and16/24px body. Short list rows are89/81/89px; result rows81/81/78px, including padding. Long original titles/reasons and localized labels expand naturally. The48px return action is280px desktop/full width mobile. Mobile bottom clearance protects pagination from fixed navigation.

The existing shared group identity and authenticated resource helpers remain authoritative. Scope describes the current group and all returned activity; it does not invent a cross-group filter. Only verified credited amounts are shown as credits; pending/rejected/no-reward/under-review/corrected/raffle-return states are distinct, and null is never converted to0. Original source title/reason is preserved; missing time is not replaced by occurrence time. Detail/back navigation preserves locale and opaque cursor. Source `HMCkB/EMnw2` empty/error/retry treatments are mutually exclusive. Local synthetic-fixture browser evidence covers all12 locales at390/1440, narrow long-text boundaries, errors, session changes, pagination and keyboard focus. This certifies the named component states, not whole shared chrome parity, live DEV data or every historical reward source.

### Group form languages and narrow cancel labels (2026-11-03, current-004)

Gift, invitation/consent, activity-photo/review and survey interface copy is complete for all12 APP_LOCALES; original user/source fields remain unchanged. Gift image removal/method placeholder and invitation Later action use the same locale owners. Editing a gift without changing fulfillment method preserves its stored original fulfillment description rather than replacing it with a translated label. New or explicitly changed methods retain the existing enum-to-description behavior.

The photo/review task alone reduces mobile cancel-button horizontal padding from20px to8px, preserving source88px target width,48px height and14/20px label. This accommodates complete localized words without shrinking text or changing shared TaskPanel actions. Local synthetic fixtures verified144 form cases at390/1440, with48 additional photo/review cancel-label checks after this scoped padding correction. Actual French mobile and desktop consent captures were inspected; this is not native-speaker/legal or whole-shared-shell certification.

### Actual global benefits, capsule and raffle (2026-11-03, current-004)

The groups-enabled `/benefits` route uses `GroupBenefitsScreen` with real wallet, paginated group raffle/mission catalog and public creator data; gate-off keeps the legacy screen. Source `sX58m/ajFsZ` orders balances/history, lucky draws, creator support and point events. Repeated raffle cards share content/metadata/action tracks with CSS subgrid so long titles and optional actual metadata do not misalign actions. No sample campaign promise, fake entry total or invented reward is copied into production. Capsule entry is generic and real published content supplies the remaining cards.

Source `mF4bM/EqCqG/mC9VD/S38b4C` belongs to global 덕질: actual capsule/raffle consumers now use that frame without the old group identity/activity tabs; pageId remains API scope. `/benefits/` descendants retain the same selected global destination. Capsule desktop controls stack as in the source, while translated radio rows expand without text overlap. Existing accounting, consent, confirmation/receipt and direct-wallet-exchange semantics remain unchanged. The global side rail uses only supported destinations, not source-only creator/event examples. Native current004 source PNGs and actual no-preview component captures were inspected; synthetic fixture checks are not deployed wallet writes or full-source parity.

### Existing-data collection presentation (2026-11-03, current-004)

Actual `CreatorGroupCollection`, `GroupDetailScreen` and Activities→Collection bind the stored page name to a localized collection heading and source description. Stored names and product titles remain literal, including `$&` and `{name}`, and sale URLs retain query/hash and common outbound behavior. Source `ZwPUD/vkvq6` uses600×400px desktop and358×238.67px at390px contained artwork,40/20px product gaps and240×48/full-width48px seller actions. Mobile section title is20/26px and product title24/31px. At768–1023px details stack under the maximum600px image instead of collapsing to a narrow column. Existing items/status/selection remain intact.

Source category/product-group samples have no authored persistence contract and are not invented or displayed as actual metadata. New classification management is not part of this implementation; the existing merchandise-view/seller-link function is retained.12locale actual-caller captures, long originals, sold-out/error/retry/pagination and keyboard evidence are scoped to that existing-data composition, not complete source grouping or deployed seller availability.

### M01 mission conditions (2026-11-03, f5sjXn/UvV19)
Direct CLI html-css declarations/native PNGs define the conditions title32/48px PC or24/36px mobile, API mission-title subtitle16/24px, source before-participation heading20/30px, and four16/24px fact rows. Facts use180px labels/24px horizontal gap on PC, stacked8px gap on mobile,16px row padding/20px separation and a half-pixel divider. Native short rows occupy55.5px PC/87.5px mobile effectively (56/88px browser rect minus.5px margin), avoiding exported HTML content-box double padding. Primary/secondary actions are280px PC/full-width mobile and48px tall. Actual API instructions/rewardPoints, including0P, replace examples; source unconfirmed-policy and timing-caveat text remains verbatim. No recognition count, specific payout date or sample reward is inferred. The source member requirement matches the existing SQL membership guard. Own history is disabled when no owned submission exists; submission/revision/view navigation and API permissions remain unchanged. Current shared chrome and actual optional content may differ from source examples; no whole-page100-point claim.

### Home metadata and empty reservations — 2026-11-03

The home fan-board preview keeps its compact thumbnail cards and shows localized like and comment totals as non-interactive, muted 13px metadata with 14px decorative icons. Totals include zero; existing cheer totals map to claps and replies. Empty reserved-LIVE summaries omit the large calendar illustration and use a wrapping inline status/link row with 4–12px gaps, preserving the 44px link target. Populated reservations and passport empty states are unchanged.

### Changha GGGI photography — 2026-11-03

At the user's request, registered Changha identity and hero images use the unedited first photograph from his own Instagram post `DfHkOu8mQkn` (2026-10-30), stored at `/images/celebrities/changha/gggi-20261030.jpg` (1883×2510). Old registered URLs resolve to the new image; future CMS uploads and explicit role removals remain authoritative. Identity and hero crops focus at 50% 28%; square/avatar/passport identity crops use 1.5x about that focus for legible faces; calendar retains its near-top portrait focus. The GGGI campaign keeps green copy on the left and the portrait in the right 46% on desktop; mobile uses a 4:3 face-preserving crop above the existing white information panel. The campaign dialog uses a 3:2 crop at the same focus. Background event lettering is photographic context, not a complete text banner; the person's face and campaign UI copy remain visible. Original social posts and historical event artwork are not rewritten.


### DEV groups experience (2026-11-03)
- Heart support reuses the common Dialog on the originating page; direct support links use a minimal shell and return to the selected creator board. Preserve focus restoration, native modified links and the existing wallet request/receipt contract.
- Benefits use the existing wallet data source and show tickets, hearts, support and events without treating local fixture values as live balances.
- Capsule reveal uses the shared result dialog and supports video failure, skip and reduced motion. Group application uses the shared dialog and retains unsaved-input confirmation.
- Group discovery distinguishes fan pages, hobby groups and brand groups while retaining existing sort and navigation behavior.
