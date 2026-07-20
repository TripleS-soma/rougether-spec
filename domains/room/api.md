# 개인 방 API

prefix `/api/v1`. 공통 규칙은 [api.md](../../api.md)를 따른다. `me`는 인증된 사용자를 가리키며 소유권 식별자(`room_user_id`)로 guard를 적용한다. 이미지/에셋은 `*_key`로 내려준다.

> 자유배치와 구버전 슬롯 호환 계약은 확정되어 있다. 스냅샷 공유 계약은 아직 초안이다.

## 방 성장 현황

### `GET /api/v1/rooms/me`
- 목적: 내 방의 성장 레벨 + 착용 캐릭터 + 배치 형식·revision + 슬롯·자유배치 + 스트릭을 한 번에 조회.
- 응답 핵심: `roomUserId`, `growthLevel`, `layoutFormat`(`SLOT_V1`/`FREE_V1`), `layoutRevision`, `character?`, `slots[]`, `placements[]`, `streak`(`currentCount`, `longestCount`), `updatedAt`.
- `placements[]`: `{ userItemId, assetKey, positionX, positionY, zIndex, scale, rotationDeg, flipped, updatedAt }`, `zIndex` 오름차순. `FREE_V1` 전환 전에는 빈 배열이다.
- 렌더링: `SLOT_V1`이면 `slots`를 사용하고 새 앱은 positioned 슬롯을 고정 좌표로 변환한다. `FREE_V1`이면 surface 3종은 `slots`, 가구는 `placements`를 정본으로 사용한다.
- table: `personal_rooms`(읽기), `room_surface_slots`·`room_item_placements`(읽기), `user_items`/`items`(assetKey 조인), `streaks`(읽기 전용).

## 아이템 배치

### `GET /api/v1/rooms/me/slots`
- 목적: 슬롯별 현재 배치 조회.
- 응답 핵심: `items[]` = `{ slotType, userItemId?, assetKey?, savedAt }`. 빈 슬롯은 `userItemId` null.
- table: `room_surface_slots`, `user_items`/`items` 조인.

### `PUT /api/v1/rooms/me/slots`
- 목적: 요청에 포함된 슬롯 배치만 저장(배치/교체/해제)하는 부분 갱신.
- 요청 핵심: `slots[]` = `{ slotType, userItemId | null }`. null이면 해당 슬롯 배치 해제.
- 검증: 유효한 `slotType`인지, 한 요청에 같은 `slotType`이 중복되지 않는지, `userItemId`가 호출자 보유 아이템인지 확인한다. 슬롯과 아이템 종류의 매칭은 서버가 강제하지 않으므로 클라이언트가 맞춰 배치한다.
- 호환 가드: `FREE_V1` 방에서 positioned 슬롯이 하나라도 포함되면 409 `ROOM_LAYOUT_FORMAT_CONFLICT`. surface(`wallpaper`/`floor`/`background`)만 포함한 요청은 허용한다.
- revision: 배치 변경 저장이 성공하면 `layoutRevision`을 1 증가시킨다.
- 응답 핵심: `GET /api/v1/rooms/me`와 동일한 갱신 후 방 상태.
- table: `room_surface_slots`(쓰기), `user_items`/`items`(검증).

> 단건 배치/해제를 별도 엔드포인트(`PUT`/`DELETE /api/v1/rooms/me/slots/{slotType}`)로 둘지는 **미정**. 우선 일괄 저장 1개로 제안.

### `PUT /api/v1/rooms/me/layout`
- 목적: surface 슬롯과 가구 자유배치를 단일 트랜잭션으로 저장한다. 첫 저장 시 해당 방만 `SLOT_V1`에서 `FREE_V1`으로 전환한다.
- 요청 핵심:
  - `baseRevision`(필수): 마지막 조회에서 받은 `layoutRevision`. 방이 아직 생성되지 않았으면 0. 현재 서버 값과 다르면 409 `ROOM_LAYOUT_REVISION_CONFLICT`.
  - `surfaceSlots[]`(필수): `{ slotType, userItemId | null }`. surface 3종만 허용하며, 요청에 포함된 슬롯만 갱신한다.
  - `placements[]`(필수): `{ userItemId, positionX, positionY, zIndex, scale, rotationDeg, flipped }`. 전체 교체 방식으로 요청에 없는 기존 자유배치는 삭제한다.
- 값 범위: `positionX`·`positionY`는 0.0~1.0, `scale`은 0.1~5.0, `rotationDeg`는 -360~360. 좌표는 방 렌더 영역 전체 기준이며 캐릭터 영역을 포함한 겹침·충돌은 서버가 검증하지 않는다.
- 생략 기본값: `scale` 1.0, `rotationDeg` 0, `flipped` false.
- 검증: 모든 `userItemId`는 호출자 소유여야 하며, 같은 보유 아이템을 한 요청에 중복 배치할 수 없다.
- 전환 호환: 기존 positioned 슬롯 row는 삭제하지 않고 구버전 표시 fallback으로 남긴다. 이후 정본은 `layoutFormat`이 결정한다.
- 응답 핵심: `GET /api/v1/rooms/me`와 동일한 갱신 후 방 상태. 성공 시 `layoutRevision`을 1 증가시킨다.
- 주요 오류: 잘못된 배치값 `ROOM_INVALID_PLACEMENT`(400), 중복 보유 아이템 `ROOM_DUPLICATE_PLACEMENT_ITEM`(400), 미보유 아이템 `ROOM_ITEM_NOT_OWNED`(403), revision 불일치 `ROOM_LAYOUT_REVISION_CONFLICT`(409).
- table: `personal_rooms`(`layout_format`, `layout_revision`), `room_surface_slots`, `room_item_placements`, `user_items`.

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
