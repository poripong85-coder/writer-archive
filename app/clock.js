// 하루의 경계. 봉인은 따로 기록하지 않는다 — 오늘 이전의 날은 곧 봉인된 날이다.
// 이 모듈은 자정을 알아채서 화면에 "하루가 넘어갔다"고 알려주기만 한다.

import { dayKeyOf, msUntilNextMidnight } from './util.js';

/**
 * 자정마다 onDayChange(prevKey, nextKey)를 부른다.
 * 기기가 잠들어 타이머를 놓쳐도 화면이 다시 보일 때 확인한다.
 */
export function watchMidnight(onDayChange) {
  let current = dayKeyOf();
  let timer = null;

  const check = () => {
    const now = dayKeyOf();
    if (now !== current) {
      const prev = current;
      current = now;
      onDayChange(prev, now);
    }
  };

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { check(); arm(); }, msUntilNextMidnight() + 1000);
  };

  const onWake = () => {
    if (document.visibilityState === 'hidden') return;
    check();
    arm();
  };

  arm();
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('focus', onWake);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onWake);
    window.removeEventListener('focus', onWake);
  };
}

/** 지난번 이 기록장을 본 날 이후, 오늘 전까지 조각이 있던 날들 (오래된 순) */
export function daysSealedSince(lastSeenKey, todayKey, dayKeys) {
  if (!lastSeenKey || lastSeenKey >= todayKey) return [];
  return [...new Set(dayKeys)].filter((k) => k >= lastSeenKey && k < todayKey).sort();
}
