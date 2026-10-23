// 순수 함수 모음 — 날짜 경계, 텍스트 파싱, 통계. 부수효과 없음 (테스트 대상).

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const pad2 = (n) => String(n).padStart(2, '0');

/** 로컬 자정 기준 하루 키. 'YYYY-MM-DD' */
export function dayKeyOf(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 'YYYY-MM-DD' → 그 날 로컬 00:00 Date */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 다음 로컬 자정까지 남은 밀리초 (항상 1 이상) */
export function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}

/** '5시간 12분' 처럼 자정까지 남은 시간 */
export function untilMidnightLabel(now = new Date()) {
  const ms = msUntilNextMidnight(now);
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${Math.max(1, Math.floor(ms / 1000))}초`;
}

/** 두 dayKey 사이의 일수 (b - a) */
export function daysBetween(aKey, bKey) {
  const a = parseDayKey(aKey), b = parseDayKey(bKey);
  return Math.round((b - a) / 86400000);
}

export function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad2(d.getMinutes())}`;
}

export function formatDayLabel(dayKey) {
  const d = parseDayKey(dayKey);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

export function formatDayShort(dayKey) {
  const d = parseDayKey(dayKey);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 오늘/어제/그저께 또는 날짜 라벨 */
export function relativeDayLabel(dayKey, todayKey = dayKeyOf()) {
  const diff = daysBetween(dayKey, todayKey);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff === 2) return '그저께';
  return formatDayShort(dayKey);
}

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]{}"']+|(?:^|\s)(www\.[^\s<>()[\]{}"']+)/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** 텍스트에서 URL 추출 (중복 제거, 원문 순서 유지) */
export function extractUrls(text = '') {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(URL_RE)) {
    let raw = (m[1] ? m[1] : m[0]).trim().replace(TRAILING, '');
    if (!raw) continue;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const TAG_RE = /(^|[\s(\[])#([\p{L}\p{N}][\p{L}\p{N}_/-]{0,39})/gu;

/** '#인사이트' 형태의 태그 추출 (소문자 정규화, 중복 제거) */
export function extractTags(text = '') {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(TAG_RE)) {
    const tag = m[2];
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function pathOf(url) {
  try {
    const u = new URL(url);
    const p = (u.pathname + u.search).replace(/\/$/, '');
    return p && p !== '' ? decodeURI(p) : u.hostname;
  } catch {
    return url;
  }
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 이스케이프된 HTML에 링크/태그 마크업 입히기 */
export function richTextHtml(text = '') {
  let html = escapeHtml(text);
  html = html.replace(
    /\bhttps?:\/\/[^\s<]+/g,
    (m) => {
      const trail = m.match(TRAILING);
      const url = trail ? m.slice(0, -trail[0].length) : m;
      const rest = trail ? trail[0] : '';
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${rest}`;
    }
  );
  html = html.replace(
    /(^|[\s(\[])#([\p{L}\p{N}][\p{L}\p{N}_/-]{0,39})/gu,
    (_m, pre, tag) => `${pre}<span class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`
  );
  return html;
}

/** 검색용 정규화 */
export function normalize(s = '') {
  return String(s).toLowerCase().trim();
}

export function entryMatches(entry, query) {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(entry.text).includes(q)) return true;
  return extractTags(entry.text).some((t) => normalize(t).includes(q.replace(/^#/, '')));
}

/** 하루치 엔트리 → 인사이트 조각 통계 */
export function summarize(entries = []) {
  const tagCounts = new Map();
  let links = 0, photos = 0, chars = 0, starred = 0;
  for (const e of entries) {
    const text = e.text || '';
    chars += text.replace(/\s/g, '').length;
    links += extractUrls(text).length;
    photos += (e.images || []).length;
    if (e.starred) starred += 1;
    for (const t of extractTags(text)) {
      const key = t.toLowerCase();
      const prev = tagCounts.get(key);
      tagCounts.set(key, { tag: prev?.tag || t, count: (prev?.count || 0) + 1 });
    }
  }
  const tags = [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { count: entries.length, links, photos, chars, starred, tags };
}

/** 달력 셀 농도 0~4 */
export function densityLevel(count) {
  if (!count) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** 월 달력 6주 매트릭스 (일요일 시작) */
export function monthMatrix(year, month /* 0-based */) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      row.push({
        date,
        dayKey: dayKeyOf(date),
        day: date.getDate(),
        weekday: date.getDay(),
        inMonth: date.getMonth() === month,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** 아카이브 대상: 오늘 이전(dayKey < todayKey)인 미봉인 날짜들 */
export function pendingArchiveDays(entryDayKeys = [], todayKey = dayKeyOf(), sealed = new Set()) {
  const days = new Set();
  for (const k of entryDayKeys) {
    if (k < todayKey && !sealed.has(k)) days.add(k);
  }
  return [...days].sort();
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

export function uid(prefix = 'e') {
  const rnd = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `${prefix}_${Date.now().toString(36)}_${rnd.slice(0, 8)}`;
}

/** 큰 시간 간격(기본 45분)마다 시간 구분선을 넣기 위한 그룹핑 */
export function groupByTimeGap(entries = [], gapMs = 45 * 60 * 1000) {
  const groups = [];
  let current = null;
  for (const e of entries) {
    if (!current || e.createdAt - current.until > gapMs) {
      current = { startedAt: e.createdAt, until: e.createdAt, entries: [e] };
      groups.push(current);
    } else {
      current.entries.push(e);
      current.until = e.createdAt;
    }
  }
  return groups;
}

/** 조각 카드 한 줄 요약 */
export function highlightOf(entries = []) {
  const starred = entries.find((e) => e.starred && (e.text || '').trim());
  const source = starred || entries.find((e) => (e.text || '').trim().length > 12) || entries[0];
  if (!source) return '';
  const text = (source.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return (source.images || []).length ? '사진 조각' : '';
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** '방금' · '5분 전' · '3시간 전' · '어제' · '10월 3일' · '2025년 10월 3일' */
export function timeAgo(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const d = new Date(ts), n = new Date(now);
  const dayGap = daysBetween(dayKeyOf(d), dayKeyOf(n));
  if (dayGap === 0) return `${Math.floor(min / 60)}시간 전`;
  if (dayGap === 1) return '어제';
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
