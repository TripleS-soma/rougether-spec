# 개인 방 API

prefix `/api/v1`. 공통 규칙은 [api.md](../../api.md)를 따른다. `me`는 인증된 사용자를 가리키며 소유권 식별자(`room_user_id`)로 guard를 적용한다. 이미지/에셋은 `*_key`로 내려준다.

> 자유배치와 구버전 슬롯 호환 계약은 확정되어 있다. 스냅샷 공유 계약은 아직 초안이다.

## 방 성장 현황

### `GET /api/v1/rooms/me`
- 목적: 내 방의 성장 레벨 + 착용 캐릭터 + 배치 형식·revision + 슬롯·자유배치 + 스트릭을 한 번에 조회.
- 응답 핵심: `roomUserId`, `growthLevel`, `layoutFormat`(`SLOT_V1`/`FREE_V1`), `layoutRevision`, `character?`, `slots[]`, `placements[]`, `streak`(`currentCount`, `longestCount`), `updatedAt`.
- **lazy 생성**: 방 row가 없으면 첫 조회 때 생성한다(`growthLevel 0`·`SLOT_V1`·`layoutRevision 0`) — 읽기 전용이 아니라 쓰기 트랜잭션이다. `PUT .../slots`·`PUT .../layout`도 동일하게 방을 자동 생성한다.
- `character`: `{ characterId, code, name, assetKey, animations, accessories[] }`. `accessories[]`는 `{ userItemId, itemId, name, assetKey, characterSlotType, equippedAt, renderProfiles[] }`이며 슬롯·보유 아이템 순으로 정렬한다. `renderProfiles[]`의 좌표·크기·상태 fallback 계약은 [상점/아이템 API의 캐릭터 응답 공통 착용 정보](../shop/api.md#캐릭터-응답의-공통-착용-정보)를 따른다. 대표 캐릭터가 없으면 `character=null`, 악세사리가 없으면 빈 배열이다.
- `slots[]`: **배치된 슬롯만** 내려간다(빈 슬롯 항목 없음 — 해제는 row 삭제).
- `placements[]`: `{ userItemId, assetKey, positionX, positionY, zIndex, scale, rotationDeg, flipped, updatedAt }`, `zIndex asc → id asc` 정렬. `FREE_V1` 전환 전에는 빈 배열이다.
- 렌더링: `SLOT_V1`이면 `slots`를 사용하고 새 앱은 positioned 슬롯을 고정 좌표로 변환한다. `FREE_V1`이면 surface 3종은 `slots`, 가구는 `placements`를 정본으로 사용한다.
- 캐릭터가 포함되는 친구 방도 같은 `character.accessories[]` 계약을 사용한다. 비구성원에게 공개되는 집 멤버 방/미리보기의 `accessories[]`는 렌더링에 필요한 `{ itemId, name, assetKey, characterSlotType, renderProfiles[] }`만 내려주고 소유 식별자 `userItemId`와 적용 시각 `equippedAt`은 제외한다.
- table: `personal_rooms`(lazy 생성 쓰기), `room_surface_slots`·`room_item_placements`(읽기), `user_items`/`items`(assetKey 조인), `user_character_accessories`(대표 캐릭터 착용 조회), `character_accessory_render_profiles`(캐릭터별 합성 정보), `streaks`(읽기 전용).

## 아이템 배치

### `PUT /api/v1/rooms/me/slots`
- 목적: 요청에 포함된 슬롯 배치만 저장(배치/교체/해제)하는 부분 갱신.
- 요청 핵심: `slots[]` = `{ slotType, userItemId | null }`. null이면 해당 슬롯 배치 해제.
- 검증: 유효한 `slotType`인지(위반 400 `ROOM_INVALID_SLOT_TYPE`), 한 요청에 같은 `slotType`이 중복되지 않는지(위반 400 `ROOM_DUPLICATE_SLOT_TYPE`), `userItemId`가 호출자 보유 아이템인지(위반 403 `ROOM_ITEM_NOT_OWNED`) 확인한다. 슬롯과 아이템 종류의 매칭은 서버가 강제하지 않으므로 클라이언트가 맞춰 배치한다.
- 호환 가드: `FREE_V1` 방에서 positioned 슬롯이 하나라도 포함되면 409 `ROOM_LAYOUT_FORMAT_CONFLICT`. surface(`wallpaper`/`floor`/`background`)만 포함한 요청은 허용한다.
- revision: `slots[]`가 비어있지 않으면 저장 성공 시 `layoutRevision`을 1 증가시킨다 — **실제 값 변경 여부와 무관**(같은 값 재저장도 증가)이고, 빈 배열 요청은 성공해도 증가하지 않는다.
- 응답 핵심: `GET /api/v1/rooms/me`와 동일한 갱신 후 방 상태.
- table: `room_surface_slots`(쓰기), `user_items`/`items`(검증).

> 단건 배치/해제를 별도 엔드포인트(`PUT`/`DELETE /api/v1/rooms/me/slots/{slotType}`)로 둘지는 **미정**. 우선 일괄 저장 1개로 제안.

### `PUT /api/v1/rooms/me/layout`
- 목적: surface 슬롯과 가구 자유배치를 단일 트랜잭션으로 저장한다. 첫 저장 시 해당 방만 `SLOT_V1`에서 `FREE_V1`으로 전환한다 — **`placements[]`가 빈 배열이어도 저장이 성공하면 전환**되며(내용물 유무 무관), 전환은 비가역이라 이후 구버전 positioned 슬롯 저장이 영구 차단된다.
- 요청 핵심:
  - `baseRevision`(필수): 마지막 조회에서 받은 `layoutRevision`. 방이 아직 생성되지 않았으면 0. 현재 서버 값과 다르면 409 `ROOM_LAYOUT_REVISION_CONFLICT`.
  - `surfaceSlots[]`(필수): `{ slotType, userItemId | null }`. surface 3종만 허용하며, 요청에 포함된 슬롯만 갱신한다.
  - `placements[]`(필수): `{ userItemId, positionX, positionY, zIndex, scale, rotationDeg, flipped }`. 전체 교체 방식으로 요청에 없는 기존 자유배치는 삭제한다.
- 값 범위: `positionX`·`positionY`는 0.0~1.0, `scale`은 0.1~5.0, `rotationDeg`는 -360~360. 좌표는 방 렌더 영역 전체 기준이며 캐릭터 영역을 포함한 겹침·충돌은 서버가 검증하지 않는다.
- 새 가구 추가 시 클라이언트가 카탈로그의 `defaultScale`과 `defaultPositionX`·`defaultPositionY`를 최종 `placements[]` 값으로 복사한다. 기본 위치가 null 쌍이면 공유 contract의 `newPlacementCenter`를 쓰고, 렌더 크기를 반영해 방 안으로 clamp한다. 서버는 카탈로그 기본값을 저장 시 다시 적용하지 않으며 기존 placement도 갱신하지 않는다.
- 생략 기본값: `scale` 1.0, `rotationDeg` 0, `flipped` false. `zIndex`는 생략 시 400이 아니라 **0으로 저장**된다(겹침 순서가 필요하면 명시 필수).
- 정규화: 서버는 저장 시 `positionX`/`positionY`를 소수 5자리, `scale`을 소수 2자리로 반올림(HALF_UP)해 저장하고 그 값을 응답에 내려준다 — 요청값과 응답값이 다를 수 있다.
- 검증: 모든 `userItemId`는 호출자 소유여야 하며, 같은 보유 아이템을 한 요청에 중복 배치할 수 없다.
- 전환 호환: 기존 positioned 슬롯 row는 삭제하지 않고 구버전 표시 fallback으로 남긴다. 이후 정본은 `layoutFormat`이 결정한다.
- 응답 핵심: `GET /api/v1/rooms/me`와 동일한 갱신 후 방 상태. 성공 시 `layoutRevision`을 1 증가시킨다.
- 주요 오류: 잘못된 배치값 `ROOM_INVALID_PLACEMENT`(400), 중복 보유 아이템 `ROOM_DUPLICATE_PLACEMENT_ITEM`(400), `surfaceSlots`에 positioned·미지 slotType `ROOM_INVALID_SLOT_TYPE`(400), `surfaceSlots` 내 같은 slotType 중복 `ROOM_DUPLICATE_SLOT_TYPE`(400), 미보유 아이템 `ROOM_ITEM_NOT_OWNED`(403), revision 불일치 `ROOM_LAYOUT_REVISION_CONFLICT`(409).
- table: `personal_rooms`(`layout_format`, `layout_revision`), `room_surface_slots`, `room_item_placements`, `user_items`.

## 방 스냅샷 공유 (**미구현 — 초안**)

### `POST /api/v1/rooms/me/snapshot`
- **서버 미구현** — 아래는 계약 초안이며 엔드포인트·테이블·저장 방식 전부 미정. 클라이언트 구현 대상 아님.
- 목적: 현재 방 상태를 스냅샷 이미지로 저장하고 공유용 참조를 발급.
- 요청 핵심: `scope`(예: `private` / `house`) — 집 구성원 공개 시 집 도메인 의존.
- 응답 핵심: `snapshotKey`(이미지 `*_key`) 등 — 저장 방식·발급 주체 **미정**(별도 스냅샷 table 없음).

## 연동 / 비범위 (다른 도메인)

- **타인 방 조회**는 집 도메인 경로다 — `GET /api/v1/houses/{houseId}/members/{membershipId}/room`(응답은 내 방 조회와 동일 계약, 대상 방 미생성이면 404 `ROOM_NOT_FOUND` — lazy 생성 없음). 집 미리보기의 `memberRooms`는 렌더 부분집합(`RoomRenderResponse`: `growthLevel`·`layoutFormat`·`character`·`slots[]{slotType,assetKey}`·`placements[]` — `userItemId`/`layoutRevision`/`streak`/`savedAt` 의도적 제외, 방 없는 사용자는 목록에서 제외)을 쓴다.
- 방명록(`room_guestbooks`) → 집(공동) 도메인.
- 인벤토리/상점 조회·구매(`GET /api/v1/me/items`, `GET /api/v1/items`, `POST /api/v1/items/{id}/purchase`) → 상점/인벤토리 도메인. 방은 배치만.
- 스트릭 갱신·루틴 완료 보상 지급 → 루틴/투두 도메인. 방은 `streaks` 읽기, 성장 반영 결과만 노출.
