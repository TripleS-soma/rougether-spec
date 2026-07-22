# 상점 / 아이템 / 재화 API

[features.md](features.md) 기준 엔드포인트 초안. 공통 규칙(prefix `/api/v1`, key 기반 이미지, 목록 `items` 배열, 인증된 사용자 기준 소유권 guard 적용)은 [api.md](../../api.md)를 따른다. 상세 req/res는 구현 시 확정하며, 아래 필드는 핵심만.

## GET /api/v1/items

상점 아이템 목록 조회. 방 꾸미기 / 캐릭터 악세사리 탭, 테마 필터.
관련 table: `items`, `themes`, `user_items`.

- 요청(query): `tab`(방 꾸미기/캐릭터 악세사리 — 값 집합 미정), `themeId?`, 페이지네이션(형태 미정)
- 응답: `items[]` — `id`, `name`, `assetKey`, `placementType`, `surfaceSlotType?`, `characterSlotType?`, `defaultSlot?`(positioned 가구의 기본 배치 슬롯, admin 에서 조정), `defaultScale`(새 FREE 배치의 초기 렌더 배율, 기본 `1.00`, admin 에서 모바일 편집 범위와 같은 `0.50`~`2.00`으로 조정), `defaultPositionX?`, `defaultPositionY?`(새 FREE 배치의 중심점 기준 초기 좌표, 각 `0.0`~`1.0`), `categoryCode`, `purchaseCurrencyType?`, `priceAmount?`, `isLimited`, `theme`(`id`/`code`/`name`/`coverImageKey?`), `owned`(boolean)
- 비고: 활성 테마·활성 아이템만. `owned`는 요청 user의 `user_items`로 판정.

## GET /api/v1/me/items

인벤토리(보유 아이템) 조회. 카테고리/슬롯별 그룹.
관련 table: `user_items`, `items`, `themes`.

- 요청(query): `categoryCode?` (문자열 pass-through, enum 검증 없음). 슬롯 타입 필터는 슬롯 enum 확정 전까지 제외.
- 응답: `items[]` — `userItemId`, `itemId`, `name`, `assetKey`, `categoryCode`, `placementType`, `surfaceSlotType?`, `characterSlotType?`, `defaultSlot?`, `defaultScale`, `defaultPositionX?`, `defaultPositionY?`, `theme`(`id`, `code`, `name`, `coverImageKey?`), `acquiredAt`
- 정렬: 최근 획득 먼저(`acquired_at DESC`), 페이지네이션 없음. `placementType`/`defaultSlot`/`defaultScale`/`defaultPositionX`/`defaultPositionY`는 방 배치용(GET /items 와 동일 계약).
- `defaultPositionX`와 `defaultPositionY`는 둘 다 값이 있거나 둘 다 null이다. null 쌍이면 공유 Room renderer contract의 `newPlacementCenter`(현재 X `0.5`, Y `0.55`)를 사용한다.
- `defaultScale`과 기본 위치는 새 가구를 FREE 방에 추가하는 순간 배치 값으로 복사한다. 이미 저장된 방 배치의 `scale`·`positionX`·`positionY`에는 소급하지 않는다.
- 비고: `deleted_at` IS NULL인 본인 보유분만(JWT `userId` 스코프). `is_active=false` 아이템도 보유분이면 노출. 방 배치는 [방 도메인](../room/) 엔드포인트로 이어짐.

## POST /api/v1/items/{id}/purchase

다이아로 아이템 구매. 잔액 차감 + 보유 추가를 한 트랜잭션으로 처리.
관련 table: `items`, `user_items`, `user_wallets`.

- 경로: `{id}` = `items.id`
- 요청 body: 없음 (멱등키 미사용 - 중복 보유 차단이 이중 구매를 방지)
- 응답: `userItemId`, `itemId`, `acquiredAt`, `wallet`(차감 후 다이아 `currencyType`/`balance`)
- 실패(확정): 다이아 부족 `SHOP_INSUFFICIENT_BALANCE`(409) / 비활성·뽑기 전용 `SHOP_ITEM_NOT_PURCHASABLE`(409) / **중복 보유 재구매 불가** `SHOP_ALREADY_OWNED`(409) / 없는 아이템 `SHOP_ITEM_NOT_FOUND`(404)
- 정합: 지갑 행 락 + `user_wallets`/`user_items` UNIQUE 제약으로 동시 요청의 이중 차감·이중 지급 방지.

## GET /api/v1/me/wallets

보유 재화(코인·다이아) 잔액 조회. 상점·구매 화면에서 사용.
관련 table: `user_wallets`.

- 응답: `items[]` — `currencyType`, `balance`. **모든 재화를 항상 포함**(지갑 미발급 재화는 balance 0)
- 비고: 코인 적립/다이아 충전은 본 도메인 밖(루틴·투두 / 뽑기). 본 엔드포인트는 조회 전용. 위치는 **me 경로로 확정**(서버 구현은 재화 담당인 상점·뽑기 쪽이 소유).

## 의존성

- 방 배치: [방 도메인](../room/) (`room_surface_slots`, `user_items`)
- 재화 획득: [뽑기 도메인](../gacha/) (다이아·아이템), [루틴/투두 도메인](../routine-todo/) (코인)
- 에러 응답 형태 · 응답 envelope: 공통 [api.md](../../api.md) → open-questions
