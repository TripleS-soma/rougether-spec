# 공동 집 (House) — 기능 명세

출처: [features.md](../../features.md) "집 (공동집)" 절을 본 도메인 범위로 발췌·구체화. 데이터는 [erd.md](../../erd.md)를 따른다.

관련 table: `house`, `house_members`, `house_goals`, `house_missions`, `house_mission_participants`, `room_guestbooks`.

## 집 탐색 / 참여

- **집 탐색**: 집 목표 카테고리 기반으로 집 목록을 조회. 목표·인원·활동 수준 필터를 지원한다. (`house`, `house_goals`)
- **탐색 참여**: 탐색 결과에서 집 선택 → **즉시가입**(초대코드 참여와 동일 정책 — role=member·status=active, 승인 흐름 없음). 참여 시 `house_members` 행 생성(탈퇴 이력은 재활성화), `house.current_member_count` 증가. (`house_members`, `house`)
- **초대코드 참여**: 코드/링크 입력 → 집 정보·구성원 수 확인 후 참여. 참여는 **즉시가입**(role=member·status=active, 승인 흐름 없음). 만료 코드(`house.invite_expires_at` 경과)·중복 참여(같은 집 active 구성원)·정원 초과 예외 처리. 탈퇴 이력 재가입은 기존 row 재활성화. (`house`, `house_members`)
  - 다중 집 가입 허용: 다른 집에 이미 속해 있어도 새 집 참여 가능. 같은 집 중복만 차단.

## 집 관리

- **집 생성**: 이름(2~30자)·대표 이미지(`cover_image_key`)·집 목표(`goal_ids` 필수 1~3개, 활성 goal 만)·참여 제한(`max_members` 1~10, 기본 4) 설정. 생성자는 `owner_user_id`로 기록되고 `house_members`에 `role=owner`·`status=active`로 즉시 등록(`current_member_count=1`). 집은 레벨 0·성장 포인트 0에서 시작. 생성 시 초대코드(영대문자+숫자 8자, 혼동문자 I,O,L,0,1 제외, 만료 7일) 발급. (`house`, `house_members`, `house_goals`)
- **설정 수정**: 이름·소개글(`description`)·대표 이미지(`cover_image_key`)·최대 인원(`max_members`) 수정. 소유자만. (`house`)
- **초대코드 재발급**: 새 `invite_code` 발급 + `invite_expires_at` 갱신. 재발급 시 기존 코드 즉시 만료. (`house`)

## 구성원 관리

- **강퇴**: 소유자만 가능. 대상 `house_members.status`를 강퇴 상태로 전환(또는 `left_at` 기록), `current_member_count` 감소. 강퇴 구성원에게 알림(알림 발송은 의존 도메인). (`house_members`, `house`)
- **집 탈퇴**: 본인 탈퇴. `house_members.left_at` 기록, 기여 기록(`house_mission_participants`)은 유지, 이후 참여 불가. `current_member_count` 감소. (`house_members`, `house`)
- **소유자 양도 후 탈퇴**: 소유자는 탈퇴 전 다른 구성원에게 소유권 양도 필요. 대상 구성원 `role=owner`로 변경 + `house.owner_user_id` 갱신 후 기존 소유자 탈퇴. (`house_members`, `house`)

## 구성원 방 방문

- **구성원 루틴 현황**: 같은 집 구성원의 오늘 루틴 완료 여부·최근 참여율 조회. 공개 범위는 사용자 설정에 따름. 루틴 데이터 자체는 **루틴/투두 도메인 의존**(`routines`, `routine_logs`, `streaks`) — 본 도메인은 집 구성원 컨텍스트(`house_members`)로 접근 경로만 제공.
- **방명록 작성**: 방문한 구성원 방에 메시지 작성. `room_owner_id`(방 주인), `house_id`(방문 맥락 집), `author_id`(작성자), `content` 저장. (`room_guestbooks`)
- **방명록 조회**: 특정 구성원 방의 방명록 최신순 조회(`created_at` desc), 삭제된 글(`deleted_at`) 제외. (`room_guestbooks`)

## 단체 미션

- **미션 등록**: 미션명(`title`)·유형(`mission_type`)·목표 조건(`target_value`)·기간(`starts_at`, `ends_at`) 입력. 보상 정책은 미정. (`house_missions`)
- **미션 조회**: 집의 미션 목록·진행률 조회. 진행률은 참여자 기여 합(`house_mission_participants.contribution_value`)과 `target_value`로 산출. (`house_missions`, `house_mission_participants`)
- **미션 기여**: 구성원의 루틴 수행이 미션 기여로 누적(`contribution_value` 증가). 기여 트리거 규칙은 루틴/투두 도메인 연동 — **의존**. (`house_mission_participants`, `house_members`)
- **미션 달성**: 목표 조건 충족 시 `house_missions.status` 달성으로 전환, 공동 보상 + 개인 보상 지급(`reward_claimed`), 집 성장 포인트(`house.growth_points`) 증가. 재화 지급은 회원/재화 도메인 의존. (`house_missions`, `house_mission_participants`, `house`)

## 집 레벨

- **집 레벨 / 성장**: 단체 미션 보상이 `house.growth_points`로 누적되고 임계값 도달 시 `house.level` 상승. 레벨 상승 시 **집 테마 보상** 해금. 테마 마스터·해금 처리는 상점/테마 도메인 의존. (`house.level`, `house.growth_points`)

## 미결정 사항

- ~~탐색 참여가 즉시 가입인지 요청→승인 흐름인지~~ → **즉시가입으로 확정**. `house_members.status` 는 active/left 2값으로 시작(승인·강퇴 상태는 필요 시 확장).
- 강퇴/탈퇴를 `status` 전환으로 표현할지 `left_at`만으로 표현할지(둘 다 컬럼 존재) 미확정.
- 단체 미션 보상 분배 규칙(공동/개인 비율, 기여도 반영), 미션 기여 트리거 규칙 미정.
- 집 레벨업 곡선·테마 매핑 미정.
- 구성원 루틴 현황 공개 범위 단위(루틴별 vs 카테고리별)는 루틴/투두 도메인 open question 연동.
