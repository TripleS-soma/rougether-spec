# 루틴 / 투두 — 기능 명세

상위: [features.md](../../features.md) · 데이터: [erd.md](../../erd.md) · API: [api.md](api.md)

표기: 기능 > 하위기능 > 설명. 각 기능에 관련 table을 명시한다. ERD에 없는 필드는 만들지 않으며, 확정 안 된 값은 "미정"으로 둔다.

## 카테고리 관리 (`categories`)

- **등록**: 이름(`name`)·색상(`color_hex`)·아이콘(`icon_key`)·정렬 순서(`sort_order`)·**공개 범위(`visibility`)**로 카테고리를 만든다. **공개 범위는 카테고리 단위로 적용**(루틴별 아님). 소유자는 `user_id`.
- **수정**: 이름·색상·아이콘·정렬 순서를 변경한다.
- **삭제**: soft delete(`deleted_at`). 삭제 시 해당 카테고리에 속한 루틴·투두는 **미분류 처리**(`routines.category_id` / `todos.category_id`를 NULL로) 한다. 두 컬럼 모두 nullable이라 미분류 상태를 표현할 수 있다.

## 루틴 관리 (`routines`)

- **등록**: 이름(`title`)·카테고리(`category_id`, 선택)·인증 방식(`auth_type`)·반복 조건·수행 시간(`scheduled_time`)·지속 기간(`starts_on`/`ends_on`)을 입력한다. **공개 범위는 카테고리를 따른다**(루틴 개별 설정 없음). 소유자는 `user_id`. 초기 상태는 `status`로 표현(값 미정).
- **인증 방식 선택** (`auth_type`): **체크형** / **사진 인증형** 중 선택. 사진 인증형은 사진 저장 정책 + AI 분석 동의를 함께 확인한다(동의 결과는 인증 등록 시 `photo_verifications.ai_review_status`에 반영).
- **반복 조건** (`repeat_type`, `repeat_days` JSON):
  - `repeat_type`: `DAILY`(매일) / `WEEKLY`(매주 특정 요일) / `WEEKLY_COUNT`(주 N회, 요일 자유).
  - `repeat_days`(JSON 객체): `DAILY` → `null`, `WEEKLY` → `{ "daysOfWeek": ["MON","WED","FRI"] }`, `WEEKLY_COUNT` → `{ "timesPerWeek": 3 }`. 요일은 `MON`~`SUN`.
  - `scheduled_time`(수행 시간)·`starts_on`/`ends_on`(지속 기간)은 별도 컬럼.
- **수행 시간 / 기간**: `scheduled_time`(TIME), `starts_on`·`ends_on`(DATE)으로 시간순 정렬 및 노출 기간을 정한다.
- **수정**: 위 필드 변경.
- **삭제**: soft delete(`deleted_at`). 기존 수행 기록(`routine_logs`)은 통계 보존 정책에 따라 **숨김 처리**(보존 범위 미정 — open-questions).

## 투두 관리 (`todos`)

- **등록**: 이름(`title`)·설명(`description`)·카테고리(`category_id`, 선택)·마감일(`due_date`)을 입력한다. 소유자는 `user_id`. 상태는 `status`.
- **수정**: 위 필드 변경.
- **삭제**: soft delete(`deleted_at`). 투두 삭제 시 **완료 기록도 함께 제거**(투두는 별도 log table 없이 자체 `status`/`completed_at`으로 완료를 표현하므로 레코드 단위로 정리).

## 오늘 현황 (`routines`, `routine_logs`, `todos`, `streaks`)

- **목록**: 오늘 수행 대상 루틴(반복 조건으로 산출)과 마감 도래 투두를 **카테고리별**로 묶어 보여준다.
- **진행 요약**: 완료 수·남은 수·전체 진행률. 루틴 완료 여부는 당일 `routine_logs`(`routine_date` = 오늘)로 판정, 투두는 `status`/`completed_at`으로 판정.
- **정렬**: 루틴은 `scheduled_time` 기준 시간순.
- **스트릭 노출**: 현재 연속 성공일(`streaks.current_count`)을 함께 표시(스트릭 상세는 방 도메인의 표시 기능과 공유).

## 루틴 완료 처리 (`routine_logs`, `streaks`, → `user_wallets`)

- **완료 체크**: 당일 `routine_logs` 생성/갱신 — `routine_date`, `status`(완료), `completed_at`(수행 시간) 기록. 보상으로 `reward_currency_type`(코인)·`reward_amount`를 기록하고 지갑(`user_wallets`) 반영을 같은 트랜잭션으로 묶는다. 스트릭(`streaks`)의 `current_count`·`longest_count`·`last_success_date`를 갱신한다.
- **완료 취소**: **당일 내**만 가능. 해당 `routine_logs.status`를 취소 상태로 되돌리고, 지급 코인과 스트릭을 **롤백**한다. ("당일" 타임존 기준 미정 — open-questions)

## 투두 완료 처리 (`todos`, → `user_wallets`)

- **완료 체크**: `todos.status`(완료)·`completed_at` 기록 + 코인 지급(`reward_currency_type`/`reward_amount` 기록 후 지갑 반영). 투두는 스트릭에 포함하지 않는다(스트릭은 루틴 기준).
- **완료 취소**: **당일 내**만 가능. `status`/`completed_at`을 되돌리고 지급 코인을 롤백한다.

## 사진 인증 (`photo_verifications`)

- **등록**: 사진 인증형 루틴 완료 시 카메라/앨범에서 업로드 → 해당 `routine_logs`에 연결된 `photo_verifications` 레코드 생성. 저장 키는 `storage_key`(전체 URL 아님), 업로드 시각 `uploaded_at`, AI 분석 동의/결과는 `ai_review_status`.
- **공개 범위** (`privacy_scope`): **나만 보기** / **집 구성원 공개**. "집 구성원 공개"의 노출 대상은 집 도메인(`house_members`)에 의존.
- **공개 범위 변경**: `privacy_scope` 갱신.
- **삭제**: soft delete(`deleted_at`). **사진만 제거**하고 루틴 완료 상태(`routine_logs`)는 **유지**한다.

## 도메인 경계 메모

- 코인 보상의 실제 잔액 변경은 `user_wallets`(회원/재화 도메인) 소관 — 이 도메인은 보상 사실 기록 + 트랜잭션 묶음만 책임.
- 코인·스트릭을 입력으로 한 방/집 성장 반영은 방·집 도메인 소관.
- 루틴 패턴/실패 분석, 인증 사진 비전 판단은 AI(순차 고도화) 영역 — 이 도메인은 원천 데이터와 동의 상태만 보관.
