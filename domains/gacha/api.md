# 뽑기 도메인 API (draft)

상위 규약: [api.md](../../api.md) · 기능: [features.md](./features.md) · 데이터: [erd.md](../../erd.md)

공통 규칙(prefix `/api/v1`, JSON, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 재화는 `user_wallets.currency_type`, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다. 아래 요청/응답 상세는 **설계 중(draft)** 이며 확정 아님.

## GET /api/v1/gacha

운영 중인 뽑기 머신 목록 조회.

- **목적**: 테마별 머신·비용·운영 기간 노출. `is_active`·운영 기간 필터.
- **응답 핵심 필드**: `items[]` — `gachaId`, `code`, `name`, `themeId`, `costCurrencyType`, `costAmount`, `drawCount`, `startsAt`, `endsAt`, `isActive`. 테마 커버는 `coverImageKey`(`themes.cover_image_key`).
- **관련 table**: `gacha` (+ theme 조인 `themes`).

## GET /api/v1/gacha/{id}

단일 머신 상세 조회.

- **목적**: 비용·기간·구성 요약. 풀 확률 공개 여부 **미정**.
- **응답 핵심 필드**: `gachaId`, `name`, `costCurrencyType`, `costAmount`, `drawCount`, `startsAt`, `endsAt`. 엔트리/확률 노출 여부 미정.
- **관련 table**: `gacha`, `gacha_pool_entries`.

## POST /api/v1/gacha/{id}/draw

테마별 뽑기 실행 (코인 소모 → 보상 지급).

- **목적**: 코인 `cost_amount` 차감 → `draw_count` 추첨 → 아이템/다이아 지급. 중복 아이템은 다이아 전환.
- **요청 핵심 필드**: (path `id`) 머신 식별. 본문은 인증된 사용자(`me`) 기준 — 소유권 식별자 `userId`로 guard 적용. 추가 옵션 **미정**(예: 연속 뽑기 수).
- **응답 핵심 필드**: `results[]` — 각 추첨에 대해 `rewardType`(item/currency), 아이템이면 `itemId`·`assetKey`·`rarity`·`converted`(중복 전환 여부), 전환·재화 보상이면 `currencyType`·`amount`(다이아). 갱신된 지갑 잔액(`wallet`: 코인·다이아) 포함 권장.
- **검증/예외**: 보유 코인 부족, `is_active=false`, 운영 기간 밖 → 거부. 차감·지급은 단일 쓰기 트랜잭션.
- **관련 table**: `gacha`, `gacha_pool_entries`, (의존) `user_items`, `user_wallets`.
- **상세 req/res**: 미정 → 서버 repo `docs/`에서 확정 후 끌어온다.

## 미정 / 의존

- 결과 응답에서 중복 전환을 별도 필드(`converted`)로 줄지, 보상 타입으로 합칠지.
- 전환 비율, `weight`/확률 계산, `rarity` 값 집합 → [open-questions.md](../../open-questions.md).
- 지갑 차감·적립 API 형태는 재화 도메인 계약을 따른다(여기서 확정 안 함).
