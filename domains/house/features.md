# 공동 집 (House) — 기능 명세

출처: [features.md](../../features.md) "집 (공동집)" 절을 본 도메인 범위로 발췌·구체화. 데이터는 [erd.md](../../erd.md)를 따른다.

관련 table: `house`, `house_members`, `house_join_requests`, `house_goals`, `house_missions`, `house_mission_participants`, `house_mission_daily_contributions`, `house_mission_daily_rewards`, `house_member_cheers`, `room_guestbooks`.

## 집 탐색 / 참여

- **집 탐색**: 집 목표 카테고리 기반으로 집 목록을 조회. 목표·인원·활동 수준 필터를 지원한다. (`house`, `house_goals`)
- **탐색 참여**: 탐색 결과에서 집 선택 → `house_join_requests.status=PENDING`으로 **입주 신청**. 신청만으로 구성원 수는 바뀌지 않으며, 방장(OWNER)이 수락해야 `house_members`가 ACTIVE로 생성·재활성화되고 `house.current_member_count`가 증가한다. 거절 후 재신청할 수 있다. (`house_join_requests`, `house_members`, `house`)
- **초대코드 참여**: 코드/링크 입력 → 집 정보·구성원 수 확인 후 참여. 코드 종류로 흐름이 갈린다 — 집 공용 코드(소유자 공유)는 **즉시가입**(role=member·status=active), 구성원 개인 코드(일반 구성원 공유)는 **방장 승인 대기**(`house_join_requests.PENDING` 생성, 방장 수락 시 입주 확정). 만료 코드(각 코드의 `invite_expires_at` 경과)·중복 참여(같은 집 active 구성원)·강퇴 이력·정원 초과 예외 처리. 탈퇴 이력 재가입은 기존 row 재활성화. 초대자가 탈퇴·강퇴하면 개인 코드는 즉시 무효, 초대자가 참여 시점에 owner 면 개인 코드도 즉시가입. (`house`, `house_members`, `house_join_requests`)
  - 즉시가입 시 같은 집의 대기 중인 입주 신청이 있으면 함께 ACCEPTED로 종결한다.
  - 다중 집 가입 허용: 다른 집에 이미 속해 있어도 새 집 참여 가능. 같은 집 중복만 차단.
- **집 순서 변경**: 집 탭에서 내 집들이 보이는 순서를 사용자가 직접 정한다(모바일 #820). `house_members.sort_order`에 저장하는 **개인 설정**이라 같은 집의 다른 구성원에게는 영향이 없다. 정한 적 없으면 기존과 같은 가입순이고, 새로 가입한 집은 끝에 붙는다. 순서를 정하지 않은 사용자에게는 아무 변화도 없어야 한다. (`house_members`)

## 집 관리

- **대표 이미지 후보 조회**: 집 생성·설정 화면은 서버의 게시 승인 manifest에서 프론트 식별용 `code`, 화면 표시용 `name`, 이미지 로딩용 `coverImageKey` 목록을 조회하고, 선택한 key만 `cover_image_key`로 저장한다. S3 `house/`의 초안·중복 파일은 후보에 자동 노출하지 않으며, 전체 URL은 저장하지 않고 클라이언트가 CDN base URL과 조합한다.
- **집 생성**: 이름(2~30자)·대표 이미지(`cover_image_key`)·집 목표(`goal_ids` 필수 1~3개, 활성 goal 만)·참여 제한(`max_members` 1~10, 기본 4) 설정. 생성자는 `owner_user_id`로 기록되고 `house_members`에 `role=owner`·`status=active`로 즉시 등록(`current_member_count=1`). 집은 레벨 0·성장 포인트 0에서 시작. 생성 시 초대코드(영대문자+숫자 8자, 혼동문자 I,O,L,0,1 제외, 만료 7일) 발급. (`house`, `house_members`, `house_goals`)
- **회원가입 기본 집**: 회원가입(최초 소셜 로그인·dev-login 신규 가입) 트랜잭션에서 지갑 발급과 함께 사용자 소유의 기본 공동집을 1회 생성한다. 이름 `나의 집`, 정원 4명, 게시 승인 커버 manifest 첫 항목을 적용하고, **집 목표는 비어 있는 채로** 만든다. 집 생성 실패는 가입 실패다(집 없는 계정을 만들지 않음). 서버의 동거 봇 규칙에 따라 초기 구성원이 함께 들어갈 수 있다. 집 목표는 `PUT /api/v1/onboarding/goals` 저장 시 "내가 OWNER이고 집 목표가 비어 있는 집"에 대표 목표 우선 + 나머지 목표 마스터 정렬순으로 최대 3개를 1회 채우며, 이후 사용자 목표 변경은 집 목표에 반영하지 않는다. 기본 집을 나갔거나 해체된 뒤 재생성하지 않고, 기존 계정에 소급 생성하지 않는다. (`house`, `house_members`, `house_goals`)
- **설정 수정**: 이름·소개글(`description`)·대표 이미지(`cover_image_key`)·최대 인원(`max_members`) 수정. 소유자만. (`house`)
- **초대코드 재발급**: ACTIVE 구성원 누구나. 소유자는 집 공용 코드(`house.invite_code`, 즉시가입), 일반 구성원은 본인 개인 코드(`house_members.invite_code`, 방장 승인 대기)를 재발급하고 `invite_expires_at` 을 갱신한다. 재발급 시 같은 종류의 기존 코드는 즉시 만료. (`house`, `house_members`)

## 구성원 관리

- **입주 신청 관리**: 소유자만 대기 중인 신청을 조회하고 수락·거절한다. 수락 시점에 집 정원을 다시 검사하고 구성원 등록·신청 종결·`current_member_count` 증가를 한 트랜잭션으로 처리한다. (`house_join_requests`, `house_members`, `house`)
- **강퇴**: 소유자만 가능. 대상 `house_members.status`를 강퇴 상태로 전환(또는 `left_at` 기록), `current_member_count` 감소. 강퇴 구성원에게 알림(알림 발송은 의존 도메인). (`house_members`, `house`)
- **집 탈퇴**: 본인 탈퇴. `house_members.left_at` 기록, 기여 기록(`house_mission_participants`)은 유지되며 집 활동·미션에는 더는 참여하지 못한다. **재가입은 허용**(기존 row 재활성화). `current_member_count` 감소. 마지막 1인 탈퇴 시 집 soft delete. (`house_members`, `house`)
- **소유자 양도 후 탈퇴**: 소유자는 탈퇴 전 다른 구성원에게 소유권 양도 필요. 대상 구성원 `role=owner`로 변경 + `house.owner_user_id` 갱신 후 기존 소유자 탈퇴. (`house_members`, `house`)

## 구성원 방 방문

- **구성원 루틴 현황**: 같은 집 구성원의 오늘 루틴 완료 여부·최근 참여율 조회. 공개 범위는 사용자 설정에 따름. 루틴 데이터 자체는 **루틴/투두 도메인 의존**(`routines`, `routine_logs`, `streaks`) — 본 도메인은 집 구성원 컨텍스트(`house_members`)로 접근 경로만 제공.
- **방명록 작성**: 방 주인과 **같은 집의 ACTIVE 구성원만**(방 주인 본인 포함) 작성 가능(확정 2026-07-05). `room_owner_id`(방 주인), `house_id`(방문 맥락 집), `author_id`(작성자), `content`(1~500자) 저장. (`room_guestbooks`)
- **방명록 조회**: 같은 집 구성원만, 최신순(**커서 기반 무한스크롤**, id desc), 삭제된 글(`deleted_at`) 제외. 삭제 API 는 후속. (`room_guestbooks`)

## 단체 미션

- **미션 등록**: 소유자(OWNER)만. 미션명(`title` 1~160자)·유형(`mission_type` — MVP는 DAILY_MEMBER_RATE/WEEKLY_MEMBER_COUNT 2종, STREAK_DAYS 미지원)·목표 조건(`target_value` — WEEKLY 1~1000, DAILY 는 달성률 % 1~100)·기간(`starts_at`, `ends_at` 선택) 입력, 등록 즉시 ACTIVE. (`house_missions`)
- **미션 조회**: 집의 미션 목록(최신 생성순)·진행률 조회. 별도 미션 목록·상세는 구성원 전용이고, 집 미리보기에는 입주 전 판단용 요약 목록을 로그인 회원에게 읽기 전용으로 공개한다. WEEKLY 진행률은 참여자 기여 합(`house_mission_participants.contribution_value`)과 `target_value`로, DAILY 진행률은 오늘(KST) 기여 멤버 수 / 집 활성 멤버 수의 비율 %와 `target_value`(%)로 산출. (`house_missions`, `house_mission_participants`, `house_mission_daily_contributions`)
- **미션 기여**: 구성원이 **공동 미션 자체를 직접 수행 체크**(`POST .../contribute`, 본인 +1·KST 하루 1회)한다 — 모델 확정 2026-07-05. 하루 1회는 일별 기여 이력(`house_mission_daily_contributions`)의 UNIQUE 로 강제(유형 공통 기록). 여기에 더해 미션에 연동된 개인 루틴(`routines.house_mission_id`)을 오늘 완료하면 자동 기여된다 — **재도입 확정 2026-07-29, server PR #234** (2026-07-05 의 "개인 루틴 완료와 무관·자동 연동 폐기(이슈 #93·PR #94)" 결정 변경. 프론트가 이름 매칭으로 우회 구현하던 연동을 서버 식별자 기반으로 정식화). 하루 1회 이력은 직접 체크와 공유하고, 루틴 완료 취소는 기여를 회수하지 않는다. 수행 인증(사진 등)은 후속. (`house_mission_participants`, `house_mission_daily_contributions`, `house_members`, `routines.house_mission_id`)
- **미션 달성 (WEEKLY)**: 기여 합이 목표 이상일 때 구성원 누구나 보상 수령(claim, 미션당 최초 1회). `house_missions.status` COMPLETED 전환 + 집 성장 포인트 +100(`house.growth_points`, 개인 재화 보상 없음 — 후속 검토) + 참여자 `reward_claimed` 일괄 true. 동시 claim 은 행 락으로 이중 지급 방지. (`house_missions`, `house_mission_participants`, `house`)
- **미션 달성 (DAILY, 매일 반복)**: 오늘(KST) 달성률이 `target_value`% 이상일 때 구성원 누구나 **하루 1회** claim → 집 성장 포인트 +20 (WEEKLY 의 1/5). COMPLETED 전환 없이 다음날 0%부터 반복하고, 그날 claim 하지 않으면 그날 보상은 소멸(소급 없음). 하루 1회는 일별 보상 이력(`house_mission_daily_rewards`)의 UNIQUE 와 행 락으로 이중 지급 방지. 달성률 분자·분모 모두 현재 ACTIVE 멤버 기준(기여 후 탈퇴·강퇴 멤버 제외). (`house_missions`, `house_mission_daily_rewards`, `house`)
- **미션 만료(EXPIRED)**: `ends_at`이 지난 ACTIVE 미션은 배치(매시 정각 KST + 기동 시 1회)가 `status=EXPIRED`로 전이. 유형 무관이며 무기한 미션은 대상 아님, COMPLETED 는 만료보다 우선. **만료 후에는 기여·claim 모두 불가(유예 없음)** — 배치 전이 전이라도 기간 검사로 즉시 거부. EXPIRED 미션은 목록·상세에 그대로 노출. (`house_missions`)

## 집 레벨

- **집 레벨 / 성장**: 단체 미션 보상(WEEKLY +100, DAILY +20)이 `house.growth_points`로 누적되고 **레벨 = growth_points / 100 선형**(레벨당 100pt, 확정 2026-07-05)으로 상승. 레벨 상승 시 **집 테마 보상** 해금. 테마 마스터·해금 처리는 상점/테마 도메인 의존. (`house.level`, `house.growth_points`)

## 미결정 사항

- ~~탐색 참여가 즉시 가입인지 요청→승인 흐름인지~~ → **요청→방장 승인으로 변경**. 신청 상태는 `house_join_requests`의 PENDING/ACCEPTED/REJECTED로 분리하고, `house_members.status`는 active/left/kicked를 유지한다. 초대코드는 집 공용 코드(소유자 공유)만 즉시가입하고, 구성원 개인 코드(일반 구성원 공유)는 같은 신청→방장 승인 흐름을 탄다.
- 강퇴/탈퇴를 `status` 전환으로 표현할지 `left_at`만으로 표현할지(둘 다 컬럼 존재) 미확정.
- 단체 미션 보상은 집 성장 포인트 +100만으로 확정(2026-07-05) — 개인 재화 보상(기여도 반영 분배 등)은 후속 검토. 미션 기여 트리거는 임시 수동 API로 우선 제공, 루틴 완료 이벤트 연동 규칙은 루틴/투두 도메인 협의 미정.
- 집 레벨업 곡선·테마 매핑 미정.
- 구성원 루틴 현황 공개 범위 단위(루틴별 vs 카테고리별)는 루틴/투두 도메인 open question 연동.
