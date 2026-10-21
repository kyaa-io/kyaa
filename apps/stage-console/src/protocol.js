export function assetUrl(asset) {
  return asset ? '/assets/' + asset.split('/').map(encodeURIComponent).join('/') : '';
}
export function readMediaReport(event, { origin, source, cueId, slideIndex }) {
  const value = event.data;
  if (!source || event.origin !== origin || event.source !== source || value?.type !== 'kyaa-stage-media') return null;
  if (slideIndex !== undefined && value.index !== slideIndex) return null;
  if (typeof value.playing !== 'boolean' || !Number.isFinite(value.position) || value.position < 0 || (value.ended !== undefined && typeof value.ended !== 'boolean')) return null;
  return { cueId, playing: value.playing, position: value.position, ended: value.ended === true || value.event === 'ended' };
}

export function previewPoint(clientX, clientY, box, naturalWidth, naturalHeight) {
  const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : box.width / box.height;
  const width = Math.min(box.width, box.height * ratio), height = width / ratio;
  const left = box.left + (box.width - width) / 2, top = box.top + (box.height - height) / 2;
  return { x: Math.max(0, Math.min(1, (clientX - left) / width)), y: Math.max(0, Math.min(1, (clientY - top) / height)) };
}
