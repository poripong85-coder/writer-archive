// 자정 아카이브: 하루가 끝나면 그날의 기록을 '인사이트 조각'으로 봉인합니다.

import { allEntries, putArchive, sealedDayKeys, getMeta, setMeta } from './db.js';
import { dayKeyOf, msUntilNextMidnight, pendingArchiveDays, summarize, highlightOf } from './util.js';

const LAST_SEAL_KEY = 'lastSealedAt';

/**
 * 오늘 이전의 미봉인 날짜를 모두 아카이브한다.
 * 조각 통계는 항상 엔트리에서 다시 계산하므로, 아카이브 레코드는 '봉인 시각'과
 * 봉인 당시 스냅샷만 보관한다 (나중에 글을 고쳐도 화면은 어긋나지 않음).
 * @returns {Promise<Array<{dayKey:string,count:number}>>} 이번에 새로 봉인된 날들
 */
export async function runRollover(now = new Date()) {
  const todayKey = dayKeyOf(now);
  const [entries, sealed] = await Promise.all([allEntries(), sealedDayKeys()]);
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.dayKey)) byDay.set(e.dayKey, []);
    byDay.get(e.dayKey).push(e);
  }

  const targets = pendingArchiveDays([...byDay.keys()], todayKey, sealed);
  const newlySealed = [];

  for (const dayKey of targets) {
    const dayEntries = byDay.get(dayKey) || [];
    const stats = summarize(dayEntries);
    await putArchive({
      dayKey,
      sealedAt: Date.now(),
      count: stats.count,
      links: stats.links,
      photos: stats.photos,
      chars: stats.chars,
      starred: stats.starred,
      tags: stats.tags.slice(0, 12),
      highlight: highlightOf(dayEntries),
    });
    newlySealed.push({ dayKey, count: stats.count });
  }

  if (newlySealed.length) await setMeta(LAST_SEAL_KEY, Date.now());
  return newlySealed;
}

export async function lastSealedAt() {
  return getMeta(LAST_SEAL_KEY, null);
}

/**
 * 다음 자정에 콜백을 실행하고 다시 예약한다.
 * 기기가 잠들어 타이머를 놓쳤을 때를 대비해 포커스/가시성 변화에서도 확인한다.
 * @returns {() => void} 해제 함수
 */
export function scheduleMidnight(onRollover) {
  let timer = null;
  let currentDay = dayKeyOf();
  let running = false;

  const fire = async (reason) => {
    if (running) return;
    running = true;
    try {
      const sealed = await runRollover();
      currentDay = dayKeyOf();
      if (sealed.length) await onRollover(sealed, reason);
    } finally {
      running = false;
    }
  };

  const arm = () => {
    clearTimeout(timer);
    // 자정 직후 1초 뒤에 실행해 경계 오차를 피한다.
    timer = setTimeout(async () => {
      await fire('midnight');
      arm();
    }, msUntilNextMidnight() + 1000);
  };

  const checkMissed = () => {
    if (document.visibilityState === 'hidden') return;
    if (dayKeyOf() !== currentDay) {
      fire('wake');
      arm();
    }
  };

  arm();
  document.addEventListener('visibilitychange', checkMissed);
  window.addEventListener('focus', checkMissed);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', checkMissed);
    window.removeEventListener('focus', checkMissed);
  };
}
