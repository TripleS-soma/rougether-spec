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

## PUT /api/v1/me/characters/{userCharacterId}/accessories

보유 캐릭터의 슬롯에 보유 악세사리를 적용한다. 같은 슬롯의 기존 악세사리는 교체된다.
관련 table: `user_character_accessories`, `user_characters`, `user_items`, `items`.

- 경로: `{userCharacterId}` = `GET /api/v1/me/characters`의 `userCharacterId`
- 요청 body: `{ "userItemId": 77 }`
- 응답: `userCharacterId`, `items[]` — `{ userItemId, itemId, name, assetKey, characterSlotType, equippedAt, renderProfiles[] }`. 해당 캐릭터의 적용 후 전체 착용 목록이며 `characterSlotType`, `userItemId` 오름차순.
- 멱등: 이미 같은 악세사리가 같은 슬롯에 적용돼 있으면 변경 없이 현재 목록을 반환한다.
- 검증: 대상 캐릭터와 악세사리를 모두 호출자가 보유해야 한다. 악세사리는 활성 `placementType=character`이고 `characterSlotType`이 있어야 하며, 대상 마스터 캐릭터와의 `default` 렌더 프로필이 등록되어 있어야 한다.
- 주요 오류: 미보유 캐릭터 `CHARACTER_NOT_OWNED`(409), 미보유 아이템 `CHARACTER_ACCESSORY_NOT_OWNED`(403), 비활성·일반 가구·슬롯 없는 아이템 `CHARACTER_ACCESSORY_INVALID`(409), 대상 캐릭터용 `default` 렌더 프로필 없음 `CHARACTER_ACCESSORY_UNSUPPORTED_CHARACTER`(409).

## DELETE /api/v1/me/characters/{userCharacterId}/accessories/{characterSlotType}

보유 캐릭터의 지정 슬롯 악세사리를 해제한다.
관련 table: `user_character_accessories`, `user_characters`.

- 경로: `{userCharacterId}` = 보유 캐릭터 ID, `{characterSlotType}` = 아이템 카탈로그가 내려준 문자열. 서버가 값 집합을 enum으로 제한하지 않는다.
- 요청 body: 없음
- 응답: 적용 API와 같은 `userCharacterId`, `items[]` 전체 착용 목록.
- 멱등: 이미 비어 있는 슬롯도 성공하며 빈 슬롯 상태를 반환한다.
- 주요 오류: 미보유 캐릭터 `CHARACTER_NOT_OWNED`(409).

## 캐릭터 응답의 공통 착용 정보

- `GET /api/v1/me/characters`의 각 `items[]`에 `accessories[]`를 포함한다.
- `accessories[]` 원소는 `{ userItemId, itemId, name, assetKey, characterSlotType, equippedAt, renderProfiles[] }`이며 위 적용·해제 응답과 같은 계약이다.
- 대표 캐릭터 여부와 무관하게 각 보유 캐릭터에 저장된 착용 목록을 반환한다. 캐릭터 선택을 바꿨다가 돌아와도 이전 착용 상태가 유지된다.
- `renderProfiles[]` 원소는 `{ renderState, assetKey, canvasWidth, canvasHeight, assetWidth, assetHeight, positionX, positionY, widthRatio, rotationDeg, zIndex }`이다.
  - `canvasWidth`·`canvasHeight`: 이 프로필의 좌표가 기준으로 삼는 캐릭터 원본 캔버스 크기. 둘 다 양수다.
  - `assetWidth`·`assetHeight`: `assetKey` 단품 이미지의 원본 크기. 둘 다 양수이며, 프론트가 표시 높이를 원본 비율로 계산할 때 사용한다.
  - `positionX`·`positionY`: 캐릭터 원본 캔버스 기준 악세사리 **중심점** 정규화 좌표(각 `0.0`~`1.0`).
  - `widthRatio`: 악세사리 표시 너비 / 캐릭터 원본 캔버스 너비 비율(`0 < widthRatio <= 2.0`). 높이는 이미지 원본 비율로 계산한다.
  - `rotationDeg`: 시계 방향 회전 각도(-360~360), `zIndex`: 캐릭터 합성 레이어 순서(클수록 위).
  - `assetKey`: 해당 상태에서 합성할 단품 이미지 key. 기본 아이템의 `assetKey`와 같을 수 있지만 상태별 이미지를 지원하기 위해 프로필에도 포함한다.
  - `default` 상태는 착용 가능 여부를 결정하는 필수 fallback이다. 프론트는 현재 캐릭터 포즈/상태와 같은 `renderState`가 있으면 이를 사용하고, 없으면 `default`를 사용한다.
  - 단품 이미지는 캐릭터 애니메이션 프레임과 독립된 고정 오버레이다. 머리 위치가 크게 달라지는 애니메이션은 같은 이름의 상태별 프로필/에셋이 등록된 경우에만 정밀 합성을 보장하며, `default`만 있으면 MVP 화면은 idle 상태 사용을 우선한다.
  - 프론트는 `contentFit=contain`으로 만들어진 실제 캐릭터 영역을 먼저 계산한 뒤 좌표를 적용한다. 컨테이너 크기를 `(containerWidth, containerHeight)`라 하면 `scale = min(containerWidth / canvasWidth, containerHeight / canvasHeight)`, 실제 영역은 `(canvasWidth * scale, canvasHeight * scale)`이며 컨테이너 중앙에 둔다. 악세사리 표시 너비는 `actualCanvasWidth * widthRatio`, 높이는 `displayWidth * assetHeight / assetWidth`다.

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
- 초기 잔액: 가입 시 통화별 지갑이 발급되며 **코인 100·다이아 0**으로 시작. 온보딩(튜토리얼)에서 가구 뽑기 단챠(코인 25) 1회를 체험시키고 75(단챠 3회분)가 남게 하는 값. 지급은 가입 트랜잭션의 지갑 신규 발급에만 묶여 1회로 보장(`(user_id, currency_type)` UNIQUE).
- 비고: 코인 적립/다이아 충전은 본 도메인 밖(루틴·투두 / 뽑기). 본 엔드포인트는 조회 전용. 위치는 **me 경로로 확정**(서버 구현은 재화 담당인 상점·뽑기 쪽이 소유).

## 의존성

- 방 배치: [방 도메인](../room/) (`room_surface_slots`, `user_items`)
- 재화 획득: [뽑기 도메인](../gacha/) (다이아·아이템), [루틴/투두 도메인](../routine-todo/) (코인)
- 에러 응답 형태 · 응답 envelope: 공통 [api.md](../../api.md) → open-questions
