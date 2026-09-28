# 가구 거래소 API

[features.md](features.md) 기준 계약. 공통 규칙(prefix `/api/v1`, key 기반 이미지, 에러 `{ code, message }`, 인증된 사용자 기준 소유권 guard)은 [api.md](../../api.md)를 따른다. 목록은 `{ items, page, size, totalElements }` 페이지 형식이다.

## 엔드포인트

| Method | Path | 결과 |
| --- | --- | --- |
| POST | `/market/assets` | 내 AI 가구 발행 → 201 Asset |
| GET | `/market/assets` | 종목 카드 목록 → 200 Page<AssetCard> |
| GET | `/market/assets/{assetId}` | 종목 상세·호가 → 200 Asset |
| GET | `/market/assets/{assetId}/trades` | 최근 체결 → 200 Page<Trade> |
| POST | `/market/orders` | 주문 접수 → 202 Command |
| POST | `/market/orders/{orderId}/cancel` | 주문 취소 접수 → 202 Command |
| GET | `/market/commands/{commandId}` | 접수 결과 → 200 Command |
| GET | `/me/market/orders` | 내 주문 목록 → 200 Page<Order> |

## POST /api/v1/market/assets

내 AI 가구를 에디션으로 발행한다.
관련 table: `market_assets`, `user_items`, `items`, `furniture_generation_jobs`.

- 요청 body: `{ "userItemId": 77, "totalSupply": 5 }`
- 검증: 호출자가 `userItemId`를 활성 보유하고 그 가구의 생성자여야 한다. `photo_furniture` 테마만. `totalSupply` 1~10. 가구당 1회.
- 응답 201: 아래 종목 상세와 같은 형태. 발행 재고 `unissuedQuantity = totalSupply - 1`.
- 주요 오류: 미보유 `MARKET_ITEM_NOT_OWNED`(403), 제작자 아님 `MARKET_NOT_CREATOR`(403), 거래 불가 아이템 `MARKET_ITEM_NOT_TRADABLE`(409), 이미 상장 `MARKET_ASSET_ALREADY_LISTED`(409).

## GET /api/v1/market/assets

- 요청(query): `page`, `size`(기본 20). 거래 중(`ACTIVE`) 종목만, 최근 상장순.
- 응답 `items[]`: `assetId`, `itemId`, `name`, `assetKey`, `creatorNickname?`(제작자 탈퇴 시 null), `totalSupply`, `bestAskPrice?`, `askQuantity`(판매 대기 총수량), `lastTradePrice?`, `status`

## GET /api/v1/market/assets/{assetId}

- 응답: `assetId`, `itemId`, `name`, `assetKey`, `creatorNickname?`, `isCreator`, `totalSupply`, `unissuedQuantity`, `status`, `lastTradePrice?`, `owned`(활성 보유 여부), `asks[]`, `bids[]`
  - `asks[]`·`bids[]`: `{ price, quantity }` 가격대별 합산, 각 최대 10단계. `asks` 가격 오름차순, `bids` 내림차순.
- 주요 오류: 없는 종목 `MARKET_ASSET_NOT_FOUND`(404).

## GET /api/v1/market/assets/{assetId}/trades

- 요청(query): `page`, `size`. 최신순.
- 응답 `items[]`: `tradeId`, `price`, `quantity`, `tradedAt`

## POST /api/v1/market/orders

- 요청 body: `{ "requestId": "uuid", "assetId": 1, "side": "BUY", "price": 30, "quantity": 1, "source": null }`
  - `side`: `BUY` / `SELL`. `SELL`이면 `source` 필수: `INVENTORY`(내 보유분, `quantity` 1) / `ISSUANCE`(제작자 발행 재고, `quantity` 1~남은 재고). `BUY`는 `quantity` 1.
  - `price`: 1~1,000 코인 정수.
- 동작: 검증 → 에스크로(코인 차감 / 보유분 인벤토리 숨김·방 배치 해제 / 발행 재고 차감) → 접수. 체결은 비동기.
- 응답 202: `{ "commandId": 10, "status": "PENDING" }`
- 멱등: 같은 `requestId` 재요청은 기존 접수를 그대로 반환한다.
- 주요 오류: 범위 위반 `VALIDATION_FAILED`(400), `MARKET_ASSET_NOT_FOUND`(404), 거래 정지 `MARKET_ASSET_SUSPENDED`(409), 코인 부족 `MARKET_INSUFFICIENT_COIN`(409), 이미 보유·매수 대기 중 `MARKET_ALREADY_HOLDING`(409), 판매할 보유분 없음 `MARKET_ITEM_NOT_OWNED`(403), 발행 재고 판매인데 제작자 아님 `MARKET_NOT_CREATOR`(403), 발행 재고 부족 `MARKET_INSUFFICIENT_SUPPLY`(409).

## POST /api/v1/market/orders/{orderId}/cancel

- 요청 body: `{ "requestId": "uuid" }`
- 응답 202: Command. 환불은 엔진 처리 시 이뤄진다.
- 주요 오류: 본인 주문 아님 `MARKET_ORDER_NOT_FOUND`(404), 이미 종료 `MARKET_ORDER_NOT_OPEN`(409).

## GET /api/v1/market/commands/{commandId}

본인 접수만 조회한다. 앱은 주문·취소 후 이 API로 결과를 확인한다.

- 응답: `commandId`, `status`(`PENDING` / `APPLIED` / `REJECTED`), `rejectCode?`, `order?`(아래 Order)
- 엔진 거절 사유: 자기 주문과 맞물림 `MARKET_SELF_TRADE`, 거래 정지 `MARKET_ASSET_SUSPENDED`, 대상 주문 종료 `MARKET_ORDER_NOT_OPEN`, 처리 반복 실패 `MARKET_ENGINE_ERROR`. 거절 시 맡아 둔 것은 돌려준다.

## GET /api/v1/me/market/orders

- 요청(query): `status` = `OPEN`(기본) / `CLOSED`, `page`, `size`. 최신순.
- 응답 `items[]`(Order): `orderId`, `assetId`, `name`, `assetKey`, `side`, `source?`, `price`, `quantity`, `filledQuantity`, `status`(`OPEN` / `FILLED` / `CANCELLED` / `EXPIRED`), `expiresAt`, `createdAt`
