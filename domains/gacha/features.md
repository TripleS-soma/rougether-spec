# 뽑기 도메인 기능 명세

상위 문서: [features.md](../../features.md) · 데이터: [erd.md](../../erd.md) · API: [api.md](./api.md)

재화: **코인**(뽑기 비용 소모) / **다이아**(중복 아이템 전환·적립). 구분은 `user_wallets.currency_type`.

## 뽑기 목록 조회

운영 중인 뽑기 머신을 노출한다. 머신은 크게 **테마별 꾸미기 아이템 뽑기**와 **테마 무관 캐릭터 뽑기**로 나뉜다.

- **머신 목록**: `is_active`이고 운영 기간(`starts_at`~`ends_at`) 내인 머신을 표시. (`gacha`)
  - 표시 필드: `name`, 테마(theme FK→`themes`, 캐릭터 뽑기는 NULL), 비용(`cost_currency_type`·`cost_amount`), 1회 뽑기 수(`draw_count`), 운영 기간(`starts_at`/`ends_at`).
  - 테마 커버 이미지는 `themes.cover_image_key`로 참조(전체 URL 아님). 캐릭터 뽑기는 `theme_id`가 NULL이라 커버가 없다.
- **머신 상세(선택)**: 단일 머신의 비용·기간·구성 요약. 풀 내부 확률 공개 여부는 미정. (`gacha`, `gacha_pool_entries`)

## 테마별 뽑기

코인을 소모해 머신을 돌리고 보상을 인벤토리/지갑에 추가한다.

- **뽑기 실행**: 머신 선택 → 코인 `cost_amount` 차감 → `draw_count`만큼 풀에서 추첨. (`gacha`, `gacha_pool_entries`)
  - 추첨은 활성 엔트리(`gacha_pool_entries.is_active`)를 `weight` 기반으로 뽑는다.
  - 회수(`characters.is_active=false`)된 캐릭터는 배출되지 않는다 — 캐릭터 회수 시 해당 풀 엔트리도 함께 비활성 처리한다(엔트리 활성과 보상 캐릭터 활성을 모두 충족해야 배출).
  - `reward_type`으로 아이템 보상(`item_id`→`items`) / 캐릭터 보상(`character_id`→`characters`) / 재화 보상(`currency_type`·`reward_amount`) 구분.
- **비용 검증·차감**: 보유 코인 < `cost_amount`이면 실행 불가(예외). 차감과 보상 지급은 하나의 쓰기 트랜잭션. (`user_wallets` — 의존)
- **운영 기간·활성 검증**: `is_active`가 false거나 운영 기간 밖이면 실행 거부.

## 캐릭터 뽑기

온보딩 기본 캐릭터 외 나머지 캐릭터를 획득하는 전용 머신이다. 테마별 아이템 뽑기와 별개의 흐름을 쓴다.

- **전용 머신**: 캐릭터 뽑기는 **테마 무관 머신 1개**로 운영한다(`gacha.theme_id`는 NULL). 풀 엔트리는 모두 `reward_type = CHARACTER`이며 `character_id`→`characters`를 가리킨다. (`gacha`, `gacha_pool_entries`)
- **비용**: **코인 1000**(`cost_currency_type = COIN`, `cost_amount = 1000`). 보유 코인이 부족하면 실행 거부.
- **추첨**: 캐릭터 **6개 전체를 균등 추첨**한다(캐릭터 엔트리는 등급/`weight` 차등 없이 동일 확률). 온보딩 기본 캐릭터도 풀에 포함된다.
- **중복 시 코인 환급**: 이미 보유한 캐릭터(`user_characters` 보유)가 나오면 지급 대신 **코인 200을 환급**한다. 신규 캐릭터는 `user_characters`로 지급하고 `acquired_at`을 기록한다. (`user_characters`, `user_wallets` — 의존)
  - 보유 판정·지급은 다른 획득 경로(온보딩 스타터 선택, 착용 교체)와 동일한 유저 행 비관적 락으로 직렬화한다 — 동시 실행이 같은 캐릭터를 중복 보유시키거나 환급 판정을 우회할 수 없다.
  - 캐릭터 중복 환급은 **다이아가 아니라 코인**으로 돌려준다(아이템 뽑기의 다이아 전환과 다름).

## 뽑기 결과 확인

획득 결과를 표시하고 중복 아이템을 전환한다.

- **결과 표시**: 이번 실행으로 획득한 아이템/다이아 목록. 아이템은 `items.asset_key`, 이름·rarity 표시. (`gacha_pool_entries`, `items`)
- **아이템 지급**: 미보유 아이템은 `user_items`로 인벤토리에 추가. (`user_items` — 의존)
- **중복 → 다이아 전환**: 사용자가 **이미 보유한 아이템**(`user_items` 보유)이 나오면 아이템 대신 다이아로 전환해 지갑에 적립. (`gacha_pool_entries`, `user_items`, `user_wallets` — 의존)
  - 전환 비율: **미정** → [open-questions.md](../../open-questions.md).

## 관련 table 요약

- **gacha**: 머신 정의 — `code`, `name`, `cost_currency_type`, `cost_amount`, `draw_count`, `starts_at`, `ends_at`, `is_active`, theme FK→`themes`?(캐릭터 뽑기는 NULL).
- **gacha_pool_entries**: 머신별 보상 풀 — `gacha_id`→`gacha`, `reward_type`(`ITEM`/`CHARACTER`/`CURRENCY`), `item_id`→`items`?, `character_id`→`characters`?, `currency_type`?, `reward_amount`?, `rarity`?, `weight`, `is_active`.

## 의존 도메인 (이 도메인이 다루지 않음)

- `user_wallets` 코인 차감·환급 → 재화/회원 도메인.
- `items` 정의·`user_items` 인벤토리 추가 → 상점/아이템 도메인.
- `characters` 정의·`user_characters` 보유 → 회원/온보딩 도메인. (캐릭터 뽑기는 `characters`를 보상으로 참조, `user_characters`로 지급)
- `themes` 테마 정의 → 상점/테마 도메인.
