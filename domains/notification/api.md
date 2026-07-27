# 알림 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

## 디바이스 토큰

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `POST /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 등록 | req: `token`, `platform`(`IOS`/`ANDROID`) | `user_device_token` |
| `DELETE /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 삭제 | query: `token` | `user_device_token` |

- 멀티디바이스 허용: 사용자당 토큰 여러 개(`user_device_token.token` UNIQUE).
- 등록은 멱등: 같은 `token` 재등록은 `updated_at`만 갱신. 다른 사용자가 등록했던 `token`이면 소유자가 현재 로그인한 사용자로 이전된다(기기 재로그인 케이스).
- 삭제는 쿼리 파라미터 `token`이 본인 소유일 때만 허용(소유권 guard). 로그아웃 시 프론트가 호출한다.
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

공용 진입점 `NotificationService.send(userId, type, title, body[, refId])` — 알림 내역을 `notification` 테이블에 저장(동기)하고 FCM push를 비동기로 발송한다. push가 실패해도 내역은 남는다(best-effort). `refId`는 발송 원인 리소스 ID(예: 리마인드면 routineId)로 중복 발송 판정에 쓰며, 생략하면 null.

- `type`(`NotificationType`): `HOUSE_KICK`, `ROUTINE_REMINDER`, `FRIEND_CHEER`. 루틴 리마인드(`ROUTINE_REMINDER`) 발송 트리거는 별도 batch worker로 구현됨(5분 주기, 같은 분 재실행은 중복 발송 방지로 스킵; 상세는 아래 스케줄러 절). 집 멤버 응원(`FRIEND_CHEER`)은 응원 API(house 도메인)가 진입점 `send(...)`를 응원 저장과 같은 트랜잭션에서 직접 호출한다(`refId` = cheerId; 도메인 알림은 이 직접 호출이 표준 — AFTER_COMMIT 리스너 방식은 내역 유실/이중 커넥션 문제로 배제). 강퇴(`HOUSE_KICK`) 알림 트리거는 후속(house 도메인 이벤트 발행 필요).
- 등록된 토큰(`user_device_token`) 전체로 멀티캐스트 발송하고, FCM이 `UNREGISTERED`/`INVALID_ARGUMENT`로 응답한 token은 삭제한다.
- 발송 결과는 `notification.push_status`(`PENDING`/`SENT`/`BLOCKED`/`FAILED`)로 추적한다: 저장 시 `PENDING`, 발송 후 등록 토큰 중 1개 이상 실제 전송에 성공하면 `SENT`, 사용자가 알림 설정을 꺼서 발송하지 않으면 `BLOCKED`, 전부 실패·발송 중 예외·등록된 토큰 없음이면 `FAILED`. `BLOCKED`는 발송 실패가 아니라 설정에 따른 정상 종결이므로 `FAILED`와 구분한다(발송 실패율 지표에 사용자 설정이 섞이지 않게 함). `FAILED` 재시도는 없다(MVP). 상태 갱신은 알림 목록 응답에 노출하지 않는다.
- firebase 서비스 계정 JSON은 환경변수(`FIREBASE_CREDENTIALS_PATH`)/외부 경로로 주입한다(커밋 금지). 발송 활성화는 프로필이 아니라 자격증명 주입 여부 기준 — 미주입 환경은 실제 발송 없이 stub으로 동작하고, 로컬도 자격증명을 주입하면 실발송된다. 테스트는 항상 stub으로 고정된다.
- 브로커(RabbitMQ/Kafka)는 아직 도입하지 않는다(다중 인스턴스·발송량 증가 시 재검토).

## 루틴 리마인드 스케줄러 (내부, 신규 엔드포인트 없음)

예약 시각이 도래한 당일 미완료 루틴에 FCM 리마인드를 발송한다. batch worker가 **5분 주기**(`@Scheduled` cron `0 */5 * * * *`, KST `Asia/Seoul`)로 실행되어 실행 시각의 분(`targetMinute`)을 대상으로 잡는다. 단일 인스턴스 전제. 리마인드는 공용 진입점 `NotificationService.send(...)`를 거치지 않고 batch worker가 알림 내역 저장과 push 발송을 직접 수행하므로, 알림 설정 게이트도 batch의 push 단계에서 별도로 적용된다(위 "알림 설정" 절).

- 발송 대상 조건(모두 충족): `routines.status = ACTIVE` + 미삭제(`deleted_at IS NULL`) + `scheduled_time`이 `targetMinute`과 일치 + 오늘 요일이 반복 규칙(`repeat_days`)에 해당(오늘 현황 판정과 동일 로직 재사용) + 당일(`routine_logs.routine_date = 오늘`) COMPLETED 로그 없음 + 오늘 미발송.
- `scheduled_time`은 **5분 단위만 사용**한다(앱 입력이 5분 단위로 제한). 5분 주기 실행 + 해당 분 정확 일치 매칭이므로 5분 단위가 아닌 시각은 리마인드가 발송되지 않는다 — 서버측 검증은 아직 없음(앱 제한에 의존).
- 중복 발송 방지: 같은 분(`targetMinute`) 재실행은 batch job instance 중복으로 스킵. 그리고 `notification`에 `type = ROUTINE_REMINDER` + `ref_id = routineId` + 오늘(KST) 생성 건이 있으면 재발송하지 않는다.
- 문구: 고정 템플릿(제목 "루틴 리마인드", 본문 "『{루틴명}』 할 시간이에요!"). 프론트 협의로 변경 가능, LLM 문구 생성은 후속.
- 알림 내역 저장과 push 발송은 batch 단계로 분리돼 있고, push 단계에서 사용자 알림 설정으로 차단된 건은 FCM 호출 없이 `push_status = BLOCKED`로 종결한다. 개별 루틴 발송 실패는 나머지 루틴 발송을 막지 않는다(루틴 단위 예외 격리).
- 후속(비차단): 다중 인스턴스 배포 시 스케줄러 중복 실행 방지(ShedLock 등), LLM 리마인드 문구 생성.

## 연동 (다른 도메인)

- 등록된 토큰은 FCM 발송 인프라(`NotificationService.send(...)`)가 발송 대상 조회에 사용한다.
