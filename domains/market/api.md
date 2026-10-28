# 가구 거래소 API

[features.md](features.md) 기준 계약. 공통 규칙(prefix `/api/v1`, key 기반 이미지, 에러 `{ code, message }`, 인증된 사용자 기준 소유권 guard)은 [api.md](../../api.md)를 따른다. 목록은 `{ items, page, size, totalElements }` 페이지 형식이다. 목록 조회의 `page`는 0 이상, `size`는 1~100(기본 20)이고, 범위를 벗어나면 `VALIDATION_FAILED`(400)이다.

## 엔드포인트

| Method | Path | 결과 |
| --- | --- | --- |
| POST | `/market/assets` | 내 AI 가구 발행 → 201 Asset |
| GET | `/market/assets` | 종목 카드 목록 → 200 Page<AssetCard> |
| GET | `/market/assets/{assetId}` | 종목 상세·호가 → 200 Asset |
| GET | `/market/assets/{assetId}/trades` | 최근 체결 → 200 Page<Trade> |
| POST | `/market/orders` | 주문 접수 → 202 Command |
| POST | `/market/orders/{orderId}/cancel` | 주문 취소 접수 → 202 Command |
| POST | `/market/orders/{orderId}/amend` | 발행 재고 판매 주문 수량 수정 접수 → 202 Command |
| GET | `/market/commands/{commandId}` | 접수 결과 → 200 Command |
| GET | `/me/market/assets` | 내 판매 관리 가구 → 200 Page<AssetCard> |
| GET | `/me/market/orders` | 내 주문 목록 → 200 Page<Order> |

## POST /api/v1/market/assets

내 AI 가구를 에디션으로 발행한다.
관련 table: `market_assets`, `user_items`, `items`, `furniture_generation_jobs`.

- 요청 body: `{ "userItemId": 77, "totalSupply": 5 }`
- 검증: 호출자가 `userItemId`를 활성 보유하고 그 가구의 생성자여야 한다. `photo_furniture` 테마만. `totalSupply` 1~10. 가구당 1회.
- 응답 201: 아래 종목 상세와 같은 형태. 발행 재고 `unissuedQuantity = totalSupply - 1`. 발행 직후에는 판매 주문이 없어 거래소 목록에 노출하지 않는다.
- 주요 오류: 미보유 `MARKET_ITEM_NOT_OWNED`(403), 제작자 아님 `MARKET_NOT_CREATOR`(403), 거래 불가 아이템 `MARKET_ITEM_NOT_TRADABLE`(409), 이미 상장 `MARKET_ASSET_ALREADY_LISTED`(409), 가구 생성·재검수 작업이 진행 중(`UPLOADING`/`QUEUED`/`PROCESSING`) `MARKET_ITEM_REVIEW_IN_PROGRESS`(409). 재검수가 실패(`FAILED`)한 가구는 남아 있으므로 발행할 수 있다.

## GET /api/v1/market/assets

- 요청(query): `page`, `size`(기본 20, 최대 100). 거래 가능(`ACTIVE`)하고 `OPEN` 판매 주문이 하나 이상인 종목만, 최근 발행순. `totalElements`에도 같은 필터를 적용한다.
- 응답 `items[]`: `assetId`, `itemId`, `name`, `assetKey`, `creatorNickname?`(제작자 탈퇴 시 null), `totalSupply`, `bestAskPrice?`(최저 매도가, 판매 대기 없으면 null), `askQuantity`(판매 대기 주문의 남은 수량 합계, 없으면 0), `lastTradePrice?`(체결 없으면 null), `status`

## GET /api/v1/me/market/assets

- 인증된 요청자가 제작했거나 활성 보유하거나 `OPEN` 판매 주문 또는 `PENDING` 판매 접수가 있는 가구를 조회한다. 판매 주문 없이 비노출 중인 가구와 거래 정지 가구도 관리 목적으로 포함한다. 거래 정지 가구의 새 주문은 계속 거절한다.
- 요청(query): `page`, `size`(기본 20, 최대 100). 최근 발행순. 응답은 위 목록과 같은 `Page<AssetCard>`이며 `totalElements`는 본인 관리 대상만 센다.
- 앱 ‘내 판매 관리’ 진입점에서 사용한다. 최초 발행과 판매 취소 후에도 가구를 다시 찾아 판매할 수 있다.

## GET /api/v1/market/assets/{assetId}

- 응답: `assetId`, `itemId`, `name`, `assetKey`, `creatorNickname?`, `isCreator`, `totalSupply`, `unissuedQuantity`, `status`, `lastTradePrice?`, `owned`(요청자가 인벤토리에 활성 보유 중인지. 판매 등록으로 맡긴 것은 제외), `buyPending`, `sellPending`, `asks[]`, `bids[]`, `mySellOrders[]`. `isCreator`와 대기 여부도 요청자 기준이다.
  - `buyPending`: 본인의 해당 종목 BUY 주문이 `OPEN`이거나 BUY PLACE 접수가 `PENDING`이면 true.
  - `sellPending`: 본인의 해당 종목 SELL 주문이 `OPEN`이거나 SELL PLACE 접수가 `PENDING`이면 true. 보유분과 발행 재고 모두 포함한다.
  - `owned`는 실제 인벤토리 보유 의미를 유지한다. 구매 버튼은 거래 정지, `owned`, `buyPending`, `sellPending`, 판매 호가 없음 중 하나라도 해당하면 비활성화한다. `buyPending`일 때 판매 버튼도 비활성화하고 내 주문으로 안내한다.
  - 취소를 접수했어도 원래 주문이 `OPEN`이면 대기는 유지된다. 체결, 취소, 만료 또는 접수 거절 처리가 끝나면 해당 대기는 해제된다. 이 조회는 안내용이며 실제 주문 접수 시 서버가 다시 검증한다.
  - 판매 호가가 없으면 구매를 막는다. 판매 주문이 있으나 가격이 맞지 않을 때만 구매 대기로 남으며 판매자 승인 절차는 없다.
  - `mySellOrders[]`: 요청자 본인의 해당 종목 `OPEN` 판매 주문을 주문 id 오름차순으로 반환한다. 아래 Order와 같은 필드이며 보유분, 발행 재고 모두 포함한다. 다른 회원의 주문은 포함하지 않는다. 잔량은 `quantity - filledQuantity`이며 주문별 취소 버튼을 제공한다.
  - 비노출 가구의 상세는 계속 조회할 수 있다. 실제 보유분, 제작자의 발행 재고 판매를 통해 재등록할 수 있다.
  - `asks[]`·`bids[]`: `{ price, quantity }` 가격대별 합산, 각 최대 10단계. `asks` 가격 오름차순, `bids` 내림차순.
- 주요 오류: 없는 종목 `MARKET_ASSET_NOT_FOUND`(404).

## GET /api/v1/market/assets/{assetId}/trades

- 요청(query): `page`, `size`(기본 20, 최대 100). 최신순.
- 응답 `items[]`: `tradeId`, `price`, `quantity`, `tradedAt`
- 주요 오류: 없는 종목 `MARKET_ASSET_NOT_FOUND`(404).

## POST /api/v1/market/orders

- 요청 body: `{ "requestId": "uuid", "assetId": 1, "side": "BUY", "price": 30, "quantity": 1, "source": null }`
  - `side`: `BUY` / `SELL`. `SELL`이면 `source` 필수: `INVENTORY`(내 보유분, `quantity` 1) / `ISSUANCE`(제작자 발행 재고, `quantity` 1~남은 재고, 최대 10). `BUY`는 `quantity` 1.
  - `price`: 1~1,000 코인 정수.
- 구매 전제: 해당 가구에 `OPEN` 판매 주문이 있어야 한다. 없으면 코인을 차감하지 않고 `MARKET_NO_SELL_ORDERS`(409)를 반환한다. 판매 접수만 `PENDING`인 상태로는 구매할 수 없다. 접수 후 마지막 판매가 종료되면 엔진이 같은 코드로 거절하고 이미 맡긴 코인을 전액 환불한다.
- 동작: 검증 → 에스크로(코인 차감 / 보유분 인벤토리 숨김·방 배치 해제 / 발행 재고 차감) → 접수. 체결은 비동기.
- 같은 가구 반대 주문 금지: 같은 가구에 내 판매 주문(`OPEN`이거나 엔진 처리 전 접수, 보유분·발행 재고 무관)이 있으면 구매할 수 없고, 내 구매 주문(`OPEN`이거나 엔진 처리 전 접수)이 있으면 발행 재고를 판매할 수 없다 → `MARKET_OWN_ORDER_CONFLICT`(409). 보유분 판매 중 구매는 기존대로 `MARKET_ALREADY_HOLDING`이다.
- 응답 202: `{ "commandId": 10, "status": "PENDING" }`
- 멱등: 같은 `requestId`로 같은 내용을 다시 보내면 기존 접수를 그대로 반환한다. 같은 `requestId`에 다른 내용(가격·수량·방향·종목이 다르거나, 취소에 쓴 `requestId`를 주문에 재사용 등)이면 `MARKET_REQUEST_CONFLICT`(409).
- 원장: 매수 에스크로 차감(`MARKET_ORDER_ESCROW`)은 `source_type = MARKET_COMMAND`, `source_id` = 접수(`market_commands`) id로 기록한다. 주문 row는 엔진이 처리할 때 만들어지기 때문이다.
- 주요 오류: 범위 위반 `VALIDATION_FAILED`(400), 같은 `requestId`에 다른 내용 `MARKET_REQUEST_CONFLICT`(409), `MARKET_ASSET_NOT_FOUND`(404), 거래 정지 `MARKET_ASSET_SUSPENDED`(409), 코인 부족 `MARKET_INSUFFICIENT_COIN`(409), 이미 보유·매수 대기 중 `MARKET_ALREADY_HOLDING`(409), 같은 가구에 내 반대 주문 있음 `MARKET_OWN_ORDER_CONFLICT`(409), 판매할 보유분 없음 `MARKET_ITEM_NOT_OWNED`(403), 발행 재고 판매인데 제작자 아님 `MARKET_NOT_CREATOR`(403), 발행 재고 부족 `MARKET_INSUFFICIENT_SUPPLY`(409).

## POST /api/v1/market/orders/{orderId}/cancel

- 요청 body: `{ "requestId": "uuid" }`
- 응답 202: Command. 환불은 엔진 처리 시 이뤄진다.
- 마지막 판매 주문이 종료되면 해당 가구는 목록에서 내려가며 남은 구매 주문도 모두 취소, 전액 환불한다. 처리 전 구매 접수도 거절, 환불한다. 다른 판매 주문이 남아 있으면 유지한다. 이 정책은 판매 만료와 전량 체결에도 동일하게 적용한다.
- 같은 주문에 `requestId`가 다른 취소 접수가 여러 번 들어오면 접수는 각각 받지만, 엔진은 두 번째부터 `MARKET_ORDER_NOT_OPEN`으로 거절한다. 환불은 한 번만 이뤄진다.
- 멱등: 같은 `requestId`로 같은 주문 취소를 다시 보내면 기존 접수를 그대로 반환한다. 같은 `requestId`에 다른 내용(다른 주문, 또는 주문 접수에 쓴 `requestId` 재사용)이면 `MARKET_REQUEST_CONFLICT`(409).
- 주요 오류: 본인 주문 아님 `MARKET_ORDER_NOT_FOUND`(404), 이미 종료 `MARKET_ORDER_NOT_OPEN`(409), 같은 `requestId`에 다른 내용 `MARKET_REQUEST_CONFLICT`(409).

## POST /api/v1/market/orders/{orderId}/amend

제작자의 발행 재고 판매 주문 수량을 늘리거나 줄인다.
관련 table: `market_commands`, `market_orders`, `market_assets`.

- 요청 body: `{ "requestId": "uuid", "quantity": 5 }`
  - `quantity`: 수정 후 주문 전체 수량(체결분 포함), 1~10.
- 대상: 본인의 `OPEN`이고 `source = ISSUANCE`인 판매 주문만. 보유분 판매·구매 주문은 수량 1 고정이라 `MARKET_ORDER_NOT_AMENDABLE`(409).
- 동작
  - 줄이기: 엔진 처리 시 줄인 수량만큼 발행 재고(`market_assets.unissued_quantity`)로 돌려준다. 대기 순서는 유지된다.
  - 늘리기: 늘린 수량만큼 접수 시 발행 재고에서 미리 차감하고(에스크로, 부족하면 `MARKET_INSUFFICIENT_SUPPLY`), 엔진이 거절하면 돌려준다. 엔진이 주문의 `engine_seq`를 수정 접수의 처리 순번으로 바꾸므로 대기 순서는 같은 가격대 맨 뒤가 되고, 엔진 재시작 후에도 유지된다.
  - `expiresAt`은 바꾸지 않는다(최초 접수 + 7일).
  - 수정 후 수량이 체결 수량 이하(남은 수량 0 이하)면 `MARKET_AMEND_BELOW_FILLED`(409). 접수 시점에 판정하고, 접수와 엔진 처리 사이 체결로 깨질 수 있으므로 엔진에서 다시 판정한다(엔진 거절 시 늘린 분 환급).
  - 엔진 정산: 같은 주문에 수정이 연달아 들어오면 접수 시점엔 앞선 수정이 아직 반영 전일 수 있으므로, 엔진은 **처리 시점 주문 수량**으로 다시 정산한다. 돌려줄 재고 = 접수 때 미리 뺀 수량 − (새 수량 − 처리 시점 수량). 양수면 발행 재고로 돌려주고, 음수면 모자란 만큼 발행 재고에서 더 빼며 부족하면 `MARKET_INSUFFICIENT_SUPPLY`로 거절하고 미리 뺀 수량을 돌려준다. 이 규칙으로 수정이 몇 번 쌓여도 발행 재고 총량이 유지된다.
  - '현재 수량과 같음'·'체결 수량 이하' 접수 판정은 접수 시점에 DB 에 반영된 주문 수량 기준이다(처리 전 수정은 고려하지 않음). 최종 결과는 위 엔진 정산이 정한다.
  - 엔진 처리 시 주문이 이미 종료됐으면 `MARKET_ORDER_NOT_OPEN`으로 거절하고 늘린 분을 돌려준다.
- 응답 202: Command. 결과는 `GET /market/commands/{commandId}`로 확인한다.
- 멱등: 주문·취소와 같은 `requestId` 규칙이다. 같은 `requestId`·같은 내용이면 기존 접수를 그대로 반환하고, 다른 내용이면 `MARKET_REQUEST_CONFLICT`(409).
- 주요 오류: 범위 위반·현재 수량과 같음 `VALIDATION_FAILED`(400), 본인 주문 아님 `MARKET_ORDER_NOT_FOUND`(404), 수정 불가 주문(보유분 판매·구매) `MARKET_ORDER_NOT_AMENDABLE`(409), 체결 수량 이하로 수정 `MARKET_AMEND_BELOW_FILLED`(409), 발행 재고 부족 `MARKET_INSUFFICIENT_SUPPLY`(409), 거래 정지 `MARKET_ASSET_SUSPENDED`(409), 같은 `requestId`에 다른 내용 `MARKET_REQUEST_CONFLICT`(409).

## GET /api/v1/market/commands/{commandId}

본인 접수만 조회한다. 앱은 주문·취소·수량 수정 후 이 API로 결과를 확인한다.

- 응답: `commandId`, `status`(`PENDING` / `APPLIED` / `REJECTED`), `rejectCode?`, `order?`(아래 Order)
- 주요 오류: 없거나 본인 접수가 아님 `MARKET_COMMAND_NOT_FOUND`(404).
- 엔진 거절 사유: 판매 주문 없음 `MARKET_NO_SELL_ORDERS`, 자기 주문과 맞물림 `MARKET_SELF_TRADE`, 거래 정지 `MARKET_ASSET_SUSPENDED`, 대상 주문 종료 `MARKET_ORDER_NOT_OPEN`(취소·수량 수정), 수량 수정 후 수량이 체결 수량 이하 `MARKET_AMEND_BELOW_FILLED`(접수 후 체결로 남은 수량이 0 이하가 된 경우), 수량 수정 엔진 정산 중 발행 재고 부족 `MARKET_INSUFFICIENT_SUPPLY`, 처리 반복 실패 `MARKET_ENGINE_ERROR`(맡아 둔 것은 돌려줌), 처리 반복 실패 후 환불까지 실패 `MARKET_ENGINE_ERROR_UNREFUNDED`(자동 환불 없음, 운영자가 수동으로 대사). `MARKET_ENGINE_ERROR_UNREFUNDED`를 뺀 거절은 맡아 둔 것을 돌려준다.

## GET /api/v1/me/market/orders

- 요청(query): `status` = `OPEN`(기본, 대기 중) / `CLOSED`(체결 완료·취소·만료), `page`, `size`(기본 20, 최대 100). 최신순.
- 주요 오류: `status`가 허용값이 아니면 `VALIDATION_FAILED`(400).
- 응답 `items[]`(Order): `orderId`, `assetId`, `name`, `assetKey`, `side`, `source?`, `price`, `quantity`, `filledQuantity`, `status`(`OPEN` / `FILLED` / `CANCELLED` / `EXPIRED`), `expiresAt`(주문 접수 시각 + 7일), `createdAt`
