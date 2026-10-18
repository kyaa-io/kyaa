# kyaa wave

Independent, dependency-free static homepage for https://kyaawave.com.

From this directory:

```sh
npm test
npm run build
npm run dev
```

`dev` serves built output at http://localhost:4173 after running the build. Python 3 is only used for local preview; Node builds and tests need no package installation. Deploy the source directory `sites/kyaa-wave` as its own Vercel project. Its `vercel.json` runs `node build.mjs`, serves `dist`, and applies headers and the event collector rewrite. Never change the existing ByUs project root or domain mappings for this app.

KO is `/` and EN is `/en/`. Both are complete static HTML; language links navigate between them. Legacy `?lang=en` and `?lang=ko` links use HTTP redirects on Vercel. Browser storage does not override an explicit language URL. Native dialogs provide local guides and email inquiries. Inquiry data only becomes a draft in the user's mail app; no application is submitted or stored by this site. The 22 October event has closed registration.

Original approved kyaa Soft Cheer SVG is unchanged; `wave` is separate native text. The two WebP community atmosphere images were AI-generated on 2026-10-19. Original PNG masters and provenance are in `outputs/kyaawave-ai-images-20261019` in the main checkout. They are labeled as AI imagery and do not document a past event or its actual venue. The former salon section and event-reference photographs were removed. Google Fonts supplies Noto Sans KR.

Ordinary trusted kyaa.io links receive missing shared UTM defaults (`utm_source=kyaa`) by appending to preserve query/hash bytes. Click and middle-click use the shared anonymous `/api/events` schema; Vercel forwards this path to the existing kyaa.io collector. No authorization or member IDs are sent, no retries occur, and failures do not block navigation. Email links and inquiry drafts are excluded. A plain local HTTP server does not proxy this API; browser verification should intercept it or use the Vercel deployment.

Browser visual, interaction, accessibility and production collector checks are deployment verification tasks; the Node tests cover helper logic and static contracts only.

Search implementation and primary sources: [SEARCH.md](./SEARCH.md).
