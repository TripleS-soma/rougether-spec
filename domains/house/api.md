# 공동 집 (House) — API 초안

[features.md](features.md) 기준 엔드포인트 초안. 공통 규약은 [상위 api.md](../../api.md)를 따른다(prefix `/api/v1`, JSON 본문, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 인증된 사용자 기준 소유권 guard 적용). 상세 req/res는 **미정**으로 둔 항목 다수.

> path·필드는 draft. 확정 시 서버 repo `docs/`에 최종 정리.

## 집 탐색 / 참여

### GET /api/v1/houses
집 탐색. 최신 생성순 기본, 페이지네이션 적용. 탐색·추천 겸용(별도 추천 엔드포인트 없음).
- query: `page`(기본 0), `size`(기본 20), `goalCode?`(목표 필터 - 1차 지원. `hasSlot`/`activityLevel` 등은 후속), `excludeJoined?`(기본 false — true 면 본인이 가입(ACTIVE) 중인 집을 제외. 본인이 OWNER 인 집도 가입 중이므로 함께 제외되고, 탈퇴(LEFT)·강퇴(KICKED) 이력만 있는 집은 포함. `goalCode`와 조합 가능. 추가 2026-07-29, server PR #234)
- res: `{ items, page, size, totalElements }` / items[]: `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `level`, `goals[]`(`goalId`, `code`, `name`), `myJoinRequestStatus?`(`PENDING`/`REJECTED`, 신청 이력 없으면 null)
- 삭제된 집(`deleted_at`)은 제외
- table: `house`, `house_goals`

### GET /api/v1/me/houses
내가 속한(active) 집 목록. 집 탭에서 내 집들을 오가는 화면용. 먼저 가입한 집 먼저, 페이지네이션 없음(다중 가입 소수 전제).
- res: `{ items }` / items[]: `houseId`, `name`, `coverImageKey`, `level`, `currentMemberCount`, `maxMembers`, `myRole`, `joinedAt`
- 삭제된 집(`deleted_at`)·탈퇴(left) membership 은 제외
- table: `house_members`, `house`

### POST /api/v1/houses/{houseId}/join-requests
탐색 결과에서 선택한 집에 **입주 신청**한다. 신청만으로 구성원이 되지 않으며 `house.current_member_count`도 바뀌지 않는다. 같은 집에서 거절된 신청은 동일 행을 `PENDING`으로 되돌려 재신청한다.
- res(201): `requestId`, `houseId`, `userId`, `nickname`, `status=PENDING`, `requestedAt`
- 예외: 없는/삭제된 집 `HOUSE_NOT_FOUND`(404) · 정원 초과 `HOUSE_FULL`(409) · 이미 구성원 `HOUSE_ALREADY_MEMBER`(409) · 강퇴 이력 `HOUSE_KICKED_MEMBER`(409) · 이미 신청 중 `HOUSE_JOIN_REQUEST_ALREADY_PENDING`(409)
- table: `house_join_requests`
- 이전 앱의 `POST /api/v1/houses/{houseId}/join`도 이 API와 동일하게 **신청만 생성**하는 deprecated alias로 유지한다. 즉시가입 우회 경로로 사용하지 않는다.

### POST /api/v1/houses/join-by-code
초대코드/링크로 참여. 코드 종류에 따라 두 흐름으로 갈린다.
- 집 공용 코드(`house.invite_code`, 소유자 공유): **즉시가입** — role=member·status=active 로 바로 등록되고 `current_member_count` 가 증가한다. 같은 집에 `PENDING` 입주 신청이 있으면 함께 `ACCEPTED`로 종결한다.
- 구성원 개인 코드(`house_members.invite_code`, 일반 구성원 공유): **방장 승인 대기** — 탐색 신청과 같은 `house_join_requests` PENDING 을 만들고, 방장이 입주 신청 수락/거절 API로 처리해야 입주가 확정된다. 구성원 수는 수락 시점에만 증가한다. 거절 이력이 있으면 같은 신청 row 를 재오픈한다.
- 코드 조회는 집 공용 코드 → 구성원 개인 코드 순. 두 네임스페이스는 발급 시점에 두 테이블을 함께 존재 검사해 겹치지 않게 한다(사전 검사 기반). 초대자가 참여 시점에 owner 면(소유권 양도 등) 개인 코드도 즉시가입으로 처리한다.
- req: `inviteCode`
- res: `membershipId`, `houseId`, `status`, `pendingApproval`, `joinRequestId` — 즉시가입이면 `pendingApproval=false`·`joinRequestId=null`, 승인 대기면 `pendingApproval=true`·`joinRequestId` 반환에 `membershipId`·`status`는 null
- 재가입: 탈퇴(LEFT) 이력이 있으면 `(house_id, user_id)` unique 제약상 기존 row 를 재활성화(joined_at 갱신, left_at 해제)
- 같은 집에 `PENDING` 입주 신청이 있으면 즉시가입과 함께 해당 신청을 `ACCEPTED`로 종결한다.
- 예외: 없는 코드·초대자 탈퇴/강퇴 `INVITE_CODE_INVALID`(404) · 만료 코드 `INVITE_CODE_EXPIRED`(409) · 정원 초과 `HOUSE_FULL`(409) · 중복 참여 `HOUSE_ALREADY_MEMBER`(409) · 강퇴 이력 `HOUSE_KICKED_MEMBER`(409) · 이미 신청 중 `HOUSE_JOIN_REQUEST_ALREADY_PENDING`(409, 구성원 개인 코드 경로) · 탈퇴 계정의 잔여 access token `AUTH_INVALID_TOKEN`(401)
- 탈퇴 계정 가드: 회원탈퇴 후 잔여 access token(만료 전 최대 30분)의 참여 확정은 401 `AUTH_INVALID_TOKEN`으로 차단한다(가입 확정 공통 경로 — 탈퇴 트랜잭션의 멤버십 정리가 되돌아가지 않게 함, [member/api.md](../member/api.md) "회원탈퇴"). 해체(soft delete)된 집의 초대코드는 없는 코드와 동일하게 참여 불가.
- table: `house`, `house_members`, `house_join_requests`

### GET /api/v1/houses/by-code/{inviteCode}
참여 전 코드로 집 미리보기(이름·구성원 수·정원). 집 공용 코드와 구성원 개인 코드 모두 인식한다. 만료 코드도 200 으로 응답하고 `inviteExpired` 로 표시한다(화면 만료 안내용). 만료 판정은 코드 종류별 만료 시각 기준.
- res: `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `inviteExpired`, `requiresApproval`
- `requiresApproval` 는 참여 시 방장 승인 대기로 들어가는지 여부 — 집 공용 코드 false, 구성원 개인 코드 true(초대자가 owner 면 false)
- table: `house`, `house_members`

### GET /api/v1/houses/{houseId}/preview
탐색에서 선택한 집을 참여 전에 미리보기. 로그인 회원 누구나(비구성원·강퇴 이력자 포함) 조회 가능 - 집 정보는 전체공개.
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`, `currentMemberCount`, `level`, `goals[]`(`goalId`,`code`,`name`), `isMember`, `isFull`, `myJoinRequestStatus?`, `missions[]`, `memberRooms[]`
- 구성원 전용 필드(`myRole`·`inviteCode`·`inviteExpiresAt`)는 내려가지 않는다. `isMember` 는 요청자가 이 집의 ACTIVE 구성원인지(true 면 상세 화면으로 전환), `isFull` 은 정원 초과 여부(신청 버튼 비활성용), `myJoinRequestStatus`는 비구성원의 최근 신청 상태(`PENDING`/`REJECTED`, 이력 없으면 null)다.
- `missions[]`: 입주 전에 집의 활동 방향과 진행 상황을 확인하는 읽기 전용 단체미션 목록(최신 생성순). 별도 미션 목록과 동일한 `missionId`, `title`, `missionType`, `targetValue`, `currentValue`, `status`, `startsAt`, `endsAt`, `todayClaimed`, `createdAt`을 제공한다. WEEKLY 진행 수치는 기여 누적 합, DAILY 진행 수치는 오늘(KST) 기여한 ACTIVE 멤버 비율 %다. 미션 생성·상세·기여·보상 권한은 기존대로 ACTIVE 구성원에게만 있다.
- `memberRooms[]`: 구성원 타일에 실제 방을 렌더하기 위한 데이터(서버 #177 확정). 가입순, ACTIVE 구성원만. 항목은 `membershipId`, `nickname`(온보딩 전 null), `room`(방 미생성 구성원은 null - 기본 방 타일로 표시)
  - `room` 은 방 렌더 부분집합: `growthLevel`, `layoutFormat`(`SLOT_V1`/`FREE_V1`), `character`(착용 캐릭터 - 마스터 데이터·assetKey·animations), `slots[]`(`slotType`, `assetKey`), `placements[]`(`assetKey`, `positionX`, `positionY`, `zIndex`, `scale`, `rotationDeg`, `flipped` - zIndex 오름차순)
  - **공개 범위(확정)**: 방 렌더 데이터(가구 배치·surface·착용 캐릭터·성장 레벨)는 미리보기를 통해 로그인 회원 전체에 공개된다(집 탐색 전체공개 정책과 일치, 방 내용물은 장식 데이터). 단 활동 정보(`streak`·`lastAccessedAt`·그날 현황·완료 내역·방명록)와 편집용 값(`layoutRevision`)·소유 리소스 식별자(`userItemId`)·배치 시각은 내려가지 않는다 — 이들은 기존대로 구성원 전용("구성원 방 방문 / 활동 열람" 계약은 불변)
- 예외: 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`, `house_members`(isMember 판정·memberRooms·DAILY 진행률 대상), `house_goals`, `house_missions`, `house_mission_participants`, `house_mission_daily_contributions`, `house_mission_daily_rewards`, `personal_rooms`, `room_surface_slots`, `room_item_placements`, `user_characters` (+ 방·캐릭터 도메인 의존)

## 집 관리

### GET /api/v1/houses/cover-images
집 생성·설정 화면에서 선택할 수 있는 커버 이미지 목록. 인증된 사용자 전용이며 페이지네이션하지 않는다.
- res: `{ items }` / items[]: `code`, `name`, `coverImageKey`
- `code`는 프론트 식별용 영문 snake_case 코드, `name`은 화면 표시용 한국어 이름이다. 실제 공동집의 사용자 지정 `name`과는 별개다.
- 서버의 게시 승인 manifest에 등록된 PNG/JPEG/WebP 후보만 `code` 오름차순으로 반환한다. S3 `house/` prefix의 초안·중복 파일은 자동 노출하지 않는다.
- 프론트는 공통 규약대로 CDN base URL과 `coverImageKey`를 조합해 이미지를 표시한다.
- 이미지가 없으면 200 `{ "items": [] }`를 반환한다.
- storage: 설정 기반 published manifest, DB table 없음

### POST /api/v1/houses
집 생성. 생성자가 `owner`. 이름은 금칙어 검사(공통 규칙, 위반 400 `HOUSE_NAME_BANNED` — 설정 수정의 이름 변경도 동일).
- req: `name`(2~30자), `description?`, `coverImageKey?`, `maxMembers?`(1~10, 미지정 시 4), `goalIds[]`(필수 1~3개, 활성 goal 만)
- res: `houseId`, `ownerUserId`, `inviteCode`, `inviteExpiresAt`
- 생성자는 `house_members`에 role=owner·status=active 로 즉시 등록, `current_member_count=1`. 집은 `level=0`, `growth_points=0` 에서 시작.
- 초대코드: 영대문자+숫자 8자(혼동문자 I,O,L,0,1 제외), 만료 7일.
- 예외: 없는/비활성 goal 포함 → `HOUSE_GOAL_INVALID`(400) · 목록에 없는 `coverImageKey` → `HOUSE_COVER_IMAGE_INVALID`(400)
- table: `house`, `house_members`(owner row), `house_goals`

### GET /api/v1/houses/{houseId}
집 상세 조회(설정·목표·레벨·성장 포인트·구성원 수). **ACTIVE 구성원만** 조회 가능.
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`, `currentMemberCount`, `level`, `growthPoints`, `goals[]`(`goalId`,`code`,`name`), `myRole`, `inviteCode`, `inviteExpiresAt`
- `inviteCode`/`inviteExpiresAt` 는 **소유자에게만** 값, 그 외 null. `myRole` 은 화면의 소유자 UI 분기용
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`, `house_members`, `house_goals`

### PUT /api/v1/houses/{houseId}
설정 수정(이름·소개글·대표 이미지·최대 인원). **소유자만**, **부분 수정**(보내지 않은 필드는 유지).
- req: `name?`(2~30자), `description?`, `coverImageKey?`, `maxMembers?`(1~10, 현재 인원 미만으로 축소 불가)
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 목록에 없는 `coverImageKey` `HOUSE_COVER_IMAGE_INVALID`(400) · 인원 미만 축소 `HOUSE_MAX_MEMBERS_BELOW_CURRENT`(409) · 없는/삭제 집 404
- table: `house`

### POST /api/v1/houses/{houseId}/invite-code
내가 공유할 초대코드 재발급. **ACTIVE 구성원만**. 소유자는 집 공용 코드(즉시가입)를, 일반 구성원은 본인 개인 코드(방장 승인 대기)를 재발급한다. 같은 종류의 기존 코드는 즉시 만료(새 코드로 교체), 만료 7일 갱신. 코드 규칙은 생성과 동일(영대문자+숫자 8자).
- res: `inviteCode`, `inviteExpiresAt`
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`, `house_members`

## 구성원 관리

### GET /api/v1/houses/{houseId}/join-requests
대기 중인 입주 신청 목록. **소유자만** 조회하며 신청 시각 오름차순으로 반환한다.
- res: `{ items }` / items[]: `requestId`, `houseId`, `userId`, `nickname`, `status=PENDING`, `requestedAt`
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house_join_requests`, `users`

### POST /api/v1/houses/{houseId}/join-requests/{requestId}/accept
입주 신청 수락. **소유자만**. 집 행 락 아래 정원을 다시 확인하고 신청자를 MEMBER·ACTIVE 구성원으로 등록한다. 탈퇴 이력이 있으면 기존 `house_members` 행을 재활성화하며, 신청은 `ACCEPTED`로 종결하고 `current_member_count`를 1 증가시킨다. 가입 확정(초대코드·신청 수락 공통 경로) 시 같은 트랜잭션에서 기존 ACTIVE 멤버 전원에게 `HOUSE_MEMBER_JOINED` 알림 내역을 저장한다(`refId` = 입주자 membershipId, 문구는 notification 도메인 참고).
- res: `membershipId`, `houseId`, `userId`, `role`, `status`, `joinedAt`
- **신청자 탈퇴 가드**: 신청자가 이미 회원탈퇴한 신청을 수락하려 하면 신청을 `REJECTED`로 전환하고 409 `HOUSE_JOIN_REQUEST_APPLICANT_WITHDRAWN`을 응답한다(거절 전환은 에러 응답과 함께 확정됨 — 탈퇴 트랜잭션의 신청 철회와 엇갈리는 동시성 방어).
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 대기 중인 신청 아님 `HOUSE_JOIN_REQUEST_NOT_PENDING`(409) · 신청자 탈퇴 `HOUSE_JOIN_REQUEST_APPLICANT_WITHDRAWN`(409) · 정원 초과 `HOUSE_FULL`(409) · 강퇴 이력 `HOUSE_KICKED_MEMBER`(409)
- table: `house_join_requests`, `house_members`, `house`

### POST /api/v1/houses/{houseId}/join-requests/{requestId}/reject
입주 신청 거절. **소유자만**. 신청을 `REJECTED`로 종결하며 구성원 수는 바뀌지 않는다.
- res: 204
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 대기 중인 신청 아님 `HOUSE_JOIN_REQUEST_NOT_PENDING`(409)
- table: `house_join_requests`

### GET /api/v1/houses/{houseId}/members
구성원 목록 조회. **ACTIVE 구성원만** 조회 가능, 목록에도 **active 구성원만** 노출(가입순 - 생성자가 첫 번째).
- res(items[]): `membershipId`, `userId`, `nickname`(온보딩 전 null), `role`, `status`, `joinedAt`, `lastAccessedAt`(갱신 이력 없으면 null)
- `lastAccessedAt` 은 회원의 마지막 접속 시각(UTC, `users.last_accessed_at`) - 로그인·refresh 재발급 성공 시 갱신되므로 해상도는 access token TTL(30분) 단위. "N분/시간 전 접속" 표시용이며 실시간 접속중 뱃지 용도가 아니다. 같은 집 구성원에게만 노출(미리보기에는 없음)
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house_members`, `users`(`last_accessed_at` 읽기)

### DELETE /api/v1/houses/{houseId}/members/{membershipId}
강퇴. **소유자만**. 대상은 status=kicked + `left_at` 전환되고 **재가입 불가**(초대코드·탐색 모두 `HOUSE_KICKED_MEMBER` 409). `HOUSE_KICK` 알림 발송은 **미구현**(후속 — enum 값만 존재, 알림 도메인 의존).
- res: 204 / 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 자기 자신 `HOUSE_KICK_SELF`(400) · 대상 무효 `HOUSE_MEMBER_NOT_FOUND`(404) · 없는/삭제 집 404
- table: `house_members`(status=kicked/`left_at`), `house`(`current_member_count` 감소)

### DELETE /api/v1/houses/{houseId}/members/me
탈퇴. status=left + `left_at` 기록, `current_member_count` 감소. 기여 기록은 유지되며 **재가입은 허용**(기존 row 재활성화 - 탈퇴하면 집 활동·미션에 더는 참여하지 못한다는 의미). 같은 트랜잭션에서 남은 ACTIVE 멤버 전원에게 `HOUSE_MEMBER_LEFT` 알림 내역을 저장한다(`refId` = 떠난 membershipId).
- 소유자는 다른 active 구성원이 있으면 **양도 선행** 필요 → `HOUSE_OWNER_MUST_TRANSFER`(409)
- **마지막 1인 탈퇴 시 집 soft delete**(`deleted_at`) - 빈 집이 탐색에 남지 않음
- res: 204 / 예외: 비구성원·중복 탈퇴 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 404
- table: `house_members`(`left_at`), `house`
- **회원탈퇴(`DELETE /api/v1/me`) 경로**: 탈퇴 트랜잭션에서 모든 ACTIVE 멤버십이 같은 규칙(LEFT·`left_at`·정원 감소·미션 루틴/카테고리 연동 해제)으로 정리된다. 단 이 API 와 달리 소유자도 양도 선행 없이 진행 — 소유 집은 **가입일 최선임 ACTIVE 멤버에게 자동 승계**(동률 시 membership id 오름차순), 남은 멤버가 없으면 집 soft delete(마지막 1인 탈퇴와 동일). 탈퇴자의 `PENDING` 입주 신청도 함께 `REJECTED` 철회. 상세는 [member/api.md](../member/api.md) "회원탈퇴".

### POST /api/v1/houses/{houseId}/transfer-ownership
소유권 양도. **소유자만**. 대상 구성원을 `owner`로 승격 + 기존 소유자는 `member`로 + `house.owner_user_id` 갱신 - 단일 트랜잭션.
- req: `targetMembershipId` (같은 집의 다른 active 구성원)
- res: `houseId`, `newOwnerMembershipId`, `newOwnerUserId`
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 대상 무효(비구성원/비활성/자기자신/타집) `HOUSE_TRANSFER_TARGET_INVALID`(400) · 없는/삭제 집 404
- table: `house_members`(role 변경), `house`(`owner_user_id`)

## 구성원 방 방문 / 활동 열람

초안의 `routine-status`(오늘 현황·참여율) 단일 엔드포인트는 방/그날 현황/완료 내역 3개로 재설계해 구현했다. 공통 규칙: **요청자·조회 대상 모두 그 집(houseId)의 ACTIVE 구성원**이어야 하며(본인 조회 가능), **요청자** 위반은 403 `HOUSE_NOT_MEMBER`, **조회 대상**(membershipId)이 그 집 ACTIVE 구성원이 아니면 404 `HOUSE_MEMBER_NOT_FOUND`. 참여율(`recentParticipationRate`) 계산값은 제공하지 않고 raw 완료 내역으로 대체(집계는 프론트).

### GET /api/v1/houses/{houseId}/members/{membershipId}/room
구성원 방 조회. 응답 형태는 내 방 조회(`GET /api/v1/rooms/me`)와 동일 — 성장 레벨, 착용 캐릭터, `layoutFormat`·`layoutRevision`, surface·기존 positioned 슬롯, 자유배치 `placements`, 스트릭.
- res: `GET /api/v1/rooms/me`와 동일 계약
- 예외: 대상이 방 미생성(내 방 화면 미방문) `ROOM_NOT_FOUND`(404)
- table: `house_members`, `personal_rooms`, `room_surface_slots`, `room_item_placements` (+ 방 도메인 의존)

### GET /api/v1/houses/{houseId}/members/{membershipId}/day
구성원의 그날 현황(루틴 + 투두, 완료 여부 포함). 반복 대상·완료 판정은 `GET /api/v1/today`·캘린더와 동일 규칙.
- query: `date?`(YYYY-MM-DD, 미지정 시 오늘 KST)
- res: `date`, `routines[]`(`id`, `originRoutineId`, `title`, `scheduledTime?`, `authType`, `categoryId`, `completed`), `todos[]`(`id`, `title`, `status`, `completedAt?`, `categoryId`), `categories[]`(`id`, `name`, `colorHex`, `iconKey` — 노출 루틴·투두가 참조하는 카테고리 표시 정보, `sortOrder` 오름차순)
- 정렬: 루틴 수행 예정 시각 오름차순, 투두 id 오름차순
- 공개 범위: 카테고리 `visibility`가 HOUSE/PUBLIC 인 루틴·투두만 노출. PRIVATE/FRIENDS·미분류는 제외(본인 조회에도 동일 적용 — 내 화면은 `GET /api/v1/today` 사용)
- table: `house_members` (+ 루틴/투두 도메인 의존)

### GET /api/v1/houses/{houseId}/members/{membershipId}/routine-completions
구성원 루틴 완료 내역 기간 조회.
- query: `from?`, `to?`(YYYY-MM-DD) — `to` 미지정 시 오늘(KST), `from` 미지정 시 `to` 기준 최근 14일. 기간 최대 92일, `from` > `to`는 400 `HOUSE_ACTIVITY_PERIOD_INVALID`
- res: `from`, `to`(실제 적용된 기간), `items[]`(`routineDate`(완료 날짜), `completedAt`, `routineId`, `originRoutineId`, `title`, `categoryId`)
- 정렬: 완료 날짜 내림차순(같은 날짜는 완료 시각 내림차순). 공개 범위 필터는 `/day`와 동일(HOUSE/PUBLIC만)
- 비고: 스케줄 수정으로 루틴 버전이 갈려도 과거 완료는 포함 — 같은 루틴 묶음 판별은 `originRoutineId` 사용
- table: `house_members` (+ 루틴/투두 도메인 의존)

### POST /api/v1/houses/{houseId}/members/{membershipId}/cheer
같은 집 구성원에게 원터치 응원을 보낸다(방명록 텍스트 응원과 별개 계약). 응원 저장과 대상에게 `FRIEND_CHEER` 알림 내역 저장은 같은 트랜잭션(원자적)이며, push 는 커밋 후 비동기(공용 진입점 규칙 동일).
- req: `type` — `great`(잘하고 있어!) / `support`(응원해요!) / `best`(오늘도 최고!)
- res: 201, `cheerId`, `houseId`, `targetMembershipId`, `targetUserId`, `type`, `cheerDate`(KST)
- 제한: 같은 보낸이→같은 대상·같은 타입은 하루(KST) **5회**(`house_member_cheers.daily_seq`로 회차 기록). **집과 무관한 사용자쌍 전역 제한**(여러 집에서 겹쳐도 합산 — 스팸 방지 의도). 타입이 다르면 각각 별도 카운트
- 예외: 미정의 타입 `HOUSE_CHEER_TYPE_INVALID`(400) · 자기 자신 `HOUSE_CHEER_SELF`(400) · 하루 5회 초과(동시 요청 unique 충돌 포함) `HOUSE_CHEER_LIMIT_EXCEEDED`(409) · 요청자/대상이 그 집 ACTIVE 구성원 아님은 공통 규칙(403 `HOUSE_NOT_MEMBER` / 404 `HOUSE_MEMBER_NOT_FOUND`)
- 알림: 대상 유저에게 `FRIEND_CHEER`(제목 "응원이 도착했어요", 본문 "{보낸이 닉네임}님: {타입 문구}", `refId` = cheerId). **닉네임 null 폴백은 미구현** — 탈퇴 익명화 등으로 닉네임이 null이면 "null님"으로 조립되는 상태라 폴백 문구("집 친구" 등) 도입은 미결 ([open-questions.md](../../open-questions.md))
- table: `house_member_cheers`, `house_members`, `notification`

방명록은 **방 주인과 같은 집(houseId)의 ACTIVE 구성원만** 조회·작성할 수 있다(방 주인 본인 포함, 위반 403 `HOUSE_NOT_MEMBER`, 집 없음/삭제 404 `HOUSE_NOT_FOUND`). path 는 `rooms` 하위로 확정(2026-07-05, 서버 구현 완료).

### GET /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 조회(최신순 = `guestbookId` 내림차순). **커서 기반 무한스크롤** — offset 페이징은 새 글 유입 시 중복/누락이 생겨 배제.
- query: `houseId`(필수), `cursor?`(이전 응답의 nextCursor, 첫 요청 생략), `size?`(기본 20, 최대 50)
- res: `items[]`(`guestbookId`, `authorId`, `authorNickname`, `content`, `createdAt`) + `nextCursor`(더 없으면 null) + `hasNext`
- `houseId`는 인가용이자 **조회 범위 필터**다 — 그 집 맥락(`house_id`)에서 작성된 글만 반환한다. 여러 집을 공유하는 상대의 방명록은 집별로 분리돼 보인다
- 삭제된 글(`deleted_at` not null)은 제외
- table: `room_guestbooks`

### POST /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 작성. content 는 금칙어 검사(공통 규칙, 위반 400 `GUESTBOOK_CONTENT_BANNED`). → 201
- req: `houseId`, `content`(1~500자)
- res: `guestbookId`, `roomOwnerId`, `authorId`, `houseId`, `content`, `createdAt`
- table: `room_guestbooks`

> 삭제 API 는 MVP 범위 외(후속 — 작성자/방 주인 soft delete 안 검토). `deleted_at` 컬럼은 그 후속용.

## 단체 미션

아래 별도 미션 API는 전부 해당 집의 ACTIVE 구성원 전용(비구성원 403 `HOUSE_NOT_MEMBER`)이다. 단, 참여 전 집 미리보기의 `missions[]`는 로그인 회원에게 읽기 전용으로 공개한다. 보상은 **집 성장 포인트만** 지급(개인 재화 보상 없음 — 후속 검토), 레벨은 `growth_points / 100` 선형(확정 2026-07-05, 서버 구현 완료 PR #81).

미션 유형별 모델이 다르다:

- `WEEKLY_MEMBER_COUNT` — **누적 카운트 미션**. 진행 수치는 전 기간 기여 누적 합, 목표 도달 시 1회 claim(+100)으로 COMPLETED 종료.
- `DAILY_MEMBER_RATE` — **일일 달성률 미션(매일 반복)**. 진행 수치는 **오늘(KST) 기여한 멤버 수 / 집 활성 멤버 수(`current_member_count`)의 비율 %(내림)**, `target_value`는 달성률 %(1~100). 그날 달성 시 하루 1회 claim(+20)이 가능하고 COMPLETED 전환 없이 다음날 0%부터 반복. 그날 claim 하지 않으면 그날 보상은 소멸(소급 없음). 달성 판정은 정수 산술(`오늘 기여수*100 >= target*멤버수`). 달성률 분자·분모 모두 현재 ACTIVE 멤버 기준(기여 후 탈퇴·강퇴한 멤버는 제외).

미션 만료(`EXPIRED`):

- `ends_at`이 지난 ACTIVE 미션은 배치(매시 정각 KST + 서버 기동 시 1회)가 `status=EXPIRED`로 전이한다. 유형 무관, `ends_at` 없는 무기한 미션은 대상 아님, COMPLETED 는 만료보다 우선.
- **만료 후에는 유형 무관 기여·claim 불가(유예 없음)** — 기간 내 목표를 달성했어도 `ends_at`이 지나면 보상을 받을 수 없다(409 `HOUSE_MISSION_NOT_ACTIVE`). 배치 전이 전이라도 기여·claim 은 기간 검사로 즉시 거부된다.
- EXPIRED 미션은 목록·상세에 그대로 노출된다(삭제 아님).

### GET /api/v1/houses/{houseId}/missions
집 미션 목록·진행률 조회. 최신 생성순.
- res(items[]): `missionId`, `title`, `missionType`, `targetValue`, `currentValue`(WEEKLY: 기여 누적 합 / DAILY: 오늘 달성률 %), `status`, `startsAt`, `endsAt`, `todayClaimed`(DAILY 전용 — 오늘 보상 수령 여부, WEEKLY 는 null 생략), `createdAt`
- table: `house_missions`, `house_mission_participants`, `house_mission_daily_contributions`, `house_mission_daily_rewards`

### POST /api/v1/houses/{houseId}/missions
미션 등록. **소유자(OWNER)만**(403 `HOUSE_NOT_OWNER`). title 은 금칙어 검사(공통 규칙, 위반 400 `HOUSE_MISSION_TITLE_BANNED`). 등록 즉시 `status=ACTIVE`. → 201
- req: `title`(1~160자), `missionType`, `targetValue`, `startsAt?`, `endsAt?`(둘 다 지정 시 endsAt > startsAt, 위반 400 `HOUSE_MISSION_PERIOD_INVALID`)
- `targetValue`: WEEKLY 는 기여 합산 목표(1~1000), DAILY 는 달성률 %(1~100 — 초과 시 400 `HOUSE_MISSION_TARGET_INVALID`)
- `missionType`은 MVP에서 `DAILY_MEMBER_RATE`·`WEEKLY_MEMBER_COUNT` 2종만 허용 — `STREAK_DAYS`는 400 `HOUSE_MISSION_TYPE_NOT_SUPPORTED`
- res: 미션 상세와 동일 형식 (`currentValue=0`, `myContribution=0`)
- table: `house_missions`

### GET /api/v1/houses/{houseId}/missions/{missionId}
미션 상세·내 기여 조회.
- res: 목록 항목 + `myContribution`(내 누적 기여 — 유형 무관 누적 체크 횟수), `achieved`(WEEKLY: currentValue >= targetValue / DAILY: 오늘 달성률 기준)
- 참여자별 기여 목록(participants[])은 화면 요구 확정 전까지 미노출
- table: `house_missions`, `house_mission_participants`, `house_mission_daily_contributions`, `house_mission_daily_rewards`

### POST /api/v1/houses/{houseId}/missions/{missionId}/contribute
**정식 기여 API**(모델 확정 2026-07-05) — 공동 미션은 구성원이 **미션 자체를 직접 수행 체크**하는 방식이다. 프론트 미션 화면의 "오늘 수행" 액션이 이 API 를 호출한다. 수행 인증(사진 등) 강화는 후속.
- **연동 루틴 자동 기여**(확정 2026-07-29, server PR #234 — 2026-07-05 의 "개인 루틴 완료와 무관" 결정을 이 범위에서 변경, 직접 수행 체크 API 는 유지): 이 미션에 연동된 루틴(`routines.house_mission_id`)을 **오늘(KST) 날짜로 완료 체크**(`POST /api/v1/routines/{id}/logs`)하면 완료와 같은 트랜잭션에서 본인 기여 +1 이 자동 반영된다. 하루 1회 규칙·판정은 직접 수행 체크와 동일 이력을 공유하며, 기여 결과는 완료 응답의 `houseMissionContribution`(이 API res 와 동일 형식)으로 내려간다. 기여 불가 사유(오늘 이미 기여·미션 비활성/기간 밖/삭제·집 비구성원·과거 날짜 완료)는 예외 없이 건너뛰고(응답 null) 루틴 완료는 정상 처리된다. **루틴 완료 취소는 기여를 회수하지 않는다.**
- 구성원 본인 기여 +1, **KST(Asia/Seoul) 기준 하루 1회** — 일별 이력(`house_mission_daily_contributions`)의 UNIQUE(mission, membership, date)가 DB 방어선(유형 공통 기록)
- `status=ACTIVE`이고 미션 기간 내일 때만 가능(위반 409 `HOUSE_MISSION_NOT_ACTIVE`), 같은 날 재기여 409 `HOUSE_MISSION_ALREADY_CONTRIBUTED`
- res: `missionId`, `myContribution`, `currentValue`(WEEKLY: 기여 누적 합 / DAILY: 오늘 달성률 %), `achieved`
- table: `house_mission_participants`, `house_mission_daily_contributions`

### POST /api/v1/houses/{houseId}/missions/{missionId}/claim
미션 보상 수령. 구성원 누구나 실행 가능. 유형별로 판정·보상·수령 주기가 다르며, **유형 무관 미션 기간 내에만 가능**(만료 후 409 `HOUSE_MISSION_NOT_ACTIVE`, 유예 없음).
- **WEEKLY** — **미션당 최초 1회**.
  - 판정: `currentValue >= targetValue` (미달 409 `HOUSE_MISSION_NOT_ACHIEVED`), 이미 COMPLETED 면 409 `HOUSE_MISSION_ALREADY_CLAIMED`
  - 처리(한 트랜잭션): `status=COMPLETED` 전환 + `house.growth_points` +100(레벨 재계산) + 참여자 `reward_claimed` 일괄 true. 미션 행·집 행 비관적 락으로 동시 claim 이중 지급 방지
- **DAILY** — **하루(KST) 1회, 매일 반복**.
  - 판정: 오늘 달성률 >= `targetValue`% (미달 409 `HOUSE_MISSION_NOT_ACHIEVED`), 오늘 이미 수령 409 `HOUSE_MISSION_ALREADY_CLAIMED`(메시지를 "오늘은 이미 보상을 받았습니다. 내일 다시 도전할 수 있습니다."로 오버라이드해 "오늘" 기준임을 구분). `status=ACTIVE`·기간 내에서만 가능(409 `HOUSE_MISSION_NOT_ACTIVE`)
  - 처리(한 트랜잭션): `house.growth_points` +20. COMPLETED 전환·`reward_claimed` 갱신 없음 — 다음날 다시 도전. 일별 보상 이력(`house_mission_daily_rewards`)의 UNIQUE(mission, reward_date)가 하루 1회의 DB 방어선
- res: `missionId`, `status`(WEEKLY: COMPLETED / DAILY: ACTIVE 유지), `grantedGrowthPoints`(WEEKLY 100 / DAILY 20), `houseGrowthPoints`, `houseLevel`
- table: `house_missions`(status), `house_mission_participants`(`reward_claimed`), `house_mission_daily_rewards`, `house`(`growth_points`, `level`)

### DELETE /api/v1/houses/{houseId}/missions/{missionId}
미션 삭제. **소유자(OWNER)만**(403 `HOUSE_NOT_OWNER`). soft delete — 삭제된 미션은 목록·상세에서 제외되고 기여·claim 도 404. → 204
- 삭제와 같은 트랜잭션에서 **전 구성원의 연동 루틴(`routines.house_mission_id`) 연동을 일괄 해제**한다(루틴 자체는 유지, 2026-07-29). 집 탈퇴·강퇴·회원탈퇴 시에도 그 회원의 해당 집 연동 루틴·카테고리 연동을 같은 방식으로 해제한다.
- 진행 중(ACTIVE) 미션은 기여가 있어도 삭제 가능(잘못 만든 미션 정리 용도). 기여 이력(participants)은 보존하고 조회에서만 숨긴다.
- 보상 수령(COMPLETED) 미션은 삭제 불가(409 `HOUSE_MISSION_ALREADY_CLAIMED`) — 집 성장 포인트 지급 이력 보존.
- 기여·claim·삭제는 같은 미션 행 비관적 락으로 직렬화한다 — "삭제 커밋 직전 읽은 미션"에 기여가 기록되거나 claim 과 삭제가 겹치는 경합을 차단.
- table: `house_missions`(`deleted_at`)

에러코드: `HOUSE_MISSION_NOT_FOUND`(404), `HOUSE_MISSION_TYPE_NOT_SUPPORTED`·`HOUSE_MISSION_PERIOD_INVALID`·`HOUSE_MISSION_TARGET_INVALID`·`HOUSE_MISSION_TITLE_BANNED`·`HOUSE_NAME_BANNED`·`GUESTBOOK_CONTENT_BANNED`(400), `HOUSE_MISSION_NOT_ACTIVE`·`HOUSE_MISSION_ALREADY_CONTRIBUTED`·`HOUSE_MISSION_NOT_ACHIEVED`·`HOUSE_MISSION_ALREADY_CLAIMED`(409), `HOUSE_NOT_OWNER`(403)

## 집 레벨

집 레벨·성장 포인트는 별도 조회 엔드포인트 없이 `GET /api/v1/houses/{houseId}`의 `level`·`growthPoints`로 노출. 레벨 상승 트리거는 미션 달성(`.../claim`)에서 발생하며 **레벨 = growth_points / 100 선형**(레벨당 100pt, 확정 2026-07-05). 테마 보상 해금은 상점/테마 도메인 의존 — 테마 매핑 **미정**. (`house.level`, `house.growth_points`)
