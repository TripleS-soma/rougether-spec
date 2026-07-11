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

## 연동 (다른 도메인)

- 등록된 토큰은 FCM 발송 인프라(`NotificationService.send(...)`)가 발송 대상 조회에 사용한다.
