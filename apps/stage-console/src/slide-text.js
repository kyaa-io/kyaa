// Keep this traversal identical to the packaged HTML adapter: indexes refer to original nodes.
export function slideTextNodes(slide) {
  const content = slide?.querySelector('.slide-content');
  if (!content) return [];
  const walker = content.ownerDocument.createTreeWalker(content, 4);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.trim() && !node.parentElement.closest('script,style')) nodes.push(node);
  }
  return nodes;
}
export function extractSlideText(document, slideIndex, overrides = {}) {
  const slide = document.querySelectorAll('section.slide')[slideIndex];
  if (!slide) throw new Error('프레젠테이션 화면을 찾을 수 없습니다.');
  return slideTextNodes(slide).map((node, index) => ({
    index, original: node.nodeValue, value: overrides[index] ?? node.nodeValue,
    role: node.parentElement.closest('h1,h2,h3,h4,h5,h6') ? '제목' : '본문',
  }));
}
export function slideTextOverrides(fields) {
  return Object.fromEntries(fields.filter(field => field.value !== field.original).map(field => [field.index, field.value]));
}
