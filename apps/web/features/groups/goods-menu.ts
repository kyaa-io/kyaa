// Next 빌드는 process.env.NEXT_PUBLIC_GOODS_MENU 를 글자로 바꿔 넣는다. Vite 기반 로컬 시험 화면에는 process 가 없어 꺼짐으로 본다.
function readGoodsMenu(): boolean {
  try { return process.env.NEXT_PUBLIC_GOODS_MENU === "true"; } catch { return false; }
}
export const GOODS_MENU = readGoodsMenu();
