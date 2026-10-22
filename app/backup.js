// 백업 — 사진까지 포함한 JSON 한 파일로 내보내고 되돌리기.

import { allEntries, allArchives, bulkPut } from './db.js';
import { blobToDataUrl, dataUrlToBlob } from './media.js';
import { dayKeyOf, pad2 } from './util.js';

const FORMAT = 'gyulggeopjil.backup';
const VERSION = 1;

export async function buildBackup() {
  const [entries, archives] = await Promise.all([allEntries(), allArchives()]);
  const packed = [];
  for (const e of entries) {
    const images = [];
    for (const img of e.images || []) {
      images.push({
        id: img.id, type: img.type, size: img.size,
        width: img.width, height: img.height, name: img.name,
        data: await blobToDataUrl(img.blob),
      });
    }
    packed.push({ ...e, images });
  }
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), entries: packed, archives };
}

/**
 * 임베드된 iframe 안에서는 <a download> 가 동작하지 않는다.
 * 그런 환경에서는 파일 대신 JSON을 복사해 가져가게 한다.
 */
export function canDownload() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export async function backupJson() {
  return JSON.stringify(await buildBackup());
}

export function backupFilename(now = new Date()) {
  return `귤껍질-백업-${dayKeyOf(now)}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

export async function downloadBackup() {
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data.entries.length;
}

export async function restoreBackup(file) {
  const text = await file.text();
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
        id: img.id, type: img.type, size: img.size,
        width: img.width, height: img.height, name: img.name,
        blob: await dataUrlToBlob(img.data),
      });
    }
    entries.push({
      id: e.id,
      dayKey: e.dayKey,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt ?? e.createdAt,
      text: e.text || '',
      images,
      starred: !!e.starred,
    });
  }
  await bulkPut({ entries, archives: Array.isArray(data.archives) ? data.archives : [] });
  return entries.length;
}
