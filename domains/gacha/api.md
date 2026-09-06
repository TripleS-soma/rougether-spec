# 뽑기 도메인 API

상위 규약: [api.md](../../api.md) · 기능: [features.md](./features.md) · 데이터: [erd.md](../../erd.md)

공통 규칙(prefix `/api/v1`, JSON, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 재화는 `user_wallets.currency_type`, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다.

## GET /api/v1/gacha

운영 중인 뽑기 머신 목록 조회. 신규 꾸미기 화면은 `catalog=category`를 명시하고, 기존 앱은 쿼리를 생략하는 방식으로 이행한다.

- **요청 쿼리**: `catalog`는 선택 필드다. 허용값은 정확히 소문자 `category`이며, 빈 문자열·그 외 값은 400 `VALIDATION_FAILED`다.
  - `catalog=category`: 정식 꾸미기 머신만 **WALLPAPER → FLOOR → FURNITURE** 순서로 반환한다. 테마별 머신·캐릭터·악세사리 전용 머신은 포함하지 않는다.
  - 생략: 정식 3종 코드를 제외한 기존 테마·캐릭터·악세사리 목록을 유지한다. 기존 머신 ID와 풀을 비활성화하지 않는다.
- **목적/필터**: `is_active=true`이고 운영 기간 안인 머신·비용을 노출한다. 시작 전 또는 종료 시각을 지난 머신은 제외한다. 정확한 포함 조건은 `starts_at <= now <= ends_at`이며 `NULL` 경계는 제한이 없다. 신규 3종이 모두 정상 운영 중이면 3개지만, 비활성·기간 밖 머신이 있으면 더 적게 반환한다. 빈 보상 풀 자체는 목록 제외 조건이 아니다.
- **응답 핵심 필드**: `items[]` — `gachaId`, `code`, `name`, `category`, `themeId`, `costCurrencyType`, `costAmount`, `drawCount`, `active`, `giftBoxAssetKey`.
  - `category`는 추가된 nullable 필드로 정식 `code`에서 도출한다. 신규 3종은 아래 값, 그 외 기존 머신은 `null`이다. 새 DB 컬럼이 아니다.
  - 신규 3종과 캐릭터 머신 모두 `themeId=null`이므로 **`themeId` 부재만으로 캐릭터 뽑기로 분류하지 않는다**. 신규 앱은 `category`(호환 분기는 정확한 정식 `code`)로 분류하고 응답의 실제 `gachaId`·비용을 사용한다.
  - `active`는 저장된 활성 플래그다. `startsAt`/`endsAt`/`coverImageKey`는 **응답에 없다**(기간은 미노출, 테마 커버는 테마 조회 쪽 계약).
- `giftBoxAssetKey`는 전체 URL이 아닌 선물상자 object key다. 기존 클라이언트의 CDN 조합 계약을 유지하며, 테마 없는 신규 3종·캐릭터와 매핑되지 않은 테마에는 기본 선물상자 key가 내려간다. 신규 공통 연출은 등급별 배경과 결과 아이템 이미지를 별도로 합성할 수 있다.
- **관련 table**: `gacha`.

| `category` | `code` | `name` | `themeId` | 단챠 비용 |
| --- | --- | --- | --- | --- |
| `WALLPAPER` | `wallpaper_gacha` | 벽지 뽑기 | `null` | `COIN` 25 |
| `FLOOR` | `floor_gacha` | 바닥 뽑기 | `null` | `COIN` 25 |
| `FURNITURE` | `furniture_gacha` | 가구 뽑기 | `null` | `COIN` 25 |

## GET /api/v1/gacha/{id}

단일 머신 상세 조회.

- **목적**: 비용·구성 요약. 신규·기존 머신 모두 기존 ID로 직접 조회할 수 있다. 상세 조회는 활성·운영 기간을 검사하지 않으며, 없는 머신이면 404 `GACHA_NOT_FOUND`다.
- **응답 핵심 필드**: 목록과 동일 형태(`gachaId`, `code`, `name`, `category`, `themeId`, `costCurrencyType`, `costAmount`, `drawCount`, `active`, `giftBoxAssetKey` — 기간 미노출). `giftBoxAssetKey` 사용 규칙은 목록 조회와 같다. 보상 항목은 아래 `/rewards`에서 조회하며, 확률은 현재 노출하지 않는다.
- **관련 table**: `gacha`, `gacha_pool_entries`.

## GET /api/v1/gacha/{id}/rewards

단일 머신에서 현재 배출되는 보상 목록을 조회한다.

- **목적**: 뽑기 전에 해당 머신에서 획득 가능한 방 꾸미기 아이템·캐릭터 악세사리·캐릭터를 이미지와 함께 미리 보여준다.
- **응답 핵심 필드**: `items[]` — `rewardType`(`ITEM`/`CHARACTER`), `itemId?`, `characterId?`, `name`, `assetKey`, `rarity?`, `owned`, `categoryCode?`, `placementType?`, `surfaceSlotType?`, `characterSlotType?`.
  - `ITEM`이면 `itemId`만, `CHARACTER`이면 `characterId`만 채운다.
  - `ITEM`의 렌더링·분류 정보는 `items` 원본 값을 그대로 내려준다. 캐릭터 악세사리는 `placementType=character`이며 `characterSlotType`으로 착용 위치를 구분하고, 별도 등급이 없으므로 `rarity=null`이다.
  - `CHARACTER`이면 아이템 분류·배치 필드(`categoryCode`, `placementType`, `surfaceSlotType`, `characterSlotType`)는 `null`이다.
  - `owned`는 인증 사용자가 해당 아이템 또는 캐릭터를 현재 보유 중인지 나타낸다.
  - 활성 풀 엔트리(`gacha_pool_entries.is_active=true`) 중 실제 보상 참조가 있는 항목만 내려주며, **보상 참조가 비활성이면 함께 제외한다** — `ITEM`은 `items.is_active`와 소속 테마 `themes.is_active`까지, `CHARACTER`는 `characters.is_active`를 검사한다. admin 카탈로그 사용/미사용 토글([shop/api.md](../shop/api.md) 어드민 섹션)이 별도 풀 조작 없이 다음 조회부터 반영된다.
  - 정식 3종은 여기에 **아이템 배치 유형과 머신 카테고리 일치 조건**을 추가한다. 벽지는 `surface_slot`+`wallpaper`, 바닥은 `surface_slot`+`floor`, 가구는 `positioned`+`surfaceSlotType=null`이다. `characterSlotType`이 있거나 `categoryCode`가 `character_accessory`·`background`이면 제외한다. `CHARACTER`와 다른 종류의 `ITEM`도 해당 3종 풀에서 제외한다. 미리보기와 draw의 적격성 조건은 같다.
  - 목록은 풀 엔트리 ID 오름차순으로 고정하되, `weight`와 계산 확률은 응답하지 않는다.
  - 적격 보상이 없으면 `items: []`를 반환한다. 빈 풀로 실제 추첨을 시도할 때만 `GACHA_EMPTY_POOL` 오류다.
- **검증/예외**: 없는 머신이면 `GACHA_NOT_FOUND`(404), `is_active=false`이거나 운영 기간 밖이면 `GACHA_INACTIVE`(409).
- **관련 table**: `gacha`, `gacha_pool_entries`, `items`, `characters`, `user_items`, `user_characters`.

## POST /api/v1/gacha/{id}/draw

뽑기 실행 (코인 소모 → 보상 지급). 아이템 뽑기와 캐릭터 뽑기가 같은 엔드포인트를 쓰며, `reward_type`으로 보상이 갈린다.

- **목적**: 코인 차감 → 요청 횟수만큼 추첨 → 아이템/캐릭터/재화 지급. **중복 아이템은 다이아 3 전환, 중복 캐릭터는 코인 100 환급**. 꾸미기 3종 뽑기 단가 25, 캐릭터 뽑기 단가 500. 이번 통합으로 가격·환급값·추첨 확률은 바꾸지 않는다.
- **요청 핵심 필드**: (path `id`) 머신 식별. 본문 `count`는 `1`(단챠) 또는 `6`(5+1회)만 허용한다. `count=6`은 단챠 5회분(`cost_amount × 5`)을 차감하고 결과 6개를 지급한다. 인증된 사용자(`me`) 기준이며 소유권 식별자 `userId`로 guard 적용한다.
  - 구버전 앱 이행 기간에는 기존 `count=10` 요청도 `count=6`과 동일하게 단챠 5회분 차감·결과 6개 지급으로 처리한다. 신규 클라이언트는 `count=10`을 사용하지 않는다.
- **응답 핵심 필드**: `results[]` — 각 추첨에 대해 `rewardType`(`ITEM`/`CHARACTER`/`CURRENCY`), `rarity`, `converted`(중복 여부).
  - 아이템 보상이면 `itemId`·`assetKey`.
  - **캐릭터 보상이면 `characterId`·`assetKey`**(`characters.base_asset_key`)·`name`. 중복이면 `converted=true`로 캐릭터 대신 코인 환급(`refundAmount`).
  - 중복 전환이면 `refundCurrencyType`·`refundAmount`(아이템 중복=다이아 3, 캐릭터 중복=코인 100). `rewardType=CURRENCY`는 중복 전환 결과에만 쓰인다.
  - 갱신된 지갑 잔액은 **`wallets[]` 배열**로 COIN·DIAMOND 2건이 항상 포함된다(각 `currencyType`·`balance`).
- **결과 개수**: `count=1`이면 `results` 1개, `count=6`이면 뽑은 순서대로 6개. 같은 5+1회 요청 안에서 먼저 획득한 보상이 다시 나오면 중복 전환으로 처리한다.
- **추첨 방식**: `gacha_pool_entries.weight`는 사용하지 않는다(스키마 잔존 컬럼). 추첨 대상 풀은 보상 미리보기와 같은 활성·카테고리 필터를 쓴다. 아이템 뽑기는 **rarity 티어 롤** — `random(100)`으로 등급을 먼저 정하고(일반 70% / 희귀 25% / 전설 5%) 그 등급 풀 안에서 균등 추첨한다. 해당 등급 풀이 비어 있으면 전체 활성 풀에서 균등 추첨(fallback — 아이템 비활성화로 등급이 비어도 동일하게 적용되므로, 특정 등급을 전부 내리면 잔여 등급의 실효 배출률이 공시 확률과 달라질 수 있다. 재정규화 도입 여부는 미정 → [open-questions.md](../../open-questions.md)). `rarity` 값은 한글 문자열 `일반`/`희귀`/`전설` 3종이며, rarity가 null인 엔트리는 `일반` 티어로 묶인다.
- **검증/예외**(전부 서버 에러코드): 머신 없음 404 `GACHA_NOT_FOUND`, `is_active=false` 또는 운영 기간 밖 409 `GACHA_INACTIVE`, `count` 1/6/10 외 400 `GACHA_INVALID_DRAW_COUNT`, 보유 코인 부족 409 `GACHA_INSUFFICIENT_COIN`, 활성 풀 비어있음 409 `GACHA_EMPTY_POOL`. 차감·지급·환급은 단일 쓰기 트랜잭션.
- **관련 table**: `gacha`, `gacha_pool_entries`, (의존) `user_items`, `user_characters`, `user_wallets`.
- **클라이언트 연출 경계**: 응답 시점에 지급·환급은 완료되어 있다. 영상 재생·건너뛰기·결과 확인은 추가 draw를 호출하지 않는다. 결과 아이템의 `assetKey`와 `rarity`를 등급별 공통 연출에 넣으며, 별도 아이템별 영상 필드나 연출 완료 API는 추가하지 않는다. 연출 상세는 [기능 명세](./features.md#공통-결과-연출)를 따른다.

### 캐릭터 악세사리 뽑기 (테마별 아이템 머신)

- `items.placement_type = character`인 캐릭터 악세사리는 `rewardType = ITEM`으로 배출된다.
- 풀 엔트리는 모두 `rarity = null`, `weight = 1`이며 활성 엔트리 전체를 균등 추첨한다. 응답에는 `weight`나 계산 확률을 포함하지 않는다.
- 이미 보유한 악세사리는 다른 아이템 중복과 동일하게 **다이아 3 환급**(`rewardType = CURRENCY`, `converted = true`, `refundAmount = 3`)으로 처리한다.

### 캐릭터 뽑기 (테마 무관 전용 머신)

- 캐릭터 뽑기 머신은 `category = null`, `themeId = null`, `costCurrencyType = COIN`, `costAmount = 500`. 신규 `catalog=category` 목록에서는 제외하되 기존 머신 ID의 직접 조회·뽑기를 유지한다.
- 풀은 캐릭터 **8개** 전체를 **균등 추첨**하고, 이미 보유한 캐릭터가 나오면 지급 대신 **코인 100 환급**(`rewardType = CURRENCY`, `converted = true`, `refundAmount = 100`). 균등은 별도 분기가 아니라 **캐릭터 엔트리의 rarity가 전부 null이라는 데이터 전제**에서 성립한다(전부 `일반` 티어로 묶여 티어 내 균등 추첨) — 캐릭터 엔트리에 rarity를 채우면 균등이 깨지므로 운영 데이터 규칙으로 유지한다. 캐릭터 수도 코드가 강제하지 않는다 — 2026-08-13 dev 서버 실측 기준 마스터 `GET /characters` 8종, 풀 `GET /gacha/12/rewards` 8엔트리(모두 `rarity = null`).
- 신규 캐릭터는 `user_characters`로 지급되고 응답에 `characterId`·`assetKey`가 포함된다.

## 미정 / 의존

- 구버전 앱 지원과 기존 테마 머신의 종료 시점은 별도 결정한다. 이번 이행에서는 목록 분기를 추가하고 기존 머신·풀을 유지하므로 새 네이티브 앱 배포 이전에도 구버전 목록 계약은 바뀌지 않는다.
- 운영 기간(`starts_at`/`ends_at`)은 목록 필터·보상 목록·draw에서 검사한다. 상세(GET /{id})는 기간 미검사·미노출 — 노출 도입 여부 미정.
- (해소) 회수 보상 배출 차단 — 풀 필터가 엔트리 활성에 더해 보상 참조 활성(`characters.is_active`, `items.is_active`+`themes.is_active`)을 코드에서 검사한다. 회수 시 풀 엔트리를 손대는 운영 절차는 불필요.
- 아이템 비활성화로 특정 rarity 등급이 통째로 비었을 때의 확률 처리(현재 전체 풀 균등 fallback) — 재정규화·재롤 도입 여부 미정.
- `reward_type = CURRENCY` 풀 엔트리는 서버가 풀에서 제외한다(미지원 — `currency_type`/`reward_amount` 컬럼은 잔존). 재화 보상 엔트리 도입 여부는 미정.
- 지갑 차감·적립 API 형태는 재화 도메인 계약을 따른다(여기서 확정 안 함).
