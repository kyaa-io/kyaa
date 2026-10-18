import {inquiryUrl, decorateOutboundUrl, isTrackedOutboundUrl} from './helpers.mjs';
const copy = await fetch('/content.json').then(response => response.json());
const locale = document.documentElement.lang === 'en' ? 'en' : 'ko';
const text = key => copy[key][locale === 'en' ? 1 : 0];
let activeGuide;
let inquiryTrigger;
function translate() {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = text(element.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach(element => {
    if (element.dataset.lang === locale) element.setAttribute('aria-current', 'true');
    else element.removeAttribute('aria-current');
    element.href = (element.dataset.lang === 'en' ? '/en/' : '/') + location.hash;
  });
  document.querySelector('#menu-toggle').setAttribute('aria-label', text('menu'));
  document.querySelectorAll('[data-close]').forEach(button => button.setAttribute('aria-label', text('close')));
  if (activeGuide) fillGuide(activeGuide);
}
translate();
const menu = document.querySelector('#navigation');
const menuToggle = document.querySelector('#menu-toggle');
function closeMenu() { menu.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); }
menuToggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); });
menu.addEventListener('click', event => { if (event.target.closest('a, [data-inquiry]')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); menuToggle.focus(); } });
const inquiry = document.querySelector('#inquiry-dialog');
const guide = document.querySelector('#guide-dialog');
document.querySelectorAll('[data-inquiry]').forEach(button => button.addEventListener('click', () => {
  inquiryTrigger = button.closest('#navigation') && getComputedStyle(menuToggle).display !== 'none' ? menuToggle : button;
  closeMenu();
  document.querySelector('#inquiry-interest').value = button.dataset.inquiry || 'creator';
  document.querySelector('#form-status').textContent = text('inquiryStatus');
  inquiry.showModal();
}));
function fillGuide(kind) {
  const titles = {community:'note1', event:'note2', kyaa:'note3', privacy:'privacy'};
  const bodies = {community:'guideCommunity', event:'guideEvent', kyaa:'guideKyaa', privacy:'privacyBody'};
  document.querySelector('#guide-heading').textContent = text(titles[kind]);
  document.querySelector('#guide-body').textContent = text(bodies[kind]);
  const link = document.querySelector('#guide-link');
  link.hidden = !['event','kyaa'].includes(kind);
  if (!link.hidden) {
    link.href = decorateOutboundUrl(kind === 'event' ? 'https://kyaa.io/connect/kyaa-wave' : 'https://kyaa.io');
    link.textContent = text(kind === 'event' ? 'eventAction' : 'visitKyaa');
  }
}
document.querySelectorAll('[data-guide]').forEach(button => button.addEventListener('click', () => { activeGuide = button.dataset.guide; fillGuide(activeGuide); guide.showModal(); }));
[inquiry,guide].forEach(dialog => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
});
guide.addEventListener('close', () => { activeGuide = null; });
inquiry.addEventListener('close', () => inquiryTrigger?.focus());
document.querySelector('#inquiry-form').addEventListener('submit', event => {
  event.preventDefault();
  const status = document.querySelector('#form-status');
  try {
    const href = inquiryUrl(Object.fromEntries(new FormData(event.currentTarget)), locale);
    location.href = href;
    status.textContent = text('draftStatus');
  } catch { status.textContent = text('invalid'); }
});
// Only these public destinations are part of this site's outbound contract.
const isTracked = anchor => {
  if (!anchor || anchor.dataset.outboundTracking === 'off' || anchor.hasAttribute('download')) return false;
  return isTrackedOutboundUrl(anchor.href);
};
document.querySelectorAll('a[href]').forEach(anchor => { if (isTracked(anchor)) anchor.href = decorateOutboundUrl(anchor.href, anchor.dataset.outboundPlacement || 'content'); });
let anonymousSessionId;
try {
  anonymousSessionId = sessionStorage.getItem('kyaa-wave-outbound-session');
  if (!/^[0-9a-f-]{36}$/i.test(anonymousSessionId || '')) anonymousSessionId = crypto.randomUUID();
  sessionStorage.setItem('kyaa-wave-outbound-session', anonymousSessionId);
} catch { try { anonymousSessionId = crypto.randomUUID(); } catch { /* Navigation remains usable without tracking. */ } }
function trackOutbound(event) {
  if ((event.type === 'click' && event.button !== 0) || (event.type === 'auxclick' && event.button !== 1)) return;
  const anchor = event.target.closest('a');
  if (!isTracked(anchor) || !anonymousSessionId) return;
  try {
    const placement = anchor.dataset.outboundPlacement || 'content';
    const linkKind = anchor.dataset.outboundKind || 'website';
    const payload = {schemaVersion:1,eventName:'outbound_link_click',source:'web.outbound',idempotencyKey:`outbound:${crypto.randomUUID()}`,occurredAt:new Date().toISOString(),anonymousSessionId,celebrityId:null,liveEventId:null,missionId:null,benefitId:null,properties:{destinationHost:new URL(anchor.href).hostname,campaign:'kyaa-wave',placement:['header','content','footer','fanpage_hero'].includes(placement)?placement:'content',linkKind:['website','social','external','ticket'].includes(linkKind)?linkKind:'website'}};
    fetch('/api/events', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',keepalive:true,body:JSON.stringify(payload)}).catch(() => {});
  } catch { /* Analytics must never block navigation. */ }
}
document.addEventListener('click', trackOutbound);
document.addEventListener('auxclick', trackOutbound);
