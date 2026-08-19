# 알림 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

## 디바이스 토큰

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `POST /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 등록 | req: `token`(필수, 최대 255자), `platform`(필수, `IOS`/`ANDROID`) / resp: 204 | `user_device_token` |
| `DELETE /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 삭제 | query: `token`(필수, 최대 255자) / resp: 204 | `user_device_token` |

- 멀티디바이스 허용: 사용자당 토큰 여러 개(`user_device_token.token` UNIQUE).
- 등록은 멱등: 같은 `token` 재등록은 `updated_at`만 갱신. 다른 사용자가 등록했던 `token`이면 소유자가 현재 로그인한 사용자로 이전된다(기기 재로그인 케이스).
- 삭제는 쿼리 파라미터 `token`이 본인 소유일 때만 허용(소유권 guard). 미존재·타인 소유 모두 404 `DEVICE_TOKEN_NOT_FOUND`로 통일한다(존재 여부 노출 회피). 필수·길이 제약 위반은 400 `VALIDATION_FAILED`. 로그아웃 시 프론트가 호출한다.
- 무효 토큰(FCM `UNREGISTERED`/`INVALID_ARGUMENT` 응답) 정리는 발송 쪽(FCM 발송 인프라)에서 처리한다.

## 알림 목록 · 읽음 처리

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/notifications` | 내 알림 목록 조회 (커서) | query: `cursor`?, `size`(기본 20·최대 50) / resp: `items[]`(`notificationId`, `type`, `title`, `body`, `isRead`, `createdAt`), `nextCursor`, `hasNext` | `notification` |
| `PATCH /api/v1/notifications/{notificationId}/read` | 알림 개별 읽음 처리 | resp: 204 | `notification` |
| `PATCH /api/v1/notifications/read-all` | 알림 전체 읽음 처리 | resp: 204 | `notification` |

- 목록은 커서 방식(방명록 컨벤션 동일) — `cursor`는 이전 응답의 `nextCursor`, 첫 요청은 생략. 최신순(id desc).
- 개별 읽음은 본인 알림만(소유권 guard: `user_id`). 존재하지 않거나 타인 소유면 404(`NOTIFICATION_NOT_FOUND`)로 통일. 이미 읽음이면 멱등(에러 아님).
- 전체 읽음은 본인의 `is_read = false` 전체를 bulk update.
- 읽음 해제(unread 되돌리기)는 없다.
- 후속(비차단): 안 읽은 알림 개수(badge) 엔드포인트는 프론트 요청 시 별도 확정.

## 알림 설정

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/users/me/notification-settings` | 내 알림 설정 조회 | resp: `all`, `reminder`, `house` (전부 boolean) | `notification_setting` |
| `PATCH /api/v1/users/me/notification-settings` | 내 알림 설정 부분 변경 | req: `all`?, `reminder`?, `house`? (전부 optional boolean) / resp: 변경 반영된 전체 설정(GET과 동일 형태) | `notification_setting` |

- 설정 단위는 개별 `NotificationType`이 아니라 **설정 그룹**(`NotificationSettingType`)이다: `ALL`(전체 마스터) / `REMINDER`(리마인더) / `HOUSE`(집 알림). 그룹 매핑은 `REMINDER` ← `ROUTINE_REMINDER`·`TODO_REMINDER`, `HOUSE` ← `HOUSE_KICK`·`FRIEND_CHEER`·`HOUSE_MISSION_ACHIEVED`·`HOUSE_MEMBER_JOINED`·`HOUSE_MEMBER_LEFT`.
- **행 없음 = ON**이 기본값이다. 신규 가입자는 설정 행이 0개이고 전부 켜진 것으로 조회된다. off로 바꿀 때만 행이 생긴다.
- off 범위는 **FCM push만 차단**이다. 알림 내역(`notification`) 저장은 설정과 무관하게 항상 수행되므로 목록·읽음 API 동작은 영향받지 않는다.
- 마스터 `all`이 off면 그룹 설정과 무관하게 모든 push가 차단된다. 이때도 그룹별 값은 보존되어, `all`을 다시 on으로 되돌리면 이전 그룹 설정이 그대로 적용된다.
- PATCH는 부분 전송이다 — 바꿀 필드만 담아 보내고 생략한 필드는 기존 값이 유지된다. 세 필드가 모두 없으면 400(`VALIDATION_FAILED`).
- `me` path이므로 JWT의 userId로만 조회·변경한다(소유권 guard 자동).
- 새 그룹이 필요해지면 `NotificationSettingType`에 상수 추가 + 응답 필드 추가만 하면 되고 table migration은 필요 없다. `NotificationType`은 소속 그룹을 생성자 인자로 받아 새 알림 타입 추가 시 그룹 지정이 컴파일 타임에 강제된다.
- 발송 게이트는 push가 나가는 **모든 경로**에 적용된다. 공용 진입점 `NotificationService.send(...)`의 push 경로뿐 아니라, 이 진입점을 거치지 않고 batch worker가 직접 발송하는 리마인드(`ROUTINE_REMINDER`·`TODO_REMINDER`)도 발송 직전에 같은 판정을 거친다. 즉 `REMINDER` 그룹 off와 마스터 `all` off는 리마인드 push에도 그대로 동작한다.
- 판정 규칙의 정본은 domain 모듈의 `NotificationPushPolicy` 하나이고 user-api·batch가 이를 공유한다: 마스터 `ALL`이 off면 그룹 설정과 무관하게 차단, 설정 행이 없으면 ON으로 본다.
- 설정으로 차단된 리마인드도 알림 내역(`notification`) 저장은 그대로이고 `push_status`만 `BLOCKED`로 종결된다(FCM 호출 없음). 설정을 꺼도 알림함 목록에는 남는다.

## FCM 발송 인프라 (내부, 신규 엔드포인트 없음)

공용 진입점 `NotificationService.send(userId, content[, refId])` — `content`는 `NotificationContent`(type·title·body) 레코드이고 문구는 `NotificationMessages` 팩토리가 소유한다. 알림 내역을 `notification` 테이블에 호출 트랜잭션에서 저장(동기)하고, push 발송은 AFTER_COMMIT 이벤트 리스너가 트랜잭션 밖(`NOT_SUPPORTED`)에서 비동기로 트리거한다 — 내역은 항상 남고 push는 best-effort. `refId`는 발송 원인 리소스 ID(예: 리마인드면 routineId, 입주·퇴거면 membershipId)로 중복 발송 판정에 쓰며, 생략하면 null.

- `type`(`NotificationType`): `HOUSE_KICK`, `ROUTINE_REMINDER`, `TODO_REMINDER`, `FRIEND_CHEER`, `HOUSE_MISSION_ACHIEVED`, `HOUSE_MEMBER_JOINED`, `HOUSE_MEMBER_LEFT`. 루틴 리마인드(`ROUTINE_REMINDER`)·투두 리마인드(`TODO_REMINDER`) 발송 트리거는 공용 batch worker(`reminderJob`)로 구현됨(5분 주기, 같은 분 재실행은 중복 발송 방지로 스킵; 상세는 아래 스케줄러 절). 집 멤버 응원(`FRIEND_CHEER`)은 응원 API(house 도메인)가 진입점 `send(...)`를 응원 저장과 같은 트랜잭션에서 직접 호출한다(`refId` = cheerId — 내역 저장은 동기, push는 위 AFTER_COMMIT 경로로 비동기). 단체 미션 달성(`HOUSE_MISSION_ACHIEVED`)은 미션 기여 공용부(`HouseMissionService.recordContribution` — 기여 API와 **연동 루틴 완료의 자동 기여 양쪽**)가 미션 행 락 트랜잭션 안에서 진입점 `send(...)`를 직접 호출한다 — 합산이 이번 기여로 처음 목표치에 도달한 순간(직전 합산 < target && 이후 ≥ target) 1회, 집 활성 멤버 전원(마지막 기여자 본인 포함)에게 발송한다. **WEEKLY 미션 한정** — DAILY 미션의 일일 달성 분기는 이 알림을 보내지 않는다. `claim`(보상 수령) 시점에는 발송하지 않는다. `refId` = missionId. 문구: 제목 "단체 미션 달성!" / 본문 "'{미션명}' 미션이 목표를 달성했어요. 보상을 받아보세요!". 중복 방지는 별도 dedupe 쿼리 없이 미션 행 락 하의 "처음 도달" 조건 판정으로 충분하다. 입주(`HOUSE_MEMBER_JOINED`)·퇴거(`HOUSE_MEMBER_LEFT`)는 가입 확정(초대코드·신청 수락 공통 경로)·탈퇴 트랜잭션에서 나머지 ACTIVE 멤버 전원에게 발송한다 — `refId` = 해당 membership id. 문구: "새 멤버 입주" / "{닉네임}님이 집에 입주했어요.", "멤버 퇴거" / "{닉네임}님이 집을 떠났어요.". 신규 엔드포인트 없음. 강퇴(`HOUSE_KICK`) 알림 트리거는 미구현(후속 — enum 값만 존재).
- **수신자가 동거 봇 계정(`users.is_bot`)이면 진입점에서 저장·push 모두 생략한다** — 알림 내역(`notification`) 행도 남기지 않는다(응원·입주/퇴거·미션 달성 등 호출처 공통, 봇은 알림을 읽을 주체가 없음). 리마인드는 진입점을 거치지 않으므로 batch 후보 조회 단계에서 봇 루틴·투두를 제외한다(아래 스케줄러 절). 봇이 **주체**인 집 이동에도 알림이 없다 — 온보딩 기본 집 봇 자동 입주는 `HOUSE_MEMBER_JOINED`를, 자리 양보·해체로 봇이 나가는 것은 `HOUSE_MEMBER_LEFT`를 발송하지 않는다(사람 입주·탈퇴에 대한 기존 발송은 그대로 → [house/features.md](../house/features.md) "동거 봇 거주"). 봇 계정 정의는 [member/features.md](../member/features.md) "동거 봇 계정".
- 등록된 토큰(`user_device_token`) 전체로 멀티캐스트 발송하고(500개 단위 청크 분할), FCM이 `UNREGISTERED`/`INVALID_ARGUMENT`로 응답한 token은 삭제한다. 멀티캐스트 호출 자체가 예외로 죽으면 그 청크 전체를 실패로 집계하되 무효 토큰 삭제는 하지 않는다.
- iOS 발송은 FCM+APNs 릴레이 방식이다(APNs 직접 연동 없음). 발송 메시지에 `ApnsConfig`(aps `sound = "default"`)를 포함해 iOS 알림이 무음으로 도착하지 않게 한다. badge 카운트는 MVP 제외. Android 쪽 메시지 형태는 변경 없음(기존 `Notification` title/body 그대로), 디바이스 토큰 API·스키마도 변경 없음. APNs 인증 키(.p8)는 Firebase Console의 Apple 앱 구성에 등록한다(콘솔 작업, 키 파일 커밋 금지).
- 발송 결과는 `notification.push_status`(`PENDING`/`SENT`/`BLOCKED`/`FAILED`)로 추적한다: 저장 시 `PENDING`, 발송 후 등록 토큰 중 1개 이상 실제 전송에 성공하면 `SENT`, 사용자가 알림 설정을 꺼서 발송하지 않으면 `BLOCKED`, 전부 실패·발송 중 예외·등록된 토큰 없음이면 `FAILED`. `BLOCKED`는 발송 실패가 아니라 설정에 따른 정상 종결이므로 `FAILED`와 구분한다(발송 실패율 지표에 사용자 설정이 섞이지 않게 함). `FAILED` 재시도는 없다(MVP). 상태 갱신은 알림 목록 응답에 노출하지 않는다.
- firebase 서비스 계정 JSON은 환경변수(`FIREBASE_CREDENTIALS_PATH`)/외부 경로로 주입한다(커밋 금지). 발송 활성화는 프로필이 아니라 자격증명 주입 여부 기준 — 미주입 환경은 실제 발송 없이 stub으로 동작하고, 로컬도 자격증명을 주입하면 실발송된다. 단 **`prod` 프로필에서 자격증명 미주입이면 stub으로 조용히 뜨지 않고 기동에 실패**한다(fail-fast). 테스트는 항상 stub으로 고정된다.
- 브로커(RabbitMQ/Kafka)는 아직 도입하지 않는다(다중 인스턴스·발송량 증가 시 재검토).

## 리마인드 스케줄러 (루틴·투두, 내부, 신규 엔드포인트 없음)

예약 시각이 도래한 당일 미완료 루틴과 마감 시각이 도래한 미완료 투두에 FCM 리마인드를 발송한다. 공용 batch worker(`reminderJob`)가 **5분 주기**(`@Scheduled` cron `0 */5 * * * *`, KST `Asia/Seoul`)로 실행되어 실행 시각의 분(`targetMinute`)을 대상으로 잡는다. 한 job 안에서 루틴 적재 → 투두 적재 → 발송 순으로 진행한다(별도 job·트리거 없음). 단일 인스턴스 전제. 리마인드는 공용 진입점 `NotificationService.send(...)`를 거치지 않고 batch worker가 알림 내역 저장과 push 발송을 직접 수행하므로, 알림 설정 게이트도 batch의 push 단계에서 별도로 적용된다(위 "알림 설정" 절).

### 루틴 리마인드 (`ROUTINE_REMINDER`)

- 발송 대상 조건(모두 충족): `routines.status = ACTIVE` + 미삭제(`deleted_at IS NULL`) + `scheduled_time`이 `targetMinute`과 일치 + 오늘 요일이 반복 규칙(`repeat_days`)에 해당(오늘 현황 판정과 동일 로직 재사용) + 당일(`routine_logs.routine_date = 오늘`) COMPLETED 로그 없음 + 오늘 미발송.
- `scheduled_time`은 **5분 단위만 허용**한다(서버 검증 — 위반 시 400, routine-todo 도메인 참고). 실행이 5분 주기 + 해당 분 정확 일치 매칭이지만 값이 5분 단위로 보장되므로 매칭 누락이 없다.
- 중복 발송 방지: 같은 분(`targetMinute`) 재실행은 batch job instance 중복으로 스킵. 그리고 `notification`에 `type = ROUTINE_REMINDER` + `ref_id = routineId` + 오늘(KST) 생성 건이 있으면 재발송하지 않는다.
- 문구: 고정 템플릿(제목 "루틴 리마인드", 본문 "『{루틴명}』 할 시간이에요!"). 프론트 협의로 변경 가능, LLM 문구 생성은 후속.
- 알림 내역 저장과 push 발송은 batch 단계로 분리돼 있고, push 단계에서 사용자 알림 설정으로 차단된 건은 FCM 호출 없이 `push_status = BLOCKED`로 종결한다. 예외 격리는 **FCM 발송 호출 실패에 한정**된다 — 개별 건의 FCM 발송 예외는 나머지 발송을 막지 않지만, 토큰 조회·상태 갱신 예외는 해당 청크 실패로 이어진다(적재 스텝의 skip limit 50과 달리 발송 스텝에는 skip 정책이 없음).

### 투두 리마인드 (`TODO_REMINDER`)

- 발송 시점: `dueDate = 오늘(KST)` AND `dueTime = targetMinute` 정각에 발송한다. 루틴과 같은 5분 주기 job을 공유하며, `dueTime`은 서버에서 5분 단위로 검증되므로 정확 일치 매칭에 누락이 없다.
- 발송 대상 조건(모두 충족): `status = PENDING` + 미삭제(`deleted_at IS NULL`) + `dueDate`·`dueTime` 모두 존재 + 오늘 미발송. `dueDate` 없이 `dueTime`만 있는 투두는 알림 대상에서 제외한다.
- 중복 발송 방지: `notification`에 `type = TODO_REMINDER` + `ref_id = todoId` + 오늘(KST) 생성 건이 있으면 재발송하지 않는다(루틴 리마인드와 동일 판정).
- 문구: 고정 템플릿(제목 "투두 리마인드", 본문 "『{투두 제목}』 할 시간이에요!" — 루틴과 동일 형태로 통일됨).
- 알림 내역 저장과 push 발송은 루틴과 같은 batch 단계를 재사용하며, `push_status` 규칙(`PENDING`/`SENT`/`BLOCKED`/`FAILED`, 알림 설정으로 차단된 건은 `BLOCKED`로 종결, 재시도 없음)과 예외 격리 범위(FCM 발송 호출 실패에 한정)도 동일하게 적용한다.
- job 결합: 루틴 적재 스텝이 실패(skip limit 초과)하면 투두 적재 스텝도 돌지 않는 결합은 수용한다(MVP).

### 후속

- 후속(비차단): 다중 인스턴스 배포 시 스케줄러 중복 실행 방지(ShedLock 등), LLM 리마인드 문구 생성.

## 연동 (다른 도메인)

- 등록된 토큰은 FCM 발송 인프라(`NotificationService.send(...)`)가 발송 대상 조회에 사용한다.
