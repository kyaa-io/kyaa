// kyaa 공지 초안 목록 (NOTICES-0855). 사실은 코드·릴리스 노트·공식 안내 페이지에서 확인한 것만 쓴다.
// 본문 블록: ["p", 문장] ["h", 소제목] ["ul", [항목]] ["ol", [항목]] ["img", 주소, 대체 글]. 문장 안의 [글자](주소)는 링크가 된다.
// 주소가 /로 시작하면 등록 때 --origin(기본 https://kyaa.io)을 붙인다. 공지 본문의 링크와 사진은 https만 허용된다.
// at: 게시 날짜(KST). 릴리스 노트 날짜를 기준으로 하고, 같은 날짜 안의 순서는 시각으로 정한다.
const OWN = (name) => `/images/notices/${name}.webp`;

export const notices = [
  // ───────── 온보딩·안내 (2026-11-11 신규 작성) ─────────
  {
    slug: "guide-start-kyaa", category: "guide", at: "2026-11-11T09:50:00+09:00",
    ko: { title: "kyaa 이용 가이드", body: [
      ["p", "최애를 찾아 팬 인증을 하고, LIVE 예약과 출석, 선물 응모까지 이어지는 순서예요."],
      ["ol", [
        "최애 페이지에서 팬 인증 퀴즈를 풀어요. 통과하면 그 최애의 패스포트를 시작해요.",
        "예약이 열린 LIVE를 기간 안에 예약해요. 예약만으로는 출석이 되지 않아요.",
        "방송 중 LIVE 화면에 안내된 방법으로 출석해요. LIVE마다 방식과 운영 시간이 달라요.",
        "선물은 혜택 화면에서 조건과 기간을 확인한 뒤 직접 응모해요. 예약이나 출석으로 자동 응모되지 않아요.",
      ]],
      ["p", "패스포트와 스탬프는 현금, 증권, 투자 상품이나 회사에 대한 권리가 아니에요."],
      ["p", "[이용 가이드 전체 보기](/guide) · 서비스 문의는 support@kyaa.io로 보내 주세요."],
    ] },
    en: { title: "kyaa service guide", body: [
      ["p", "Find a favorite, verify as a fan, then reserve LIVE, check in and enter prize draws."],
      ["ol", [
        "Take the fan verification quiz on your favorite's page. After you pass, you can start that favorite's Fan Passport.",
        "Reserve a LIVE that is open for reservations before the deadline. A reservation does not count as attendance.",
        "Check in during the broadcast by following the instructions on the LIVE screen. The method and window differ by LIVE.",
        "Check the conditions and period on the benefit screen, then enter a prize draw yourself. A reservation or check-in does not enter you automatically.",
      ]],
      ["p", "Passports and Stamps do not represent cash, securities, investment products, or rights in the company."],
      ["p", "[Read the full guide](/guide) · Send service questions to support@kyaa.io."],
    ] },
  },
  {
    slug: "guide-jjinfan", category: "guide", at: "2026-11-11T09:40:00+09:00",
    ko: { title: "찐팬 되는 법", body: [
      ["img", OWN("notice-jjinfan100"), "하트 도장이 가득 찍힌 시트와 하트 모양 도장 일러스트"],
      ["p", "찐팬은 입국 심사, 덕질 기록 채우기, 찐팬 스탬프 순서로 돼요."],
      ["ol", [
        "입국 심사: 퀴즈를 통과하면 팬 인증이 되고 패스포트를 받아요.",
        "덕질 기록 채우기: 패스포트의 미션북 9칸 가운데 인증 칸을 뺀 칸을 덕질로 채워요.",
        "찐팬 스탬프: 돈을 쓴 인증을 제출해 마지막 칸을 채워요.",
      ]],
      ["p", "한 쪽의 9칸을 모두 채우고 받으면 크리에이터 하트가 1개 쌓여요. 2쪽부터는 찐팬 인증 후에 받을 수 있어요."],
      ["p", "인증 종류마다 꼭 보여야 하는 정보와 가려도 되는 정보가 달라요. 개인정보는 올리기 전에 직접 가려 주세요."],
      ["p", "[찐팬 되는 법 보기](/guide/jjinfan)"],
    ] },
    en: { title: "How to become a true fan", body: [
      ["img", OWN("notice-jjinfan100"), "Illustration of a sheet filled with heart stamps and a heart-shaped stamp"],
      ["p", "Becoming a true fan takes three steps: entry review, filling the mission book, and the true-fan stamp."],
      ["ol", [
        "Entry review: pass the fan quiz to verify as a fan and get your Passport.",
        "Mission book: fill the slots of your Passport mission book page, all but the proof slot, by being a fan.",
        "True-fan stamp: submit proof of a purchase to fill the last slot.",
      ]],
      ["p", "Fill all 9 slots on a page and claim it to collect 1 creator heart. From page 2, claiming opens after true-fan verification."],
      ["p", "What must stay visible and what you may hide differs by proof type. Cover private details yourself before you upload."],
      ["p", "[See how to become a true fan](/guide/jjinfan)"],
    ] },
  },
  {
    slug: "guide-dukjil", category: "guide", at: "2026-11-11T09:30:00+09:00",
    ko: { title: "덕질하는 법", body: [
      ["img", OWN("fan-activity-guide"), "하트 스탬프가 찍힌 패스포트 미션북 일러스트"],
      ["p", "출석, 글, 댓글, 공감처럼 덕질할 때마다 포인트와 스탬프를 받아요."],
      ["ul", [
        "활동마다 받는 포인트와 하루·한 달 한도가 달라요.",
        "받은 스탬프가 덕질 기록 칸을 채워요.",
        "칸을 다 채우고 받으면 하트가 쌓이고, 하트와 덕질 활동으로 팬페이지 순위를 볼 수 있어요.",
      ]],
      ["p", "활동별 포인트와 한도 표는 [덕질하는 법](/guide/dukjil)에서 확인하세요."],
    ] },
    en: { title: "How to earn as a fan", body: [
      ["img", OWN("fan-activity-guide"), "Illustration of a Passport mission book with heart stamps"],
      ["p", "Check-ins, posts, comments and reactions each earn points and a stamp."],
      ["ul", [
        "Points and daily or monthly limits differ by activity.",
        "The stamps you earn fill the slots of your mission book.",
        "Fill all the slots and claim them to collect a heart. Hearts and fan activity decide fan page rankings.",
      ]],
      ["p", "See the points and limits for each activity in [How to earn as a fan](/guide/dukjil)."],
    ] },
  },
  {
    slug: "guide-fanpage-promotion", category: "guide", at: "2026-11-11T09:20:00+09:00",
    ko: { title: "팬페이지 홍보 안내", body: [
      ["p", "팬페이지를 운영하는 크리에이터가 내 링크를 찾고, 프로필·스토리·LIVE에 쓸 홍보 문구를 복사하는 페이지예요."],
      ["ol", [
        "이름이나 핸들로 내 프로필을 검색해 팬페이지 링크를 확인해요.",
        "프로필 소개란에 팬페이지 링크를 넣어요.",
        "LIVE를 시작하기 전에 스토리로 알리고 링크 스티커를 넣어요.",
        "방송 화면에 짧은 주소를 띄우고, 말로도 팬페이지에서 할 일을 안내해요.",
      ]],
      ["p", "이벤트가 있으면 담당자와 일정·혜택을 먼저 정한 뒤, 확정된 참여 방법과 링크를 팬에게 알려 주세요."],
      ["p", "[팬페이지 홍보 안내 보기](/bias/promotion)"],
    ] },
    en: { title: "Promote your fan page", body: [
      ["p", "Creators with a fan page can find their link here and copy ready-made text for a bio, a story or a LIVE."],
      ["ol", [
        "Search your name or handle to find your fan page link.",
        "Add the fan page link to your profile bio.",
        "Post a story before you go live and add a link sticker.",
        "Show the short URL on your live screen and say what fans can do on the fan page.",
      ]],
      ["p", "If you run an event, agree on the schedule and benefits with your contact first, then share the confirmed instructions and link with fans."],
      ["p", "[Open the promotion guide](/bias/promotion)"],
    ] },
  },
  {
    slug: "guide-menu-contact", category: "guide", at: "2026-11-11T09:10:00+09:00",
    ko: { title: "안내 및 문의 메뉴 모음", body: [
      ["p", "화면 맨 아래 ‘안내 및 문의’에서 여는 페이지예요."],
      ["ul", [
        "[이용 가이드](/guide)",
        "[찐팬 되는 법](/guide/jjinfan)",
        "[덕질하는 법](/guide/dukjil)",
        "[팬페이지 홍보 안내](/bias/promotion)",
        "[팬미팅 협업 문의](/pages/us-fanmeetings)",
        "[팬이 있는 당신에게](/pages/creator-onboarding)",
        "[파트너 협업 제안](/pages/partners)",
        "[온체인 기록](/pages/onchain)",
        "[kyaa wave](https://kyaawave.com/)",
      ]],
      ["p", "서비스 문의는 support@kyaa.io로 보내 주세요. 로그인 없이 볼 수 있는 [계정 삭제 안내](/account-deletion)도 있어요."],
    ] },
    en: { title: "Guides and contact menu", body: [
      ["p", "These pages open from “Guides & contact” at the bottom of every screen."],
      ["ul", [
        "[Service guide](/guide)",
        "[How to become a true fan](/guide/jjinfan)",
        "[How to earn as a fan](/guide/dukjil)",
        "[Promote your fan page](/bias/promotion)",
        "[Fanmeeting partnerships](/pages/us-fanmeetings)",
        "[For everyone with fans](/pages/creator-onboarding)",
        "[Partnership proposals](/pages/partners)",
        "[Onchain records](/pages/onchain)",
        "[kyaa wave](https://kyaawave.com/)",
      ]],
      ["p", "Send service questions to support@kyaa.io. You can also read the [account deletion guide](/account-deletion) without signing in."],
    ] },
  },
  {
    slug: "guide-onchain-records", category: "guide", at: "2026-11-11T09:00:00+09:00",
    ko: { title: "온체인 기록 안내", body: [
      ["p", "kyaa는 팬 행동을 GIWA Sepolia 테스트넷에 기록하고, 확정된 기록을 공개 페이지에서 볼 수 있게 해요."],
      ["ul", [
        "공개 수치는 QA 지갑과 과거 이관 기록을 뺀 확정 기록이에요.",
        "회원가입 수, 전체 댓글 수, 구매 인증은 이 원장에 기록하지 않아요. 값이 없는 항목은 0건이 아니라 미기록이에요.",
        "최근 20개 원장 항목은 화면에서, 전체 원장은 JSON 파일로 내려받아 확인할 수 있어요.",
      ]],
      ["p", "[온체인 기록 보기](/pages/onchain)"],
    ] },
    en: { title: "Onchain records", body: [
      ["p", "kyaa records fan actions on the GIWA Sepolia testnet and shows the confirmed records on a public page."],
      ["ul", [
        "Public figures count confirmed records and exclude QA wallets and past migrations.",
        "Sign-ups, total comments and purchase verification are not recorded in this ledger. An empty item means not recorded, not zero.",
        "The latest 20 ledger entries appear on the page, and you can download the full ledger as JSON.",
      ]],
      ["p", "[View onchain records](/pages/onchain)"],
    ] },
  },
  // ───────── 크리에이터·협업 안내 (2026-11-11 신규 작성) ─────────
  {
    slug: "creator-for-everyone-with-fans", category: "creator", at: "2026-11-11T08:50:00+09:00",
    ko: { title: "팬이 있는 당신에게", body: [
      ["img", OWN("notice-creator-intro"), "돋보기 아래 놓인 세 장의 프로필 카드 일러스트"],
      ["p", "크리에이터, 아티스트, 운동선수, 작가, 팀, 브랜드와 IP처럼 팬이 있는 분이 kyaa에서 팬 활동을 준비하는 방법이에요."],
      ["ul", [
        "팬들이 찾아올 한 페이지: 소개, 활동 채널, 새 소식을 한곳에 모아요.",
        "LIVE: 기존 채널의 LIVE 일정을 알리고 예약을 받아요. 방송 당일 출석 방식도 함께 준비해요.",
        "팬 패스포트: 팬 인증부터 LIVE 참여까지 팬의 활동을 기록해요.",
        "팬 이벤트: 상품·티켓·체험 혜택과 응모·추첨 조건을 함께 정해요.",
      ]],
      ["p", "소속사 없이 혼자 활동해도 문의할 수 있어요. 활동명, 주로 쓰는 채널 링크, 팬과 해보고 싶은 활동을 알려 주세요. 이용 범위와 비용은 활동 방식을 확인한 뒤 협의해요."],
      ["p", "[팬이 있는 당신에게 보기](/pages/creator-onboarding)"],
    ] },
    en: { title: "For everyone with fans", body: [
      ["img", OWN("notice-creator-intro"), "Illustration of three profile cards under a magnifying glass"],
      ["p", "How creators, artists, athletes, writers, teams, brands and IP with fans can plan fan activities on kyaa."],
      ["ul", [
        "One page for your fans: your bio, channel links and updates in one place.",
        "LIVE: share upcoming livestreams from your existing channels and take reservations. We help plan check-in for the day.",
        "Fan Passport: keep a record of fan verification and LIVE participation.",
        "Fan events: agree on products, tickets or experiences and the entry or draw conditions.",
      ]],
      ["p", "You can get in touch without an agency. Tell us your public name, links to your main channels and what you would like to do with your fans. Scope and cost are agreed after we review how you work."],
      ["p", "[Open For everyone with fans](/pages/creator-onboarding)"],
    ] },
  },
  {
    slug: "partner-proposals", category: "creator", at: "2026-11-11T08:40:00+09:00",
    ko: { title: "파트너 협업 제안", body: [
      ["p", "브랜드, 기업, 에이전시, 콘텐츠·행사 파트너가 셀럽·크리에이터에게 제안할 수 있는 협업이에요."],
      ["ul", [
        "커머스·공동구매",
        "라이브커머스",
        "굿즈·IP 협업",
        "광고·브랜디드 콘텐츠",
        "팬 혜택·이벤트",
      ]],
      ["p", "제안 내용을 검토한 뒤 참여자, 각 팀의 역할, 진행 조건과 비용을 함께 정해요. 협업 대상이나 기획이 정해지지 않았어도 제품과 목적부터 알려 주면 돼요."],
      ["p", "[파트너 협업 제안 보기](/pages/partners)"],
    ] },
    en: { title: "Partnership proposals", body: [
      ["p", "Brands, businesses, agencies and content or event partners can propose these collaborations to celebrities and creators."],
      ["ul", [
        "Commerce and group buys",
        "Live shopping",
        "Merchandise and IP",
        "Advertising and branded content",
        "Fan benefits and events",
      ]],
      ["p", "After reviewing your proposal, we agree on who takes part, each team's role, the terms and the cost. You do not need a fixed partner or plan; start with your product and goal."],
      ["p", "[Open Partnership proposals](/pages/partners)"],
    ] },
  },
  {
    slug: "us-fanmeeting-partnership", category: "creator", at: "2026-11-11T08:30:00+09:00",
    ko: { title: "미국 팬미팅 협업 문의", body: [
      ["p", "크리에이터, 기획사, 브랜드가 미국에서 팬미팅을 열 때 kyaa가 팬 참여 기획을 맡고, 미국 현지 운영 파트너가 현장을 맡아요."],
      ["ul", [
        "kyaa: 팬에게 안내할 참여 페이지와 캠페인, 예약·출석·덕질·설문으로 쌓는 참여 기록, 참여 결과를 바탕으로 한 다음 캠페인 기획",
        "미국 현지 운영 파트너: 장소 섭외와 현장 준비, 현지 스태프·제작·운영 지원",
      ]],
      ["p", "[팬미팅 협업 문의 보기](/pages/us-fanmeetings)"],
    ] },
    en: { title: "U.S. fanmeeting partnerships", body: [
      ["p", "When creators, agencies or brands hold a fanmeeting in the U.S., kyaa plans fan participation and a local U.S. operating partner runs the venue side."],
      ["ul", [
        "kyaa: participation pages and campaigns for fans, participation records built from reservations, check-ins, fan activities and surveys, and the next campaign based on the results",
        "Local U.S. operating partner: venue sourcing and on-site preparation, local staff, production and operations support",
      ]],
      ["p", "[Open Fanmeeting partnerships](/pages/us-fanmeetings)"],
    ] },
  },

  // ───────── 이벤트 (원래 날짜) ─────────
  {
    slug: "event-elina-banksy", category: "event", at: "2026-09-29T10:00:00+09:00",
    ko: { title: "엘리나 × 뱅크시 이벤트", body: [
      ["p", "엘리나 팬 인증과 LIVE 예약으로 응모권을 받아 뱅크시 관련 선물에 응모하는 이벤트예요."],
      ["ul", [
        "경품: 뱅크시 관람권 60명, 비피오 랜덤 케이스 10명, 뱅크시 한정판 스태츄 3명 추첨",
        "팬 인증으로 응모권 1장, LIVE 예약으로 1장을 받아요. 각 보상은 처음 완료할 때 한 번만 지급돼요.",
        "9월 18일 Instagram LIVE에 출석하면 응모권 10장을 더 받아요.",
        "예약이나 출석으로 자동 응모되지 않아요. 응모권을 받은 뒤 경품을 골라 직접 응모해요.",
        "안내 당시 응모 마감은 10월 7일 오후 6시(KST)였어요.",
      ]],
      ["p", "[엘리나 이벤트 보기](/pages/elina-fan-guide)"],
    ] },
    en: { title: "Elina × Banksy giveaway", body: [
      ["p", "Verify as an Elina fan and reserve her LIVE to earn entries for Banksy-related prizes."],
      ["ul", [
        "Prizes: 60 Banksy exhibition tickets, 10 BPIO random cases, 3 limited-edition Banksy statues",
        "Fan verification gives 1 entry and a LIVE reservation gives 1 more. Each reward is given once, on first completion.",
        "Checking in to the September 18 Instagram LIVE gives 10 more entries.",
        "A reservation or check-in does not enter you automatically. After you get entries, choose a prize and enter yourself.",
        "At the time of this announcement, entries closed on October 7 at 6 PM KST.",
      ]],
      ["p", "[Open the Elina guide](/pages/elina-fan-guide)"],
    ] },
  },
  {
    slug: "event-byus-day", category: "event", at: "2026-10-02T10:00:00+09:00",
    ko: { title: "BYUS DAY 10월 22일 참가 신청", body: [
      ["p", "10월 22일 목요일 18:30에 시작하는 행사예요. 장소는 서울 용산 Dragon Hill Lodge(DHL)이고, 본행사와 뒷풀이가 이어져요."],
      ["ul", [
        "본행사: 오프닝, 식사(코스요리), 세션 및 Q&A, 럭키드로우, BYUS LIVE",
        "참가 신청은 kyaa 안의 초대 페이지에서 받았어요.",
      ]],
      ["p", "참가 신청 마감은 [kyaa wave 참가 신청 마감](/notices/event-kyaa-wave-rsvp-closed)에서 확인하세요."],
    ] },
    en: { title: "BYUS DAY on October 22: RSVP", body: [
      ["p", "The event starts at 18:30 on Thursday, October 22 at Dragon Hill Lodge (DHL) in Yongsan, Seoul, with a main program and an after-party."],
      ["ul", [
        "Main program: opening, course dinner, sessions and Q&A, lucky draw, BYUS LIVE",
        "RSVPs were taken on an invitation page inside kyaa.",
      ]],
      ["p", "For the close of RSVPs, see [kyaa wave RSVP closed](/notices/event-kyaa-wave-rsvp-closed)."],
    ] },
  },
  {
    slug: "event-kyaa-wave-rsvp-closed", category: "event", at: "2026-10-12T10:00:00+09:00",
    ko: { title: "kyaa wave 참가 신청 마감", body: [
      ["p", "kyaa wave 참가 신청이 마감됐어요."],
      ["ul", [
        "일시: 10월 22일 목요일, 본행사 18:30–21:30, 뒷풀이 21:30–24:00",
        "장소: 서울 용산 Dragon Hill Lodge",
        "행사장 안에서는 주차할 수 없어요.",
      ]],
      ["p", "[kyaa wave 홈페이지](https://kyaawave.com/)"],
    ] },
    en: { title: "kyaa wave RSVPs are closed", body: [
      ["p", "RSVPs for kyaa wave are now closed."],
      ["ul", [
        "When: Thursday, October 22. Main event 18:30–21:30, after-party 21:30–24:00 KST",
        "Where: Dragon Hill Lodge, Yongsan, Seoul",
        "Parking is not available inside the venue.",
      ]],
      ["p", "[kyaa wave homepage](https://kyaawave.com/)"],
    ] },
  },
  {
    slug: "event-kyaa-wave-fanpage", category: "event", at: "2026-10-21T10:00:00+09:00",
    ko: { title: "Kyaa Wave 팬페이지 프로그램 참여", body: [
      ["p", "Kyaa Wave 팬페이지에서 행사 프로그램 세 가지를 확인하고, 프로그램마다 사진과 댓글을 남길 수 있어요."],
      ["ul", [
        "프로그램북의 QR이나 참여 코드로 참여 확인을 시작해요. 체크인 코드는 하이픈 없는 6자리예요.",
        "사진이나 댓글을 처음 남기면 프로그램마다 스탬프를 1개씩 받아요.",
        "미션을 완료할 때마다 응모권이 늘어나고, 응모권이 많을수록 경품 당첨 확률이 높아져요.",
        "댓글 이벤트 경품: 창하 커피챗 20명, 창하·WeNa 호텔 커피 각 5명 추첨",
      ]],
      ["p", "[Kyaa Wave 팬페이지 열기](/kyaa-wave-fanpage)"],
    ] },
    en: { title: "Kyaa Wave fan page programs", body: [
      ["p", "On the Kyaa Wave fan page you can see the three event programs and leave a photo and a comment on each."],
      ["ul", [
        "Start check-in with the QR code or participation code in the program book. The check-in code is 6 digits with no hyphen.",
        "Your first photo or comment on each program earns 1 stamp for that program.",
        "Each completed mission adds entries, and more entries raise your chance of winning a prize.",
        "Comment event prizes: 20 coffee chats with Changha, and 5 hotel coffees each from Changha and WeNa",
      ]],
      ["p", "[Open the Kyaa Wave fan page](/kyaa-wave-fanpage)"],
    ] },
  },
  {
    slug: "event-runmusic-qr", category: "event", at: "2026-10-20T10:00:00+09:00",
    ko: { title: "런앤뮤직 QR로 참여하기", body: [
      ["img", OWN("notice-runmusic-passport"), "러닝화, 헤드폰, 음표가 그려진 수첩 일러스트"],
      ["p", "런앤뮤직 현장의 QR로 사전등록, 응원, 현장 체크인, 사진, 퀴즈에 참여하고 내 응모권을 확인할 수 있어요."],
      ["p", "[런앤뮤직 참여 페이지](/connect/runmusic)"],
    ] },
    en: { title: "Join RUN&MUSIC with the QR code", body: [
      ["img", OWN("notice-runmusic-passport"), "Illustration of running shoes, headphones and a music notebook"],
      ["p", "Use the QR code at RUN&MUSIC to pre-register, cheer, check in on site, share photos, take the quiz and see your entries."],
      ["p", "[RUN&MUSIC page](/connect/runmusic)"],
    ] },
  },
  {
    slug: "event-runmusic-entry", category: "event", at: "2026-10-23T10:00:00+09:00",
    ko: { title: "런앤뮤직 선물 응모 방법", body: [
      ["p", "RUN&MUSIC에 좋아요를 누른 뒤 한 번 응모해요. 선물을 받을 카카오톡 ID는 응모할 때 입력하거나 붙여넣어 저장해요."],
      ["ul", [
        "선물: 안동참마요거트 1L, 스타벅스 1만원",
        "좋아요를 누르고 응모 확정을 누르면 ID 저장과 응모가 함께 끝나요.",
        "기존 참여 내역은 그대로 유지돼요.",
      ]],
      ["p", "[런앤뮤직 응모 페이지](/connect/runmusic)"],
    ] },
    en: { title: "How to enter the RUN&MUSIC draw", body: [
      ["p", "Like RUN&MUSIC, then enter once. Enter or paste the KakaoTalk ID where we will send the prize when you enter."],
      ["ul", [
        "Prizes: Andong Chammayogurt 1L, Starbucks 10,000 won",
        "Like the page and confirm your entry to save your ID and enter in one step.",
        "Your earlier participation records are kept.",
      ]],
      ["p", "[RUN&MUSIC entry page](/connect/runmusic)"],
    ] },
  },
  {
    slug: "event-runmusic-winners", category: "event", at: "2026-10-30T10:00:00+09:00",
    ko: { title: "런앤뮤직 당첨자 104명 안내", body: [
      ["img", OWN("notice-winner"), "투명한 응모함과 선물 상자 일러스트"],
      ["p", "런앤뮤직 당첨자는 모두 104명이에요. 스타벅스 1만원 89명, 안동참마요거트 1L 15명이에요."],
      ["p", "이메일 일부를 가린 명단을 선물별로 검색하고 페이지를 넘겨 확인할 수 있어요."],
      ["p", "[당첨자 명단 보기](/connect/runmusic/notice)"],
    ] },
    en: { title: "RUN&MUSIC winners: 104 people", body: [
      ["img", OWN("notice-winner"), "Illustration of a clear entry box and a gift box"],
      ["p", "There are 104 RUN&MUSIC winners in total: 89 for Starbucks 10,000 won and 15 for Andong Chammayogurt 1L."],
      ["p", "Search the list by prize and page through it. Email addresses are partly hidden."],
      ["p", "[View the winner list](/connect/runmusic/notice)"],
    ] },
  },
  {
    slug: "event-gggi-changha-goods", category: "event", at: "2026-10-26T10:00:00+09:00",
    ko: { title: "GGGI × 창하 굿즈 이벤트", body: [
      ["img", "/images/gggi/changha-event-20261026.webp", "GGGI × 창하 굿즈 이벤트 이미지"],
      ["p", "GGGI 페이지에서 좋아요를 누르면 굿즈 이벤트에 자동으로 응모돼요. 계정당 1회 참여할 수 있고, 접수 완료를 화면에서 확인해요."],
      ["p", "GGGI 자체 굿즈와 창하 관련 굿즈를 드릴 예정이에요. 상세 구성은 공개되면 안내해요."],
      ["p", "[이벤트 자세히 보기](/gggi#gggi-event)"],
    ] },
    en: { title: "GGGI × Changha merchandise event", body: [
      ["img", "/images/gggi/changha-event-20261026.webp", "GGGI × Changha merchandise event image"],
      ["p", "Like the GGGI page to enter the merchandise event automatically. You can enter once per account and see your confirmation on screen."],
      ["p", "GGGI merchandise and Changha-related merchandise are planned as prizes. Details will be announced when they are public."],
      ["p", "[View event details](/gggi#gggi-event)"],
    ] },
  },
  {
    slug: "creator-wena-open", category: "creator", at: "2026-10-14T10:00:00+09:00",
    ko: { title: "위나(We;Na) 팬페이지가 열렸어요", body: [
      ["p", "위나(We;Na) 팬페이지가 열렸어요. 공식 채널의 로고와 We;Na 영문 표기를 반영했어요."],
      ["p", "[위나 팬페이지](/wena)"],
    ] },
    en: { title: "The We;Na fan page is open", body: [
      ["p", "The We;Na fan page is open, with the official channel logo and the We;Na spelling."],
      ["p", "[We;Na fan page](/wena)"],
    ] },
  },
  {
    slug: "creator-hyunji-open", category: "creator", at: "2026-10-16T10:00:00+09:00",
    ko: { title: "현지 팬페이지가 열렸어요", body: [
      ["p", "현지 팬페이지에서 Instagram 사진 8장과 소개를 볼 수 있어요. 팬 인증 퀴즈는 3문항이에요."],
      ["p", "[현지 팬페이지](/hyunji)"],
    ] },
    en: { title: "The Hyunji fan page is open", body: [
      ["p", "On the Hyunji fan page you can see 8 Instagram photos and her profile. The fan verification quiz has 3 questions."],
      ["p", "[Hyunji fan page](/hyunji)"],
    ] },
  },

  // ───────── 서비스 변경 (릴리스 노트 날짜) ─────────
  {
    slug: "update-name-kyaa", category: "update", at: "2026-10-12T12:00:00+09:00",
    ko: { title: "서비스 이름과 로고가 kyaa로 바뀌었어요", body: [
      ["img", OWN("notice-update-name"), "하트 아이콘이 있는 휴대폰과 이름표 일러스트"],
      ["ul", [
        "웹 서비스 이름과 로고를 kyaa로 바꿨어요.",
        "기존 주소로 공개 페이지에 접속하면 kyaa의 새 주소로 이어져요.",
        "홈의 슬로건은 “Kyaa. Every Fan Moment Counts.”예요. 링크 공유 미리보기와 앱 설치 이름에도 반영했어요.",
        "이미 발급된 Passport와 Stamp의 이름·주소는 그대로예요.",
      ]],
    ] },
    en: { title: "The service is now named kyaa", body: [
      ["img", OWN("notice-update-name"), "Illustration of a phone with a heart icon and a name tag"],
      ["ul", [
        "The web service name and logo are now kyaa.",
        "Opening a public page at the old address takes you to the new kyaa address.",
        "The home slogan is “Kyaa. Every Fan Moment Counts.” It also appears in link previews and the installed app name.",
        "The names and addresses of Passports and Stamps already issued stay the same.",
      ]],
    ] },
  },
  {
    slug: "update-passport-stamp-art", category: "update", at: "2026-10-14T12:00:00+09:00",
    ko: { title: "패스포트와 스탬프 이미지가 새 kyaa 디자인으로 바뀌었어요", body: [
      ["ul", [
        "kyaa 로고가 들어간 입체적인 팬 패스포트와 스탬프 이미지 15종을 새로 준비했어요.",
        "MY의 여권, 발급 완료, 커뮤니티, 공유 화면의 스탬프 이미지를 새 디자인으로 통일했어요.",
      ]],
    ] },
    en: { title: "Passport and Stamp images have a new kyaa design", body: [
      ["ul", [
        "We prepared 15 new three-dimensional Fan Passport and Stamp images with the kyaa logo.",
        "Stamp images on the My passport, issue-complete, community and share screens now use the new design.",
      ]],
    ] },
  },
  {
    slug: "update-fan-points-login-inquiries", category: "update", at: "2026-10-18T12:00:00+09:00",
    ko: { title: "팬 포인트, 로그인 안내, 문의 내역이 바뀌었어요", body: [
      ["ul", [
        "정책이 적용된 최애에서 출석, 좋아요, 댓글, 인증 같은 덕질 활동에 따라 팬 포인트를 모으고, 활동별 적립 한도를 확인할 수 있어요.",
        "인스타그램, 카카오톡 같은 앱 안에서 Google 로그인을 할 수 없으면 브라우저로 이어가는 안내와 로그인 링크 복사를 제공해요.",
        "문의 내역에서 추가 메시지를 보내고 답변을 이어서 확인할 수 있어요.",
        "로그인 없이 볼 수 있는 [계정 삭제 안내](/account-deletion) 페이지를 추가했어요. 삭제 요청 방법, 삭제되는 정보, 남는 기록과 보관 기간을 안내해요.",
      ]],
    ] },
    en: { title: "Changes to fan points, sign-in help and inquiries", body: [
      ["ul", [
        "For favorites with an active policy, you can earn fan points from fan activity such as check-ins, likes, comments and verification, and see the limit for each activity.",
        "When Google sign-in does not work inside apps such as Instagram or KakaoTalk, we show how to continue in a browser and let you copy the sign-in link.",
        "In your inquiry history you can send additional messages and keep following the replies.",
        "We added an [account deletion guide](/account-deletion) you can read without signing in. It explains how to request deletion, what is deleted, and what is kept and for how long.",
      ]],
    ] },
  },
  {
    slug: "update-fan-proposals-score", category: "update", at: "2026-10-19T12:00:00+09:00",
    ko: { title: "방송별 팬 제안과 팬 점수 안내가 바뀌었어요", body: [
      ["ul", [
        "방송별 팬 제안 페이지에서 공개된 질문, 응원, 신청곡과 선정 상태를 함께 볼 수 있어요.",
        "팬 점수에 현재 점수와 다음 등급의 기준 점수를 함께 보여 줘서 남은 점수를 알 수 있어요.",
        "화면 맨 아래 메뉴에서 kyaa wave 홈페이지로 이동할 수 있어요.",
      ]],
    ] },
    en: { title: "Changes to LIVE fan suggestions and fan score", body: [
      ["ul", [
        "On each broadcast's fan suggestions page, you can see published questions, cheers and song requests together with their selection status.",
        "Fan score now shows your current score and the score needed for the next level, so you can see how much is left.",
        "You can open the kyaa wave homepage from the menu at the bottom of the screen.",
      ]],
    ] },
  },
  {
    slug: "update-web-login-russian", category: "update", at: "2026-10-26T12:00:00+09:00",
    ko: { title: "웹 로그인과 언어가 바뀌었어요", body: [
      ["ul", [
        "웹에서 Google·Apple로 로그인하면 별도의 기존 지갑 연결 절차 없이 이용할 수 있어요.",
        "사이트 언어에 러시아어를 추가했어요.",
      ]],
    ] },
    en: { title: "Web sign-in and language changes", body: [
      ["ul", [
        "Signing in with Google or Apple on the web no longer needs a separate step to connect an existing wallet.",
        "Russian is now available as a site language.",
      ]],
    ] },
  },
  {
    slug: "update-events-list", category: "update", at: "2026-10-27T12:00:00+09:00",
    ko: { title: "전체 이벤트가 목록으로 바뀌었어요", body: [
      ["p", "전체 이벤트를 작은 사진과 안내가 나란히 보이는 목록으로 바꿨어요. 카드마다 사진, 제목, 안내, 이동 버튼 순서로 보여요."],
      ["p", "[전체 이벤트 보기](/events)"],
    ] },
    en: { title: "All events is now a list", body: [
      ["p", "All events now appears as a list with a small photo beside each description. Every card shows the photo, title, description and action in the same order."],
      ["p", "[See all events](/events)"],
    ] },
  },
  {
    slug: "update-board-attachments", category: "update", at: "2026-11-03T12:00:00+09:00",
    ko: { title: "팬 게시판에 사진과 영상을 올릴 수 있어요", body: [
      ["ul", [
        "팬 게시판 글에 사진은 최대 10장, 영상은 1개를 첨부할 수 있어요. 사진과 영상은 한 글에 함께 첨부할 수 없어요.",
      ]],
    ] },
    en: { title: "Attach photos and videos on the fan board", body: [
      ["ul", [
        "A fan board post can have up to 10 photos or 1 video. Photos and videos cannot be attached to the same post.",
      ]],
    ] },
  },
  {
    slug: "update-relative-time-login-browser", category: "update", at: "2026-11-04T12:00:00+09:00",
    ko: { title: "작성 시간 표시와 앱 안 로그인이 바뀌었어요", body: [
      ["ul", [
        "팬페이지 게시판과 게시글·댓글의 작성 시간이 방금 전, 분 전, 시간 전, 일 전으로 보여요. 7일이 지난 글은 날짜로 보여요.",
        "인스타그램, 스레드, 카카오톡 같은 앱 안 브라우저에서 Google로 계속하기를 누르면 iPhone은 Safari로, Android는 기기 브라우저로 로그인 화면을 열도록 시도해요. 앱과 기기에 따라 열리지 않을 수 있어요.",
        "사이트 하단의 X 링크가 kyaa 공식 X 계정(@kyaa_app)으로 연결돼요.",
      ]],
    ] },
    en: { title: "Post time display and in-app sign-in", body: [
      ["ul", [
        "Posting times on fan page boards, posts and comments now read just now, minutes ago, hours ago or days ago. Posts older than 7 days show the date.",
        "Choosing Continue with Google inside in-app browsers such as Instagram, Threads or KakaoTalk now tries to open the sign-in screen in Safari on iPhone and in the device browser on Android. It may not open, depending on the app and device.",
        "The X link at the bottom of the site now goes to the official kyaa X account (@kyaa_app).",
      ]],
    ] },
  },
  {
    slug: "update-popular-posts-attendance-hearts", category: "update", at: "2026-11-05T12:00:00+09:00",
    ko: { title: "인기글, 출석체크, 하트 교환이 바뀌었어요", body: [
      ["ul", [
        "인기글이 3개에서 최대 10개까지 표시돼요. 기간 안에 추천을 받은 글만 순위에 들어가요.",
        "크리에이터별 출석체크 창이 새로 생겼어요. 출석 완료, 패스포트 없음, 하루 한도, 불러오기 실패 상태를 각각 안내해요.",
        "하트 교환에서 한 번에 바꿀 개수를 직접 고를 수 있어요. 가진 포인트와 오늘 남은 교환 횟수 안에서 고를 수 있어요.",
      ]],
    ] },
    en: { title: "Popular posts, check-in and heart exchange", body: [
      ["ul", [
        "Popular posts now show up to 10 instead of 3. Only posts that received likes in the period are ranked.",
        "There is a new check-in window for each creator. It explains each state: checked in, no Passport, daily limit reached, and failed to load.",
        "You can now choose how many hearts to exchange at once, within your points and the exchanges you have left today.",
      ]],
    ] },
  },
  {
    slug: "update-mission-book-proofs-rankings", category: "update", at: "2026-11-06T12:00:00+09:00",
    ko: { title: "패스포트 미션북, 찐팬 인증 제출, 랭킹이 생겼어요", body: [
      ["ul", [
        "패스포트에 미션북이 생겼어요. 한 쪽에 스탬프 9칸이 있고, 다 채우면 크리에이터 하트를 1개 받을 수 있어요. 2쪽부터는 찐팬 인증 후에 받을 수 있어요.",
        "찐팬 인증을 위한 증빙 제출 화면을 만들었어요. 종류를 고르고 이미지를 최대 3장 올릴 수 있으며, 개인정보 부분은 직접 가려서 올려요.",
        "크리에이터별 주간·월간·전체 하트 순위와 팬 순위를 볼 수 있는 랭킹 화면이 생겼어요.",
      ]],
      ["p", "[찐팬 되는 법](/guide/jjinfan) · [랭킹](/rankings)"],
    ] },
    en: { title: "Mission book, true-fan proof and rankings", body: [
      ["ul", [
        "Your Passport now has a mission book. Each page has 9 stamp slots, and filling them all earns 1 creator heart. From page 2, claiming opens after true-fan verification.",
        "There is a new screen to submit proof for true-fan verification. Choose a proof type and upload up to 3 images, covering private details yourself.",
        "A new rankings screen shows weekly, monthly and all-time heart rankings per creator, and fan rankings.",
      ]],
      ["p", "[How to become a true fan](/guide/jjinfan) · [Rankings](/rankings)"],
    ] },
  },
  {
    slug: "update-auto-join-todays-missions", category: "update", at: "2026-11-07T12:00:00+09:00",
    ko: { title: "팬 인증 후 자동 가입과 오늘의 미션이 생겼어요", body: [
      ["ul", [
        "팬 인증을 통과해 패스포트를 받으면 그 팬페이지에 자동으로 가입돼요. 글쓰기, 댓글, 자유 소통방을 바로 쓸 수 있어요. 이미 패스포트가 있는 팬도 같은 상태가 돼요.",
        "덕질에 오늘의 미션 목록이 생겼어요. 활동마다 받는 포인트와 진행 막대, 완료 도장이 보이고, 전체 완료 보상은 준비 중으로 표시해요.",
      ]],
    ] },
    en: { title: "Auto-join after verification and today's missions", body: [
      ["ul", [
        "When you pass fan verification and get a Passport, you automatically join that fan page. You can write posts and comments and use the free chat room right away. Fans who already have a Passport get the same status.",
        "There is a new list of today's missions in the activity tab. It shows the points for each activity, a progress bar and a completion stamp. The reward for finishing everything is marked as coming soon.",
      ]],
    ] },
  },
  {
    slug: "update-translation-fan-page-intro", category: "update", at: "2026-11-08T12:00:00+09:00",
    ko: { title: "팬페이지 소개가 선택한 언어로 번역돼요", body: [
      ["img", OWN("notice-update-translate"), "서로 번역되는 말풍선 두 개 일러스트"],
      ["p", "한국어·영어 외의 언어로 팬페이지를 보면 소개 글이 번역돼요. 바로 아래 ‘원문 보기’를 누르면 원래 소개로, 다시 누르면 번역으로 돌아가요."],
    ] },
    en: { title: "Fan page intros are translated into your language", body: [
      ["img", OWN("notice-update-translate"), "Illustration of two speech bubbles translating each other"],
      ["p", "When you view a fan page in a language other than Korean or English, its intro is translated. Select View original just below to see the original intro, and select again to return to the translation."],
    ] },
  },
  {
    slug: "update-home-shorts-my-gifts", category: "update", at: "2026-11-10T12:00:00+09:00",
    ko: { title: "홈 숏폼과 MY 선물 탭이 생겼어요", body: [
      ["img", OWN("notice-update-shorts"), "재생 버튼이 있는 필름 세 장 일러스트"],
      ["ul", [
        "홈에서 숏폼이라는 이름으로 크리에이터의 짧은 영상을 볼 수 있어요. 영상이 없으면 안내를 보여 줘요.",
        "MY에 선물 탭이 생겼어요. 당첨된 선물을 목록으로 모아 보고, 선물마다 수령 진행 단계와 다음에 할 일을 상세 화면에서 확인해요.",
      ]],
    ] },
    en: { title: "Home shorts and the My gifts tab", body: [
      ["img", OWN("notice-update-shorts"), "Illustration of three film frames with a play button"],
      ["ul", [
        "On Home you can watch short creator videos under Shorts. A message appears when there are none.",
        "My has a new Gifts tab. It lists the gifts you won, and each gift's detail screen shows its delivery step and what to do next.",
      ]],
    ] },
  },
  {
    slug: "update-notices-list", category: "update", at: "2026-11-10T13:00:00+09:00",
    ko: { title: "공지사항 목록이 바뀌었어요", body: [
      ["ul", [
        "홈 공지에서 전체 공지로 이동할 수 있어요.",
        "공지 목록은 한 페이지에 10개씩 보이고, 여러 페이지면 쪽 번호로 이동해요.",
        "공지는 분류, 제목, 날짜 순서로 보여요.",
        "공지 상세는 본문 아래 구분선 뒤에 ‘다른 공지’ 구역을 따로 둬요.",
      ]],
      ["p", "[공지사항 보기](/notices)"],
    ] },
    en: { title: "The notices list has changed", body: [
      ["ul", [
        "You can open all notices from Home notices.",
        "The list shows 10 notices per page and has page numbers when there are more.",
        "Each notice shows its category, title and date in that order.",
        "A notice detail page puts other notices in a separate section below a divider.",
      ]],
      ["p", "[See notices](/notices)"],
    ] },
  },
  {
    slug: "update-home-ranking-basis", category: "update", at: "2026-11-11T08:20:00+09:00",
    ko: { title: "홈 랭킹 기준이 바뀌었어요", body: [
      ["p", "하트는 자주 바뀌지 않는다는 의견에 따라 홈 랭킹 기준을 바꿨어요."],
      ["ul", [
        "찐팬 랭킹은 모은 포인트 수로 순위를 매겨요.",
        "크리에이터 랭킹은 페이지 좋아요 수로 순위를 매겨요.",
        "오늘, 7일, 누적 모두 같은 기준이에요.",
      ]],
      ["p", "[랭킹 보기](/rankings)"],
    ] },
    en: { title: "Home ranking criteria have changed", body: [
      ["p", "We changed the Home ranking criteria because hearts do not change often."],
      ["ul", [
        "True-fan rankings are ordered by points collected.",
        "Creator rankings are ordered by page likes.",
        "Today, 7 days and all-time use the same criteria.",
      ]],
      ["p", "[See rankings](/rankings)"],
    ] },
  },
  {
    slug: "update-board-video-limit", category: "update", at: "2026-11-11T08:10:00+09:00",
    ko: { title: "팬게시판에 영상을 올릴 수 있어요", body: [
      ["p", "팬게시판에 60초 이내 영상을 최대 200MB까지 올릴 수 있어요."],
    ] },
    en: { title: "Upload videos to the fan board", body: [
      ["p", "You can upload a video of up to 60 seconds and 200 MB to the fan board."],
    ] },
  },
];
