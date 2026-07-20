# 공동 집 (House) — API 초안

[features.md](features.md) 기준 엔드포인트 초안. 공통 규약은 [상위 api.md](../../api.md)를 따른다(prefix `/api/v1`, JSON 본문, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 인증된 사용자 기준 소유권 guard 적용). 상세 req/res는 **미정**으로 둔 항목 다수.

> path·필드는 draft. 확정 시 서버 repo `docs/`에 최종 정리.

## 집 탐색 / 참여

### GET /api/v1/houses
집 탐색. 최신 생성순 기본, 페이지네이션 적용. 탐색·추천 겸용(별도 추천 엔드포인트 없음).
- query: `page`(기본 0), `size`(기본 20), `goalCode?`(목표 필터 - 1차 지원. `hasSlot`/`activityLevel` 등은 후속)
- res: `{ items, page, size, totalElements }` / items[]: `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `level`, `goals[]`(`goalId`, `code`, `name`)
- 삭제된 집(`deleted_at`)은 제외
- table: `house`, `house_goals`

### GET /api/v1/me/houses
내가 속한(active) 집 목록. 집 탭에서 내 집들을 오가는 화면용. 먼저 가입한 집 먼저, 페이지네이션 없음(다중 가입 소수 전제).
- res: `{ items }` / items[]: `houseId`, `name`, `coverImageKey`, `level`, `currentMemberCount`, `maxMembers`, `myRole`, `joinedAt`
- 삭제된 집(`deleted_at`)·탈퇴(left) membership 은 제외
- table: `house_members`, `house`

### POST /api/v1/houses/{houseId}/join
탐색 결과에서 선택한 집에 참여. **즉시가입** — 초대코드 참여와 동일 정책(role=member·status=active, 승인 흐름 없음, 탈퇴 이력 재가입은 기존 row 재활성화).
- res: `membershipId`, `houseId`, `userId`, `role`, `status`, `joinedAt`
- 예외: 없는/삭제된 집 `HOUSE_NOT_FOUND`(404) · 정원 초과 `HOUSE_FULL`(409) · 중복 참여 `HOUSE_ALREADY_MEMBER`(409)
- table: `house_members`, `house`(`current_member_count` 갱신)

### POST /api/v1/houses/join-by-code
초대코드/링크로 참여. **즉시가입** — role=member·status=active 로 바로 등록되고 `current_member_count` 가 증가한다(승인 흐름 없음).
- req: `inviteCode`
- res: `membershipId`, `houseId`, `status`
- 재가입: 탈퇴(LEFT) 이력이 있으면 `(house_id, user_id)` unique 제약상 기존 row 를 재활성화(joined_at 갱신, left_at 해제)
- 예외: 없는 코드 `INVITE_CODE_INVALID`(404) · 만료 코드 `INVITE_CODE_EXPIRED`(409) · 정원 초과 `HOUSE_FULL`(409) · 중복 참여 `HOUSE_ALREADY_MEMBER`(409)
- table: `house`, `house_members`

### GET /api/v1/houses/by-code/{inviteCode}
참여 전 코드로 집 미리보기(이름·구성원 수·정원). 만료 코드도 200 으로 응답하고 `inviteExpired` 로 표시한다(화면 만료 안내용).
- res: `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `inviteExpired`
- table: `house`

### GET /api/v1/houses/{houseId}/preview
탐색에서 선택한 집을 참여 전에 미리보기. 로그인 회원 누구나(비구성원·강퇴 이력자 포함) 조회 가능 - 집 정보는 전체공개.
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`, `currentMemberCount`, `level`, `goals[]`(`goalId`,`code`,`name`), `isMember`, `isFull`
- 구성원 전용 필드(`myRole`·`inviteCode`·`inviteExpiresAt`)는 내려가지 않는다. `isMember` 는 요청자가 이 집의 ACTIVE 구성원인지(true 면 상세 화면으로 전환), `isFull` 은 정원 초과 여부(가입 버튼 비활성용)
- 예외: 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`, `house_members`(isMember 판정), `house_goals`

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
집 생성. 생성자가 `owner`.
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
초대코드 재발급. **소유자만**. 기존 코드 즉시 만료(새 코드로 교체), 만료 7일 갱신. 코드 규칙은 생성과 동일(영대문자+숫자 8자).
- res: `inviteCode`, `inviteExpiresAt`
- 예외: 소유자 아님(비구성원 포함) `HOUSE_NOT_OWNER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`

## 구성원 관리

### GET /api/v1/houses/{houseId}/members
구성원 목록 조회. **ACTIVE 구성원만** 조회 가능, 목록에도 **active 구성원만** 노출(가입순 - 생성자가 첫 번째).
- res(items[]): `membershipId`, `userId`, `nickname`(온보딩 전 null), `role`, `status`, `joinedAt`, `lastAccessedAt`(갱신 이력 없으면 null)
- `lastAccessedAt` 은 회원의 마지막 접속 시각(UTC, `users.last_accessed_at`) - 로그인·refresh 재발급 성공 시 갱신되므로 해상도는 access token TTL(30분) 단위. "N분/시간 전 접속" 표시용이며 실시간 접속중 뱃지 용도가 아니다. 같은 집 구성원에게만 노출(미리보기에는 없음)
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house_members`, `users`(`last_accessed_at` 읽기)

### DELETE /api/v1/houses/{houseId}/members/{membershipId}
강퇴. **소유자만**. 대상은 status=kicked + `left_at` 전환되고 **재가입 불가**(초대코드·탐색 모두 `HOUSE_KICKED_MEMBER` 409). 알림 발송은 알림 도메인 의존.
- res: 204 / 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 자기 자신 `HOUSE_KICK_SELF`(400) · 대상 무효 `HOUSE_MEMBER_NOT_FOUND`(404) · 없는/삭제 집 404
- table: `house_members`(status=kicked/`left_at`), `house`(`current_member_count` 감소)

### DELETE /api/v1/houses/{houseId}/members/me
탈퇴. status=left + `left_at` 기록, `current_member_count` 감소. 기여 기록은 유지되며 **재가입은 허용**(기존 row 재활성화 - 탈퇴하면 집 활동·미션에 더는 참여하지 못한다는 의미).
- 소유자는 다른 active 구성원이 있으면 **양도 선행** 필요 → `HOUSE_OWNER_MUST_TRANSFER`(409)
- **마지막 1인 탈퇴 시 집 soft delete**(`deleted_at`) - 빈 집이 탐색에 남지 않음
- res: 204 / 예외: 비구성원·중복 탈퇴 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 404
- table: `house_members`(`left_at`), `house`

### POST /api/v1/houses/{houseId}/transfer-ownership
소유권 양도. **소유자만**. 대상 구성원을 `owner`로 승격 + 기존 소유자는 `member`로 + `house.owner_user_id` 갱신 - 단일 트랜잭션.
- req: `targetMembershipId` (같은 집의 다른 active 구성원)
- res: `houseId`, `newOwnerMembershipId`, `newOwnerUserId`
- 예외: 소유자 아님 `HOUSE_NOT_OWNER`(403) · 대상 무효(비구성원/비활성/자기자신/타집) `HOUSE_TRANSFER_TARGET_INVALID`(400) · 없는/삭제 집 404
- table: `house_members`(role 변경), `house`(`owner_user_id`)

## 구성원 방 방문 / 활동 열람

초안의 `routine-status`(오늘 현황·참여율) 단일 엔드포인트는 방/그날 현황/완료 내역 3개로 재설계해 구현했다. 공통 규칙: **요청자·조회 대상 모두 그 집(houseId)의 ACTIVE 구성원**이어야 하며(본인 조회 가능), 위반 시 403 `HOUSE_NOT_MEMBER`. 참여율(`recentParticipationRate`) 계산값은 제공하지 않고 raw 완료 내역으로 대체(집계는 프론트).

### GET /api/v1/houses/{houseId}/members/{membershipId}/room
구성원 방 조회. 응답 형태는 내 방 조회(`GET /api/v1/rooms/me`)와 동일 — 성장 레벨, 착용 캐릭터, surface(벽지/바닥/배경)·positioned 슬롯별 배치, 스트릭.
- res: `GET /api/v1/rooms/me`와 동일 계약
- 예외: 대상이 방 미생성(내 방 화면 미방문) `ROOM_NOT_FOUND`(404)
- table: `house_members`, `personal_rooms`, `room_surface_slots` (+ 방 도메인 의존)

### GET /api/v1/houses/{houseId}/members/{membershipId}/day
구성원의 그날 현황(루틴 + 투두, 완료 여부 포함). 반복 대상·완료 판정은 `GET /api/v1/today`·캘린더와 동일 규칙.
- query: `date?`(YYYY-MM-DD, 미지정 시 오늘 KST)
- res: `date`, `routines[]`(`id`, `originRoutineId`, `title`, `scheduledTime?`, `authType`, `categoryId`, `completed`), `todos[]`(`id`, `title`, `status`, `completedAt?`, `categoryId`)
- 정렬: 루틴 수행 예정 시각 오름차순, 투두 id 오름차순
- 공개 범위: 카테고리 `visibility`가 HOUSE/PUBLIC 인 루틴·투두만 노출. PRIVATE/FRIENDS·미분류는 제외(본인 조회에도 동일 적용 — 내 화면은 `GET /api/v1/today` 사용)
- table: `house_members` (+ 루틴/투두 도메인 의존)

### GET /api/v1/houses/{houseId}/members/{membershipId}/routine-completions
구성원 루틴 완료 내역 기간 조회.
- query: `from?`, `to?`(YYYY-MM-DD) — `to` 미지정 시 오늘(KST), `from` 미지정 시 `to` 기준 최근 14일. 기간 최대 92일, `from` > `to`는 400 `HOUSE_ACTIVITY_PERIOD_INVALID`
- res: `from`, `to`(실제 적용된 기간), `items[]`(`date`, `completedAt`, `routineId`, `originRoutineId`, `title`, `categoryId`)
- 정렬: 완료 날짜 내림차순(같은 날짜는 완료 시각 내림차순). 공개 범위 필터는 `/day`와 동일(HOUSE/PUBLIC만)
- 비고: 스케줄 수정으로 루틴 버전이 갈려도 과거 완료는 포함 — 같은 루틴 묶음 판별은 `originRoutineId` 사용
- table: `house_members` (+ 루틴/투두 도메인 의존)

방명록은 **방 주인과 같은 집(houseId)의 ACTIVE 구성원만** 조회·작성할 수 있다(방 주인 본인 포함, 위반 403 `HOUSE_NOT_MEMBER`, 집 없음/삭제 404 `HOUSE_NOT_FOUND`). path 는 `rooms` 하위로 확정(2026-07-05, 서버 구현 완료).

### GET /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 조회(최신순 = `guestbookId` 내림차순). **커서 기반 무한스크롤** — offset 페이징은 새 글 유입 시 중복/누락이 생겨 배제.
- query: `houseId`(필수), `cursor?`(이전 응답의 nextCursor, 첫 요청 생략), `size?`(기본 20, 최대 50)
- res: `items[]`(`guestbookId`, `authorId`, `authorNickname`, `content`, `createdAt`) + `nextCursor`(더 없으면 null) + `hasNext`
- 삭제된 글(`deleted_at` not null)은 제외
- table: `room_guestbooks`

### POST /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 작성. → 201
- req: `houseId`, `content`(1~500자)
- res: `guestbookId`, `roomOwnerId`, `authorId`, `houseId`, `content`, `createdAt`
- table: `room_guestbooks`

> 삭제 API 는 MVP 범위 외(후속 — 작성자/방 주인 soft delete 안 검토). `deleted_at` 컬럼은 그 후속용.

## 단체 미션

전부 해당 집의 ACTIVE 구성원 전용(비구성원 403 `HOUSE_NOT_MEMBER`). 보상은 **집 성장 포인트 +100만** 지급(개인 재화 보상 없음 — 후속 검토), 레벨은 `growth_points / 100` 선형(확정 2026-07-05, 서버 구현 완료 PR #81).

### GET /api/v1/houses/{houseId}/missions
집 미션 목록·진행률 조회. 최신 생성순.
- res(items[]): `missionId`, `title`, `missionType`, `targetValue`, `currentValue`(기여 합산), `status`, `startsAt`, `endsAt`, `createdAt`
- table: `house_missions`, `house_mission_participants`

### POST /api/v1/houses/{houseId}/missions
미션 등록. **소유자(OWNER)만**(403 `HOUSE_NOT_OWNER`). 등록 즉시 `status=ACTIVE`. → 201
- req: `title`(1~160자), `missionType`, `targetValue`(1~1000), `startsAt?`, `endsAt?`(둘 다 지정 시 endsAt > startsAt, 위반 400 `HOUSE_MISSION_PERIOD_INVALID`)
- `missionType`은 MVP에서 `DAILY_MEMBER_RATE`·`WEEKLY_MEMBER_COUNT` 2종만 허용 — `STREAK_DAYS`는 400 `HOUSE_MISSION_TYPE_NOT_SUPPORTED`
- res: 미션 상세와 동일 형식 (`currentValue=0`, `myContribution=0`)
- table: `house_missions`

### GET /api/v1/houses/{houseId}/missions/{missionId}
미션 상세·내 기여 조회.
- res: 목록 항목 + `myContribution`(내 누적 기여), `achieved`(currentValue >= targetValue)
- 참여자별 기여 목록(participants[])은 화면 요구 확정 전까지 미노출
- table: `house_missions`, `house_mission_participants`

### POST /api/v1/houses/{houseId}/missions/{missionId}/contribute
**정식 기여 API**(모델 확정 2026-07-05) — 공동 미션은 구성원이 **미션 자체를 직접 수행 체크**하는 방식이다. 개인 루틴 완료와는 무관하며, 프론트 미션 화면의 "오늘 수행" 액션이 이 API 를 호출한다. 수행 인증(사진 등) 강화는 후속.
- 구성원 본인 기여 +1, **KST(Asia/Seoul) 기준 하루 1회**(참여 row `updated_at` 판정)
- `status=ACTIVE`이고 미션 기간 내일 때만 가능(위반 409 `HOUSE_MISSION_NOT_ACTIVE`), 같은 날 재기여 409 `HOUSE_MISSION_ALREADY_CONTRIBUTED`
- res: `missionId`, `myContribution`, `currentValue`, `achieved`
- table: `house_mission_participants`

### POST /api/v1/houses/{houseId}/missions/{missionId}/claim
미션 보상 수령. 구성원 누구나 실행 가능, **미션당 최초 1회**.
- 판정: `currentValue >= targetValue` (미달 409 `HOUSE_MISSION_NOT_ACHIEVED`), 이미 COMPLETED 면 409 `HOUSE_MISSION_ALREADY_CLAIMED`
- 처리(한 트랜잭션): `status=COMPLETED` 전환 + `house.growth_points` +100(레벨 재계산) + 참여자 `reward_claimed` 일괄 true. 미션 행·집 행 비관적 락으로 동시 claim 이중 지급 방지
- res: `missionId`, `status`, `grantedGrowthPoints`(=100), `houseGrowthPoints`, `houseLevel`
- table: `house_missions`(status), `house_mission_participants`(`reward_claimed`), `house`(`growth_points`, `level`)

### DELETE /api/v1/houses/{houseId}/missions/{missionId}
미션 삭제. **소유자(OWNER)만**(403 `HOUSE_NOT_OWNER`). soft delete — 삭제된 미션은 목록·상세에서 제외되고 기여·claim 도 404. → 204
- 진행 중(ACTIVE) 미션은 기여가 있어도 삭제 가능(잘못 만든 미션 정리 용도). 기여 이력(participants)은 보존하고 조회에서만 숨긴다.
- 보상 수령(COMPLETED) 미션은 삭제 불가(409 `HOUSE_MISSION_ALREADY_CLAIMED`) — 집 성장 포인트 지급 이력 보존.
- 기여·claim·삭제는 같은 미션 행 비관적 락으로 직렬화한다 — "삭제 커밋 직전 읽은 미션"에 기여가 기록되거나 claim 과 삭제가 겹치는 경합을 차단.
- table: `house_missions`(`deleted_at`)

에러코드: `HOUSE_MISSION_NOT_FOUND`(404), `HOUSE_MISSION_TYPE_NOT_SUPPORTED`·`HOUSE_MISSION_PERIOD_INVALID`(400), `HOUSE_MISSION_NOT_ACTIVE`·`HOUSE_MISSION_ALREADY_CONTRIBUTED`·`HOUSE_MISSION_NOT_ACHIEVED`·`HOUSE_MISSION_ALREADY_CLAIMED`(409), `HOUSE_NOT_OWNER`(403)

## 집 레벨

집 레벨·성장 포인트는 별도 조회 엔드포인트 없이 `GET /api/v1/houses/{houseId}`의 `level`·`growthPoints`로 노출. 레벨 상승 트리거는 미션 달성(`.../claim`)에서 발생하며 **레벨 = growth_points / 100 선형**(레벨당 100pt, 확정 2026-07-05). 테마 보상 해금은 상점/테마 도메인 의존 — 테마 매핑 **미정**. (`house.level`, `house.growth_points`)
