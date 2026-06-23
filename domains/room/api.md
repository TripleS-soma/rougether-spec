# 개인 방 API

prefix `/api/v1`. 공통 규칙은 [api.md](../../api.md)를 따른다. `me`는 인증된 사용자를 가리키며 소유권 식별자(`room_user_id`)로 guard를 적용한다. 이미지/에셋은 `*_key`로 내려준다.

> draft. 요청/응답 상세는 구현 시 서버 repo `docs/`에서 확정. 아래는 합의 대상 초안이다.

## 방 성장 현황

### `GET /api/v1/rooms/me`
- 목적: 내 방의 성장 레벨 + 슬롯 배치 + 스트릭을 한 번에 조회.
- 응답 핵심: `roomUserId`, `growthLevel`, `slots[]`(아래 슬롯 형태), `streak`(`currentCount`, `longestCount`), `updatedAt`.
- table: `personal_rooms`(읽기), `room_surface_slots`(읽기), `user_items`/`items`(assetKey 조인), `streaks`(읽기 전용).

## 아이템 배치

### `GET /api/v1/rooms/me/slots`
- 목적: 슬롯별 현재 배치 조회.
- 응답 핵심: `items[]` = `{ slotType, userItemId?, assetKey?, savedAt }`. 빈 슬롯은 `userItemId` null.
- table: `room_surface_slots`, `user_items`/`items` 조인.

### `PUT /api/v1/rooms/me/slots`
- 목적: 슬롯 배치 일괄 저장(배치/교체/해제).
- 요청 핵심: `slots[]` = `{ slotType, userItemId | null }`. null이면 해당 슬롯 배치 해제.
- 검증: `userItemId`가 호출자 보유 아이템인지, 아이템의 `surface_slot_type`이 `slotType`과 맞는지(인벤토리 도메인 의존, 규칙 **미정**).
- 응답 핵심: 갱신된 `slots[]`, `updatedAt`.
- table: `room_surface_slots`(쓰기), `user_items`/`items`(검증).

> 단건 배치/해제를 별도 엔드포인트(`PUT`/`DELETE /api/v1/rooms/me/slots/{slotType}`)로 둘지는 **미정**. 우선 일괄 저장 1개로 제안.

## 방 스냅샷 공유

### `POST /api/v1/rooms/me/snapshot`
- 목적: 현재 방 상태를 스냅샷 이미지로 저장하고 공유용 참조를 발급.
- 요청 핵심: `scope`(예: `private` / `house`) — 집 구성원 공개 시 집 도메인 의존.
- 응답 핵심: `snapshotKey`(이미지 `*_key`) 등 — 저장 방식·발급 주체 **미정**(별도 스냅샷 table 없음).
- table: 미정.

## 비범위 (다른 도메인)

- 방명록(`room_guestbooks`) → 집(공동) 도메인.
- 인벤토리/상점 조회·구매(`GET /api/v1/me/items`, `GET /api/v1/items`, `POST /api/v1/items/{id}/purchase`) → 상점/인벤토리 도메인. 방은 배치만.
- 스트릭 갱신·루틴 완료 보상 지급 → 루틴/투두 도메인. 방은 `streaks` 읽기, 성장 반영 결과만 노출.
