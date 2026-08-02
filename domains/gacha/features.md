# 뽑기 도메인 기능 명세

상위 문서: [features.md](../../features.md) · 데이터: [erd.md](../../erd.md) · API: [api.md](./api.md)

재화: **코인**(뽑기 비용 소모) / **다이아**(중복 아이템 전환·적립). 구분은 `user_wallets.currency_type`.

## 뽑기 목록 조회

운영 중인 뽑기 머신을 노출한다. 머신은 크게 **테마별 꾸미기 아이템 뽑기**와 **테마 무관 캐릭터 뽑기**로 나뉜다.

- **머신 목록**: `is_active`인 머신을 표시(운영 기간 `starts_at`~`ends_at`은 스키마만 존재하고 검사·노출하지 않음 — 도입 미정). (`gacha`)
  - 표시 필드: `name`, 테마(theme FK→`themes`, 캐릭터 뽑기는 NULL), 비용(`cost_currency_type`·`cost_amount`), 1회 뽑기 수(`draw_count`), `active`.
  - 테마 커버 이미지는 `themes.cover_image_key`로 참조(전체 URL 아님). 캐릭터 뽑기는 `theme_id`가 NULL이라 커버가 없다.
- **머신 상세**: 단일 머신의 비용·기간을 조회한다. (`gacha`)
- **보상 미리보기**: 단일 머신의 활성 풀에 등록된 방 꾸미기 아이템·캐릭터 악세사리·캐릭터를 이미지·이름·등급(있는 보상만)·사용자 보유 여부와 함께 조회한다. 아이템은 `placement_type`과 슬롯 타입을 함께 내려 클라이언트가 방 아이템과 캐릭터 착용 아이템을 구분한다. 풀 엔트리의 `weight`와 계산 확률은 공개하지 않는다. (`gacha_pool_entries`, `items`, `characters`, `user_items`, `user_characters`)

## 테마별 뽑기

코인을 소모해 머신을 돌리고 보상을 인벤토리/지갑에 추가한다.

- **뽑기 실행**: 머신 선택 → 단챠 또는 5+1회 선택 → 코인 차감 → 요청 횟수만큼 풀에서 추첨. (`gacha`, `gacha_pool_entries`)
  - 단챠는 `count=1`로 `cost_amount`를 차감하고 결과 1개를 지급한다.
  - 5+1회는 `count=6`으로 단챠 5회분(`cost_amount × 5`)을 차감하고 결과 6개를 지급한다.
  - 추첨은 활성 엔트리(`gacha_pool_entries.is_active`)를 **rarity 티어 롤**로 뽑는다 — 일반 70% / 희귀 25% / 전설 5%로 등급을 먼저 정하고 등급 풀 안에서 균등, 빈 등급이면 전체 활성 풀 균등(fallback). `weight` 컬럼은 사용하지 않는다(잔존). `rarity`는 한글 `일반`/`희귀`/`전설` 3종, null이면 `일반` 취급.
  - 회수(`characters.is_active=false`)된 캐릭터 배출 차단은 **미구현** — 풀 필터가 엔트리 활성만 검사하므로, 캐릭터 회수 시 해당 풀 엔트리를 함께 비활성 처리하는 운영 절차가 필요하다(코드 차단 도입은 미정).
  - `reward_type`으로 아이템 보상(`item_id`→`items`) / 캐릭터 보상(`character_id`→`characters`) / 재화 보상(`currency_type`·`reward_amount`) 구분.
- **비용 검증·차감**: 보유 코인이 선택한 옵션의 비용(단챠 `cost_amount`, 5+1회 `cost_amount × 5`)보다 적으면 실행 불가(예외). 차감과 보상 지급은 하나의 쓰기 트랜잭션. (`user_wallets` — 의존)
- **활성 검증**: `is_active`가 false면 실행 거부(409 `GACHA_INACTIVE`). 운영 기간은 검사하지 않는다(도입 미정).

## 캐릭터 악세사리 뽑기

캐릭터에 착용하는 악세사리는 상점에서 직접 구매하지 않고 아이템 뽑기로 획득한다.

- **분류·등록**: `items.placement_type = character`인 아이템을 캐릭터 악세사리로 판정한다. 활성 악세사리는 카탈로그 적재 시 같은 테마의 **악세사리 전용 머신**에 `reward_type = ITEM`으로 자동 등록한다. 전용 머신이 없으면 가구 뽑기와 같은 기본값(`COIN` 25, `draw_count = 1`)으로 만든다. 등급 가구와 악세사리를 한 풀에 섞지 않는다.
- **구매 불가**: `purchase_currency_type`과 `price_amount`는 모두 `NULL`로 저장한다.
- **균등 추첨**: 악세사리에는 등급을 두지 않는다. 해당 전용 풀의 모든 활성 엔트리는 `rarity = NULL`, `weight = 1`이며 풀 전체에서 동일 확률로 추첨한다.
- **중복 처리**: 다른 `ITEM` 보상과 동일하게 `user_items` 보유 여부로 중복을 판정하고, 이미 보유했다면 아이템 대신 **다이아 3**을 지급한다.

## 캐릭터 뽑기

온보딩 기본 캐릭터 외 나머지 캐릭터를 획득하는 전용 머신이다. 테마별 아이템 뽑기와 별개의 흐름을 쓴다.

- **전용 머신**: 캐릭터 뽑기는 **테마 무관 머신 1개**로 운영한다(`gacha.theme_id`는 NULL). 풀 엔트리는 모두 `reward_type = CHARACTER`이며 `character_id`→`characters`를 가리킨다. (`gacha`, `gacha_pool_entries`)
- **비용**: **코인 500**(`cost_currency_type = COIN`, `cost_amount = 500`). 보유 코인이 부족하면 실행 거부. 가구(테마) 뽑기 단가 25와 의도적으로 격차를 두어 캐릭터를 희소 보상으로 남긴다.
- **추첨**: 캐릭터 **6개 전체를 균등 추첨**한다 — 캐릭터 엔트리는 rarity를 전부 null로 두는 데이터 전제로 동일 확률이 성립한다(api.md 참고). 온보딩 기본 캐릭터도 풀에 포함된다.
- **중복 시 코인 환급**: 이미 보유한 캐릭터(`user_characters` 보유)가 나오면 지급 대신 **코인 100을 환급**한다. 신규 캐릭터는 `user_characters`로 지급하고 `acquired_at`을 기록한다. (`user_characters`, `user_wallets` — 의존)
  - 보유 판정·지급은 다른 획득 경로(온보딩 스타터 선택, 착용 교체)와 동일한 유저 행 비관적 락으로 직렬화한다 — 동시 실행이 같은 캐릭터를 중복 보유시키거나 환급 판정을 우회할 수 없다.
  - 캐릭터 중복 환급은 **다이아가 아니라 코인**으로 돌려준다(아이템 뽑기의 다이아 전환과 다름).

## 뽑기 결과 확인

획득 결과를 표시하고 중복 아이템을 전환한다.

- **결과 표시**: 이번 실행으로 획득한 아이템/다이아 목록. 방 꾸미기 아이템과 캐릭터 악세사리는 모두 `reward_type=ITEM`으로 지급하며, 아이템은 `items.asset_key`, 이름·`rarity`(악세사리는 `NULL`)를 표시한다. (`gacha_pool_entries`, `items`)
- **아이템 지급**: 미보유 아이템은 `user_items`로 인벤토리에 추가. (`user_items` — 의존)
- **중복 → 다이아 전환**: 사용자가 **이미 보유한 아이템**(`user_items` 보유)이 나오면 아이템 대신 다이아로 전환해 지갑에 적립. (`gacha_pool_entries`, `user_items`, `user_wallets` — 의존)
  - 전환값: 방 꾸미기 아이템과 캐릭터 악세사리 모두 **다이아 3**.

## 관련 table 요약

- **gacha**: 머신 정의 — `code`, `name`, `cost_currency_type`, `cost_amount`, `draw_count`, `starts_at`, `ends_at`, `is_active`, theme FK→`themes`?(캐릭터 뽑기는 NULL).
- **gacha_pool_entries**: 머신별 보상 풀 — `gacha_id`→`gacha`, `reward_type`(`ITEM`/`CHARACTER` — `CURRENCY` 엔트리는 서버가 풀에서 제외, 미지원), `item_id`→`items`?, `character_id`→`characters`?, `currency_type`?·`reward_amount`?(잔존 컬럼, 미사용), `rarity`?(`일반`/`희귀`/`전설`), `weight`(잔존 컬럼, 추첨 미사용), `is_active`.

## 의존 도메인 (이 도메인이 다루지 않음)

- `user_wallets` 코인 차감·환급 → 재화/회원 도메인.
- `items` 정의·`user_items` 인벤토리 추가 → 상점/아이템 도메인.
- `characters` 정의·`user_characters` 보유 → 회원/온보딩 도메인. (캐릭터 뽑기는 `characters`를 보상으로 참조, `user_characters`로 지급)
- `themes` 테마 정의 → 상점/테마 도메인.
