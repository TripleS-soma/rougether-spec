# 채팅 API

집 구성원 텍스트 채팅, 기록, 재접속 복구와 읽음 표시를 제공합니다. 첫 배포는 기존 user-api 인스턴스에서 운영합니다. 전체 채팅과 모바일 연동은 별도 작업입니다.

## 범위와 기본 정책

- 집마다 채팅방을 하나 두며 현재 ACTIVE인 일반 회원만 접근합니다. 집 공개 여부와 무관하게 비구성원은 차단합니다.
- 텍스트 전송, 기록 조회, 재접속 복구, 사용자별 마지막 읽은 위치, 메시지별 안 읽은 구성원 수를 제공합니다.
- 현재 구성원은 입주 전 기록도 조회할 수 있습니다. 집에서 나가면 접근이 차단되며 재입주 시 읽음 위치를 유지합니다. 새 구성원의 초기 읽음 위치는 0입니다.
- 봇과 탈퇴 계정은 채팅 참여 및 읽음 집계에서 제외합니다. 발신자 본인은 본인이 보낸 메시지의 안 읽은 수에 포함하지 않습니다.
- 조회·소켓 연결·발신 자체로는 읽음 처리하지 않습니다. 클라이언트가 실제로 화면에 표시한 메시지의 순서를 명시적으로 보냅니다.
- 전체 채팅은 미구현입니다. 채팅방 유형, 메시지, 읽음 상태, 전송 프로토콜은 별도 채팅 도메인이 소유하며 HOUSE 접근 권한만 집 멤버십을 사용합니다.
- 메시지 수정·삭제·첨부·푸시·타이핑·온라인 상태·신고/차단은 이번 범위에 포함하지 않습니다. 알림 도메인의 계약은 변경하지 않습니다.
- 계정 탈퇴 후 기존 메시지 본문은 방명록과 같은 공동 기록으로 유지하고 발신자 닉네임·프로필 키는 노출하지 않습니다. 본문 보존기간/삭제 정책은 후속 결정 항목입니다.

## HTTP API

모든 요청은 기존 `Authorization: Bearer <accessToken>` 인증을 사용합니다. 성공 응답에는 envelope가 없습니다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| POST | `/api/v1/houses/{houseId}/chat-room` | 집 채팅방 생성 또는 기존 방 반환, 반복 호출해도 같은 방 |
| GET | `/api/v1/chat/rooms/{roomId}` | 방 상태와 현재 구성원의 읽음 위치 |
| POST | `/api/v1/chat/rooms/{roomId}/messages` | 텍스트 전송, 재시도 시 기존 메시지 반환 |
| GET | `/api/v1/chat/rooms/{roomId}/messages` | 메시지 기록/누락 복구 |
| PUT | `/api/v1/chat/rooms/{roomId}/read` | 본인의 읽음 위치를 앞으로 이동 |

### 전송

```json
{"clientMessageId":"2496d9e7-4a56-4c6b-8a1f-e5c93288dd1e","content":"오늘 루틴 완료했어요!"}
```

- `clientMessageId`: 클라이언트가 생성한 UUID. 같은 방·발신자·UUID로 재전송하면 같은 메시지를 반환합니다. 내용이 달라지면 409입니다.
- `content`: 공백만인 메시지 불가, 최대 2,000 UTF-16 code unit(서버의 `String.length`/`@Size` 기준), 기존 금칙어 검사 적용. 입력한 공백·줄바꿈은 유지합니다.
- 발신자 ID는 요청에서 받지 않고 JWT로 결정합니다.
- 응답은 신규·재시도 모두 200입니다. 저장 성공이 실시간 수신 완료까지 보장하는 것은 아닙니다.

```json
{
  "messageId":120,"roomId":5,"sequence":31,
  "clientMessageId":"2496d9e7-4a56-4c6b-8a1f-e5c93288dd1e",
  "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
  "content":"오늘 루틴 완료했어요!","createdAt":"2026-09-21T13:00:00Z","unreadCount":2
}
```

`sequence`는 방별 1부터 시작하는 순서입니다. 메시지 식별/중복 제거는 `(roomId, sequence)` 또는 `messageId`로 처리합니다. 동시에 전송해도 순서와 저장 커밋 순서가 뒤집히지 않습니다.

### 목록과 누락 복구

- 파라미터 없음: 최신순 `sequence DESC`.
- `before=N`: N보다 이전 메시지를 최신순으로 조회합니다.
- `after=N`: N보다 이후 메시지를 과거순 `sequence ASC`로 조회합니다. 재접속 복구는 이 모드를 사용합니다.
- `before`와 `after`는 동시 사용 불가입니다. `before > 0`, `after >= 0`.
- `size`: 기본 50, 최소 1, 최대 100.
- 응답: `{items, nextCursor, hasNext, room}`. 다음 페이지가 있으면 마지막 항목의 순서를 `nextCursor`로 반환합니다. 사용 중인 `before`/`after` 방향 그대로 전달합니다.
- 최신 50개를 처음 읽은 경우 더 오래된 메시지는 `before`로 조회합니다. 연결이 끊긴 후에는 마지막으로 연속 수신한 순서를 `after`로 전달합니다.

### 읽음 상태

```json
{"lastReadSequence":31}
```

0부터 방의 마지막 순서까지 허용합니다. 해당 순서까지 읽었다는 누적 확인이며, 더 작은 값이 뒤늦게 도착해도 기존 값을 낮추지 않습니다. 여러 기기의 읽음 상태가 공유됩니다.

```json
{
  "roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":31,
  "readers":[
    {"userId":7,"membershipId":50,"lastReadSequence":31},
    {"userId":8,"membershipId":51,"lastReadSequence":29}
  ]
}
```

클라이언트는 메시지의 발신자를 제외한 현재 `readers` 중 `lastReadSequence < 메시지.sequence`인 인원 수로 표시값을 갱신할 수 있습니다. 순서가 뒤집힌 알림에는 사용자별 읽음 위치의 최댓값을 적용합니다. 구성원 입주·탈퇴에 따라 집계 대상도 바뀝니다.

## WebSocket

주소는 `/api/v1/chat/ws`입니다. 운영에서는 HTTPS 호스트의 `wss://`를 사용합니다. 브라우저 Origin은 기존 `cors.allowed-origins`만 허용합니다.

연결 후 10초 이내 첫 텍스트 프레임으로 구독 요청을 보냅니다. 토큰을 URL/query string에 넣지 않습니다. 한 연결은 한 방만 구독합니다.

```json
{"type":"SUBSCRIBE","roomId":5,"accessToken":"<accessToken>"}
```

서버가 JWT와 현재 구성원 권한을 검증한 뒤 아래를 반환합니다.

```json
{"type":"READY","room":{"roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":31,"readers":[]}}
```

메시지 전송·읽음 변경 이후 `type=ROOM_UPDATED`와 같은 형태의 최신 `room` 상태를 보냅니다. 메시지 본문은 HTTP 목록으로 가져옵니다. 방 변경이 없더라도 약 5초마다 최신 상태를 보내 연결을 유지하고 Redis 알림 누락을 보정합니다. 서버 부하·네트워크 지연에 따른 절대 시간 보장은 아닙니다.

### 클라이언트 연결 순서

1. 방 생성/조회로 `roomId`를 얻고 WebSocket 이벤트 리스너를 연결합니다.
2. SUBSCRIBE를 보내고 READY 이후 기록을 조회합니다. 로컬 기록이 있으면 `after=마지막 연속 수신 sequence`로 복구합니다.
3. ROOM_UPDATED의 `lastSequence`가 로컬 연속 수신 위치보다 크면 `after` 조회를 반복하고 `hasNext`를 따라갑니다. 알림 여러 개를 합쳐 하나의 조회 작업으로 처리할 수 있습니다.
4. 저장한 마지막 메시지의 `sequence`만 수신 커서로 기록합니다. 알림의 `lastSequence`로 바로 점프하면 중간 메시지를 놓칩니다.
5. 화면에 실제 표시한 마지막 순서를 read API로 전송합니다. 전송 응답이 유실되면 같은 UUID로 재전송합니다.
6. 토큰 만료/네트워크 단절/배포로 끊어지면 기존 로그인 refresh 흐름으로 유효한 JWT를 확보한 뒤 재연결합니다.

인가 실패·잘못된 구독 요청·인증 시간 초과는 1008, 잘못된 JSON은 1007, 종료 중 서버는 1001, 용량 초과는 1013입니다. 토큰 만료 및 탈퇴·강퇴는 수신 시와 주기 동기화 때 다시 검사합니다. HTTP 접근 권한은 매 요청 검사하므로 소켓 정리 전에 메시지 본문을 추가 조회할 수 없습니다.

소켓에 SEND/READ 프레임을 보내지 않습니다. 상태 변경은 위 HTTP API로 수행하며 모든 수신은 WebSocket으로 알림받습니다.

## 오류

| code | HTTP | 의미 |
| --- | --- | --- |
| CHAT_ROOM_NOT_FOUND | 404 | 채팅방 없음 |
| CHAT_FORBIDDEN | 403 | 비구성원·탈퇴/강퇴·봇·삭제 집 등 접근 불가 |
| CHAT_INPUT_INVALID | 400 | 커서 범위·조합·읽음 위치·본문 오류 |
| CHAT_CONTENT_BANNED | 400 | 금칙어 포함, 해당 단어는 응답 미노출 |
| CHAT_MESSAGE_CONFLICT | 409 | 같은 멱등키로 다른 본문 요청 |

DTO validation·인증 오류는 기존 공통 규약을 따릅니다.
