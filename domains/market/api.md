# 고정가 가구 거래 API

인증된 사용자 기준이다. 경로 접두사는 `/api/v1/market/shop`이다. JSON 오류 형태는 공통 API 계약을 따른다.

## GET /api/v1/market/shop

- query: `page` 기본 0, `size` 기본 20, 최대 100, `mine` 기본 false.
- `mine=false`: 판매 중이며 제작자가 활성 상태인 상품. 차단한 제작자의 상품은 제외한다.
- `mine=true`: 본인이 만든 상품. 판매 중지와 가격 미설정 상품도 포함한다.
- 응답: `{ items, page, size, totalElements }`.
- 상품: `assetId`, `itemId`, `name`, `assetKey`, `creatorNickname`, `isCreator`, `price`(미설정 null), `selling`, `owned`.

## GET /api/v1/market/shop/{assetId}

- 위 상품 객체를 반환한다. 판매 중지 상품도 상세를 볼 수 있다.

## POST /api/v1/market/shop

- body: `{ "userItemId": 989, "price": 30 }`.
- 본인이 생성하고 보관 중인 가구만 판매 등록할 수 있다. 검수 중이면 거절한다.
- 기존 상품이 있으면 그 상품의 가격을 바꾸고 판매를 재개한다. 원본과 방 배치는 유지한다.
- 응답 200: 상품 객체.

## PUT /api/v1/market/shop/{assetId}

- body: `{ "price": 30, "selling": true }`. 가격 1~1,000, selling 필수.
- 제작자만 가격과 판매 상태를 바꿀 수 있다. 판매 중지는 `selling=false`다.
- 응답 200: 변경된 상품 객체.

## POST /api/v1/market/shop/{assetId}/purchase

- body: `{ "requestId": "UUID", "expectedPrice": 30 }`.
- 응답 200: `{ "purchaseId": 1, "assetId": 11, "userItemId": 990, "price": 30 }`.
- 동기 결제다. 주문 대기, 접수 결과 폴링은 없다. 같은 요청 재전송은 같은 영수증을 반환한다.
- 성공한 구매의 가격, 판매자, 수수료, 지급 가구는 `market_purchases`에 불변 기록한다.
- 원장: 구매자 `MARKET_PURCHASE`, 제작자 `MARKET_SALE`, 양쪽 `source_type=MARKET_PURCHASE`, `source_id=purchaseId`.

## 오류

| 코드 | 상태 | 의미 |
| --- | --- | --- |
| MARKET_PRICE_CHANGED | 409 | 현재 가격과 요청 가격이 다름. 새 가격을 확인한 뒤 재시도 |
| MARKET_NOT_FOR_SALE | 409 | 판매 중지 또는 가격 미설정 |
| MARKET_TRANSITION_PENDING | 409 | 기존 주문의 정산, 반환이 아직 끝나지 않음 |
| MARKET_ORDERBOOK_RETIRED | 409 | 기존 발행, 주문, 수량 수정 API는 종료됨 |
| MARKET_ALREADY_HOLDING | 409 | 제작자 본인, 이미 보유, 이미 구매한 상품 |
| MARKET_INSUFFICIENT_COIN | 409 | 코인 부족 |
| MARKET_REQUEST_CONFLICT | 409 | 같은 requestId에 다른 상품 또는 요청 가격 |
| MARKET_NOT_CREATOR | 403 | 제작자가 아닌 사용자의 판매 등록, 수정 |
| MARKET_ITEM_NOT_OWNED | 403 | 판매 등록할 원본을 보유하지 않음 |
| MARKET_ASSET_SUSPENDED | 409 | 운영자 거래 정지 |
| MARKET_ASSET_NOT_FOUND | 404 | 상품 없음 또는 제작자 탈퇴 등 구매 불가 |

기존 주문 취소와 조회는 [기존 API](legacy-api.md)를 따른다. 새 주문 생성과 수량 수정은 허용하지 않는다.
