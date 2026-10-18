import {ACQUISITION_CHANNELS, acquisitionChannel, createInquirySubmission, gatheringHasEnded, GATHERING_END, decorateOutboundUrl, isTrackedOutboundUrl} from './helpers.mjs';
const copy = await fetch('/content.json').then(response => response.json());
const locale = document.documentElement.lang === 'en' ? 'en' : 'ko';
let anonymousSessionId;
let channel = acquisitionChannel(location.search, document.referrer);
try {
  anonymousSessionId = sessionStorage.getItem('kyaa-wave-outbound-session');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anonymousSessionId || '')) anonymousSessionId = crypto.randomUUID();
  sessionStorage.setItem('kyaa-wave-outbound-session', anonymousSessionId);
  const savedChannel = sessionStorage.getItem('kyaa-wave-channel');
  if (ACQUISITION_CHANNELS.includes(savedChannel)) channel = savedChannel;
  sessionStorage.setItem('kyaa-wave-channel', channel);
} catch { try { anonymousSessionId = crypto.randomUUID(); } catch { /* Navigation remains usable without tracking. */ } }
const eventKeys = ['eventLabel', 'eventDescription', 'eventNote', 'eventAction', 'note2', 'note2Copy', 'guideEvent'];
const text = key => copy[eventKeys.includes(key) && gatheringHasEnded() ? `${key}Past` : key === 'eventLabel' ? 'eventLabelNext' : key][locale === 'en' ? 1 : 0];
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
function updateGathering() {
  eventKeys.forEach(key => document.querySelectorAll(`[data-i18n="${key}"]`).forEach(element => { element.textContent = text(key); }));
  if (activeGuide === 'event') fillGuide('event');
}
const untilGatheringEnd = GATHERING_END - Date.now();
if (untilGatheringEnd > 0) setTimeout(updateGathering, Math.min(untilGatheringEnd, 2147483647));
document.addEventListener('visibilitychange', updateGathering);
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
  if (['idle', 'rejected'].includes(submission.state)) document.querySelector('#inquiry-interest').value = button.dataset.inquiry || 'creator';
  trackEngagement('inquiry_open');
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
function trackEngagement(event, requestId) {
  try {
    requestId ||= crypto.randomUUID();
    fetch('https://kyaa.io/api/wave/engagements', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'omit', keepalive:true, body:JSON.stringify({event, requestId, sessionId:anonymousSessionId, channel, locale})}).catch(() => {});
  }
  catch { /* Measurement must not interrupt an inquiry. */ }
}
trackEngagement('page_view');
const form = document.querySelector('#inquiry-form');
const fields = document.querySelector('#inquiry-fields');
const submitButton = document.querySelector('#inquiry-submit');
const status = document.querySelector('#form-status');
const submission = createInquirySubmission(payload => {
  trackEngagement('inquiry_submit', payload.requestId);
  return fetch('https://kyaa.io/api/inquiries/wave', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'omit', signal:AbortSignal.timeout(20000), body:JSON.stringify(payload)});
}, () => crypto.randomUUID());
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submission.busy || submission.state === 'accepted') return;
  const values = Object.fromEntries(new FormData(form));
  values.consent = form.elements.consent.checked;
  values.sessionId = anonymousSessionId;
  values.channel = channel;
  try {
    const pending = submission.submit(values, locale);
    if (submission.busy) {
      fields.disabled = true;
      submitButton.disabled = true;
      form.setAttribute('aria-busy', 'true');
      status.textContent = text('sending');
      submitButton.textContent = text('sending');
    }
    const result = await pending;
    status.textContent = text(result);
    fields.disabled = result === 'accepted' || result === 'unknown';
    submitButton.disabled = result === 'accepted';
    submitButton.textContent = text(result === 'unknown' ? 'retryInquiry' : result === 'accepted' ? 'inquiryDone' : 'sendInquiry');
  } catch {
    status.textContent = text('invalid');
    fields.disabled = false;
    submitButton.disabled = false;
    submitButton.textContent = text('sendInquiry');
  } finally { form.removeAttribute('aria-busy'); }
});
// Only these public destinations are part of this site's outbound contract.
const isTracked = anchor => {
  if (!anchor || anchor.dataset.outboundTracking === 'off' || anchor.hasAttribute('download')) return false;
  return isTrackedOutboundUrl(anchor.href);
};
document.querySelectorAll('a[href]').forEach(anchor => { if (isTracked(anchor)) anchor.href = decorateOutboundUrl(anchor.href, anchor.dataset.outboundPlacement || 'content', anchor.dataset.outboundKind || 'website'); });
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
