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

## 집 관리

### POST /api/v1/houses
집 생성. 생성자가 `owner`.
- req: `name`(2~30자), `description?`, `coverImageKey?`, `maxMembers?`(1~10, 미지정 시 4), `goalIds[]`(필수 1~3개, 활성 goal 만)
- res: `houseId`, `ownerUserId`, `inviteCode`, `inviteExpiresAt`
- 생성자는 `house_members`에 role=owner·status=active 로 즉시 등록, `current_member_count=1`. 집은 `level=0`, `growth_points=0` 에서 시작.
- 초대코드: 영대문자+숫자 8자(혼동문자 I,O,L,0,1 제외), 만료 7일.
- 예외: 없는/비활성 goal 포함 → `HOUSE_GOAL_INVALID`(400)
- table: `house`, `house_members`(owner row), `house_goals`

### GET /api/v1/houses/{houseId}
집 상세 조회(설정·목표·레벨·성장 포인트·구성원 수). **ACTIVE 구성원만** 조회 가능.
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`, `currentMemberCount`, `level`, `growthPoints`, `goals[]`(`goalId`,`code`,`name`), `myRole`, `inviteCode`, `inviteExpiresAt`
- `inviteCode`/`inviteExpiresAt` 는 **소유자에게만** 값, 그 외 null. `myRole` 은 화면의 소유자 UI 분기용
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`, `house_members`, `house_goals`

### PUT /api/v1/houses/{houseId}
설정 수정(이름·소개글·대표 이미지·최대 인원). 소유자만.
- req: `name?`, `description?`, `coverImageKey?`, `maxMembers?`
- table: `house`

### POST /api/v1/houses/{houseId}/invite-code
초대코드 재발급. **소유자만**. 기존 코드 즉시 만료(새 코드로 교체), 만료 7일 갱신. 코드 규칙은 생성과 동일(영대문자+숫자 8자).
- res: `inviteCode`, `inviteExpiresAt`
- 예외: 소유자 아님(비구성원 포함) `HOUSE_NOT_OWNER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house`

## 구성원 관리

### GET /api/v1/houses/{houseId}/members
구성원 목록 조회. **ACTIVE 구성원만** 조회 가능, 목록에도 **active 구성원만** 노출(가입순 - 생성자가 첫 번째).
- res(items[]): `membershipId`, `userId`, `nickname`(온보딩 전 null), `role`, `status`, `joinedAt`
- 예외: 비구성원 `HOUSE_NOT_MEMBER`(403) · 없는/삭제 집 `HOUSE_NOT_FOUND`(404)
- table: `house_members`

### DELETE /api/v1/houses/{houseId}/members/{membershipId}
강퇴. 소유자만. 알림 발송은 알림 도메인 의존.
- table: `house_members`(상태 전환/`left_at`), `house`(`current_member_count` 감소)

### DELETE /api/v1/houses/{houseId}/members/me
탈퇴. 기여 기록 유지, 이후 참여 불가. 소유자는 양도 후 가능(아래 선행).
- table: `house_members`(`left_at`), `house`

### POST /api/v1/houses/{houseId}/transfer-ownership
소유권 양도. 대상 구성원을 `owner`로, `house.owner_user_id` 갱신.
- req: `targetMembershipId`
- table: `house_members`(role 변경), `house`(`owner_user_id`)

## 구성원 방 방문

### GET /api/v1/houses/{houseId}/members/{membershipId}/routine-status
구성원 오늘 루틴 현황·최근 참여율. 공개 범위는 사용자 설정.
- res: `userId`, `todayCompleted`, `recentParticipationRate` (형태 **미정**)
- 의존: 루틴/투두 도메인(`routines`, `routine_logs`, `streaks`) — 본 도메인은 집 구성원 접근 경로만 제공
- table: `house_members` (+ 루틴/투두 도메인 의존)

### GET /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 조회(최신순). `house_id` 맥락으로 필터 가능.
- query: `houseId?`
- res(items[]): `guestbookId`, `authorId`, `authorNickname`, `content`, `createdAt`
- table: `room_guestbooks`

### POST /api/v1/rooms/{roomOwnerId}/guestbooks
방명록 작성.
- req: `houseId`, `content`
- res: `guestbookId`, `roomOwnerId`, `authorId`, `houseId`, `createdAt`
- table: `room_guestbooks`

> 방명록 path가 `houses` 하위인지 `rooms` 하위인지는 방 도메인과 협의 **미정**. `room_guestbooks`가 `room_owner_id`·`house_id`·`author_id`를 모두 갖는 점만 확정.

## 단체 미션

### GET /api/v1/houses/{houseId}/missions
집 미션 목록·진행률 조회.
- res(items[]): `missionId`, `title`, `missionType`, `targetValue`, `currentValue`(기여 합산), `status`, `startsAt`, `endsAt`
- table: `house_missions`, `house_mission_participants`

### POST /api/v1/houses/{houseId}/missions
미션 등록. 보상 정책 **미정**.
- req: `title`, `missionType`, `targetValue`, `startsAt?`, `endsAt?`
- res: `missionId`, `status`
- table: `house_missions`

### GET /api/v1/houses/{houseId}/missions/{missionId}
미션 상세·참여자별 기여 조회.
- res: `missionId`, `targetValue`, `currentValue`, `participants[]`(`membershipId`, `contributionValue`, `rewardClaimed`)
- table: `house_missions`, `house_mission_participants`

### POST /api/v1/houses/{houseId}/missions/{missionId}/claim
미션 달성·보상 수령. 공동+개인 보상 지급, 집 성장 포인트 증가.
- res: `rewardClaimed`, `growthPoints`, `level`
- 의존: 재화 지급(`user_wallets`, 회원/재화 도메인), 집 테마 해금(상점/테마 도메인)
- table: `house_missions`(status), `house_mission_participants`(`reward_claimed`), `house`(`growth_points`, `level`)
- 미션 기여 누적(`contribution_value`) 트리거는 루틴/투두 도메인 연동 — 별도 엔드포인트 vs 이벤트 기반 **미정**

## 집 레벨

집 레벨·성장 포인트는 별도 조회 엔드포인트 없이 `GET /api/v1/houses/{houseId}`의 `level`·`growthPoints`로 노출. 레벨 상승 트리거는 미션 달성(`.../claim`)에서 발생, 테마 보상 해금은 상점/테마 도메인 의존. 레벨업 곡선·테마 매핑 **미정**. (`house.level`, `house.growth_points`)
