# 알림 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

## 디바이스 토큰

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `POST /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 등록 | req: `token`, `platform`(`IOS`/`ANDROID`) | `user_device_token` |
| `DELETE /api/v1/users/me/device-tokens` | FCM 디바이스 토큰 삭제 | req: `token` | `user_device_token` |

- 멀티디바이스 허용: 사용자당 토큰 여러 개(`user_device_token.token` UNIQUE).
- 등록은 멱등: 같은 `token` 재등록은 `updated_at`만 갱신. 다른 사용자가 등록했던 `token`이면 소유자가 현재 로그인한 사용자로 이전된다(기기 재로그인 케이스).
- 삭제는 요청 본문의 `token`이 본인 소유일 때만 허용(소유권 guard). 로그아웃 시 프론트가 호출한다.
- 무효 토큰(FCM `UNREGISTERED`/`INVALID_ARGUMENT` 응답) 정리는 발송 쪽(FCM 발송 인프라)에서 처리한다.

## FCM 발송 인프라 (내부, 신규 엔드포인트 없음)

공용 진입점 `NotificationService.send(userId, type, title, body)` — 알림 내역을 `notification` 테이블에 저장(동기)하고 FCM push를 비동기로 발송한다. push가 실패해도 내역은 남는다(best-effort).

- `type`(`NotificationType`) 초기값: `HOUSE_KICK`, `ROUTINE_REMINDER`. 발송 트리거 로직은 후속(강퇴 알림은 house 도메인 이벤트 발행 필요, 루틴 리마인드는 별도 배치).
- 등록된 토큰(`user_device_token`) 전체로 멀티캐스트 발송하고, FCM이 `UNREGISTERED`/`INVALID_ARGUMENT`로 응답한 token은 삭제한다.
- firebase 서비스 계정 JSON은 환경변수(`FIREBASE_CREDENTIALS_PATH`)/외부 경로로 주입한다(커밋 금지). 발송 활성화는 프로필이 아니라 자격증명 주입 여부 기준 — 미주입 환경은 실제 발송 없이 stub으로 동작하고, 로컬도 자격증명을 주입하면 실발송된다. 테스트는 항상 stub으로 고정된다.
- 브로커(RabbitMQ/Kafka)는 아직 도입하지 않는다(다중 인스턴스·발송량 증가 시 재검토).

## 연동 (다른 도메인)

- 등록된 토큰은 FCM 발송 인프라(`NotificationService.send(...)`)가 발송 대상 조회에 사용한다.
