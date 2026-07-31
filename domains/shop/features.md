# 상점 / 아이템 / 재화 기능 명세

기능 > 하위기능 > 설명 단위. 컬럼·FK는 [erd.md](../../erd.md) 기준이며, 없는 필드는 만들지 않는다.

## 아이템 목록 조회

상점에서 구매·수집 대상 아이템을 보여준다. 관련 table: `items`, `themes`, `user_items`.

- **탭 구분**: 방 꾸미기 탭과 캐릭터 악세사리 탭으로 나눠 노출한다.
  - 방 꾸미기: 바닥·벽·천장 등 표면 배치 아이템. `items.placement_type` / `items.surface_slot_type`로 구분.
  - 캐릭터 악세사리: `items.placement_type = character`인 캐릭터 착용 아이템. `items.character_slot_type`으로 착용 위치를 구분한다. **상점에서 직접 구매 불가(뽑기 전용)** — 노출·보유 표시만.
- **카드 표시 정보**: 이미지(`items.asset_key`), 이름(`items.name`), 가격(`items.price_amount` + `items.purchase_currency_type`), 테마(`themes.name`/`themes.code`), 보유 여부.
  - 보유 여부는 해당 user의 `user_items`(`deleted_at` IS NULL) 존재로 판정.
- **테마 필터**: `themes` 단위로 묶어 보여주거나 필터링. 활성 테마(`themes.is_active`)·활성 아이템(`items.is_active`)만 노출.
- **한정 표시**: `items.is_limited`로 한정 아이템 뱃지 표시. (운영 기간 등 추가 규칙은 본 도메인 컬럼에 없음 — 미정.)

## 인벤토리 조회

사용자가 보유한 아이템을 확인하고 방 배치로 진입한다. 관련 table: `user_items`, `items`, `themes`.

- **보유 목록**: 해당 user의 `user_items` 중 `deleted_at` IS NULL인 항목을, 연결된 `items` 정보(이미지·이름·테마·슬롯 타입)와 함께 반환.
- **카테고리/슬롯별 그룹**: `items.category_code` 또는 슬롯 타입(`surface_slot_type`/`character_slot_type`) 기준으로 묶어 표시.
- **방 배치 진입**: 보유 아이템 선택 → 방 배치 화면으로 이동. 실제 슬롯 배치·저장은 [방 도메인](../room/)(`room_surface_slots`)이 담당하며, 본 도메인은 보유 목록 제공까지.

## 캐릭터 악세사리 착용

보유한 악세사리를 보유 캐릭터에 적용하고, 캐릭터가 노출되는 화면에서 같은 착용 상태를 계속 사용한다. 관련 table: `user_character_accessories`, `user_characters`, `user_items`, `items`.

- **캐릭터별 저장**: 착용 상태는 user 전역이 아니라 `user_characters`별로 저장한다. 대표 캐릭터를 바꿨다가 돌아와도 각 캐릭터가 마지막으로 착용한 악세사리가 복원된다.
- **슬롯당 1개**: 한 캐릭터의 같은 `character_slot_type`에는 악세사리 1개만 착용할 수 있다. 같은 슬롯에 새 악세사리를 적용하면 기존 값을 원자적으로 교체한다.
- **소유권·종류 검증**: 호출자가 보유한 `user_character_id`와 `user_item_id`만 사용할 수 있다. 아이템은 활성 `placement_type = character`이고 `character_slot_type`이 있어야 한다.
- **해제**: 캐릭터와 슬롯을 지정해 해당 슬롯의 착용을 해제한다. 이미 비어 있는 슬롯 해제는 성공으로 처리한다.
- **표시 지속성**: 내 캐릭터 목록과 내 방·친구 방·집 멤버 방/미리보기의 캐릭터 응답은 저장된 `accessories[]`를 포함한다. 클라이언트는 캐릭터 원본 위에 각 `assetKey`를 레이어로 합성한다.
- **캐릭터별 렌더 보정**: 같은 악세사리라도 캐릭터 체형과 애니메이션 상태가 다르므로 `(item, character, renderState)`별 렌더 프로필을 정본으로 사용한다. 관리자 화면에서 실제 캐릭터를 미리 보며 중심점 위치(`positionX`·`positionY`), 표시 너비(`widthRatio`), 회전(`rotationDeg`), 합성 순서(`zIndex`)를 조정하고 저장한다. 조정값은 아이템 전역 기본값으로 합치지 않는다.
- **운영 제한**: 렌더 프로필 1건은 하나의 단품 이미지와 하나의 `zIndex`만 합성한다. 한 악세사리가 캐릭터 앞과 뒤를 동시에 감싸야 자연스러운 목걸이·의상형 에셋은 앞·뒤 레이어 분리 계약을 추가하기 전까지 MVP 등록 대상에서 제외한다.

## 아이템 구매

다이아로 방 꾸미기 아이템을 구매한다. 관련 table: `items`, `user_items`, `user_wallets`.

- **구매 가능 판정**: 대상 아이템이 활성(`is_active`)이고 다이아 구매 정보(`purchase_currency_type`=다이아, `price_amount` 존재)를 가질 때만 구매 가능. 캐릭터 악세사리 등 뽑기 전용 아이템은 구매 불가.
- **잔액 확인**: 구매 전 `items.price_amount`와 user의 다이아 `user_wallets.balance`(해당 `currency_type` row)를 비교. 부족하면 예외 처리(구매 차단).
- **구매 처리(트랜잭션)**: 다이아 `user_wallets.balance` 차감 + `user_items` row 생성(`acquired_at` 기록)을 하나의 쓰기 트랜잭션으로 묶는다.
  - 중복 보유 처리(이미 보유한 아이템 재구매 허용 여부)는 **미정**.
- **재화 잔액 조회**: 구매 화면에서 현재 보유 다이아(필요 시 코인)를 `user_wallets`에서 조회해 표시. 코인 적립 자체는 본 도메인 밖(루틴/투두).
