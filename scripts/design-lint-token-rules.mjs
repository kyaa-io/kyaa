// design-system-1112/token-table.md: raw declarations stay in the baseline, never in new screen CSS.
import postcss from 'postcss';
export const TOKEN_RULES = Object.fromEntries(['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map(id => [id, { sev: 'fail', note: '현재 토큰 표의 역할별 토큰을 사용한다' }]));
export function scanTokens(code) {
  const out = new Map();
  const add = (id, text) => { const k = `${id}|${text}`; out.set(k, (out.get(k) ?? 0) + 1); };
  const root = postcss.parse(code);
  root.walkDecls(d => {
    const p = d.prop.toLowerCase(), v = d.value;
    const bare = v.replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, '').trim();
    const globals = /^(inherit|initial|unset|revert|normal|auto|none|0)$/;
    let id;
    if (/^(font-size|font-weight|line-height|font-family|font)$/.test(p) && bare && !globals.test(bare) && !(p === 'line-height' && bare === '1')) id = 'D1';
    if (/^(gap|row-gap|column-gap|padding(?:-.+)?|margin(?:-.+)?)$/.test(p) && /-?\d*\.?\d+(?:px|rem|em|%|vh|vw)|\b[1-9]\d*\b/.test(bare)) id = 'D2';
    if (/^border(?:-.+)?-radius$/.test(p) && ((bare && !/^(0|50%|inherit)$/.test(bare)) || /--radius-(control|collection|hero|action)\b/.test(v))) id = 'D3';
    if (/^(color|background(?:-color)?|border(?:-.+)?|fill|stroke)$/.test(p) && /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch|lab|color)\(|\b(?:white|black|red|blue|pink|gray|grey)\b/i.test(bare)) id = 'D4';
    if (p === 'box-shadow' && v !== 'none' && v !== '0' && !/^var\(--shadow-overlay\)$/.test(v)) id = 'D5';
    if (/--space-7\b|--section-gap\b/.test(v)) id = 'D2';
    if (id) add(id, `${p}: ${v.replace(/\s+/g, ' ').trim()}`);
  });
  root.walkRules(r => {
    if (!/(?:button|action|btn)/i.test(r.selector)) return;
    const icon = r.nodes.some(n => n.type === 'rule' && /svg|icon/i.test(n.selector));
    if (icon && !r.nodes.some(n => n.prop === 'gap' && /var\(--(?:space-|fan-action-icon-gap)/.test(n.value))) add('D6', `${r.selector}: icon button requires token gap`);
  });
  return out;
}
