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

- **목적**: 비용·기간·구성 요약. 풀 확률 공개 여부 **미정**.
- **응답 핵심 필드**: `gachaId`, `name`, `costCurrencyType`, `costAmount`, `drawCount`, `startsAt`, `endsAt`. 엔트리/확률 노출 여부 미정.
- **관련 table**: `gacha`, `gacha_pool_entries`.

## POST /api/v1/gacha/{id}/draw

뽑기 실행 (코인 소모 → 보상 지급). 아이템 뽑기와 캐릭터 뽑기가 같은 엔드포인트를 쓰며, `reward_type`으로 보상이 갈린다.

- **목적**: 코인 `cost_amount` 차감 → `draw_count` 추첨 → 아이템/캐릭터/재화 지급. 중복 아이템은 다이아 전환, **중복 캐릭터는 코인 200 환급**.
- **요청 핵심 필드**: (path `id`) 머신 식별. 본문은 인증된 사용자(`me`) 기준 — 소유권 식별자 `userId`로 guard 적용. 추가 옵션 **미정**(예: 연속 뽑기 수).
- **응답 핵심 필드**: `results[]` — 각 추첨에 대해 `rewardType`(`ITEM`/`CHARACTER`/`CURRENCY`), `rarity`, `converted`(중복 여부).
  - 아이템 보상이면 `itemId`·`assetKey`.
  - **캐릭터 보상이면 `characterId`·`assetKey`**(`characters.base_asset_key`)·`name`. 중복이면 `converted=true`로 캐릭터 대신 코인 환급(`refundAmount`).
  - 재화/환급이면 `currencyType`·`refundAmount`(아이템 중복=다이아, 캐릭터 중복=코인 200).
  - 갱신된 지갑 잔액(`wallet`: `currencyType`·`balance`) 포함.
- **검증/예외**: 보유 코인 부족, `is_active=false`, 운영 기간 밖 → 거부. 차감·지급·환급은 단일 쓰기 트랜잭션.
- **관련 table**: `gacha`, `gacha_pool_entries`, (의존) `user_items`, `user_characters`, `user_wallets`.

### 캐릭터 뽑기 (테마 무관 전용 머신)

- 캐릭터 뽑기 머신은 `themeId = null`, `costCurrencyType = COIN`, `costAmount = 1000`.
- 풀은 캐릭터 6개 전체를 **균등 추첨**하고, 이미 보유한 캐릭터가 나오면 지급 대신 **코인 200 환급**(`rewardType = CURRENCY`, `converted = true`, `refundAmount = 200`).
- 신규 캐릭터는 `user_characters`로 지급되고 응답에 `characterId`·`assetKey`가 포함된다.

## 미정 / 의존

- 결과 응답에서 중복 전환을 별도 필드(`converted`)로 줄지, 보상 타입으로 합칠지.
- 전환 비율, `weight`/확률 계산, `rarity` 값 집합 → [open-questions.md](../../open-questions.md).
- 지갑 차감·적립 API 형태는 재화 도메인 계약을 따른다(여기서 확정 안 함).
