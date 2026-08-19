# 개인 방 기능 명세

루틴 달성을 개인 방의 성장·꾸미기로 시각화하는 도메인. 소유 table은 `personal_rooms`, `room_surface_slots`, `room_item_placements`. 스트릭 표시는 `streaks`를 읽기만 한다.

> 소유권 식별자(`user_id` = `personal_rooms` PK, `room_user_id`)로 인증된 사용자의 권한을 확인한다. 이미지/에셋은 `*_key`로 참조한다.

## 개인 방 성장 현황

- **방 레벨 조회**: 현재 `growth_level`을 보여준다(항상 0에서 시작). **성장 포인트 컬럼·누적치는 없고, `growth_level`을 올리는 경로도 서버에 미구현**이다 — 레벨업 트리거·환산 규칙은 루틴 도메인 의존 **미정**. (`personal_rooms`)
- **레벨업 피드백**: 레벨업 경로 구현 시 시각 피드백을 노출한다(위 미정에 종속). (`personal_rooms`)
- **대표 캐릭터 착용 상태**: 방에 표시되는 대표 캐릭터와 그 캐릭터에 저장된 악세사리 `accessories[]`를 함께 반환한다. 내 방·친구 방·집 멤버 방/미리보기가 같은 캐릭터별 착용 상태를 사용한다. 적용·해제는 [상점/아이템 도메인](../shop/)이 담당한다.

## 아이템 배치

- **배치 형식**: `personal_rooms.layout_format`이 방의 정본을 결정한다. `SLOT_V1`은 기존 `room_surface_slots`, `FREE_V1`은 positioned 가구에 `room_item_placements`를 사용한다. 기본값은 `SLOT_V1`이며 자유배치를 처음 저장한 방만 `FREE_V1`으로 지연 전환한다.
- **surface 배치**: 벽지(`wallpaper`)·바닥(`floor`)·배경(`background`) 3종은 배치 형식과 무관하게 `room_surface_slots`에 저장한다.
- **슬롯 배치 호환**: 기존 positioned 슬롯 8종(`topLeft`, `topCenter`, `topRight`, `midLeft`, `midRight`, `bottomLeft`, `bottomCenter`, `bottomRight`)을 유지한다. `FREE_V1` 전환 시 기존 positioned row를 삭제하지 않아 구버전 표시 fallback으로 남기되, 정본은 `layout_format`이 결정한다.
- **최초 변환 fallback**: `items.default_slot`은 구버전 표시와 `SLOT_V1` 방을 새 앱에서 고정 좌표로 변환할 때 사용하므로 유지한다.
- **새 가구 초기값**: `FREE_V1` 편집기에서 가구를 새로 추가할 때 `items.default_scale`과 nullable 쌍 `default_position_x`·`default_position_y`를 해당 배치에 복사한다. 기본 위치가 null 쌍이면 공유 Room renderer contract의 `newPlacementCenter`(현재 X `0.5`, Y `0.55`)를 사용한다. 좌표 anchor는 가구 중심이며 클라이언트가 현재 배율의 렌더 폭을 반영해 방 안으로 clamp한다. 카탈로그 기본값 변경은 기존 배치에 소급하지 않는다.
- **가구 자유배치**: 가구별 `position_x`·`position_y`(방 렌더 영역 전체 기준 0.0~1.0), `z_index`, `scale`, `rotation_deg`, `flipped`를 저장한다. 캐릭터 자리와의 겹침을 포함해 서버는 겹침·충돌을 검증하지 않는다. (`room_item_placements`)
- **보유·중복 규칙**: 호출자가 보유한 `user_item_id`만 배치할 수 있고, 같은 보유 아이템은 한 방에 한 번만 자유배치할 수 있다.
- **동시 저장 보호**: `layout_revision`은 방 배치 저장이 성공할 때마다 증가한다. 자유배치 저장 요청의 `baseRevision`이 현재 값과 다르면 409로 거부해 다른 기기의 저장을 덮어쓰지 않는다.
- **동거 봇 방 레이아웃 순환**: 동거 봇(`users.is_bot`)의 방은 **매주 월요일** 활동 창에서 그날 아직 안 바뀐 방(`personal_rooms.updated_at` 이 오늘 0시 이전)만 프리셋을 순환한다 — 프리셋 = 고정 기준 월요일 대비 주차 인덱스 % 3(1→2→3, 한 주 서버가 멈춰도 순환이 어긋나지 않음). 위 자유배치 저장 경로(`baseRevision` = 현재 revision)를 그대로 타므로 `layout_revision` 이 증가하고, revision 충돌은 정상 거절로 흡수된다. 스케줄러 공통 규칙은 [member/features.md](../member/features.md) "동거 봇 계정".
- **구버전 저장 가드**: `FREE_V1` 방에 기존 슬롯 저장 API로 positioned 슬롯을 하나라도 보내면 409 `ROOM_LAYOUT_FORMAT_CONFLICT`를 반환한다. surface 슬롯만 포함한 요청은 허용한다.

## 스트릭 표시

- **스트릭 조회**: 현재 연속 성공일(`current_count`)과 최장 기록(`longest_count`)을 방 화면에 표시한다. 스트릭 갱신·보너스 산정은 루틴 도메인 담당이며 여기서는 읽기만 한다. (`streaks` 읽기 전용)

## 장기 미접속 거미줄 (MVP)

- **발생**: 매일 12:30 KST(서버 기동 시 누락 보정)에 개인 방이 있고 마지막 접속(`users.last_accessed_at`, 없으면 가입 시각)이 2일 전 이하인 방에 거미줄을 활성화한다. 동거 봇 계정(`users.is_bot`)의 방은 대상에서 제외한다 — 봇은 로그인하지 않아 접속 시각이 오르지 않으므로 거미줄이 고착되기 때문 → [member/features.md](../member/features.md) "동거 봇 계정".
- **표시**: 내 방과 같은 집 ACTIVE 구성원 방 조회 응답의 nullable `cobweb`으로 내려주며, 집 구성원 타일과 실제 방 왼쪽 위 모서리에 표시한다. 한 번 발생한 거미줄은 방 주인이 복귀해도 청소 전까지 유지한다.
- **청소·보상**: 방 주인 또는 같은 집 ACTIVE 구성원이 터치해 청소할 수 있다. 최초 성공 요청만 청소자에게 코인 3개를 지급하고 원장을 남기며, 행·지갑 비관적 락으로 동시 터치 이중 지급을 막는다.
- **복귀 알림**: 다른 집 구성원이 청소하면 방 주인에게 `ROOM_COBWEB_CLEANED` 집 알림을 저장하고 push한다. 자기 방 청소에는 자기 알림을 보내지 않는다.
- **재발생**: 청소 시각과 마지막 접속 중 더 늦은 시각부터 다시 2일이 지나고 여전히 미접속이면 같은 방의 거미줄이 새 회차로 재활성화된다.
- **동거 봇의 청소**: 같은 집 사람 방에 활성 거미줄이 있으면 동거 봇이 활동 창(프로필 시간대) 안 **10분 틱마다 1% 확률**(SPREAD 84틱 기준 하루 약 57% — 사람이 복귀해 스스로 청소할 3코인 기회를 봇이 선점하지 않게 낮은 값)로 위 청소 경로(같은 집 구성원 청소)를 그대로 호출한다. 청소 보상 3코인은 봇 지갑에 들어가고, 방 주인에게는 기존과 같이 `ROOM_COBWEB_CLEANED` 알림이 간다. 사람이 이미 청소했으면 봇의 시도는 정상 거절로 흡수된다. 스케줄러 공통 규칙은 [member/features.md](../member/features.md) "동거 봇 계정".
- table: `room_cobwebs`, `users`(접속 판정), `user_wallets`·`wallet_histories`(보상), `notification`(복귀 알림).

## 방 스냅샷 공유

- **스냅샷 생성·공유**: 현재 방 상태를 이미지로 저장해 외부 공유 또는 집 구성원 공개용으로 만든다. 스냅샷 이미지의 저장 방식·`*_key` 발급은 **미정**(별도 스냅샷 table 없음). 집 구성원 공개 대상은 집 도메인 의존.

## 도메인 경계

- **방명록**(`room_guestbooks`)은 집(공동) 도메인 담당. 이 도메인에서 다루지 않는다.
- 보상 지급·재화 차감(`user_wallets`), 아이템 획득(`user_items` 생성)은 루틴·상점·뽑기 도메인 담당. 방은 이미 보유한 아이템의 배치만 담당한다.
