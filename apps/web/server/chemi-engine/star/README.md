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
Where 05-0b leaves coefficients unspecified, the launch model weights inner,
Jupiter/Saturn and outer transits 1/1.2/1.4. Conjunction, sextile, square, trine
and opposition use 1/.6/-.8/1/-1. Accuracy falls linearly to zero at the orb.
Approaching and separating samples scale by 1.1 and .9. Matching a planet and
house in one domain counts once. Reasons rank by magnitude and include the KST
date of the first subsequent hourly sample outside the orb.
The launch quintiles use 40 synthetic charts over November 1–30, 2026.
Supply the applicable versioned monthly distribution when available and persist
the returned stars and version with the result. For unknown birth times,
birthMoonSigns accepts the caller-resolved bounds of the local birth date.
