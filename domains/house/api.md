# 공동 집 (House) — API 초안

[features.md](features.md) 기준 엔드포인트 초안. 공통 규약은 [상위 api.md](../../api.md)를 따른다(prefix `/api/v1`, JSON 본문, ISO-8601+offset, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 인증 MVP 유예·소유권 식별자 유지). 상세 req/res는 **미정**으로 둔 항목 다수.

> path·필드는 draft. 확정 시 서버 repo `docs/`에 최종 정리.

## 집 탐색 / 참여

### GET /api/v1/houses
집 탐색. 목표 카테고리·인원·활동 수준 필터로 집 목록 조회.
- query(미정): `goalCode`, `hasSlot`, `activityLevel` 등 필터
- res(items[]): `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `level`, `goals[]`
- table: `house`, `house_goals`

### POST /api/v1/houses/{houseId}/join
탐색 결과에서 선택한 집에 참여(요청). 즉시 가입 vs 요청→승인 흐름 **미정**.
- res: `membershipId`, `houseId`, `userId`, `role`, `status`, `joinedAt`
- 예외: 같은 집 중복 가입(`(house_id, user_id)`) → 충돌
- table: `house_members`, `house`(`current_member_count` 갱신)

### POST /api/v1/houses/join-by-code
초대코드/링크로 참여. 코드로 집 정보·구성원 수 확인 후 합류.
- req: `inviteCode`
- res: `membershipId`, `houseId`, `status`
- 예외: 만료 코드(`invite_expires_at` 경과), 중복 참여
- table: `house`, `house_members`

### GET /api/v1/houses/by-code/{inviteCode}
참여 전 코드로 집 미리보기(이름·구성원 수·목표). (참여와 분리, 선택)
- res: `houseId`, `name`, `coverImageKey`, `currentMemberCount`, `maxMembers`, `inviteExpired`
- table: `house`

## 집 관리

### POST /api/v1/houses
집 생성. 생성자가 `owner`.
- req: `name`, `description?`, `coverImageKey?`, `maxMembers?`, `goalIds[]`
- res: `houseId`, `ownerUserId`, `inviteCode`, `inviteExpiresAt`
- table: `house`, `house_members`(owner row), `house_goals`

### GET /api/v1/houses/{houseId}
집 상세 조회(설정·목표·레벨·성장 포인트·구성원 수).
- res: `houseId`, `name`, `description`, `coverImageKey`, `maxMembers`, `currentMemberCount`, `level`, `growthPoints`, `goals[]`
- table: `house`, `house_goals`

### PUT /api/v1/houses/{houseId}
설정 수정(이름·소개글·대표 이미지·최대 인원). 소유자만.
- req: `name?`, `description?`, `coverImageKey?`, `maxMembers?`
- table: `house`

### POST /api/v1/houses/{houseId}/invite-code
초대코드 재발급. 기존 코드 즉시 만료.
- res: `inviteCode`, `inviteExpiresAt`
- table: `house`

## 구성원 관리

### GET /api/v1/houses/{houseId}/members
구성원 목록 조회.
- res(items[]): `membershipId`, `userId`, `nickname`, `role`, `status`, `joinedAt`
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
