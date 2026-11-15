// 모임 맨 위 홍보 배너의 양옆 채움 색을 그림 가장자리에서 계산한다(FB-N26).
// 각 그림의 맨 왼쪽·맨 오른쪽 2픽셀 세로 열 전체의 채널별 중앙값을 구해
// apps/web/features/groups/domain/creator-promo-banner-edges.json 에 쓴다(그림의 색이라 JSON 데이터로 둔다). 새 배너 그림을 넣으면 한 번 다시 돌린다.
//   node scripts/promo-banner-edge-colors.mjs          결과 파일을 다시 쓴다
//   node scripts/promo-banner-edge-colors.mjs --check  파일이 그림과 맞는지만 확인한다(다르면 종료 코드 1)
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDir = path.join(root, "apps/web/public/images/groups/promo");
const outFile = path.join(root, "apps/web/features/groups/domain/creator-promo-banner-edges.json");
const sharp = createRequire(path.join(root, "package.json"))("sharp");
const EDGE_WIDTH = 2;

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

async function edgeColors(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const side = (from) => hex([0, 1, 2].map((channel) => median(Array.from({ length: info.height * EDGE_WIDTH }, (_, n) => {
    const x = from + (n % EDGE_WIDTH), y = Math.floor(n / EDGE_WIDTH);
    return data[(y * info.width + x) * 3 + channel];
  }))));
  return { left: side(0), right: side(info.width - EDGE_WIDTH) };
}

const files = readdirSync(imageDir).filter((name) => /^[a-z0-9-]+-\d{8}\.webp$/.test(name)).sort();
const entries = [];
for (const name of files) entries.push([name.replace(/-\d{8}\.webp$/, ""), await edgeColors(path.join(imageDir, name))]);
const body = `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = (() => { try { return readFileSync(outFile, "utf8"); } catch { return ""; } })();
  if (current !== body) { console.error("creator-promo-banner-edges.json 이 그림과 다릅니다. node scripts/promo-banner-edge-colors.mjs 를 다시 돌리세요."); process.exit(1); }
  console.log(`edge colors ok (${entries.length} banners)`);
} else { writeFileSync(outFile, body); console.log(body); }
