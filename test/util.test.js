import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKeyOf, parseDayKey, msUntilNextMidnight, untilMidnightLabel, daysBetween,
  formatTime, formatDayLabel, relativeDayLabel, extractUrls, extractTags,
  domainOf, richTextHtml, escapeHtml, entryMatches, summarize, densityLevel,
  monthMatrix, pendingArchiveDays, groupByTimeGap, highlightOf, formatBytes,
} from '../app/util.js';

test('dayKeyOf는 로컬 자정 기준으로 날짜를 만든다', () => {
  assert.equal(dayKeyOf(new Date(2026, 8, 14, 0, 0, 0)), '2026-09-14');
  assert.equal(dayKeyOf(new Date(2026, 8, 14, 23, 59, 59)), '2026-09-14');
  assert.equal(dayKeyOf(new Date(2026, 8, 15, 0, 0, 1)), '2026-09-15');
  assert.equal(dayKeyOf(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseDayKey는 dayKeyOf의 역함수다', () => {
  for (const key of ['2026-01-01', '2026-02-28', '2026-12-31']) {
    assert.equal(dayKeyOf(parseDayKey(key)), key);
  }
});

test('msUntilNextMidnight는 다음 자정까지의 시간', () => {
  assert.equal(msUntilNextMidnight(new Date(2026, 8, 14, 23, 0, 0)), 60 * 60 * 1000);
  assert.equal(msUntilNextMidnight(new Date(2026, 8, 14, 0, 0, 0)), 24 * 60 * 60 * 1000);
  assert.ok(msUntilNextMidnight(new Date(2026, 8, 14, 23, 59, 59, 999)) >= 1);
});

test('untilMidnightLabel', () => {
  assert.equal(untilMidnightLabel(new Date(2026, 8, 14, 18, 48)), '5시간 12분');
  assert.equal(untilMidnightLabel(new Date(2026, 8, 14, 23, 30)), '30분');
});

test('daysBetween / relativeDayLabel', () => {
  assert.equal(daysBetween('2026-09-12', '2026-09-14'), 2);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1); // 2026는 평년
  assert.equal(relativeDayLabel('2026-09-14', '2026-09-14'), '오늘');
  assert.equal(relativeDayLabel('2026-09-13', '2026-09-14'), '어제');
  assert.equal(relativeDayLabel('2026-09-12', '2026-09-14'), '그저께');
  assert.equal(relativeDayLabel('2026-09-01', '2026-09-14'), '9월 1일 (화)');
});

test('formatTime / formatDayLabel', () => {
  assert.equal(formatTime(new Date(2026, 8, 14, 0, 5).getTime()), '오전 12:05');
  assert.equal(formatTime(new Date(2026, 8, 14, 12, 0).getTime()), '오후 12:00');
  assert.equal(formatTime(new Date(2026, 8, 14, 15, 24).getTime()), '오후 3:24');
  assert.equal(formatDayLabel('2026-09-14'), '2026년 9월 14일 (월)');
});

test('extractUrls는 문장 끝 문장부호를 떼고 www도 잡는다', () => {
  assert.deepEqual(
    extractUrls('참고 https://example.com/a?b=1, 그리고 www.naver.com 도.'),
    ['https://example.com/a?b=1', 'https://www.naver.com'],
  );
  assert.deepEqual(extractUrls('링크 없음'), []);
  assert.deepEqual(extractUrls('중복 https://a.com https://a.com'), ['https://a.com']);
});

test('extractTags는 한글 태그와 중복을 처리한다', () => {
  assert.deepEqual(extractTags('#인사이트 오늘의 #ai/agent 정리 #인사이트'), ['인사이트', 'ai/agent']);
  assert.deepEqual(extractTags('색상코드 #fff 는 태그로 잡힌다'), ['fff']);
  assert.deepEqual(extractTags('url https://a.com/#앵커 는 태그가 아니다'), []);
});

test('domainOf', () => {
  assert.equal(domainOf('https://www.naver.com/x'), 'naver.com');
  assert.equal(domainOf('https://news.ycombinator.com/item?id=1'), 'news.ycombinator.com');
});

test('richTextHtml은 HTML을 이스케이프하고 링크·태그만 마크업한다', () => {
  const html = richTextHtml('<script>bad</script> #메모 https://a.com');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<span class="tag" data-tag="메모">#메모</span>'));
  assert.ok(html.includes('<a href="https://a.com"'));
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('entryMatches는 본문과 태그를 모두 본다', () => {
  const e = { text: '오늘 읽은 글 #에이전트 정리' };
  assert.ok(entryMatches(e, '읽은'));
  assert.ok(entryMatches(e, '#에이전트'));
  assert.ok(entryMatches(e, '에이전트'));
  assert.ok(entryMatches(e, ''));
  assert.ok(!entryMatches(e, '없는말'));
});

test('summarize는 하루치 통계를 낸다', () => {
  const entries = [
    { text: '메모 하나 #인사이트', images: [], starred: true },
    { text: 'https://a.com 참고 #인사이트 #링크', images: [{ id: 1 }, { id: 2 }] },
    { text: '', images: [{ id: 3 }] },
  ];
  const s = summarize(entries);
  assert.equal(s.count, 3);
  assert.equal(s.links, 1);
  assert.equal(s.photos, 3);
  assert.equal(s.starred, 1);
  assert.equal(s.tags[0].tag, '인사이트');
  assert.equal(s.tags[0].count, 2);
  assert.equal(summarize([]).count, 0);
});

test('densityLevel', () => {
  assert.equal(densityLevel(0), 0);
  assert.equal(densityLevel(2), 1);
  assert.equal(densityLevel(5), 2);
  assert.equal(densityLevel(9), 3);
  assert.equal(densityLevel(30), 4);
});

test('monthMatrix는 일요일 시작 6주 격자를 만든다', () => {
  const weeks = monthMatrix(2026, 8); // 2026년 9월
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0].length, 7);
  assert.equal(weeks[0][0].weekday, 0);
  const first = weeks.flat().find((c) => c.inMonth && c.day === 1);
  assert.equal(first.dayKey, '2026-09-01');
  assert.equal(weeks.flat().filter((c) => c.inMonth).length, 30);
});

test('pendingArchiveDays는 오늘 이전의 미봉인 날만 고른다', () => {
  const keys = ['2026-09-12', '2026-09-13', '2026-09-14'];
  assert.deepEqual(pendingArchiveDays(keys, '2026-09-14', new Set()), ['2026-09-12', '2026-09-13']);
  assert.deepEqual(pendingArchiveDays(keys, '2026-09-14', new Set(['2026-09-12'])), ['2026-09-13']);
  assert.deepEqual(pendingArchiveDays(keys, '2026-09-12', new Set()), []);
});

test('groupByTimeGap은 시간 간격으로 묶는다', () => {
  const t = new Date(2026, 8, 14, 9, 0).getTime();
  const entries = [
    { createdAt: t },
    { createdAt: t + 10 * 60000 },
    { createdAt: t + 3 * 3600000 },
  ];
  const groups = groupByTimeGap(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[1].entries.length, 1);
  assert.deepEqual(groupByTimeGap([]), []);
});

test('highlightOf는 별표한 조각을 우선한다', () => {
  const entries = [
    { text: '평범한 긴 메모입니다 아주 길어요', starred: false },
    { text: '핵심 인사이트', starred: true },
  ];
  assert.equal(highlightOf(entries), '핵심 인사이트');
  assert.equal(highlightOf([{ text: '', images: [{}] }]), '사진 조각');
  assert.equal(highlightOf([]), '');
  assert.ok(highlightOf([{ text: 'ㄱ'.repeat(200) }]).length <= 60);
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512B');
  assert.equal(formatBytes(2048), '2KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0MB');
});
