# 채팅 API

집 구성원 글·사진·이모티콘 채팅과 메시지 공감, 기록, 재접속 복구와 읽음 표시를 제공합니다. 첫 배포는 기존 user-api 인스턴스에서 운영합니다. 전체 채팅과 모바일 연동은 별도 작업입니다.

## 범위와 기본 정책

- 집마다 채팅방을 하나 두며 현재 ACTIVE인 일반 회원만 접근합니다. 집 공개 여부와 무관하게 비구성원은 차단합니다.
- 글·사진·이모티콘 메시지 전송, 메시지 공감, 기록 조회, 재접속 복구, 사용자별 마지막 읽은 위치, 메시지별 안 읽은 구성원 수, 메시지 신고와 운영자 삭제를 제공합니다.
- 메시지 하나에 사진을 최대 10장까지 붙이고 글을 함께 보낼 수 있습니다. 앱은 고른 사진들과 입력한 글을 메시지 하나로 보냅니다. 말풍선을 길게 누르면 공감·복사·공유·신고 메뉴가 열립니다. 이모티콘은 서버 계약만 먼저 두었습니다. 앱은 아직 이모티콘을 보내지 않으며, 이모티콘 메시지를 받으면 `content` 문구로 표시합니다.
- 사진 여러 장·함께 보내는 글·이모티콘·공감·자르기를 쓰는 앱은 user-api와 admin-api가 모두 이 계약을 지원하는 버전으로 전환된 뒤에 배포합니다. 그 이전 서버는 `imageIds`·`emoticonKey`를 처리하지 못합니다. 구버전 앱은 기존 필드(`content`, `image`, 단일 `imageId`)만으로 계속 동작합니다.
- 현재 구성원은 입주 전 기록도 조회할 수 있습니다. 집에서 나가면 접근이 차단되며 재입주 시 읽음 위치를 유지합니다. 새 구성원의 초기 읽음 위치는 0입니다.
- 봇과 탈퇴 계정은 채팅 참여 및 읽음 집계에서 제외합니다. 발신자 본인은 본인이 보낸 메시지의 안 읽은 수에 포함하지 않습니다.
- 조회·소켓 연결·발신 자체로는 읽음 처리하지 않습니다. 클라이언트가 실제로 화면에 표시한 메시지의 순서를 명시적으로 보냅니다.
- 전체 채팅은 미구현입니다. 채팅방 유형, 메시지, 읽음 상태, 전송 프로토콜은 별도 채팅 도메인이 소유하며 HOUSE 접근 권한만 집 멤버십을 사용합니다.
- 새 메시지 FCM 푸시와 방별 푸시 음소거를 제공합니다(아래 "푸시 알림" 절). 알림 도메인에는 설정 그룹 `CHAT`과 푸시 전용 타입 `CHAT_MESSAGE`를 추가합니다([알림 API](../notification/api.md)).
- 사용자의 메시지 수정·삭제, 사진·이모티콘 외 첨부, 공감 알림(푸시), 타이핑, 온라인 상태, 사용자 차단, 자동 유해 판정은 이번 범위에 포함하지 않습니다.
- 메시지 글과 사진은 계속 보관합니다. 계정 탈퇴 후 기존 메시지 본문은 방명록과 같은 공동 기록으로 유지하고 발신자 닉네임·프로필 키는 노출하지 않습니다. 사진의 정리 조건은 아래 "사진 보관과 정리" 절을 따릅니다.

## HTTP API

모든 요청은 기존 `Authorization: Bearer <accessToken>` 인증을 사용합니다. 성공 응답에는 envelope가 없습니다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| POST | `/api/v1/houses/{houseId}/chat-room` | 집 채팅방 생성 또는 기존 방 반환, 반복 호출해도 같은 방 |
| GET | `/api/v1/chat/rooms/{roomId}` | 방 상태와 현재 구성원의 읽음 위치 |
| POST | `/api/v1/chat/rooms/{roomId}/images` | 사진 한 장 업로드(multipart `file`, 선택 자르기 영역), 201 |
| GET | `/api/v1/chat/images/{imageId}` | 권한 확인 후 JPEG 바이너리 반환 |
| DELETE | `/api/v1/chat/images/{imageId}` | 본인의 미전송 업로드 취소, 204 |
| POST | `/api/v1/chat/rooms/{roomId}/messages` | 글·사진·이모티콘 메시지 전송, 재시도 시 기존 메시지 반환 |
| GET | `/api/v1/chat/rooms/{roomId}/messages` | 메시지 기록/누락 복구 |
| PUT | `/api/v1/chat/rooms/{roomId}/messages/{messageId}/reaction` | 본인의 공감 설정·교체, 같은 요청을 반복해도 같은 결과 |
| DELETE | `/api/v1/chat/rooms/{roomId}/messages/{messageId}/reaction` | 본인의 공감 취소, 공감이 없어도 200 |
| POST | `/api/v1/chat/rooms/{roomId}/messages/{messageId}/reports` | 메시지 신고, 201, 재신고 시 기존 신고 반환 |
| PUT | `/api/v1/chat/rooms/{roomId}/read` | 본인의 읽음 위치를 앞으로 이동 |
| GET | `/api/v1/chat/rooms/{roomId}/notification` | 본인의 이 방 푸시 음소거 여부 조회 |
| PUT | `/api/v1/chat/rooms/{roomId}/notification` | 본인의 이 방 푸시 음소거 변경 |

### 전송

글 메시지:

```json
{"clientMessageId":"2496d9e7-4a56-4c6b-8a1f-e5c93288dd1e","content":"오늘 루틴 완료했어요!"}
```

사진 메시지(함께 보내는 글은 선택):

```json
{"clientMessageId":"7c1a4f52-3b7e-4a89-9d20-6e5b1f8c2a47","imageIds":[12,13],"content":"오늘 아침 산책"}
```

이모티콘 메시지:

```json
{"clientMessageId":"b3d1c0a4-6f2e-4d57-8a19-0c7e5f4b9d21","emoticonKey":"cat-hello"}
```

- 허용 조합은 셋입니다. 그 밖의 조합은 400 `CHAT_INPUT_INVALID`입니다.
  - `TEXT`: `content`만 보냅니다.
  - `IMAGE`: 사진(`imageIds` 또는 `imageId`)을 보내고, `content`를 함께 넣으면 사진과 함께 보내는 글이 됩니다. 글 없이 사진만 보내도 됩니다.
  - `EMOTICON`: `emoticonKey`만 보냅니다. `content`나 사진과 함께 보낼 수 없습니다.
- `clientMessageId`: 클라이언트가 생성한 UUID. 같은 방·발신자·UUID로 재전송하면 같은 메시지를 반환합니다. 유형, 글(`TEXT`의 본문·`IMAGE`의 함께 보낸 글), 사진 ID의 순서 목록, `emoticonKey`가 모두 같아야 같은 요청이며 하나라도 다르면 409 `CHAT_MESSAGE_CONFLICT`입니다. 사진이 이미 정리됐거나 운영자가 삭제한 메시지라 비교할 사진 행이 없으면 사진은 비교하지 않고 기존 메시지를 반환합니다.
- `content`: 공백만인 값 불가, 최대 2,000 UTF-16 code unit(서버의 `String.length`/`@Size` 기준). 입력한 공백·줄바꿈은 유지합니다. 사진과 함께 보내는 글에도 같은 제한을 적용합니다.
- `imageIds`: [사진 업로드](#사진-업로드와-조회) 응답의 `imageId` 목록입니다. 1~10장이며 같은 ID를 두 번 넣을 수 없고 null 항목도 허용하지 않습니다. 적힌 순서대로 메시지에 붙습니다. 위반하면 400 `CHAT_INPUT_INVALID`입니다. 빈 배열은 생략한 것으로 봅니다.
- `imageId`: 구버전 앱용 단일 사진 필드이며 `imageIds=[imageId]`와 같게 처리합니다. `imageIds`와 함께 보내면 400 `CHAT_INPUT_INVALID`입니다.
- 사진은 장마다 본인 업로드·같은 방·저장 완료·미만료·미사용인지 검사합니다. 하나라도 아니면 409 `CHAT_IMAGE_UNAVAILABLE`이며 메시지와 사진 연결을 전부 롤백합니다. 통과하지 못한 요청에 들어 있던 다른 사진은 미전송 상태로 남아 다시 보낼 수 있습니다. 사진 하나는 메시지 하나에만 쓸 수 있습니다.
- `emoticonKey`: 형식은 `^[a-z0-9][a-z0-9_-]{0,39}$`(영문 소문자·숫자로 시작, 소문자·숫자·`_`·`-`, 최대 40자)이며 어긋나면 400 `CHAT_INPUT_INVALID`입니다. 서버는 이모티콘 카탈로그를 두지 않고 형식만 검사합니다. 그림은 앱 번들에 있고 서버는 key만 저장합니다.
- 금칙어 검사는 `TEXT`의 본문과 `IMAGE`의 함께 보낸 글에 적용하며 걸리면 400 `CHAT_CONTENT_BANNED`입니다. 이때 사진은 미전송 상태로 남습니다. AI 사용자 이벤트는 `TEXT` 메시지에만 보냅니다.
- 발신자 ID는 요청에서 받지 않고 JWT로 결정합니다.
- 응답은 신규·재시도 모두 200입니다. 저장 성공이 실시간 수신 완료까지 보장하는 것은 아닙니다.

```json
{
  "messageId":120,"roomId":5,"sequence":31,
  "clientMessageId":"2496d9e7-4a56-4c6b-8a1f-e5c93288dd1e",
  "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
  "content":"오늘 루틴 완료했어요!","createdAt":"2026-09-21T13:00:00Z","unreadCount":2,
  "messageType":"TEXT","image":null,
  "images":[],"caption":null,"emoticonKey":null,"reactions":[]
}
```

```json
{
  "messageId":122,"roomId":5,"sequence":33,
  "clientMessageId":"7c1a4f52-3b7e-4a89-9d20-6e5b1f8c2a47",
  "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
  "content":"오늘 아침 산책","createdAt":"2026-09-21T13:01:00Z","unreadCount":2,
  "messageType":"IMAGE","image":{"imageId":12,"width":1600,"height":1200},
  "images":[{"imageId":12,"width":1600,"height":1200},{"imageId":13,"width":1200,"height":1600}],
  "caption":"오늘 아침 산책","emoticonKey":null,"reactions":[]
}
```

```json
{
  "messageId":123,"roomId":5,"sequence":34,
  "clientMessageId":"b3d1c0a4-6f2e-4d57-8a19-0c7e5f4b9d21",
  "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
  "content":"이모티콘을 보냈어요","createdAt":"2026-09-21T13:02:00Z","unreadCount":2,
  "messageType":"EMOTICON","image":null,
  "images":[],"caption":null,"emoticonKey":"cat-hello","reactions":[]
}
```

- `messageType`: `TEXT`, `IMAGE`, `EMOTICON`. 기존 메시지는 `TEXT`입니다.
- `images`: 사진 메시지의 사진 전체를 보낸 순서대로 담은 `{imageId, width, height}` 배열입니다(최대 10장). 글·이모티콘 메시지와 운영자가 삭제한 메시지는 빈 배열이고, 탈퇴한 회원의 사진은 빠집니다.
- `image`: 구버전 앱용 필드로 `images`의 첫 장과 같습니다. `images`가 비어 있으면 null입니다.
- `caption`: 사진 메시지에 함께 보낸 글입니다. 함께 보낸 글이 없거나 사진 메시지가 아니거나 운영자가 삭제한 메시지면 null입니다.
- `emoticonKey`: 이모티콘 메시지의 key입니다. 이모티콘 메시지가 아니거나 운영자가 삭제한 메시지면 null입니다. 앱은 번들에 있는 그림과 맞춰 표시하고, 모르는 key는 `content` 문구로 대신 표시합니다. 현재 앱에는 이모티콘 그림이 없어 모든 key를 `content` 문구로 표시합니다.
- `reactions`: 메시지의 공감을 유형별로 묶은 `[{type, userIds}]`입니다. 공감이 있는 유형만 싣고 유형 순서는 `HEART`, `LIKE`, `CHECK`, `LAUGH`, `SURPRISE`, `SAD`입니다. `userIds`는 누른 순서이며 탈퇴한 회원은 빠집니다. 공감이 없거나 운영자가 삭제한 메시지는 빈 배열입니다. 예: `[{"type":"HEART","userIds":[8,9]},{"type":"CHECK","userIds":[7]}]`. 새로 저장한 메시지의 전송 응답에서는 빈 배열이고, `clientMessageId` 재시도 응답에는 그 시점의 공감이 담깁니다. 자세한 규칙은 [메시지 공감](#메시지-공감)을 따릅니다.
- `content`는 계속 non-null인 구버전 앱 표시용 문구입니다. `TEXT`는 본문, `IMAGE`는 함께 보낸 글이 있으면 그 글이고 없으면 한 장은 `사진을 보냈어요`, 여러 장은 `사진 N장을 보냈어요`, `EMOTICON`은 `이모티콘을 보냈어요`입니다. 새 앱은 `images`·`caption`·`emoticonKey`로 표시하며 `IMAGE`의 `content`는 그리지 않습니다.
- `messageType` 이후의 필드는 전송 응답·기록 조회·소켓 `MESSAGE_CREATED`에 공통으로 포함됩니다. 사진·이모티콘 메시지의 열람 범위는 글 메시지와 같습니다.

`sequence`는 방별 1부터 시작하는 순서입니다. 메시지 식별/중복 제거는 `(roomId, sequence)` 또는 `messageId`로 처리합니다. 동시에 전송해도 순서와 저장 커밋 순서가 뒤집히지 않습니다.

### 사진 업로드와 조회

1. `POST /api/v1/chat/rooms/{roomId}/images`의 multipart `file`로 사진을 한 장씩 올립니다. 그 방의 현재 ACTIVE 일반 회원만 올릴 수 있습니다. 여러 장을 보낼 때도 업로드는 장마다 따로 합니다.
2. 응답의 `imageId`를 메시지 전송의 `imageIds`에 사용합니다. 보내지 않은 업로드는 24시간 뒤 만료됩니다. 보내지 않기로 했으면 `DELETE /api/v1/chat/images/{imageId}`로 취소합니다.
3. 사진은 `GET /api/v1/chat/images/{imageId}`에 `Authorization` 헤더를 넣어 표시합니다.

```json
{"imageId":12,"width":1600,"height":1200,"contentType":"image/jpeg"}
```

업로드 응답은 201입니다. `width`·`height`는 자르기와 변환을 마친 뒤의 값이고 `contentType`은 항상 `image/jpeg`입니다.

- 규격: JPEG·PNG, 파일당 10MiB 이하입니다. 원본이 가로·세로 8,192px 또는 3,200만 화소를 넘으면 거부합니다. 회전 보정 후 긴 변 1,600px JPEG로 다시 저장하고 EXIF·위치 정보를 제거합니다([피드 사진](../feed/features.md#사진과-삭제)과 같은 규칙).
- 자르기: multipart에 선택 필드 `cropX`, `cropY`, `cropWidth`, `cropHeight`를 함께 넣으면 그 영역만 남겨 저장합니다. 네 값은 회전 보정 후 사진의 가로·세로에 대한 0~1 비율이며, 넷 다 보내거나 넷 다 생략합니다.
  - `cropX`·`cropY`는 왼쪽·위쪽 시작 위치로 0 이상 1 미만, `cropWidth`·`cropHeight`는 0 초과 1 이하이고 `cropX + cropWidth`와 `cropY + cropHeight`는 각각 1 이하입니다.
  - 일부만 보냈거나 숫자가 아니거나 범위를 벗어나면 400 `CHAT_IMAGE_INVALID`입니다. 잘린 결과의 가로나 세로가 16px 미만이어도 같은 오류입니다.
  - 처리 순서는 디코딩 → 회전 보정 → 자르기 → 긴 변 1,600px 축소 → JPEG 저장입니다. 용량·화소 제한은 자르기 전 원본에 적용합니다.
  - 앱은 자르기 화면에서 영역만 정하고 원본 파일을 그대로 올립니다. 자르기를 써도 아래 한도는 그대로입니다.
- 저장: 비공개 key `private/chat/<uuid>.jpg`를 DB에만 저장하고 응답에 내보내지 않습니다. CDN URL로 조합하지 않습니다.
- 한도: 사용자당 KST 하루 50장(업로드 기준), 미전송 업로드 30개까지이며 넘으면 429 `CHAT_IMAGE_LIMIT`입니다. 취소했거나 저장에 실패한 업로드는 미전송 30개에서 바로 빠지지만 하루 50장 집계에는 남습니다.
- 동시 처리: 사진 디코딩은 서버 프로세스당 동시 1개까지이며 5초 안에 차례를 얻지 못하면 503 `CHAT_STORAGE_UNAVAILABLE`입니다. 피드 업로드와 같은 제한을 공유합니다.
- 조회: 전송 전에는 업로더만, 전송 후에는 그 방의 현재 ACTIVE 일반 회원만 200입니다. 그 외(없음·만료·삭제·탈퇴·권한 없음)는 404 `CHAT_IMAGE_NOT_FOUND`입니다. 응답 헤더는 `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`입니다.
- 취소: 본인의 미전송 업로드만 204입니다. 다른 사람의 사진은 404 `CHAT_IMAGE_NOT_FOUND`, 저장이 끝나지 않았거나 이미 보낸 사진은 409 `CHAT_IMAGE_UNAVAILABLE`입니다.

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

### 방별 푸시 음소거

```json
{"muted":true}
```

- `GET`은 `{roomId, muted}`를 반환합니다. `PUT`은 위 body를 받아 200으로 같은 형태 `{roomId, muted}`를 반환합니다.
- 본인 설정만 다루며 현재 구성원만 호출할 수 있습니다. 접근 정책과 오류는 다른 채팅 API와 같습니다(비구성원 `CHAT_FORBIDDEN` 등).
- 기본값은 `false`입니다. `chat_read_states.push_muted`에 저장하며, 읽음 상태 행이 없으면 만들어 저장합니다.
- 음소거는 이 방의 새 메시지 푸시만 막습니다. 메시지 수신·소켓 전달·읽음 상태에는 영향이 없습니다.
- 방 상태 응답(`room`, `readers`)에는 넣지 않습니다. 방 상태는 구성원 전원에게 같은 내용이 가는 공용 스냅샷이라 다른 구성원의 음소거 여부가 노출되기 때문입니다.

### 메시지 공감

```json
{"type":"HEART"}
```

- `PUT /api/v1/chat/rooms/{roomId}/messages/{messageId}/reaction`은 위 body로 본인의 공감을 남기거나 다른 유형으로 바꿉니다. 같은 유형을 다시 보내면 그대로 두고 200입니다.
- `DELETE` 같은 경로는 본인의 공감을 취소합니다. body는 없으며 남긴 공감이 없어도 200입니다.
- `type`: `HEART`(하트), `LIKE`(좋아요), `CHECK`(확인), `LAUGH`(웃음), `SURPRISE`(놀람), `SAD`(슬픔) 중 하나입니다. 없거나 허용값이 아니면 400입니다(공통 요청 검증 규약).
- 한 사람은 메시지당 공감 하나만 가집니다. 본인이 보낸 메시지에도 남길 수 있습니다. 유형을 바꾸면 새로 누른 것으로 보아 그 유형 `userIds`의 맨 뒤에 놓입니다.
- 그 방의 현재 ACTIVE 일반 회원만 호출할 수 있습니다. 접근 정책과 오류는 다른 채팅 API와 같습니다(비구성원·봇 `CHAT_FORBIDDEN`, 없는 방 `CHAT_ROOM_NOT_FOUND`). 없거나 다른 방이거나 운영자가 삭제한 메시지는 404 `CHAT_MESSAGE_NOT_FOUND`입니다.
- 응답은 설정·취소 모두 그 메시지의 공감 전체입니다.

```json
{"messageId":120,"sequence":31,"reactions":[{"type":"HEART","userIds":[8,7]}]}
```

- `reactions`의 형태와 순서는 메시지 응답의 `reactions`와 같습니다. 공감이 없으면 빈 배열입니다.
- 공감은 푸시를 보내지 않고 읽음 상태와 `sequence`, 방의 `lastSequence`를 바꾸지 않습니다. `ROOM_UPDATED`도 보내지 않습니다.
- 다른 구성원의 변경은 소켓 `MESSAGE_REACTIONS`로 받습니다(아래 "공감 변경 전달" 절). 놓친 변경은 기록을 다시 조회할 때 메시지의 `reactions`로 맞춥니다.
- 탈퇴한 회원의 공감은 응답에서 빠집니다.

### 메시지 신고

```json
{"reason":"ABUSE","detail":"욕설이 포함돼 있어요"}
```

- 대상은 글·사진·이모티콘 메시지 전부이며 신고 대상 유형은 `CHAT_MESSAGE`입니다. 사진이 여러 장이어도 신고 단위는 메시지 하나입니다.
- 그 방의 현재 ACTIVE 일반 회원만 신고할 수 있습니다. 본인 메시지는 400 `REPORT_SELF_TARGET`, 없거나 삭제됐거나 다른 방의 메시지는 404 `CHAT_MESSAGE_NOT_FOUND`입니다.
- 요청·응답·사유는 피드 신고와 같습니다. `reason`은 필수이며 `SPAM`(스팸·광고), `ABUSE`(욕설·괴롭힘), `SEXUAL`(선정적), `VIOLENCE`(폭력·위협), `PERSONAL_INFO`(개인정보 노출), `COPYRIGHT`(저작권 침해), `OTHER`(기타) 중 하나입니다. `detail`은 선택이며 최대 500자입니다. 앞뒤 공백을 제거하고 빈 값은 저장하지 않습니다.
- 응답은 201 `{"reportId":12,"status":"RECEIVED"}` 형태입니다. `status`는 `RECEIVED`(검토 대기), `ACTIONED`(숨김 조치), `DISMISSED`(조치 없음 종료)입니다. 같은 신고자가 다시 신고하면 새로 저장하지 않고 처음 신고를 201로 반환합니다(사유·설명은 처음 값 유지).
- 신고만으로 메시지가 숨겨지지 않고 운영자가 검토합니다.

## 운영자 삭제

운영자는 신고 대기열(admin-api `/admin/reports`)에서 신고를 처리합니다. `POST /admin/reports/{id}/resolve`의 `HIDE`가 메시지를 삭제하고, `DISMISS`는 메시지를 건드리지 않고 신고만 닫습니다.

- HIDE는 `chat_messages.deleted_at`을 설정하고 같은 메시지의 대기 신고를 함께 닫습니다. 복구는 없습니다.
- 삭제된 메시지 응답: `content`는 `삭제된 메시지예요`, `image`·`caption`·`emoticonKey`는 null, `images`·`reactions`는 빈 배열입니다. `sequence`와 `messageType`은 유지합니다. 함께 보낸 글 원문도 DB에 남고 응답에서만 비웁니다.
- 사진 조회는 삭제 즉시 그 메시지의 사진 전부가 404 `CHAT_IMAGE_NOT_FOUND`가 되고, S3 파일은 정리 작업이 지웁니다.
- 삭제된 메시지에는 공감을 남기거나 취소할 수 없습니다(404 `CHAT_MESSAGE_NOT_FOUND`).
- 이미 받아 둔 화면은 다음 기록 조회부터 반영됩니다.
- 삭제된 메시지는 AI 사용자 컨텍스트와 기억 근거에서 제외합니다.
- 운영자는 대기열 항목의 `target.chatImageIds`로 `GET /admin/reports/chat-images/{imageId}`를 장마다 호출해 신고된 사진을 봅니다. `chatImageIds`는 그 메시지의 사진 전체를 보낸 순서대로 담고, 사진이 없는 메시지와 다른 신고 대상 유형에서는 빈 배열입니다. 기존 `target.chatImageId`는 첫 장으로 유지하며 사진이 없으면 null입니다. 신고된 메시지의 사진만 볼 수 있고 그 외에는 404 `REPORT_IMAGE_NOT_FOUND`입니다. 응답은 캐시하지 않습니다.

## 사진 보관과 정리

- 사진은 글처럼 계속 보관합니다. 집을 나간 사람이 올린 사진은 유지합니다.
- 탈퇴: 그 회원이 올린 사진의 조회는 즉시 404가 되고 메시지의 `image`는 null, `images`는 빈 배열이 됩니다. `content`와 `caption`은 유지합니다. 사진 파일과 행은 정리 작업이 지웁니다.
- 집 해체(`house.deleted_at`): 그 방의 사진을 전부 지웁니다. 방 접근은 이미 차단됩니다.
- 운영자가 삭제한 메시지의 사진도 정리 작업이 지웁니다. 여러 장이면 전부 지웁니다.
- 미전송 업로드는 24시간 뒤 만료되고 정리합니다. 취소했거나 저장에 실패해 일찍 만료된 행도 그날의 하루 한도 집계에 남아야 하므로, 올린 날의 다음 KST 날짜부터 정리합니다.
- 저장이 끝나지 않은 업로드(`ready=false`)는 탈퇴·해체여도 바로 지우지 않고 만료 후 정리합니다. 진행 중인 S3 저장이 끝난 뒤 파일만 남는 것을 막기 위해서입니다.
- 정리 작업은 실행 완료 후 5분 간격으로 돕니다. S3 실패 시 행을 남겨 재시도하며, S3 객체는 버전과 삭제 marker까지 제거합니다.

## 푸시 알림

새 채팅 메시지를 채팅을 보고 있지 않은 집 구성원에게 FCM 푸시로 알립니다.

- 대상: 그 방(집)의 ACTIVE 구성원 중 발신자·봇·탈퇴 회원을 제외한 인원(방 상태 `readers`와 같은 범위). 그중 이 방을 음소거한 사람과 그 방 소켓을 구독 중인 사람(채팅 화면을 보는 중)은 제외합니다.
- 구독 판정은 서버 인스턴스 메모리 기준이라 배포 전환 중 몇 초는 틀릴 수 있습니다. 앱은 그 채팅 화면을 보는 중이면 포그라운드 푸시를 표시하지 않습니다.
- 메시지마다 1건씩 보내되, 같은 집의 알림은 한 묶음으로 표시합니다(server #526). 묶음 키는 `chat-house-{houseId}`이며 FCM data의 `groupKey`, Android 알림 `tag`, APNs `thread-id`에 같은 값을 싣습니다.
  - Android: 앱이 꺼져 있거나 백그라운드일 때는 같은 `tag`의 앞 알림을 새 알림이 대체해 집마다 최신 메시지 1건만 남습니다. 앱이 켜진 채 받은 알림은 대체되지 않습니다.
  - iOS: 알림 센터에서 같은 `thread-id`끼리 한 스택으로 쌓입니다.
  - 앱은 그 집 채팅 화면을 열 때(알림 탭·앱 안 진입 모두) 트레이에 남은 그 집 채팅 알림을 모두 지웁니다(mobile #1746).
- 알림함(`notification`)에는 저장하지 않고 푸시만 보냅니다. 알림 목록 API에 나타나지 않으며 발송 상태도 기록하지 않습니다.
- 메시지 저장 커밋 후 알림 전용 executor에서 비동기로 보냅니다. `clientMessageId` 재전송으로 기존 메시지를 돌려주는 경우와 저장이 롤백된 경우는 보내지 않습니다. 푸시 실패는 전송 응답에 영향을 주지 않습니다.
- 설정: 알림 설정 그룹 `CHAT`(설정 API `chat` 필드, 기본 ON)이 off이거나 마스터 `all`이 off면 보내지 않습니다.
- 문구: 제목은 집 이름, 본문은 `{닉네임}: {메시지 앞 100자}`입니다. 100자를 넘으면 `…`를 붙입니다. 닉네임이 없으면 `이웃`/`A neighbor`를 사용합니다. 사진·이모티콘 메시지의 본문은 아래와 같습니다.
  - 함께 보낸 글이 있는 사진: 장수와 무관하게 `{닉네임}: [사진] {글 앞 100자}` / `{nickname}: [Photo] {글 앞 100자}`. 100자를 넘으면 `…`를 붙입니다.
  - 글 없는 사진 한 장: `{닉네임}: 사진을 보냈어요` / `{nickname}: sent a photo`.
  - 글 없는 사진 여러 장: `{닉네임}: 사진 N장을 보냈어요` / `{nickname}: sent N photos`.
  - 이모티콘: `{닉네임}: 이모티콘을 보냈어요` / `{nickname}: sent an emoticon`. key는 싣지 않습니다.
- 공감은 푸시를 보내지 않습니다.
- FCM data: `{ "type": "CHAT_MESSAGE", "roomId": "5", "houseId": "20", "groupKey": "chat-house-20" }`.

## WebSocket

주소는 `/api/v1/chat/ws`입니다. 운영에서는 HTTPS 호스트의 `wss://`를 사용합니다. 브라우저 Origin은 기존 `cors.allowed-origins`만 허용합니다.

연결 후 10초 이내 첫 텍스트 프레임으로 구독 요청을 보냅니다. 토큰을 URL/query string에 넣지 않습니다. 한 연결은 한 방만 구독합니다.

```json
{"type":"SUBSCRIBE","roomId":5,"accessToken":"<accessToken>","includeMessages":true,"includeReactions":true}
```

`includeMessages=true`는 본문 직접 수신 모드입니다. 생략하거나 false이면 기존 상태 알림 모드로 동작하며 `MESSAGE_CREATED`를 보내지 않습니다. 구버전 앱과 같은 서버를 사용할 수 있습니다. 메시지 전송과 읽음 갱신은 두 모드 모두 HTTP API를 유지합니다.

`includeReactions=true`는 공감 변경 수신 옵션입니다. 보낸 연결에만 `MESSAGE_REACTIONS`를 전달하며, 생략하거나 false인 연결(구버전 앱)에는 이 프레임을 보내지 않습니다. `includeMessages`와 따로 켤 수 있습니다.

서버가 JWT와 현재 구성원 권한을 검증한 뒤 아래를 반환합니다.

```json
{"type":"READY","includeMessages":true,"includeReactions":true,"room":{"roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":31,"readers":[]}}
```

READY에는 SUBSCRIBE에서 켠 옵션만 `true`로 실립니다. 켜지 않은 옵션은 필드 자체가 없으며, 옵션을 하나도 보내지 않은 기존 상태 모드의 READY에는 `includeMessages`·`includeReactions` 필드가 없습니다. 본문 모드의 READY는 서버가 본문 수신을 지원한다는 확인이고, `includeReactions:true`는 서버가 공감 변경 전달을 지원한다는 확인입니다. 앱은 `includeReactions`를 보낸 뒤 READY에 같은 플래그가 없으면 공감을 기록 조회로만 갱신합니다. READY의 `lastSequence`까지의 기록은 최초 목록 또는 HTTP `after`로 가져옵니다. 서버는 그 다음 순서부터 본문을 직접 전달하며, READY보다 본문을 먼저 보내지 않습니다.

### 본문 직접 전달

커밋 또는 다른 노드의 Redis 알림을 받으면 소켓 송신 작업을 즉시 제출합니다. 정상 전달을 위해 250ms 주기를 기다리지 않습니다. DB 조회·작업 대기·네트워크 지연까지 없다는 의미는 아니며 절대 지연시간은 보장하지 않습니다.

```json
{
  "type":"MESSAGE_CREATED",
  "message":{
    "messageId":121,"roomId":5,"sequence":32,
    "clientMessageId":"f0e8d3a2-902a-4b76-bb50-1ca73b277709",
    "senderUserId":7,"senderNickname":"이웃","senderProfileImageKey":null,
    "content":"오늘 루틴 완료했어요!","createdAt":"2026-10-02T08:00:00Z","unreadCount":2,
    "messageType":"TEXT","image":null,
    "images":[],"caption":null,"emoticonKey":null,"reactions":[]
  }
}
```

- `message`는 HTTP 전송/기록 API와 동일한 메시지 DTO입니다. 별도 HTTP 조회 없이 표시할 수 있습니다. 발신자의 구독 소켓에도 전달됩니다. `reactions`에는 프레임을 쓰는 시점의 공감이 담깁니다.
- 연결별로 DB의 마지막 전송 순서 이후를 오름차순으로 읽고 한 프레임씩 보냅니다. 로컬·Redis 신호가 중복되거나 합쳐져도 본문을 생략하지 않습니다.
- 한 작업은 최대 50개 본문을 보내고, 남으면 다음 작업으로 이어집니다. 송신 중 본문을 메모리에 무제한 쌓지 않으며 대기 중인 기록은 DB가 보관합니다.
- 서버의 소켓 쓰기 완료는 클라이언트 수신/저장 확인이나 읽음 확인이 아닙니다. HTTP 응답·소켓·복구 조회가 겹칠 수 있으므로 `(roomId, sequence)` 또는 `messageId`로 중복을 제거합니다.
- 본문 수신만으로 읽음 상태가 바뀌지 않습니다. 화면에 표시한 마지막 위치를 기존 read API로 전송합니다.

### 공감 변경 전달

공감이 설정·교체·취소되면 커밋 후 `includeReactions=true`로 구독한 그 방의 연결에 아래 프레임을 보냅니다. 공감을 누른 본인의 구독 소켓에도 전달됩니다.

```json
{"type":"MESSAGE_REACTIONS","roomId":5,"messageId":120,"sequence":31,"reactions":[{"type":"HEART","userIds":[8,7]}]}
```

- `reactions`는 그 메시지의 공감 전체이며 형태는 메시지 응답의 `reactions`와 같습니다. 변경분이 아니므로 클라이언트는 받은 값으로 그 메시지의 공감을 통째로 바꿉니다. 모두 취소되면 빈 배열이 옵니다.
- 서버는 프레임을 쓰기 직전에 DB에서 현재 값을 읽습니다. 신호가 겹치거나 순서가 바뀌어도 마지막에 받은 프레임이 최신 값입니다. 같은 메시지의 연속 변경은 한 프레임으로 합쳐질 수 있고, 같은 내용의 프레임이 한 번 더 올 수도 있습니다.
- 본문 모드 연결이 아직 받지 못한 메시지(`sequence`가 그 연결의 전달 위치보다 뒤)의 공감은 프레임으로 보내지 않습니다. 뒤따르는 `MESSAGE_CREATED`의 `reactions`가 최신 값을 싣습니다.
- 그사이 운영자가 삭제한 메시지의 프레임은 보내지 않습니다.
- 공감 변경은 `ROOM_UPDATED`를 만들지 않고 `lastSequence`·`readers`도 바꾸지 않습니다.
- 유실된 공감 신호는 다시 보내지 않습니다. 약 5초 주기 보정에도 공감은 포함하지 않으며, 클라이언트는 기록을 다시 조회할 때 메시지의 `reactions`로 맞춥니다.
- 한 연결에 아직 보내지 못한 공감 변경이 메시지 256개를 넘으면 1013으로 끊습니다. 클라이언트는 재접속과 기록 조회로 복구합니다.

### 방 상태와 복구

메시지 전송·읽음 변경 이후에는 기존 형식의 `ROOM_UPDATED`도 보냅니다.

```json
{"type":"ROOM_UPDATED","room":{"roomId":5,"roomType":"HOUSE","houseId":20,"lastSequence":32,"readers":[]}}
```

본문 모드에서는 해당 작업의 본문들을 먼저 전달한 뒤 방 상태를 보냅니다. 클라이언트가 이미 연속 수신한 위치까지는 추가 HTTP 조회를 하지 않습니다. 구성원과 읽음 상태는 `room.readers`로 갱신합니다.

방 변경이 없더라도 약 5초마다 DB와 동기화합니다. 본문 모드는 구독 이후 누락된 본문도 이때 이어 보내고, 상태 모드는 최신 방 상태만 알립니다. 공감 변경은 이 보정에 포함하지 않습니다. Redis Pub/Sub는 전달 보장이 아니며, 재접속 시 HTTP 복구는 두 모드 모두 필요합니다.

### 클라이언트 연결 순서

1. 방 생성/조회로 `roomId`를 얻고 WebSocket 이벤트 리스너를 연결합니다.
2. `includeMessages=true`(공감을 실시간으로 받으려면 `includeReactions=true`도 함께)로 SUBSCRIBE를 보내고 READY를 기다립니다. READY 이전까지의 기록을 최초 목록으로 조회하거나, 로컬 기록이 있으면 `after=마지막 연속 수신 sequence`로 복구합니다.
3. 기록 조회 중 들어오는 `MESSAGE_CREATED`를 보관하고 HTTP 결과와 순서대로 병합합니다. 예를 들어 로컬 위치가 29, READY가 31일 때 32가 먼저 와도 30·31을 복구하기 전에 커서를 32로 올리지 않습니다.
4. 정상 수신은 본문을 바로 표시합니다. 중복은 제거하고, 순서에 틈이 있거나 ROOM_UPDATED의 `lastSequence`가 로컬 연속 수신 위치보다 크면 `after` 조회로 채웁니다. `hasNext`가 true이면 계속 조회합니다. 동시에 여러 복구 요청을 만들지 않습니다.
5. 수신 커서는 실제로 확보한 연속 구간 끝까지만 전진합니다. READY/ROOM_UPDATED의 `lastSequence`나 아직 앞 구간이 빠진 본문 순서로 바로 점프하지 않습니다. 처음 최신 목록을 가져온 경우에는 그 목록의 연속 구간을 시작점으로 삼고, 이전 기록은 `before`로 따로 조회합니다.
6. 화면에 실제 표시한 마지막 순서를 read API로 전송합니다. 발신 HTTP 응답이 유실되면 같은 UUID로 재전송합니다. HTTP 응답보다 본문 이벤트가 먼저 도착할 수도 있으므로 발신자·`clientMessageId`로 전송 중 말풍선과 연결합니다.
7. 토큰 만료/네트워크 단절/배포/서버 용량 초과로 끊어지면 필요 시 기존 로그인 refresh 흐름으로 유효한 JWT를 확보한 뒤 지수 백오프와 jitter를 적용해 재연결합니다. 마지막 연속 수신 위치부터 HTTP로 복구합니다.
8. `MESSAGE_REACTIONS`를 받으면 `messageId`로 해당 메시지를 찾아 `reactions`를 통째로 바꿉니다. 본인의 공감은 PUT/DELETE 응답으로 먼저 반영할 수 있습니다. 끊긴 동안 놓친 공감 변경은 프레임으로 다시 오지 않습니다. `after` 복구는 새 메시지만 가져오므로, 재연결의 READY를 받으면 최신 쪽 한 페이지(파라미터 없는 기록 조회)를 다시 받아 이미 가진 메시지의 `reactions`를 덮어씁니다. 그보다 오래된 메시지의 공감은 그 구간을 다시 조회할 때 맞춰집니다.

기존 상태 모드는 `includeMessages`를 생략하고 READY 뒤 기록 조회, ROOM_UPDATED 뒤 부족한 구간 HTTP 조회를 수행합니다. 서버 배포 후 모바일에서 본문 모드를 활성화합니다. 백엔드 변경만으로 기존 앱이 새 본문 이벤트를 처리하는 것은 아닙니다.

인가 실패·잘못된 구독 요청·인증 시간 초과는 1008, 잘못된 JSON은 1007, 종료 중 서버는 1001, 작업 대기열/연결 용량 초과와 미전송 공감 변경 초과는 1013, 송신 실패·지연 또는 순서 불일치는 1011입니다. 토큰 만료 및 탈퇴·강퇴는 각 프레임 쓰기 직전과 주기 동기화 때 다시 검사합니다. 이미 네트워크로 내보낸 프레임을 회수할 수는 없지만, 권한 상실이 확인된 이후 다음 본문은 전달하지 않습니다. HTTP 접근 권한도 매 요청 검사합니다.

소켓에 SEND/READ/공감 프레임을 보내지 않습니다. 상태 변경은 위 HTTP API로 수행합니다.

## 오류

| code | HTTP | 의미 |
| --- | --- | --- |
| CHAT_ROOM_NOT_FOUND | 404 | 채팅방 없음 |
| CHAT_FORBIDDEN | 403 | 비구성원·탈퇴/강퇴·봇·삭제 집 등 접근 불가 |
| CHAT_INPUT_INVALID | 400 | 커서 범위·조합·읽음 위치·본문 오류, `content`·`imageId`·`imageIds`·`emoticonKey` 조합 오류, 사진 10장 초과·중복 ID, `emoticonKey` 형식 오류 |
| CHAT_CONTENT_BANNED | 400 | 글 본문 또는 사진과 함께 보낸 글에 금칙어 포함, 해당 단어는 응답 미노출 |
| CHAT_MESSAGE_CONFLICT | 409 | 같은 멱등키로 유형·글·사진 ID 순서·`emoticonKey`가 다른 요청 |
| CHAT_MESSAGE_NOT_FOUND | 404 | 신고·공감 대상 메시지가 없거나 삭제됐거나 다른 방의 메시지 |
| CHAT_IMAGE_INVALID | 400 | 실제 JPEG/PNG 아님, 용량·화소 제한, 손상 이미지, 자르기 영역 오류(일부만 보냄·숫자 아님·범위 밖·결과 16px 미만) |
| CHAT_IMAGE_NOT_FOUND | 404 | 없음·만료·삭제·탈퇴·조회 권한 없음, 다른 사람의 사진 취소 |
| CHAT_IMAGE_UNAVAILABLE | 409 | 전송할 사진 중 하나라도 본인 소유·같은 방·저장 완료·미만료·미사용 상태가 아님, 저장 중이거나 이미 보낸 사진 취소 |
| CHAT_IMAGE_LIMIT | 429 | 사용자당 KST 하루 50장 또는 미전송 업로드 30개 초과 |
| CHAT_STORAGE_UNAVAILABLE | 503 | 사진 저장소 일시 오류, 사진 디코딩 차례를 5초 안에 얻지 못함 |
| REPORT_SELF_TARGET | 400 | 본인 메시지 신고 |

DTO validation·인증 오류는 기존 공통 규약을 따릅니다.
