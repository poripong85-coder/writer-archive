// 백업 — 기록장 하나를 사진까지 포함한 JSON 한 파일로 내보내고 되돌린다.
// 같은 형식이 예전 버전(이 기기에만 저장하던 시절)의 조각을 옮겨올 때도 쓰인다.

import { blobToDataUrl, dataUrlToBlob, photoSrc } from './media.js';
import { dayKeyOf, pad2, uid } from './util.js';

const FORMAT = 'gyulggeopjil.backup';
const VERSION = 2;

/** 사진 레코드 → Blob (로컬 Blob이면 그대로, 공유 저장소면 내려받아서) */
async function imageBlob(img) {
  if (img.blob) return img.blob;
  const src = photoSrc(img);
  if (!src) return null;
  try {
    const res = await fetch(src);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

export async function buildBackup(book) {
  const entries = [];
  for (const e of book.entries) {
    const images = [];
    for (const img of e.images || []) {
      const blob = await imageBlob(img);
      if (!blob) continue;
      images.push({
        id: img.id, type: blob.type || img.type, width: img.width, height: img.height, name: img.name,
        data: await blobToDataUrl(blob),
      });
    }
    entries.push({
      id: e.id, dayKey: e.dayKey, createdAt: e.createdAt, updatedAt: e.updatedAt,
      text: e.text, starred: !!e.starred, images,
    });
  }
  return { format: FORMAT, version: VERSION, book: book.key, exportedAt: new Date().toISOString(), entries };
}

export function backupFilename(book, now = new Date()) {
  const name = book.key === 'public' ? '귤껍질기록장' : '나의기록장';
  return `${name}-백업-${dayKeyOf(now)}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

/** 파일 저장이 직접 되는 환경인지 (액자 안이 아님) */
export function canDirectDownload() {
  try { return window.self === window.top; } catch { return false; }
}

/**
 * 백업 파일을 건넨다.
 * @returns {Promise<{status: 'saved'|'declined'|'copy', json?: string, count: number}>}
 *   'copy' 면 화면에서 JSON을 복사해 가도록 보여줘야 한다.
 */
export async function exportBackup(book, env) {
  const data = await buildBackup(book);
  const json = JSON.stringify(data);
  const filename = backupFilename(book);
  const count = data.entries.length;

  if (env.downloads) {
    try {
      await env.downloads.save({ filename, data: json });
      return { status: 'saved', count };
    } catch (err) {
      if (err?.code === 'declined') return { status: 'declined', count };
      return { status: 'copy', json, count, filename };
    }
  }
  if (canDirectDownload()) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved', count };
  }
  return { status: 'copy', json, count, filename };
}

/** 백업 JSON(v1·v2) → 가져올 엔트리 목록 (사진은 Blob으로 복원) */
export async function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('백업 파일을 읽을 수 없어요.');
  }
  if (data?.format !== FORMAT || !Array.isArray(data.entries)) {
    throw new Error('귤껍질 백업 파일이 아니에요.');
  }
  const entries = [];
  for (const e of data.entries) {
    const images = [];
    for (const img of e.images || []) {
      if (!img?.data) continue;
      images.push({
        id: img.id || uid('img'), type: img.type, width: img.width, height: img.height,
        name: img.name, blob: await dataUrlToBlob(img.data),
      });
    }
    entries.push({ ...e, images });
  }
  return entries;
}
