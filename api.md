# API 공통 규약

모든 도메인 API가 공유하는 규약이다. 도메인별 엔드포인트는 각 `domains/<도메인>/api.md`를 참조한다.

## 공통 규칙

- prefix: `/api/v1`
- 본문은 JSON, 시각은 ISO-8601 + offset (`2026-06-21T12:00:00+09:00`)
- 타임존: 모든 날짜·당일/자정 판정은 **`Asia/Seoul`(KST, UTC+9)** 기준. 시각 저장도 KST로 통일한다 (`+9` 하드코딩 말고 `Asia/Seoul` 설정값으로).
- 이미지/에셋은 전체 URL 대신 key로 주고받는다 (`asset_key` / `cover_image_key` / `storage_key`). 프론트가 CDN base URL과 조합.
- 목록 응답은 `items` 배열로 감싼다.
- 인증/인가는 **MVP에 포함**한다(멘토 결정). **소셜 로그인(카카오·구글·애플) + JWT** 기반. `me` path는 인증된 사용자를 가리키며, 소유권 식별자(`user_id`, `owner_user_id`, `house_id`, `room_user_id`, `membership_id`)로 권한(guard)을 실제 적용한다. 토큰/세션 상세는 [open-questions.md](open-questions.md).
- 재화는 `user_wallets.currency_type`로 코인/다이아 구분. 보상 지급·차감은 쓰기 트랜잭션으로 묶는다.

## 도메인 API 인덱스

| 도메인 | 문서 |
| --- | --- |
| 회원 / 온보딩 | [domains/member/api.md](domains/member/api.md) |
| 루틴 / 투두 | [domains/routine-todo/api.md](domains/routine-todo/api.md) |
| 개인 방 | [domains/room/api.md](domains/room/api.md) |
| 상점 / 재화 | [domains/shop/api.md](domains/shop/api.md) |
| 뽑기 | [domains/gacha/api.md](domains/gacha/api.md) |
| 공동 집 | [domains/house/api.md](domains/house/api.md) |

## 에러 응답

실패 응답은 적절한 HTTP status + 아래 body로 통일한다. 전역 핸들러(`@RestControllerAdvice`)에서 일괄 변환한다.

| status | 상황 |
| --- | --- |
| `400` | 잘못된 입력 / validation 실패 |
| `401` | 미인증 (로그인 필요) |
| `403` | 권한 없음 |
| `404` | 리소스 없음 |
| `409` | 상태 충돌 (정원 초과·중복 등) |
| `500` | 서버 오류 |

body 형태:

```json
{ "code": "ROOM_NOT_FOUND", "message": "방을 찾을 수 없습니다." }
```

validation 실패(400)는 `fieldErrors`를 포함한다:

```json
{ "code": "VALIDATION_FAILED", "message": "입력값이 올바르지 않습니다.",
  "fieldErrors": [ { "field": "maxMembers", "reason": "1 이상이어야 합니다." } ] }
```

- `code`: 프론트 분기용 기계 식별자. `도메인_사유` 대문자 스네이크 (`HOUSE_FULL`, `INVITE_CODE_EXPIRED`).
- `message`: 사람이 읽는 설명.
- `fieldErrors`: validation 실패 시에만 (`field` + `reason`).
- 도메인별 `code` 목록은 각 도메인 구현 시 채운다.

## 응답 형태 / 페이지네이션

- **envelope 미사용**: 성공 응답은 리소스를 바로 반환한다(`{ success, data }`로 감싸지 않음). 성공/실패는 HTTP status로 구분하고, 목록만 `items` 배열로 감싼다.
- **페이지네이션(offset)**: 목록이 큰 도메인(상점 아이템·집 탐색)은 `?page=0&size=20`. 응답은 `{ items, page, size, totalElements }`. 목록이 작은 도메인은 생략. 무한스크롤 본격화 시 cursor 전환 검토.
