# kyaa wave

Independent, dependency-free static homepage for https://kyaawave.com.

From this directory:

```sh
npm test
npm run build
npm run dev
```

`dev` serves built output at http://localhost:4173 after running the build. Python 3 is only used for local preview; Node builds and tests need no package installation. The production branch is `codex/kyaawave-homepage-20261018`. Its `.github/workflows/kyaawave-aws.yml` builds this site and publishes it to private S3 through CloudFront. Commit the change and a new Korean release note, then push that branch. Trusted publishing and notification tools live on `main`; see `infrastructure/aws/wave/README.md` there. The former Vercel project `sallylab/kyaawave` is retained only for rollback after its Git integration is disconnected. Do not change other projects' domain mappings.

KO is `/` and EN is `/en/`. Both are complete static HTML; language links navigate between them. Legacy `?lang=en` and `?lang=ko` links use HTTP redirects on CloudFront. Browser storage does not override an explicit language URL. Native dialogs provide local guides and direct community/partnership inquiries. Inquiries are sent without cookies to the existing kyaa.io WAVE API, which queues a single email to biz@kyaa.io with the three configured Sallylab teammates in CC; replies go to the submitter. Durable idempotency, explicit consent, origin/size/field validation and existing business quotas apply. The primary public address is biz@kyaa.io. A successful response confirms queue acceptance, not final mailbox delivery; uncertain outcomes retry only the original request ID and payload. The 22 October event has closed registration.

Original approved kyaa Soft Cheer SVG is unchanged; `wave` is separate native text. The hero and gathering sections use real Dragon Hill Lodge exterior and Naija Ballroom photographs from the existing kyaa wave proposal (`outputs/kyaa-wave-proposal-20261008/assets/dragon-hill-lodge-night-exterior.jpg` and `dhl-naija-ballroom-official.jpeg` in the main checkout). WebP versions retain the full original frames; CSS crops the decorative hero per viewport and the venue photo retains its natural ratio. These are venue photographs, not documentation of a past kyaa wave gathering. The social sharing image uses the same exterior photograph with the approved logo. Original proposal photos remain unchanged. Google Fonts supplies Noto Sans KR.

Ordinary trusted kyaa.io links receive missing shared UTM defaults (`utm_source=kyaa`) by appending to preserve query/hash bytes. Click and middle-click use the shared anonymous `/api/events` schema; CloudFront forwards this path to the existing kyaa.io collector. No authorization or member IDs are sent, no retries occur, and failures do not block navigation. Email links and inquiry drafts are excluded. A plain local HTTP server does not proxy this API; browser verification should intercept it or use the AWS deployment.

Successful Git production deployments also post the new Korean release notes to the existing Bug Report Telegram room through trusted main. The wave receipt/check, bootstrap and kyaawave.com links are separate from core notices. Never manually duplicate a successful automated notice; inspect uncertain outcomes before retrying.

Browser visual, interaction, accessibility and production collector checks are deployment verification tasks; the Node tests cover helper logic and static contracts only.

Search implementation and primary sources: [SEARCH.md](./SEARCH.md).

Community participation uses the inquiry form; this independent site does not direct visitors to the general Kyaa Telegram channel. Visible image captions were removed on request; image provenance remains in historical source records. The gathering changes to past tense at 2026-10-22T21:30:00+09:00, including already-open pages. Static HTML uses a neutral gathering heading. Anonymous page/open/submit events and server-committed acceptance are retained up to90days, with fixed channel categories and no inquiry payload in analytics. The existing kyaa admin gate protects `/api/admin/analytics/wave?days=7` (also30/90); values count events/tab sessions, not people or delivered mail.

Vercel GitHub production environments can be named `Production – kyaawave` when multiple projects share the repository. The notifier accepts that exact name and keeps legacy `Production` history, so an environment rename does not replay or omit release notes.

AWS uses the `AWS wave production` deployment environment and the same Wave notice receipt history. Public source SHA and artifact digest must match the verified workflow run before an announcement. Never manually duplicate an automatic notice.

The `#archive` recap of the 22 October 2026 gathering uses photographer originals from the shared Drive folder `KYAA Wave 2026 : Fans Make Waves` (folders `04` and `05`), selected to avoid large faces, readable name tags and personal information, converted to 3:2 WebP at 800/1600 widths without EXIF and shown uncropped. Program names follow their sources: `KYAA WAVE LIVE` from the printed KYAA Passport, `Kyaa LIVE Insight with 나영석 PD님` from the kyaa fan page notice `live-insight`; host, organizer and sponsors come from the event backdrop. The social image is the backdrop photograph (`final-34`). Unconfirmed items are not shown; they stay in the `_private` note of `content.json`, which the build strips.
