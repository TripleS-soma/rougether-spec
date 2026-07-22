# 개인 방 기능 명세

루틴 달성을 개인 방의 성장·꾸미기로 시각화하는 도메인. 소유 table은 `personal_rooms`, `room_surface_slots`, `room_item_placements`. 스트릭 표시는 `streaks`를 읽기만 한다.

> 소유권 식별자(`user_id` = `personal_rooms` PK, `room_user_id`)로 인증된 사용자의 권한을 확인한다. 이미지/에셋은 `*_key`로 참조한다.

## 개인 방 성장 현황

- **방 레벨·성장 포인트 조회**: 현재 `growth_level`과 누적 성장 정도를 보여준다. 루틴 달성이 성장의 원천이다. (`personal_rooms`)
- **레벨업 피드백**: 누적 성장이 임계치를 넘으면 `growth_level`이 오르고 시각 피드백을 노출한다. 성장 포인트 누적·환산 규칙은 루틴 도메인 의존 — **미정**. (`personal_rooms`)

## 아이템 배치

- **배치 형식**: `personal_rooms.layout_format`이 방의 정본을 결정한다. `SLOT_V1`은 기존 `room_surface_slots`, `FREE_V1`은 positioned 가구에 `room_item_placements`를 사용한다. 기본값은 `SLOT_V1`이며 자유배치를 처음 저장한 방만 `FREE_V1`으로 지연 전환한다.
- **surface 배치**: 벽지(`wallpaper`)·바닥(`floor`)·배경(`background`) 3종은 배치 형식과 무관하게 `room_surface_slots`에 저장한다.
- **슬롯 배치 호환**: 기존 positioned 슬롯 8종(`topLeft`, `topCenter`, `topRight`, `midLeft`, `midRight`, `bottomLeft`, `bottomCenter`, `bottomRight`)을 유지한다. `FREE_V1` 전환 시 기존 positioned row를 삭제하지 않아 구버전 표시 fallback으로 남기되, 정본은 `layout_format`이 결정한다.
- **최초 변환 fallback**: `items.default_slot`은 구버전 표시와 `SLOT_V1` 방을 새 앱에서 고정 좌표로 변환할 때 사용하므로 유지한다.
- **새 가구 초기값**: `FREE_V1` 편집기에서 가구를 새로 추가할 때 `items.default_scale`과 nullable 쌍 `default_position_x`·`default_position_y`를 해당 배치에 복사한다. 기본 위치가 null 쌍이면 공유 Room renderer contract의 `newPlacementCenter`(현재 X `0.5`, Y `0.55`)를 사용한다. 좌표 anchor는 가구 중심이며 클라이언트가 현재 배율의 렌더 폭을 반영해 방 안으로 clamp한다. 카탈로그 기본값 변경은 기존 배치에 소급하지 않는다.
- **가구 자유배치**: 가구별 `position_x`·`position_y`(방 렌더 영역 전체 기준 0.0~1.0), `z_index`, `scale`, `rotation_deg`, `flipped`를 저장한다. 캐릭터 자리와의 겹침을 포함해 서버는 겹침·충돌을 검증하지 않는다. (`room_item_placements`)
- **보유·중복 규칙**: 호출자가 보유한 `user_item_id`만 배치할 수 있고, 같은 보유 아이템은 한 방에 한 번만 자유배치할 수 있다.
- **동시 저장 보호**: `layout_revision`은 방 배치 저장이 성공할 때마다 증가한다. 자유배치 저장 요청의 `baseRevision`이 현재 값과 다르면 409로 거부해 다른 기기의 저장을 덮어쓰지 않는다.
- **구버전 저장 가드**: `FREE_V1` 방에 기존 슬롯 저장 API로 positioned 슬롯을 하나라도 보내면 409 `ROOM_LAYOUT_FORMAT_CONFLICT`를 반환한다. surface 슬롯만 포함한 요청은 허용한다.

## 스트릭 표시

- **스트릭 조회**: 현재 연속 성공일(`current_count`)과 최장 기록(`longest_count`)을 방 화면에 표시한다. 스트릭 갱신·보너스 산정은 루틴 도메인 담당이며 여기서는 읽기만 한다. (`streaks` 읽기 전용)

## 방 스냅샷 공유

- **스냅샷 생성·공유**: 현재 방 상태를 이미지로 저장해 외부 공유 또는 집 구성원 공개용으로 만든다. 스냅샷 이미지의 저장 방식·`*_key` 발급은 **미정**(별도 스냅샷 table 없음). 집 구성원 공개 대상은 집 도메인 의존.

## 도메인 경계

- **방명록**(`room_guestbooks`)은 집(공동) 도메인 담당. 이 도메인에서 다루지 않는다.
- 보상 지급·재화 차감(`user_wallets`), 아이템 획득(`user_items` 생성)은 루틴·상점·뽑기 도메인 담당. 방은 이미 보유한 아이템의 배치만 담당한다.
