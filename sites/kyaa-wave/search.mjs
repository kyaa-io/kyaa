const origin = 'https://kyaawave.com';
const pages = {
 ko: {path:'/', title:'kyaa wave — 엔터와 테크가 만나는 사람들의 커뮤니티', description:'콘텐츠, 기술, 브랜드의 사람들이 경험을 나누고 함께할 일을 찾는 커뮤니티. kyaa wave의 크리에이터 커뮤니티와 모임을 만나보세요.', locale:'ko_KR'},
 en: {path:'/en/', title:'kyaa wave — Entertainment, tech and people', description:'A community where people in content, technology and brands share experiences and explore collaboration. Discover the kyaa wave creator community and gatherings.', locale:'en_US'}
};
const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderPage(template, copy, language) {
 const page = pages[language];
 const url = origin + page.path;
 const image = `${origin}/assets/og-kyaa-wave-20261019-v2.jpg`;
 const imageAlt = language === 'en' ? 'kyaa wave — Entertainment, technology and people. AI-generated community scene.' : 'kyaa wave — 엔터테인먼트와 기술, 그리고 사람들. AI로 표현한 커뮤니티.';
 const graph = {'@context':'https://schema.org','@graph':[
  {'@type':'Organization','@id':`${origin}/#publisher`,name:'kyaa wave',url:`${origin}/`,parentOrganization:{'@type':'Organization',name:'Sallylab Inc.'},email:'biz@kyaa.io',logo:{'@type':'ImageObject',url:`${origin}/assets/icon-512.png`,width:512,height:512}},
  {'@type':'WebSite','@id':`${origin}/#website`,url:`${origin}/`,name:'kyaa wave',alternateName:'KYAA WAVE',inLanguage:['ko','en'],publisher:{'@id':`${origin}/#publisher`}},
  {'@type':'WebPage','@id':`${url}#webpage`,url,name:page.title,description:page.description,inLanguage:language,isPartOf:{'@id':`${origin}/#website`},primaryImageOfPage:{'@type':'ImageObject',url:image,width:1200,height:630},publisher:{'@id':`${origin}/#publisher`}}
 ]};
 const meta = `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="msvalidate.01" content="159EFD393F8532147113221C607968F0">
<meta name="naver-site-verification" content="aaad223af4f086d0debe6249a0b149c5b4a53cea">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${origin}/">
<link rel="alternate" hreflang="en" href="${origin}/en/">
<link rel="alternate" hreflang="x-default" href="${origin}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="kyaa wave">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${page.locale}">
<meta property="og:locale:alternate" content="${pages[language === 'en' ? 'ko' : 'en'].locale}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${escape(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${escape(imageAlt)}">
<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/assets/kyaa-original.svg">
<link rel="icon" type="image/png" href="/assets/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180">
<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<','\\u003c')}</script>`;
 let html=template.replace(/<html lang="[^"]+">/,`<html lang="${language}">`)
  .replace(/<head>.*?<\/head>/s,`<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#19181d">${meta}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"><script type="module" src="/app.mjs"></script></head>`)
  .replace(/(<[a-z0-9-]+\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[^<]*/g,(_,tag,key)=>{
   if (!copy[key]) throw new Error(`Missing translation: ${key}`);
   return tag + escape(copy[key][language === 'en' ? 1 : 0]);
  })
  .replace(/<a href="\?lang=(ko|en)" lang="\1" data-lang="\1"(?: aria-current="true")?>/g,(_,lang)=>`<a href="${pages[lang].path}" lang="${lang}" data-lang="${lang}"${lang === language ? ' aria-current="true"' : ''}>`);
 html=html.replace('aria-label="메뉴 열기"',`aria-label="${copy.menu[language==='en'?1:0]}"`).replaceAll('aria-label="닫기"',`aria-label="${copy.close[language==='en'?1:0]}"`);
 return html;
}
