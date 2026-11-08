# 알림 API

> 한국어·영어 표시와 개인 알림 시간대의 공통 계약은 [다국어·시간대](../../global-localization.md)를 따른다. 아래 기존 한국어 문구는 기본 언어 예시다.

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
| `GET /api/v1/notifications` | 내 알림 목록 조회 (커서) | query: `cursor`?, `size`(기본 20·최대 50) / resp: `items[]`(`notificationId`, `type`, `title`, `body`, `isRead`, `createdAt`, `refId`), `nextCursor`, `hasNext` | `notification` |
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
| `GET /api/v1/users/me/notification-settings` | 내 알림 설정 조회 | resp: `all`, `reminder`, `house`, `feed`, `market`, `chat` (전부 boolean) | `notification_setting` |
| `PATCH /api/v1/users/me/notification-settings` | 내 알림 설정 부분 변경 | req: `all`?, `reminder`?, `house`?, `feed`?, `market`?, `chat`? (전부 optional boolean) / resp: 변경 반영된 전체 설정(GET과 동일 형태) | `notification_setting` |

- 설정 단위는 개별 `NotificationType`이 아니라 **설정 그룹**(`NotificationSettingType`)이다: `ALL`(전체 마스터) / `REMINDER`(리마인더) / `HOUSE`(집 알림) / `FEED`(피드 알림) / `MARKET`(거래소 알림) / `CHAT`(채팅 알림). 그룹 매핑은 `REMINDER` ← `ROUTINE_REMINDER`·`TODO_REMINDER`·`WEEKLY_REPORT`·`APP_INACTIVITY_REMINDER`, `HOUSE` ← `HOUSE_KICK`·`FRIEND_CHEER`·`HOUSE_MISSION_ACHIEVED`·`HOUSE_MEMBER_JOINED`·`HOUSE_MEMBER_LEFT`·`HOUSE_JOIN_REQUEST_CREATED`·`HOUSE_JOIN_REQUEST_ACCEPTED`·`HOUSE_JOIN_REQUEST_REJECTED`·`ROOM_COBWEB_CLEANED`, `FEED` ← `FEED_COMMENT`, `MARKET` ← `MARKET_SELL_FILLED`·`MARKET_BUY_FILLED`·`MARKET_BID_PLACED`, `CHAT` ← `CHAT_MESSAGE`, `SERVICE`(서비스 메시지) ← `BUG_REPORT_REPLY`·`ADMIN_NOTICE`. `SERVICE` 는 설정 UI·API 에 노출하지 않는다 — off 행이 생길 수 없어 사실상 마스터 `ALL` off 만 차단한다(문의 답장은 리마인드를 꺼둔 사용자에게도 가야 함).
- **행 없음 = ON**이 기본값이다. 신규 가입자는 설정 행이 0개이고 전부 켜진 것으로 조회된다. off로 바꿀 때만 행이 생긴다.
- off 범위는 **FCM push만 차단**이다. 알림 내역(`notification`) 저장은 설정과 무관하게 항상 수행되므로 목록·읽음 API 동작은 영향받지 않는다. 단 푸시 전용 타입(`CHAT_MESSAGE`)은 원래 내역을 저장하지 않으므로 off면 아무것도 남지 않는다.
- 마스터 `all`이 off면 그룹 설정과 무관하게 모든 push가 차단된다. 이때도 그룹별 값은 보존되어, `all`을 다시 on으로 되돌리면 이전 그룹 설정이 그대로 적용된다.
- PATCH는 부분 전송이다 — 바꿀 필드만 담아 보내고 생략한 필드는 기존 값이 유지된다. 여섯 필드(`all`·`reminder`·`house`·`feed`·`market`·`chat`)가 모두 없으면 400(`VALIDATION_FAILED`).
- `me` path이므로 JWT의 userId로만 조회·변경한다(소유권 guard 자동).
- 새 그룹이 필요해지면 `NotificationSettingType`에 상수 추가 + 응답 필드 추가만 하면 되고 table migration은 필요 없다. `NotificationType`은 소속 그룹을 생성자 인자로 받아 새 알림 타입 추가 시 그룹 지정이 컴파일 타임에 강제된다.
- 발송 게이트는 push가 나가는 **모든 경로**에 적용된다. 공용 진입점 `NotificationService.send(...)`의 push 경로뿐 아니라, 이 진입점을 거치지 않고 batch worker가 직접 발송하는 리마인드(`ROUTINE_REMINDER`·`TODO_REMINDER`)·주간 회고 도착(`WEEKLY_REPORT`)도 발송 직전에 같은 판정을 거친다. 즉 `REMINDER` 그룹 off와 마스터 `all` off는 리마인드·주간 회고 push에도 그대로 동작한다.
- 판정 규칙의 정본은 domain 모듈의 `NotificationPushPolicy` 하나이고 user-api·batch·admin-api(버그 제보 답장 #348)가 이를 공유한다: 마스터 `ALL`이 off면 그룹 설정과 무관하게 차단, 설정 행이 없으면 ON으로 본다.
- 설정으로 차단된 리마인드도 알림 내역(`notification`) 저장은 그대로이고 `push_status`만 `BLOCKED`로 종결된다(FCM 호출 없음). 설정을 꺼도 알림함 목록에는 남는다.

## FCM 발송 인프라 (내부, 신규 엔드포인트 없음)

공용 진입점 `NotificationService.send(userId, content[, refId])` — `content`는 `NotificationContent`(type·title·body) 레코드이고 문구는 `NotificationMessages` 팩토리가 소유한다. 알림 내역을 `notification` 테이블에 호출 트랜잭션에서 저장(동기)하고, push 발송은 AFTER_COMMIT 이벤트 리스너가 트랜잭션 밖(`NOT_SUPPORTED`)에서 비동기로 트리거한다 — 내역은 항상 남고 push는 best-effort. `refId`는 발송 원인 리소스 ID(예: 리마인드면 routineId, 입주·퇴거면 membershipId)로 중복 발송 판정에 쓰며, 생략하면 null.

- `type`(`NotificationType`): `FEED_COMMENT`, `HOUSE_KICK`, `ROUTINE_REMINDER`, `TODO_REMINDER`, `FRIEND_CHEER`, `HOUSE_MISSION_ACHIEVED`, `HOUSE_MEMBER_JOINED`, `HOUSE_MEMBER_LEFT`, `HOUSE_JOIN_REQUEST_CREATED`, `HOUSE_JOIN_REQUEST_ACCEPTED`, `HOUSE_JOIN_REQUEST_REJECTED`, `ROOM_COBWEB_CLEANED`, `WEEKLY_REPORT`, `BUG_REPORT_REPLY`, `ADMIN_NOTICE`, `APP_INACTIVITY_REMINDER`, `MARKET_SELL_FILLED`, `MARKET_BUY_FILLED`, `MARKET_BID_PLACED`. 거래소 알림 3종은 아래 "거래소 알림" 절 참고. 루틴 리마인드(`ROUTINE_REMINDER`)·투두 리마인드(`TODO_REMINDER`) 발송 트리거는 공용 batch worker(`reminderJob`)로 구현됨(5분 주기, 같은 분 재실행은 중복 발송 방지로 스킵; 상세는 아래 스케줄러 절). 집 멤버 응원(`FRIEND_CHEER`)은 응원 API(house 도메인)가 진입점 `send(...)`를 응원 저장과 같은 트랜잭션에서 직접 호출한다(`refId` = cheerId — 내역 저장은 동기, push는 위 AFTER_COMMIT 경로로 비동기). 단체 미션 달성(`HOUSE_MISSION_ACHIEVED`)은 미션 기여 공용부(`HouseMissionService.recordContribution` — 기여 API와 **연동 루틴 완료의 자동 기여 양쪽**)가 미션 행 락 트랜잭션 안에서 진입점 `send(...)`를 직접 호출한다 — 합산이 이번 기여로 처음 목표치에 도달한 순간(직전 합산 < target && 이후 ≥ target) 1회, 집 활성 멤버 전원(마지막 기여자 본인 포함)에게 발송한다. **WEEKLY 미션 한정** — DAILY 미션의 일일 달성 분기는 이 알림을 보내지 않는다. `claim`(보상 수령) 시점에는 발송하지 않는다. `refId` = missionId. 문구: 제목 "단체 미션 달성!" / 본문 "'{미션명}' 미션이 목표를 달성했어요. 보상을 받아보세요!". 중복 방지는 별도 dedupe 쿼리 없이 미션 행 락 하의 "처음 도달" 조건 판정으로 충분하다. 입주(`HOUSE_MEMBER_JOINED`)·퇴거(`HOUSE_MEMBER_LEFT`)는 가입 확정(초대코드·신청 수락 공통 경로)·탈퇴 트랜잭션에서 나머지 ACTIVE 멤버 전원에게 발송한다 — `refId` = 해당 membership id. 문구: "새 멤버 입주" / "{닉네임}님이 집에 입주했어요.", "멤버 퇴거" / "{닉네임}님이 집을 떠났어요.". 신규 엔드포인트 없음. 입주 신청 수명주기 알림 3종: 신청 도착(`HOUSE_JOIN_REQUEST_CREATED`)은 신청 생성·재오픈(탐색 신청·구성원 개인 코드 참여 공통) 트랜잭션에서 **방장에게** 발송한다 — 문구: "입주 신청 도착" / "{신청자 닉네임}님이 '{집 이름}'에 입주를 신청했어요. 수락하면 입주가 확정돼요."(닉네임 null 이면 "이웃"으로 폴백). 같은 수신자·타입·본문 조합은 **1시간 안에 재발송하지 않는다** — 철회→재신청(신청 행이 새로 생겨 `refId`가 바뀜)·거절→재신청(reopen)을 반복해 방장에게 push 를 무제한 밀어넣는 증폭 방어이며, 억제되는 것은 알림뿐이고 신청 자체는 생성된다. `refId` = requestId 인데 신청자가 철회하면 대상 신청 행이 하드 삭제되므로 **알림의 refId 가 삭제된 신청을 가리킬 수 있다** — 프론트는 신청 목록 화면 폴백을 두어야 한다. 수락(`HOUSE_JOIN_REQUEST_ACCEPTED` — "입주 신청 승인" / "'{집 이름}' 입주 신청이 승인됐어요.")·거절(`HOUSE_JOIN_REQUEST_REJECTED` — "입주 신청 거절" / "'{집 이름}' 입주 신청이 거절됐어요.")은 각 처리 트랜잭션에서 **신청자 본인에게** 발송한다(`refId` = requestId). 방 거미줄 청소(`ROOM_COBWEB_CLEANED`) 트리거·문구는 [house/api.md](../house/api.md) 거미줄 청소 항목 참고. 강퇴(`HOUSE_KICK`) 알림 트리거는 미구현(후속 — enum 값만 존재). 주간 회고 도착(`WEEKLY_REPORT`)은 주간 배치(`weeklyReportPushJob`)가 발송한다 — 회고 생성 배치(일요일 00:30 KST)와 **분리된 발송 시각**(일요일 20:00 KST) 이후 매시 트리거가 가장 최근 끝난 주의 회고에 대해 알림을 적재·발송하며(리마인드와 같은 batch 발송 경로 재사용, 진입점 미경유), `refId` = 주간 회고 id로 중복 발송을 막는다. 대상은 항상 가장 최근 끝난 주뿐이라 서버가 오래 멈췄다 살아나도 지난 주들의 뒤늦은 push는 나가지 않는다. 문구: 제목 "지난주 루틴 회고가 도착했어요" / 본문 "지난주 루틴 {N}회 중 {M}회를 완료했어요. 이번 주 계획 전에 확인해 보세요."(서버 집계 수치만 사용, LLM 문구 미사용). 설정 그룹은 `REMINDER`. 버그 제보 답장(`BUG_REPORT_REPLY`, #348)은 **admin-api 가 발송하는 첫 타입**이다 — 어드민 답장 등록 트랜잭션에서 알림 내역을 저장하고(`refId` = 제보 id), push 는 커밋 후 **동기** 발송한다(빈도가 낮아 어드민 응답 지연 감수). 별도 부팅 앱이라 user-api 진입점을 재사용할 수 없어 같은 계약(내역 저장은 동기·항상, push 는 best-effort)의 미러를 admin-api 에 두고, 게이트 판정은 공용 `NotificationPushPolicy` 를 그대로 쓴다. 문구: 제목 "보내주신 제보에 답변이 도착했어요" / 본문 = 답장 내용 200자 미리보기(알림함 body 겸용, 전문은 내 제보 목록에서). 설정 그룹은 `SERVICE`. admin-api 배포에도 `FIREBASE_CREDENTIALS_PATH` 주입이 필요하다(미주입이면 stub 발송).
- 등록된 토큰(`user_device_token`) 전체로 멀티캐스트 발송하고(500개 단위 청크 분할), FCM이 `UNREGISTERED`/`INVALID_ARGUMENT`로 응답한 token은 삭제한다. 멀티캐스트 호출 자체가 예외로 죽으면 그 청크 전체를 실패로 집계하되 무효 토큰 삭제는 하지 않는다.
- iOS 발송은 FCM+APNs 릴레이 방식이다(APNs 직접 연동 없음). 발송 메시지에 `ApnsConfig`(aps `sound = "default"`)를 포함해 iOS 알림이 무음으로 도착하지 않게 한다. badge 카운트는 MVP 제외. Android 쪽 메시지 형태는 변경 없음(기존 `Notification` title/body 그대로), 디바이스 토큰 API·스키마도 변경 없음. APNs 인증 키(.p8)는 Firebase Console의 Apple 앱 구성에 등록한다(콘솔 작업, 키 파일 커밋 금지).
- 발송 결과는 `notification.push_status`(`NOT_REQUESTED`/`PENDING`/`SENT`/`BLOCKED`/`FAILED`)로 추적한다: 푸시를 요청하지 않은 운영자 알림은 `NOT_REQUESTED`로 저장하고 FCM을 호출하지 않는다. 푸시 요청이 있으면 저장 시 `PENDING`, 등록 토큰 중 1개 이상 FCM 접수에 성공하면 `SENT`, 사용자가 알림 설정을 꺼서 발송하지 않으면 `BLOCKED`, 전부 실패·발송 중 예외·등록된 토큰 없음이면 `FAILED`. `BLOCKED`는 발송 실패가 아니라 설정에 따른 정상 종결이므로 `FAILED`와 구분한다(발송 실패율 지표에 사용자 설정이 섞이지 않게 함). `SENT`는 기기 수신이나 사용자 열람을 보장하지 않는다. `FAILED` 푸시 재시도는 없다(MVP). 상태 갱신은 알림 목록 응답에 노출하지 않는다.
- **푸시 전용 타입**: `CHAT_MESSAGE`(설정 그룹 `CHAT`)는 알림함에 저장하지 않는 푸시 전용 타입이라 위 `type` 목록·알림 목록 API에 나오지 않는다. 공용 진입점 `send(...)`는 항상 내역을 저장하므로, 이 타입은 내역 없이 보내는 별도 푸시 전용 경로를 쓴다 — `notification` 행·`push_status` 발송 상태 기록이 없다. 설정 게이트는 같은 `NotificationPushPolicy`를 거친다(`ALL` 또는 `CHAT` off면 차단). 트리거·대상·문구·FCM data는 [채팅 API](../chat/api.md) "푸시 알림" 절을 따른다.
- firebase 서비스 계정 JSON은 환경변수(`FIREBASE_CREDENTIALS_PATH`)/외부 경로로 주입한다(커밋 금지). 발송 활성화는 프로필이 아니라 자격증명 주입 여부 기준 — 미주입 환경은 실제 발송 없이 stub으로 동작하고, 로컬도 자격증명을 주입하면 실발송된다. 단 **`prod` 프로필에서 자격증명 미주입이면 stub으로 조용히 뜨지 않고 기동에 실패**한다(fail-fast). 테스트는 항상 stub으로 고정된다.
- 브로커(RabbitMQ/Kafka)는 아직 도입하지 않는다(다중 인스턴스·발송량 증가 시 재검토).

## 운영자 알림 발송 (`ADMIN_NOTICE`, admin-api)

관리자 화면 `GET /notification-campaigns`에서 초안을 검토하고 명시적으로 승인한 캠페인만 발송한다. 아래 API는 사용자 `/api/v1` API와 별개이며 관리자 세션의 **`ADMIN` 또는 `SUPER_ADMIN`** 역할이 필요하다. 모든 POST는 CSRF 토큰을 요구한다(화면 meta의 토큰과 헤더 이름 사용). 승인자가 작성자와 달라도 권한이 있으면 승인할 수 있고 양쪽 감사 정보를 보존한다.

| method · path | 목적 | 요청 / 응답 |
| --- | --- | --- |
| `GET /admin/notification-campaigns` | 최근 발송/초안 목록 | 최신 50개 summary **배열 자체**(사용자 목록의 `items` envelope와 다름) |
| `GET /admin/notification-campaigns/{id}` | 초안/발송 현황 | summary |
| `POST /admin/notification-campaigns/preview` | 대상 수 미리보기, 저장·발송 없음 | req: `title`, `body`, `audience`, `userIds`, `pushEnabled` / resp: `recipientCount`, `pushAllowedCount`, `blockedCount`, `tokenlessCount`, `pushNotRequestedCount` |
| `POST /admin/notification-campaigns` | 초안과 수신 대상 스냅샷 저장, 발송 없음 | req: 미리보기 필드 + `requestId`(UUID) / resp: 201 summary |
| `POST /admin/notification-campaigns/{id}/send` | 별도 확인 후 승인 | req: `confirmed: true`, `expectedRecipientCount` / resp: 202 summary |

### 입력과 대상 확정

- 제목은 앞뒤 공백 제거 후 1~255자, 본문은 1~1000자다. `audience`는 `SELECTED` / `ALL`이다. 화면 기본은 `SELECTED`, 푸시 `pushEnabled` 기본은 **false**다. 앱 알림함 저장은 항상 수행하고 “푸시도 보내기”는 별도로 선택한다.
- `SELECTED`는 양수 사용자 ID 목록이 필수이며 입력 목록 최대 **1,000개**다. 중복을 제거하고 정렬한다. 없는 ID, 탈퇴 회원, 봇, AI 계정이 섞이면 전체 요청을 400 `VALIDATION_FAILED`로 거절한다. 일부만 조용히 발송하지 않는다.
- `ALL`은 `userIds`가 비어 있어야 하며 미탈퇴 일반 회원만 대상으로 한다. 대상은 최대 **10,000명**이고 초과하면 400이다. 초안 저장 후 가입한 사용자는 기존 캠페인에 추가되지 않는다.
- 미리보기는 그 시점의 대상을 조회할 뿐이다. 초안 저장 시 대상 ID를 `notification_campaign_recipients`에 확정하며, 승인 화면은 저장된 대상 수를 다시 읽어 확인한다. 저장된 수와 `expectedRecipientCount`가 다르면 409 `NOTIFICATION_RECIPIENT_COUNT_CHANGED`다. 실제 처리 시 탈퇴/삭제/봇/AI로 바뀐 수신자는 `SKIPPED`로 남긴다.
- 푸시 미선택 미리보기는 `pushNotRequestedCount=recipientCount`이며 푸시 가능/차단/토큰 없음은 모두 0이다. 푸시 선택 시 `NotificationPushPolicy`로 먼저 차단을 구분하고, 나머지를 토큰 없음과 전송 가능으로 나눈다. 이 수치는 사전 추정이며 실제 발송 직전 설정/토큰 상태와 다를 수 있다.
- `requestId`는 작성자별 멱등 키다. 같은 키와 동일한 정규화 내용/채널/대상 요청은 기존 초안을 반환하고, 다른 내용을 재사용하면 409 `NOTIFICATION_REQUEST_CONFLICT`다. 초안 저장 응답 유실 때 같은 키로 복구한다.

### 승인, 발송과 이력

- 화면은 미리보기 → 초안 저장 → 별도 확인창 → 수신 대상 수와 내용을 확인한 체크 → 발송 순서다. 입력 수정은 이전 미리보기를 무효화한다. 목록 조회, 미리보기, 저장과 Enter 입력은 발송을 호출하지 않는다.
- 캠페인 상태는 `DRAFT` → `SENDING` → `COMPLETED`다. `confirmed=true` 승인만 `SENDING`으로 전환하며 작성자와 실제 승인자/시각을 별도로 남긴다. 재승인은 캠페인을 재시작하거나 최초 승인자를 바꾸지 않는다. 발송 응답 유실 시 GET으로 확인하며 자동 재발송하지 않는다.
- 승인된 캠페인은 admin-api의 저장된 작업 상태에서 처리한다(기본 1초 간격, 최대 10캠페인, 각 25명). 수신자 행 락 안에서 알림 생성과 `CREATED`/알림 ID 기록을 **같은 트랜잭션**으로 커밋해 재기동과 중복 처리에도 알림함을 중복 생성하지 않는다. 커밋된 행은 다시 처리하지 않는다.
- 알림함 저장 전 실패는 롤백 후 수신자 `attempt_count`를 올리고 대기 수신자를 재시도한다. 3회 실패하면 수신자 `FAILED`로 종결한다. 이는 알림 생성 재시도이며 FCM 발송 실패의 재시도와 다르다. 실패/건너뜀도 삭제하지 않고 현황에 남긴다.
- 수신자 대기가 없으면 실패가 있어도 캠페인은 `COMPLETED`가 된다. 이는 **수신자 처리 완료**이고 모든 기기 수신 성공이 아니다. 푸시는 알림 저장 커밋 후 best-effort로 보내며 FCM 실패가 알림함 기록을 지우지 않는다.
- 알림 타입은 `ADMIN_NOTICE`, 설정 그룹은 `SERVICE`, `refId=null`이다. 별도의 SERVICE 토글은 설정 API/UI에 노출하지 않으며 기존 공용 정책을 적용한다. 푸시 미선택은 `NOT_REQUESTED`(FCM 호출 없음), 요청했으나 사용자 설정 차단은 `BLOCKED`, 토큰 없음/전부 실패는 `FAILED`, FCM 한 개 이상 접수는 `SENT`다. FCM 접수는 기기 표시/수신/열람을 보장하지 않는다.
- **혼합 배포 주의**: `ADMIN_NOTICE`와 `NOT_REQUESTED`는 새 Java enum 값이다. 이를 읽는 모든 user-api 인스턴스가 새 버전으로 전환된 뒤에만 관리자 캠페인 발송을 시작한다. 새 enum 행이 저장된 뒤에는 구버전 user-api로 단순 롤백하면 알림 목록 역직렬화가 실패할 수 있으므로, 해당 enum을 읽는 호환 버전을 유지하거나 데이터 호환 대책을 마련해야 한다. 푸시 OFF여도 `ADMIN_NOTICE`/`NOT_REQUESTED` 행이 생기므로 순서 조건은 같다.
- 캠페인 공지는 일반 알림함 title/body로 표시한다. 임의 링크, 이벤트 이동 버튼, 접속 팝업/다시 보지 않기 연동은 이 API에 포함하지 않는다.

summary 공통 필드:

| 필드 | 의미 |
| --- | --- |
| `id`, `title`, `body`, `audience`, `pushEnabled`, `status`, `recipientCount` | 저장된 캠페인 내용과 수신 스냅샷 수 |
| `createdCount` | 알림함 저장 완료 수 |
| `pushSentCount` | FCM 한 개 이상 접수된 알림 수(기기 수가 아님) |
| `pushFailedCount`, `pushBlockedCount`, `pushPendingCount`, `pushNotRequestedCount` | 푸시 실패 / 설정 차단 / 결과 대기 / 푸시 미요청 알림 수 |
| `skippedCount`, `processingFailedCount` | 수신 자격 상실 등 건너뜀 / 알림 생성 재시도 소진 수 |
| `createdAt`, `createdByUsername` | 초안 생성 시각과 작성자 |
| `approvedByUsername`, `approvedAt` | 최초 실제 승인자와 승인 시각(미승인/과거 이력은 null 허용) |

회원 탈퇴 등으로 알림이 삭제되어도 수신자 처리 이력은 남고 `notification_id`는 null이 된다. 따라서 `createdCount`는 과거 저장 완료를 포함하며 현재 알림 행 수와 다를 수 있다. 푸시별 수치는 현재 연결된 알림을 분류한 것이므로 `createdCount`와 별도로 더해 총 수신자 수를 계산하지 않는다. 발송 도중 수치는 변할 수 있다. 미존재 캠페인은 404 `NOTIFICATION_CAMPAIGN_NOT_FOUND`다. 서버 V98은 캠페인/수신자 테이블과 승인 감사 필드를 추가한다. 검증은 로컬 모의 API/H2/fake FCM만 사용하며 실사용자 발송으로 테스트하지 않는다.

## 피드 댓글 알림 (`FEED_COMMENT`)

- 새 댓글의 수신자는 게시물 작성자 1명이다. 본인 댓글·동일 댓글 UUID 재시도는 제외하며, 다른 새 댓글은 각각 알린다. `refId`는 **게시물 ID**다.
- 댓글 저장 트랜잭션에서 `NotificationService.send(...)`를 호출해 알림 내역과 함께 커밋한다. 푸시는 커밋 후 기존 비동기 경로로 보내고, 내역 저장 실패는 댓글도 롤백한다. 푸시 실패는 댓글을 되돌리지 않는다.
- `GET /notifications`의 모든 알림 항목에 nullable `refId`가 추가된다. 타입에 따라 원인 리소스의 종류가 다르므로 `FEED_COMMENT`일 때만 게시물 ID로 사용한다. 기존 알림의 refId 의미는 바꾸지 않는다.
- 피드 FCM data: `{ "type": "FEED_COMMENT", "notificationId": "100", "postId": "42" }` (문자열 값). 다른 기존 공용 알림의 FCM payload는 유지한다.
- 설정 그룹 `FEED`는 GET/PATCH 설정의 `feed` 필드로 관리하며 기본 ON이다. `ALL` 또는 `FEED` off면 알림 내역은 저장하고 push만 `BLOCKED`로 종결한다. `HOUSE`·`REMINDER` off는 피드 알림을 차단하지 않는다. 구버전 앱처럼 PATCH에 `feed`가 없으면 기존 값은 유지된다.
- 수신자의 `users.language` 기준: 한국어 `새 댓글이 달렸어요` / `내 게시물에 새 댓글이 달렸어요. 확인해 보세요!`, 영어 `New comment` / `Someone commented on your post. Take a look!`.
- 닉네임·댓글 원문은 복사하지 않는다. 삭제/탈퇴 후 이미 생성된 일반 안내와 ID는 남을 수 있고, 이동 시 게시물이 404이면 피드 목록으로 돌아간다. 기기에서 이미 수신한 푸시는 회수하지 않는다.
- 새 DB 컬럼은 필요 없다. `notification.type`에 `FEED_COMMENT`, `notification_setting.type`에 `FEED`를 저장한다.

## 거래소 알림 (`MARKET_SELL_FILLED`·`MARKET_BUY_FILLED`·`MARKET_BID_PLACED`)

거래소 매칭 엔진이 발송한다. 신규 엔드포인트는 없고 설정 API에 `market` 필드가 추가된다. 동작 규칙은 [market/features.md](../market/features.md) "알림" 절과 같다.

- 판매 체결(`MARKET_SELL_FILLED`): 호가창에 대기하던 판매 주문이 체결되면 판매자에게 체결 건마다 1개. 보유분·발행 재고 판매 모두. `refId` = 판매자 주문 id.
- 구매 체결(`MARKET_BUY_FILLED`): 호가창에 대기하던 구매 주문이 체결되면 구매자에게. `refId` = 구매자 주문 id.
- 구매 대기 등록(`MARKET_BID_PLACED`): 구매 주문이 즉시 다 체결되지 않고 `OPEN`으로 남으면, 그 종목에 `OPEN` SELL 주문이 있는 판매자 전원(구매자 본인 제외, 중복 제거)에게. 같은 수신자·종목(`refId`)으로는 24시간에 1번만 보낸다 — 본문에 가격이 들어가 본문 비교 dedup 은 가격만 바꾸면 우회되므로 `refId` 기준으로 거른다. `refId` = assetId.
- 체결 알림은 대기하던 쪽(maker)에게만 보낸다. taker는 접수 결과 조회(`GET /market/commands/{commandId}`)로 안다.
- 엔진 처리 트랜잭션 안에서 `NotificationService.send(...)`로 내역을 저장하고(동기), push는 커밋 후(AFTER_COMMIT) best-effort로 보낸다. 롤백된 체결로는 push가 나가지 않고 알림 내역도 남지 않는다. 엔진 재시도·펜싱으로 같은 접수가 다시 처리돼도 체결이 1회이므로 알림도 1회다.
- 문구(ko / en, 가격은 체결가 또는 구매 대기 가격)
  - 판매 체결: "가구가 팔렸어요" / "'{가구명}'이(가) {체결가}코인에 팔렸어요." — "Your furniture sold" / "'{name}' sold for {price} coins."
  - 구매 체결: "구매가 체결됐어요" / "'{가구명}'을(를) {체결가}코인에 샀어요. 인벤토리를 확인해 보세요." — "Your purchase went through" / "You bought '{name}' for {price} coins. Check your inventory."
  - 구매 대기 등록: "구매 대기가 들어왔어요" / "누군가 '{가구명}'을(를) {가격}코인에 사고 싶어 해요." — "Someone wants to buy" / "Someone wants to buy '{name}' for {price} coins."
- 설정 그룹 `MARKET`은 GET/PATCH 설정의 `market` 필드로 관리하며 기본 ON(행 없음 = ON)이다. `ALL` 또는 `MARKET` off면 알림 내역은 저장하고 push만 `BLOCKED`로 종결한다.
- 새 DB 컬럼·migration은 필요 없다. `notification.type`·`notification_setting.type`은 CHECK 없는 VARCHAR(30)이다.

## 고양이 미접속 알림 (`APP_INACTIVITY_REMINDER`)

실제 foreground 활동 후 48·96·168시간에 맞춰 고양이 말투의 복귀 알림을 보낸다. 회원 현지 시간 09:00 이상 21:00 미만에 30분마다 확인하고, 회차당 단계별 최대 한 번 적재한다. 오래 미접속한 경우 현재 최고 단계 한 건만 보낸다. 본문·중복 방지·복귀 시 취소·모바일 연동 계약은 [고양이 앱 아이콘 명세](../app-icon/features.md)를 따른다.

설정 그룹은 `REMINDER`이다. 기존 `ALL`/`REMINDER` 게이트와 FCM 토큰 처리 경로를 사용하고, 설정 off여도 알림 내역은 남는다. 이 타입은 복귀·성취·이전 회차/단계로 발송 필요가 사라진 대기 알림도 `BLOCKED`로 종결한다. `ref_id`는 수신 사용자 ID이며 외부 리소스 상세로 이동시키는 ID가 아니다. 서버는 title/body를 발송하고 앱 실행과 네이티브 아이콘 적용은 모바일이 처리한다.

## 리마인드 스케줄러 (루틴·투두, 내부, 신규 엔드포인트 없음)

예약 시각이 도래한 당일 미완료 루틴과 마감 시각이 도래한 미완료 투두에 FCM 리마인드를 발송한다. 공용 batch worker(`reminderJob`)가 **5분 주기**(`@Scheduled` cron `0 */5 * * * *`, KST `Asia/Seoul`)로 실행되어 실행 시각의 분(`targetMinute`)을 대상으로 잡는다. `targetMinute`은 실행 Instant를 식별하는 KST 표현이며, 시간대별 현지 날짜·시각과 현지 자정 경계로 후보를 조회한다. 한 job 안에서 루틴 적재 → 투두 적재 → 발송 순으로 진행한다(별도 job·트리거 없음). 단일 인스턴스 전제. 리마인드는 공용 진입점 `NotificationService.send(...)`를 거치지 않고 batch worker가 알림 내역 저장과 push 발송을 직접 수행하므로, 알림 설정 게이트도 batch의 push 단계에서 별도로 적용된다(위 "알림 설정" 절).

### 루틴 리마인드 (`ROUTINE_REMINDER`)

- 발송 대상 조건(모두 충족): `routines.status = ACTIVE` + 미삭제(`deleted_at IS NULL`) + `scheduled_time`이 `targetMinute`을 회원 시간대로 변환한 시각과 일치 + 오늘 요일이 반복 규칙(`repeat_days`)에 해당(오늘 현황 판정과 동일 로직 재사용) + 당일(`routine_logs.routine_date = 오늘`) COMPLETED 로그 없음 + 오늘 미발송.
- `scheduled_time`은 **5분 단위만 허용**한다(서버 검증 — 위반 시 400, routine-todo 도메인 참고). 실행이 5분 주기 + 해당 분 정확 일치 매칭이지만 값이 5분 단위로 보장되므로 매칭 누락이 없다.
- 중복 발송 방지: 같은 분(`targetMinute`) 재실행은 batch job instance 중복으로 스킵. 그리고 `notification`에 `type = ROUTINE_REMINDER` + `ref_id = routineId` + 오늘(회원 현지 날짜) 생성 건이 있으면 재발송하지 않는다.
- 문구: 고정 템플릿(제목 "루틴 리마인드", 본문 "『{루틴명}』 할 시간이에요!"). 프론트 협의로 변경 가능, LLM 문구 생성은 후속.
- 알림 내역 저장과 push 발송은 batch 단계로 분리돼 있고, push 단계에서 사용자 알림 설정으로 차단된 건은 FCM 호출 없이 `push_status = BLOCKED`로 종결한다. 예외 격리는 **FCM 발송 호출 실패에 한정**된다 — 개별 건의 FCM 발송 예외는 나머지 발송을 막지 않지만, 토큰 조회·상태 갱신 예외는 해당 청크 실패로 이어진다(적재 스텝의 skip limit 50과 달리 발송 스텝에는 skip 정책이 없음).

### 투두 리마인드 (`TODO_REMINDER`)

- 발송 시점: `dueDate = 오늘(회원 현지 날짜)` AND `dueTime = targetMinute의 회원 현지 시각` 정각에 발송한다. 루틴과 같은 5분 주기 job을 공유하며, `dueTime`은 서버에서 5분 단위로 검증되므로 정확 일치 매칭에 누락이 없다.
- 발송 대상 조건(모두 충족): `status = PENDING` + 미삭제(`deleted_at IS NULL`) + `dueDate`·`dueTime` 모두 존재 + 오늘 미발송. `dueDate` 없이 `dueTime`만 있는 투두는 알림 대상에서 제외한다.
- 중복 발송 방지: `notification`에 `type = TODO_REMINDER` + `ref_id = todoId` + 오늘(회원 현지 날짜) 생성 건이 있으면 재발송하지 않는다(루틴 리마인드와 동일 판정).
- 문구: 고정 템플릿(제목 "투두 리마인드", 본문 "『{투두 제목}』 할 시간이에요!" — 루틴과 동일 형태로 통일됨).
- 알림 내역 저장과 push 발송은 루틴과 같은 batch 단계를 재사용하며, `push_status` 규칙(`PENDING`/`SENT`/`BLOCKED`/`FAILED`, 알림 설정으로 차단된 건은 `BLOCKED`로 종결, 재시도 없음)과 예외 격리 범위(FCM 발송 호출 실패에 한정)도 동일하게 적용한다.
- job 결합: 루틴 적재 스텝이 실패(skip limit 초과)하면 투두 적재 스텝도 돌지 않는 결합은 수용한다(MVP).

### 후속

- 후속(비차단): 다중 인스턴스 배포 시 스케줄러 중복 실행 방지(ShedLock 등), LLM 리마인드 문구 생성.

## 연동 (다른 도메인)

- 등록된 토큰은 FCM 발송 인프라(`NotificationService.send(...)`)가 발송 대상 조회에 사용한다.
