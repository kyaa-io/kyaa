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

No UI, persistence, API, Placidus, text interpretation or daily score calibration
is implemented here. Those must not be inferred from the raw chart API.
