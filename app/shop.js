// 귤껍질 상점 — 상품 정보. 사진·구성품·가격·구매 방법은 정해지는 대로 여기 채운다.
//   photos : [{ src: 'images/shop/snowman-1.jpg', alt: '눈사람 모빌 전체 모습' }, …]
//   items  : ['눈사람 3개', …]  구성품
//   price  : '25,000원'
//   buyUrl : 구매(주문) 페이지 주소. 비어 있으면 '판매 준비중' 버튼만 보인다
//   howToBuy : 구매 방법 안내 한두 줄

export const PRODUCTS = {
  'buy-snowman': {
    name: '눈사람 모빌',
    icon: 'i-snowman',
    status: '판매 준비중',
    lead: '눈사람 모빌 + 겨울 간식 모임에서 만드는 그 모빌이에요.',
    photos: [],
    items: [],
    price: '',
    buyUrl: '',
    howToBuy: '',
    back: { route: 'meet-snowman', text: '← 눈사람 모빌 + 겨울 간식 모임으로' },
  },
};
