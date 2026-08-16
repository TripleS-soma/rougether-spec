# AI 주간 회고 — 기능 명세

상위: [features.md](../../features.md) · 데이터: [erd.md](../../erd.md) · API: [api.md](api.md)

표기: 기능 > 하위기능 > 설명. 각 기능에 관련 table을 명시한다. 확정 안 된 값은 "미정"으로 두고 [open-questions.md](../../open-questions.md)에 모은다.

## 주 경계 (공통)

- 주는 **일~토, `Asia/Seoul`** 기준이다. `week_start_date` = 일요일, `week_end_date` = 토요일. 일요일 당일은 다음 주에 속한다.
- 회고 1건은 사용자·주(`user_id`, `week_start_date`)당 1개다(unique). 같은 주를 다시 만들지 않는다.

## 주간 집계 (`routine_logs`, `routines`, `categories`, `streaks`)

- **집계 대상 로그**: 그 주(`routine_date` ∈ 일~토)의 `routine_logs` 중 `COMPLETED`/`FAILED`. `PENDING`은 세지 않는다. **삭제된 루틴(`routines.deleted_at` not null)의 로그는 집계에서 제외**한다(포함 여부는 루틴 삭제 숨김 정책과 함께 미정 — open-questions).
- **집계 결과(`stats_json`)**: LLM 입력이자 회고 응답의 통계이며, 배치(직렬화)와 조회 API(역직렬화)가 공유하는 계약이다.
  - `scheduledCount` = COMPLETED + FAILED 로그 수, `completedCount`, `failedCount`, `completionRate`(0~1, 소수 둘째 자리 반올림, 로그 0건이면 계산하지 않고 생성 자체를 skip).
  - `byWeekday[]`: 일~토 순 7개 고정. 요소는 `{ dayOfWeek, completed, failed }`.
  - `byRoutine[]`: **루틴 계보(`origin_routine_id`) 단위로 병합**한다 — 스케줄 수정으로 버전이 갈려도 한 루틴으로 센다. 표시명(`title`)·카테고리명(`categoryName`)은 그 주 로그에서 본 **가장 새 버전(id 최대)** 의 값이며, 현재 버전을 따로 조회하지 않는다. 요소는 `{ lineageId, title, categoryName, completed, failed }`.
  - `streak`: 생성 시점의 `streaks.current_count`/`longest_count` 스냅샷(`{ currentCount, longestCount }`).

## 회고 생성 (LLM, `weekly_reports`)

- **프롬프트 입력**: 닉네임 + 소개글(`bio`) + 선택 목표 전체(`user_goals`, 대표 목표 표시) + 위 집계. **이메일·집·다른 사용자 정보는 넣지 않는다.** 사용자 입력 텍스트(닉네임·bio·루틴 제목 등)는 데이터이지 지시가 아님을 시스템 프롬프트에 명시하고 구분자로 감싼다. 출력은 한국어·JSON만 허용.
- **LLM 출력 스키마**: `{ "summary": string(≤300자), "highlights": string[≤3], "failurePatterns": string[≤3], "suggestions": string[≤3] }`. `summary`가 없으면 스키마 위반으로 보고, 길이·개수 초과는 잘라서 수용한다(모델이 제한을 어겨도 회고를 살린다). 코드펜스·앞뒤 잡음은 벗겨내고 파싱한다.
- **저장**: `status = GENERATED`, `model` = 사용한 모델 id, `summary`, `sections_json` = `{ highlights, failurePatterns, suggestions }`, `stats_json`, `generated_at`.
- **실패 처리(`FALLBACK`)**: 파싱/스키마 위반 시 1회 재요청. 재실패·HTTP 오류·타임아웃이면 `status = FALLBACK`으로 저장한다 — `stats_json`은 그대로, `summary`는 서버 고정 문구 `"이번 주 루틴 {scheduledCount}회 중 {completedCount}회를 완료했어요."`, `sections_json`의 세 배열은 빈 배열, `model`은 null. **재생성은 없다**(허용 여부 미정 — open-questions).
- **LLM 연동**: OpenAI 호환 chat completions API를 쓴다(현재 OpenAI, 기본 모델 `gpt-5.6-luna` + reasoning effort low, JSON mode 사용). base-url·모델·타임아웃·temperature는 서버 설정값이라 코드 변경 없이 다른 호환 공급자로 교체 가능. 요청 한도를 고려해 사용자를 **순차 처리**하고 429/5xx는 지수 백오프로 2회 재시도하며, 401/403(키 오류)은 폴백하지 않고 배치를 실패시켜 키 수정 후 재시작으로 회수한다. **API 키가 주입되지 않은 환경(stub)에서는 회고를 생성하지 않는다**(가짜 회고가 재생성 불가한 정본으로 남지 않게 fail-closed).

## 생성 배치 (`weeklyReportJob`, 내부, 신규 엔드포인트 없음)

- **정본 실행 시각**: 매주 **일요일 00:30 KST**에 직전 일~토 주를 생성한다.
- **트리거**: 매일 매시 30분(`0 30 * * * *`, `Asia/Seoul`) + 앱 기동 시 1회. 대상 주는 "가장 최근에 끝난 일~토"(일요일이면 7일 전 일요일)라 어느 요일에 돌아도 같은 `weekStart`로 수렴하고, 그 주가 이미 완료됐으면 job instance 중복으로 조용히 넘어간다 → 주당 1회만 실제 실행. 일요일 종일 서버가 죽어 있어도 월요일 이후 첫 트리거에서 회수된다.
- **선행 가드**: 그 주 **토요일을 대상으로 한 day-end 배치(`routineDayEndJob`)가 완료되지 않았으면 job을 시작하지 않고** 다음 트리거로 미룬다(토요일 `FAILED`가 다 찍힌 뒤에만 집계해야 주 전체를 로그 단독 소싱해도 정확). LLM stub 환경도 마찬가지로 시작하지 않는다.
- **대상 사용자**: 그 주 `routine_logs`(`COMPLETED`/`FAILED`, 삭제 루틴 제외) 1건 이상 보유 + 탈퇴(익명화) 회원 제외. **로그 0건이면 생성 skip**(placeholder 저장 안 함). 그 주 회고가 이미 있으면 skip.
- **처리 단위**: 사용자 1명 = 트랜잭션 1개(chunk 1). LLM 호출이 트랜잭션 안에서 일어나므로 커넥션 점유를 사용자 단위로 끊고, 실패한 사용자만 skip한다(집계 오류·unique 충돌 등, 상한 50건). skip된 사용자·원인은 warn 로그로 남기고 job은 완료로 종결한다. 선행 가드 실패는 job 미시작이라 skip 카운트와 무관.
- **멱등성**: 주당 job instance 1개(`weekStart` 파라미터) + unique(`user_id`, `week_start_date`)로 재실행·중복 실행에도 회고가 두 번 생기지 않는다. 늦은 완료로 그 주 로그 상태가 뒤집혀도 회고는 갱신하지 않는다.
- **알림**: 회고 완성 푸시 없음(후속 — 알림 도메인 협의).

## 회고 조회 (`weekly_reports`) — 예정

- 회고 목록·상세 조회는 이슈 #287에서 확정한다(본인 소유 회고만, 목록은 `week_start_date` 내림차순 — unique(`user_id`, `week_start_date`) 인덱스가 커버). `stats_json`·`sections_json` 스키마는 조회 응답에도 그대로 쓰인다(배치·API 공유 계약). 응답 필드 확정 시 [api.md](api.md)에 반영한다.

## 탈퇴 회원 (회원 도메인 dependency)

- 탈퇴(익명화) 회원은 생성 대상에서 제외한다.
- 탈퇴 잔여 데이터 하드 파기 시 `weekly_reports`도 함께 삭제한다 — 루틴 로그·스트릭·목표·닉네임/bio로 만든 파생 데이터라 원본과 같이 지운다.
