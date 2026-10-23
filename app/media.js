// 사진 처리: 저장 전 리사이즈, objectURL 캐시, 백업용 base64 변환.

import { uid } from './util.js';

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const urlCache = new Map(); // imageId -> objectURL

export function imageUrl(image) {
  if (!image) return '';
  if (urlCache.has(image.id)) return urlCache.get(image.id);
  const url = URL.createObjectURL(image.blob);
  urlCache.set(image.id, url);
  return url;
}

let photoBase = '';

/** 웹 모드(Supabase)에서 저장소 사진 주소의 앞부분을 정한다 */
export function setPhotoBase(base) {
  photoBase = String(base || '').replace(/\/$/, '');
}

/** 저장된 사진 레코드 → <img src>. claude.ai 사진은 asset id, 웹 모드는 저장소 경로, 로컬 사진은 Blob. */
export function photoSrc(image) {
  if (!image) return '';
  if (image.asset) return `/_blob/${image.asset}`;
  if (image.path && photoBase) return `${photoBase}/${image.path.split('/').map(encodeURIComponent).join('/')}`;
  if (image.blob) return imageUrl(image);
  return image.src || '';
}

export function releaseImages(images = []) {
  for (const img of images) {
    const url = urlCache.get(img.id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(img.id);
    }
  }
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지를 읽을 수 없어요.'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** File/Blob → 저장용 이미지 레코드 (필요하면 축소) */
export async function prepareImage(file) {
  if (!file || !file.type?.startsWith('image/')) return null;
  const isGif = file.type === 'image/gif';
  let blob = file;
  let width = 0, height = 0;

  try {
    const bitmap = await loadBitmap(file);
    width = bitmap.width; height = bitmap.height;
    const edge = Math.max(width, height);
    if (!isGif && edge > MAX_EDGE) {
      const scale = MAX_EDGE / edge;
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const resized = await new Promise((res) => canvas.toBlob(res, type, QUALITY));
      if (resized && resized.size < file.size) {
        blob = resized; width = w; height = h;
      }
    }
    bitmap.close?.();
  } catch {
    // 디코딩 실패 시 원본 그대로 저장
  }

  return {
    id: uid('img'),
    blob,
    type: blob.type || file.type || 'image/jpeg',
    size: blob.size,
    width,
    height,
    name: file.name || '사진',
  };
}

export async function prepareImages(files) {
  const out = [];
  for (const f of files) {
    const rec = await prepareImage(f);
    if (rec) out.push(rec);
  }
  return out;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** 클립보드/드롭 이벤트에서 이미지 파일 뽑아내기 */
export function filesFromEvent(event) {
  const dt = event.clipboardData || event.dataTransfer;
  if (!dt) return [];
  const files = [];
  if (dt.items?.length) {
    for (const item of dt.items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && f.type.startsWith('image/')) files.push(f);
      }
    }
  }
  if (!files.length && dt.files?.length) {
    for (const f of dt.files) if (f.type.startsWith('image/')) files.push(f);
  }
  return files;
}
