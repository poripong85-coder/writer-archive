// 귤 하우스 — 온라인 집들이. 중문 모양과 방 소개는 전부 이 파일 하나에서 고친다.
// 중문을 똑똑 두드리면 귤이 문을 열고 나와서 방을 하나씩 구경시켜 준다.

export const HOUSE = {
  title: '귤 하우스',
  lead: '중문을 똑똑 두드려 보세요. 귤이 문을 열고 나와서 집 구경을 시켜 줘요.',

  // 우리집 중문 — 사진에 맞춰 고치기
  door: {
    panels: 3,            // 유리문 짝 수 (1~4). 3이면 3연동 슬라이딩
    openTo: 'right',      // 열릴 때 문짝이 모이는 쪽: 'right' | 'left'
    arch: false,          // 위가 둥근 아치형이면 true
    frame: '#2f2a26',     // 문틀 색 (블랙·화이트·우드 등)
    glass: 'fluted',      // 'clear' 투명 · 'frosted' 불투명 · 'fluted' 세로 줄무늬(모루유리)
    bars: [0.36],         // 가로 살 위치 (위에서부터 비율, 0~1). 없으면 []
    handle: '#c9a56b',    // 손잡이 색
  },

  greet: {
    knock: '똑!',
    who: '누구세요~?',
    hello: '앗, 와 줬구나! 어서 들어와요.',
    start: '우리 집 구경시켜 줄게요',
  },

  // 방 소개. scene: living · kitchen · study · bedroom · veranda (픽토그램 장면)
  // photo 에 사진 주소를 넣으면 장면 아래에 사진이 같이 뜬다.
  rooms: [
    { scene: 'living', name: '거실', line: '여기가 거실이에요. 햇볕이 제일 잘 드는 자리라 낮엔 늘 여기 있어요.', photo: '' },
    { scene: 'kitchen', name: '부엌', line: '부엌이에요. 귤차 한 잔 끓여 드릴까요? 따끈하게요.', photo: '' },
    { scene: 'study', name: '작업방', line: '귤껍질 출판사가 태어난 작업방! 책상 위는 늘 조금 어질러져 있어요.', photo: '' },
    { scene: 'bedroom', name: '침실', line: '침실은 살짝만 보여 드릴게요. 쉿, 이불이 아직 안 개어졌거든요.', photo: '' },
    { scene: 'veranda', name: '베란다', line: '마지막은 베란다! 화분들이 귤이랑 같이 광합성 중이에요.', photo: '' },
  ],

  outro: {
    line: '구경 잘 했어요? 집들이 선물은 방명록 한마디면 충분해요!',
    guestbook: '방명록에 한마디 남기기',
    again: '처음부터 다시 구경하기',
  },
};
