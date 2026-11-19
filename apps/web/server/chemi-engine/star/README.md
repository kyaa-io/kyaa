# W1-STAR

Server-only tropical geocentric apparent positions, astronomy-engine 2.1.19 (MIT).
`calculateChart` accepts an already resolved UTC instant and east-positive longitude.
The profile owner must resolve historical timezone/DST before calling this engine.
Unknown birth time returns null angles and houses; the supplied instant is only a
caller-selected planetary estimate, not a recovered birth time. Supported years: 1900–2100.

Meeus horizon/ecliptic intersection supplies ASC and MC. Whole-sign houses are
explicitly named and are for internal fortune calculations, not the Placidus display chart.
`dailySky` supplies 24 hourly samples beginning at KST midnight.

`reference.test.json` contains 40 synthetic dates: five years, four locations,
April 20 boundary dates and local midnight, including historical Seoul daylight
saving time. Swiss Ephemeris 2.10.03 (Moshier) generated numbers only; no Swiss
implementation or dependency is shipped. Tests compare all ten bodies and both
angles within one arcminute and require identical zodiac signs and house numbers.
Reference regeneration requires external Python pyswisseph, never npm/runtime.

Display charts use placidusCusps and placidusHouse. Both are null for unknown times
and at or beyond the polar circle of date. Never substitute internal whole-sign
houses in the display. All 40 charts also compare twelve Placidus cusps and ten
house placements. Eight Swiss samples bracket ASC sign changes at 37.6° and 65° N.

scoreDay scores the strongest hourly contact per transit, aspect and natal target.
각도와 오늘 행성의 무게는 weights.json에서 관리한다(잠정, 기획서 반영 대기).
허용 오차 안에서 가장 정확한 시각의 점수를 구하고, 한국 시각 22시에서 23시 사이
오차가 줄면 해당 각도의 가중 점수를 더하고 벌어지면 뺀다. 오차가 같으면
다가옴으로 보지 않는다. 한 영역에서 행성과 하우스가 모두 맞아도 한 번만 센다.
시간을 모르면 영역에 배정되지 않은 트랜짓은 총운에 직접 합산한다.
출시 분위표는 40개 차트와 2026년 11월 30일로 시간 앎·모름 각각 1,200건을
계산했다. 원점수 동률은 날짜·영역·출생 행성 위치·상승궁의 고정 해시 순서로 나눈다.
Supply the applicable versioned monthly distribution when available and persist
the returned stars and version with the result. For unknown birth times,
birthMoonSigns accepts the caller-resolved bounds of the local birth date.
