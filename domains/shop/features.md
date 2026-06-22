# 상점 / 아이템 / 재화 기능 명세

기능 > 하위기능 > 설명 단위. 컬럼·FK는 [erd.md](../../erd.md) 기준이며, 없는 필드는 만들지 않는다.

## 아이템 목록 조회

상점에서 구매·수집 대상 아이템을 보여준다. 관련 table: `items`, `themes`, `user_items`.

- **탭 구분**: 방 꾸미기 탭과 캐릭터 악세사리 탭으로 나눠 노출한다.
  - 방 꾸미기: 바닥·벽·천장 등 표면 배치 아이템. `items.placement_type` / `items.surface_slot_type`로 구분.
  - 캐릭터 악세사리: 캐릭터 착용 아이템. `items.character_slot_type`로 구분. **상점에서 직접 구매 불가(뽑기 전용)** — 노출·보유 표시만.
  - 두 탭의 정확한 필터 기준 값(어떤 `placement_type`/`category_code`를 어느 탭에 넣을지)은 **미정**.
- **카드 표시 정보**: 이미지(`items.asset_key`), 이름(`items.name`), 가격(`items.price_amount` + `items.purchase_currency_type`), 테마(`themes.name`/`themes.code`), 보유 여부.
  - 보유 여부는 해당 user의 `user_items`(`deleted_at` IS NULL) 존재로 판정.
- **테마 필터**: `themes` 단위로 묶어 보여주거나 필터링. 활성 테마(`themes.is_active`)·활성 아이템(`items.is_active`)만 노출.
- **한정 표시**: `items.is_limited`로 한정 아이템 뱃지 표시. (운영 기간 등 추가 규칙은 본 도메인 컬럼에 없음 — 미정.)

## 인벤토리 조회

사용자가 보유한 아이템을 확인하고 방 배치로 진입한다. 관련 table: `user_items`, `items`, `themes`.

- **보유 목록**: 해당 user의 `user_items` 중 `deleted_at` IS NULL인 항목을, 연결된 `items` 정보(이미지·이름·테마·슬롯 타입)와 함께 반환.
- **카테고리/슬롯별 그룹**: `items.category_code` 또는 슬롯 타입(`surface_slot_type`/`character_slot_type`) 기준으로 묶어 표시.
- **방 배치 진입**: 보유 아이템 선택 → 방 배치 화면으로 이동. 실제 슬롯 배치·저장은 [방 도메인](../room/)(`room_surface_slots`)이 담당하며, 본 도메인은 보유 목록 제공까지.

## 아이템 구매

다이아로 방 꾸미기 아이템을 구매한다. 관련 table: `items`, `user_items`, `user_wallets`.

- **구매 가능 판정**: 대상 아이템이 활성(`is_active`)이고 다이아 구매 정보(`purchase_currency_type`=다이아, `price_amount` 존재)를 가질 때만 구매 가능. 캐릭터 악세사리 등 뽑기 전용 아이템은 구매 불가.
- **잔액 확인**: 구매 전 `items.price_amount`와 user의 다이아 `user_wallets.balance`(해당 `currency_type` row)를 비교. 부족하면 예외 처리(구매 차단).
- **구매 처리(트랜잭션)**: 다이아 `user_wallets.balance` 차감 + `user_items` row 생성(`acquired_at` 기록)을 하나의 쓰기 트랜잭션으로 묶는다.
  - 중복 보유 처리(이미 보유한 아이템 재구매 허용 여부)는 **미정**.
- **재화 잔액 조회**: 구매 화면에서 현재 보유 다이아(필요 시 코인)를 `user_wallets`에서 조회해 표시. 코인 적립 자체는 본 도메인 밖(루틴/투두).
