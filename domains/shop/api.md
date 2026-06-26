# 상점 / 아이템 / 재화 API

[features.md](features.md) 기준 엔드포인트 초안. 공통 규칙(prefix `/api/v1`, key 기반 이미지, 목록 `items` 배열, 인증된 사용자 기준 소유권 guard 적용)은 [api.md](../../api.md)를 따른다. 상세 req/res는 구현 시 확정하며, 아래 필드는 핵심만.

## GET /api/v1/items

상점 아이템 목록 조회. 방 꾸미기 / 캐릭터 악세사리 탭, 테마 필터.
관련 table: `items`, `themes`, `user_items`.

- 요청(query): `tab`(방 꾸미기/캐릭터 악세사리 — 값 집합 미정), `themeId?`, 페이지네이션(형태 미정)
- 응답: `items[]` — `id`, `name`, `assetKey`, `placementType`, `surfaceSlotType?`, `characterSlotType?`, `categoryCode`, `purchaseCurrencyType?`, `priceAmount?`, `isLimited`, `theme`(`id`/`code`/`name`/`coverImageKey?`), `owned`(boolean)
- 비고: 활성 테마·활성 아이템만. `owned`는 요청 user의 `user_items`로 판정.

## GET /api/v1/me/items

인벤토리(보유 아이템) 조회. 카테고리/슬롯별 그룹.
관련 table: `user_items`, `items`, `themes`.

- 요청(query): `categoryCode?` 또는 슬롯 타입 필터(형태 미정)
- 응답: `items[]` — `userItemId`, `itemId`, `name`, `assetKey`, `categoryCode`, `surfaceSlotType?`, `characterSlotType?`, `theme`, `acquiredAt`
- 비고: `deleted_at` IS NULL인 보유분만. 방 배치는 [방 도메인](../room/) 엔드포인트로 이어짐.

## POST /api/v1/items/{id}/purchase

다이아로 아이템 구매. 잔액 차감 + 보유 추가를 한 트랜잭션으로 처리.
관련 table: `items`, `user_items`, `user_wallets`.

- 경로: `{id}` = `items.id`
- 요청 body: 미정(멱등키 등 사용 여부 미정)
- 응답: `userItemId`, `itemId`, `acquiredAt`, `wallet`(차감 후 다이아 `currencyType`/`balance`)
- 실패: 다이아 부족 / 비활성·뽑기 전용 아이템(구매 불가) / 중복 보유 시 동작 — 각 예외 응답 형태는 공통 에러 규약(미정)에 따름.

## GET /api/v1/me/wallets

보유 재화(코인·다이아) 잔액 조회. 상점·구매 화면에서 사용.
관련 table: `user_wallets`.

- 응답: `items[]` — `currencyType`, `balance`
- 비고: 코인 적립/다이아 충전은 본 도메인 밖(루틴·투두 / 뽑기). 본 엔드포인트는 조회 전용. 엔드포인트 위치(상점 도메인 vs 회원 공통)는 **미정**.

## 의존성

- 방 배치: [방 도메인](../room/) (`room_surface_slots`, `user_items`)
- 재화 획득: [뽑기 도메인](../gacha/) (다이아·아이템), [루틴/투두 도메인](../routine-todo/) (코인)
- 에러 응답 형태 · 응답 envelope: 공통 [api.md](../../api.md) → open-questions
