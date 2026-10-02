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
{"type":"SUBSCRIBE","roomId":5,"accessToken":"<accessToken>","includeMessages":true}
```

`includeMessages=true`는 본문 직접 수신 모드입니다. 생략하거나 false이면 기존 상태 알림 모드로 동작하며 `MESSAGE_CREATED`를 보내지 않습니다. 구버전 앱과 같은 서버를 사용할 수 있습니다. 메시지 전송과 읽음 갱신은 두 모드 모두 HTTP API를 유지합니다.

서버가 JWT와 현재 구성원 권한을 검증한 뒤 아래를 반환합니다.

```json
{"type":"READY","includeMessages":true,"room":{"roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":31,"readers":[]}}
```

기존 상태 모드의 READY에는 `includeMessages` 필드가 없습니다. 본문 모드의 READY는 서버가 본문 수신을 지원한다는 확인입니다. READY의 `lastSequence`까지의 기록은 최초 목록 또는 HTTP `after`로 가져옵니다. 서버는 그 다음 순서부터 본문을 직접 전달하며, READY보다 본문을 먼저 보내지 않습니다.

### 본문 직접 전달

커밋 또는 다른 노드의 Redis 알림을 받으면 소켓 송신 작업을 즉시 제출합니다. 정상 전달을 위해 250ms 주기를 기다리지 않습니다. DB 조회·작업 대기·네트워크 지연까지 없다는 의미는 아니며 절대 지연시간은 보장하지 않습니다.

```json
{
  "type":"MESSAGE_CREATED",
  "message":{
    "messageId":121,"roomId":5,"sequence":32,
    "clientMessageId":"f0e8d3a2-902a-4b76-bb50-1ca73b277709",
    "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
    "content":"오늘 루틴 완료했어요!","createdAt":"2026-10-02T08:00:00Z","unreadCount":2
  }
}
```

- `message`는 HTTP 전송/기록 API와 동일한 메시지 DTO입니다. 별도 HTTP 조회 없이 표시할 수 있습니다. 발신자의 구독 소켓에도 전달됩니다.
- 연결별로 DB의 마지막 전송 순서 이후를 오름차순으로 읽고 한 프레임씩 보냅니다. 로컬·Redis 신호가 중복되거나 합쳐져도 본문을 생략하지 않습니다.
- 한 작업은 최대 50개 본문을 보내고, 남으면 다음 작업으로 이어집니다. 송신 중 본문을 메모리에 무제한 쌓지 않으며 대기 중인 기록은 DB가 보관합니다.
- 서버의 소켓 쓰기 완료는 클라이언트 수신/저장 확인이나 읽음 확인이 아닙니다. HTTP 응답·소켓·복구 조회가 겹칠 수 있으므로 `(roomId, sequence)` 또는 `messageId`로 중복을 제거합니다.
- 본문 수신만으로 읽음 상태가 바뀌지 않습니다. 화면에 표시한 마지막 위치를 기존 read API로 전송합니다.

### 방 상태와 복구

메시지 전송·읽음 변경 이후에는 기존 형식의 `ROOM_UPDATED`도 보냅니다.

```json
{"type":"ROOM_UPDATED","room":{"roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":32,"readers":[]}}
```

본문 모드에서는 해당 작업의 본문들을 먼저 전달한 뒤 방 상태를 보냅니다. 클라이언트가 이미 연속 수신한 위치까지는 추가 HTTP 조회를 하지 않습니다. 구성원과 읽음 상태는 `room.readers`로 갱신합니다.

방 변경이 없더라도 약 5초마다 DB와 동기화합니다. 본문 모드는 구독 이후 누락된 본문도 이때 이어 보내고, 상태 모드는 최신 방 상태만 알립니다. Redis Pub/Sub는 전달 보장이 아니며, 재접속 시 HTTP 복구는 두 모드 모두 필요합니다.

### 클라이언트 연결 순서

1. 방 생성/조회로 `roomId`를 얻고 WebSocket 이벤트 리스너를 연결합니다.
2. `includeMessages=true`로 SUBSCRIBE를 보내고 READY를 기다립니다. READY 이전까지의 기록을 최초 목록으로 조회하거나, 로컬 기록이 있으면 `after=마지막 연속 수신 sequence`로 복구합니다.
3. 기록 조회 중 들어오는 `MESSAGE_CREATED`를 보관하고 HTTP 결과와 순서대로 병합합니다. 예를 들어 로컬 위치가 29, READY가 31일 때 32가 먼저 와도 30·31을 복구하기 전에 커서를 32로 올리지 않습니다.
4. 정상 수신은 본문을 바로 표시합니다. 중복은 제거하고, 순서에 틈이 있거나 ROOM_UPDATED의 `lastSequence`가 로컬 연속 수신 위치보다 크면 `after` 조회로 채웁니다. `hasNext`가 true이면 계속 조회합니다. 동시에 여러 복구 요청을 만들지 않습니다.
5. 수신 커서는 실제로 확보한 연속 구간 끝까지만 전진합니다. READY/ROOM_UPDATED의 `lastSequence`나 아직 앞 구간이 빠진 본문 순서로 바로 점프하지 않습니다. 처음 최신 목록을 가져온 경우에는 그 목록의 연속 구간을 시작점으로 삼고, 이전 기록은 `before`로 따로 조회합니다.
6. 화면에 실제 표시한 마지막 순서를 read API로 전송합니다. 발신 HTTP 응답이 유실되면 같은 UUID로 재전송합니다. HTTP 응답보다 본문 이벤트가 먼저 도착할 수도 있으므로 발신자·`clientMessageId`로 전송 중 말풍선과 연결합니다.
7. 토큰 만료/네트워크 단절/배포/서버 용량 초과로 끊어지면 필요 시 기존 로그인 refresh 흐름으로 유효한 JWT를 확보한 뒤 지수 백오프와 jitter를 적용해 재연결합니다. 마지막 연속 수신 위치부터 HTTP로 복구합니다.

기존 상태 모드는 `includeMessages`를 생략하고 READY 뒤 기록 조회, ROOM_UPDATED 뒤 부족한 구간 HTTP 조회를 수행합니다. 서버 배포 후 모바일에서 본문 모드를 활성화합니다. 백엔드 변경만으로 기존 앱이 새 본문 이벤트를 처리하는 것은 아닙니다.

인가 실패·잘못된 구독 요청·인증 시간 초과는 1008, 잘못된 JSON은 1007, 종료 중 서버는 1001, 작업 대기열/연결 용량 초과는 1013, 송신 실패·지연 또는 순서 불일치는 1011입니다. 토큰 만료 및 탈퇴·강퇴는 각 프레임 쓰기 직전과 주기 동기화 때 다시 검사합니다. 이미 네트워크로 내보낸 프레임을 회수할 수는 없지만, 권한 상실이 확인된 이후 다음 본문은 전달하지 않습니다. HTTP 접근 권한도 매 요청 검사합니다.

소켓에 SEND/READ 프레임을 보내지 않습니다. 상태 변경은 위 HTTP API로 수행합니다.

## 오류

| code | HTTP | 의미 |
| --- | --- | --- |
| CHAT_ROOM_NOT_FOUND | 404 | 채팅방 없음 |
| CHAT_FORBIDDEN | 403 | 비구성원·탈퇴/강퇴·봇·삭제 집 등 접근 불가 |
| CHAT_INPUT_INVALID | 400 | 커서 범위·조합·읽음 위치·본문 오류 |
| CHAT_CONTENT_BANNED | 400 | 금칙어 포함, 해당 단어는 응답 미노출 |
| CHAT_MESSAGE_CONFLICT | 409 | 같은 멱등키로 다른 본문 요청 |

DTO validation·인증 오류는 기존 공통 규약을 따릅니다.
