export const imageCached = {};
export function getCachedImage(key) {
  return imageCached[key] || null;
}
export function cacheImage(key, url) {
  if (!key || !url) return;
  imageCached[key] = url;
  return url;
}
export async function clearImageCache() {
  for (const key in imageCached) {
    try { URL.revokeObjectURL(imageCached[key]); } catch (e) { /* ignore */ }
    delete imageCached[key];
  }
}