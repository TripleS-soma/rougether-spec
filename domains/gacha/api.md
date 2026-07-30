# 뽑기 도메인 API (draft)

상위 규약: [api.md](../../api.md) · 기능: [features.md](./features.md) · 데이터: [erd.md](../../erd.md)

공통 규칙(prefix `/api/v1`, JSON, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 재화는 `user_wallets.currency_type`, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다. 아래 요청/응답 상세는 **설계 중(draft)** 이며 확정 아님.

## GET /api/v1/gacha

운영 중인 뽑기 머신 목록 조회. 테마별 아이템 뽑기와 테마 무관 캐릭터 뽑기가 함께 내려간다.

- **목적**: 머신·비용·운영 기간 노출. `is_active`·운영 기간 필터.
- **응답 핵심 필드**: `items[]` — `gachaId`, `code`, `name`, `themeId`(캐릭터 뽑기는 `null`), `costCurrencyType`, `costAmount`, `drawCount`, `startsAt`, `endsAt`, `isActive`. 테마 커버는 `coverImageKey`(`themes.cover_image_key`, 캐릭터 뽑기는 `null`).
- **관련 table**: `gacha` (+ theme 조인 `themes`).

## GET /api/v1/gacha/{id}

단일 머신 상세 조회.

- **목적**: 비용·기간 등 머신 정보 조회.
- **응답 핵심 필드**: `gachaId`, `name`, `costCurrencyType`, `costAmount`, `drawCount`, `startsAt`, `endsAt`.
- **관련 table**: `gacha`.

## GET /api/v1/gacha/{id}/rewards

단일 머신에서 현재 배출되는 보상 목록을 조회한다.

- **목적**: 뽑기 전에 해당 머신에서 획득 가능한 방 꾸미기 아이템·캐릭터 악세사리·캐릭터를 이미지와 함께 미리 보여준다.
- **응답 핵심 필드**: `items[]` — `rewardType`(`ITEM`/`CHARACTER`), `itemId?`, `characterId?`, `name`, `assetKey`, `rarity?`, `owned`, `categoryCode?`, `placementType?`, `surfaceSlotType?`, `characterSlotType?`.
  - `ITEM`이면 `itemId`만, `CHARACTER`이면 `characterId`만 채운다.
  - `ITEM`의 렌더링·분류 정보는 `items` 원본 값을 그대로 내려준다. 캐릭터 악세사리는 `placementType=character`이며 `characterSlotType`으로 착용 위치를 구분한다.
  - `CHARACTER`이면 아이템 분류·배치 필드(`categoryCode`, `placementType`, `surfaceSlotType`, `characterSlotType`)는 `null`이다.
  - `owned`는 인증 사용자가 해당 아이템 또는 캐릭터를 현재 보유 중인지 나타낸다.
  - 활성 풀 엔트리(`gacha_pool_entries.is_active=true`) 중 실제 보상 참조가 있는 항목만 내려준다.
  - 목록은 풀 엔트리 ID 오름차순으로 고정하되, `weight`와 계산 확률은 응답하지 않는다.
- **검증/예외**: 없는 머신이면 `GACHA_NOT_FOUND`(404), `is_active=false`이거나 운영 기간 밖이면 `GACHA_INACTIVE`(409).
- **관련 table**: `gacha`, `gacha_pool_entries`, `items`, `characters`, `user_items`, `user_characters`.

## POST /api/v1/gacha/{id}/draw

뽑기 실행 (코인 소모 → 보상 지급). 아이템 뽑기와 캐릭터 뽑기가 같은 엔드포인트를 쓰며, `reward_type`으로 보상이 갈린다.

- **목적**: 코인 차감 → 요청 횟수만큼 추첨 → 아이템/캐릭터/재화 지급. **중복 아이템은 다이아 3 전환, 중복 캐릭터는 코인 100 환급**. 가구(테마) 뽑기 단가 25, 캐릭터 뽑기 단가 500. 환급값은 단가에 연동한다 — 단가만 낮추면 중복 전환이 소모 비용을 넘어서 뽑기가 재화 환전 수단이 된다.
- **요청 핵심 필드**: (path `id`) 머신 식별. 본문 `count`는 `1`(단챠) 또는 `6`(5+1회)만 허용한다. `count=6`은 단챠 5회분(`cost_amount × 5`)을 차감하고 결과 6개를 지급한다. 인증된 사용자(`me`) 기준이며 소유권 식별자 `userId`로 guard 적용한다.
  - 구버전 앱 이행 기간에는 기존 `count=10` 요청도 `count=6`과 동일하게 단챠 5회분 차감·결과 6개 지급으로 처리한다. 신규 클라이언트는 `count=10`을 사용하지 않는다.
- **응답 핵심 필드**: `results[]` — 각 추첨에 대해 `rewardType`(`ITEM`/`CHARACTER`/`CURRENCY`), `rarity`, `converted`(중복 여부).
  - 아이템 보상이면 `itemId`·`assetKey`.
  - **캐릭터 보상이면 `characterId`·`assetKey`**(`characters.base_asset_key`)·`name`. 중복이면 `converted=true`로 캐릭터 대신 코인 환급(`refundAmount`).
  - 재화/환급이면 `currencyType`·`refundAmount`(아이템 중복=다이아 3, 캐릭터 중복=코인 100).
  - 갱신된 지갑 잔액(`wallet`: `currencyType`·`balance`) 포함.
- **결과 개수**: `count=1`이면 `results` 1개, `count=6`이면 뽑은 순서대로 6개. 같은 5+1회 요청 안에서 먼저 획득한 보상이 다시 나오면 중복 전환으로 처리한다.
- **검증/예외**: 보유 코인 부족, `is_active=false`, 운영 기간 밖 → 거부. 차감·지급·환급은 단일 쓰기 트랜잭션.
- **관련 table**: `gacha`, `gacha_pool_entries`, (의존) `user_items`, `user_characters`, `user_wallets`.

### 캐릭터 뽑기 (테마 무관 전용 머신)

- 캐릭터 뽑기 머신은 `themeId = null`, `costCurrencyType = COIN`, `costAmount = 500`.
- 풀은 캐릭터 6개 전체를 **균등 추첨**하고, 이미 보유한 캐릭터가 나오면 지급 대신 **코인 100 환급**(`rewardType = CURRENCY`, `converted = true`, `refundAmount = 100`).
- 신규 캐릭터는 `user_characters`로 지급되고 응답에 `characterId`·`assetKey`가 포함된다.

## 미정 / 의존

- 결과 응답에서 중복 전환을 별도 필드(`converted`)로 줄지, 보상 타입으로 합칠지.
- 전환 비율, `weight`/추첨 확률 계산, `rarity` 값 집합 → [open-questions.md](../../open-questions.md). 계산 결과는 보상 목록 API에 노출하지 않는다.
- 지갑 차감·적립 API 형태는 재화 도메인 계약을 따른다(여기서 확정 안 함).
