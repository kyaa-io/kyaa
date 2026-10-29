# Pinned V3 deployment fixtures

Copied read-only on 2026-10-19 from `/Users/jewel/.codex/worktrees/1c9a/byus/contracts/out/` before building this checkout. These retain the original creation/deployed bytecode and ABI; no V3 source was recompiled. Tests deploy the original base and Kyaa V3 creation bytecode with local bindings, and require the original codec runtime hash `0xe3095c9a1847be6e857e06f7182d417597094331c3a2ab5b2058253ab248bc39`.

Production prior codec address: `0x4e44a1c183bac430f30033bd1a639c696b93612a` (read-only hub storage slot +6, finalized block 39036069).

| Fixture | Original artifact | Original artifact SHA-256 | Fixture SHA-256 |
|---|---|---|---|
| `ByUsActionHubV3.json` | `ByUsActionHub.sol/ByUsActionHub.json` | `17b08064d85eb5e140141b3e568ce32e20f33581a49bde70bb691db5ffbd9524` | `bb24f5a87c61687e560bd9976408b9e27f6baa2bc8a0e74900f900faeb8234e9` |
| `ByUsActionCodecV3.json` | `ByUsActionCodec.sol/ByUsActionCodec.json` | `e12a845fd7850e9b996a438647dabb80b86224954ca3082c6a6c8a59f6380cd0` | `33c6c66d251bc2f310574a2f0472ef9fb3fd10d2e606883ea6f4c9d0bc349ce2` |
| `KyaaActionHubV3.json` | `KyaaActionHub.sol/KyaaActionHub.json` | `4a7b40d8a2a5743b6abdb7b35e3c1865f9e299264f95d7dbdac14524ec79c290` | `046c2ef0a2766d80f84848d9505266e45699c58be41b8f6f544653ce07a72012` |
