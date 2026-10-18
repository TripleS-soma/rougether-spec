# 공개 SNS 피드 API

Prefix: `/api/v1/feed`. 모든 경로는 활성 일반 회원의 `Authorization: Bearer <accessToken>`이 필요하다. 요청 body의 작성자 ID를 받지 않는다. 피드 시각은 ISO-8601 UTC `Z`로 반환하며 표시 시 기기 시간대로 변환한다.

## 엔드포인트

| Method | Path | 결과 |
| --- | --- | --- |
| POST | `/images` | multipart `file` 한 장 업로드 → 201 Image |
| GET | `/images/{imageId}` | 권한 확인 후 JPEG 바이너리 → 200 |
| DELETE | `/images/{imageId}` | 본인의 미게시 업로드 취소 → 204 |
| POST | `/posts` | 게시물 등록 → 201 Post (재시도도 201) |
| GET | `/posts` | 전체/게시판별/작성자별 커서 목록 → 200 Page<Post> |
| GET | `/posts/{postId}` | 게시물 상세 → 200 Post |
| PATCH | `/posts/{postId}` | 본인 본문·게시판·연결 루틴 수정 → 200 Post |
| DELETE | `/posts/{postId}` | 본인 게시물 삭제 → 204 |
| PUT | `/posts/{postId}/like` | 좋아요 → 204 |
| DELETE | `/posts/{postId}/like` | 좋아요 취소 → 204 |
| GET | `/posts/{postId}/comments` | 전체 댓글 또는 원댓글 커서 목록 → 200 Page<Comment> |
| GET | `/posts/{postId}/comments/{commentId}/replies` | 원댓글의 대댓글 커서 목록 → 200 Page<Comment> |
| POST | `/posts/{postId}/comments` | 댓글 등록 → 201 Comment (재시도도 201) |
| DELETE | `/posts/{postId}/comments/{commentId}` | 본인 댓글 삭제 → 204 |

## 사진 업로드 → 게시

1. JPEG/PNG 사진을 한 장씩 `POST /images`의 `file`에 전송한다. 파일당 최대 **10MiB**. 서버가 JPEG로 변환하므로 반환된 치수/형식을 사용한다.
2. 응답의 `imageId`를 원하는 표시 순서대로 게시 요청에 담는다. `storageKey`를 클라이언트가 만들어 보내지 않는다.
3. 업로드 완료 후 24시간 안에 게시한다. 작성 취소 시 `DELETE /images/{imageId}`로 만료 처리할 수 있다. 정리가 끝나기 전까지 업로드 30개 한도에 포함된다.
4. 사진은 `GET /images/{imageId}`에 Authorization 헤더를 넣어 표시한다. 게시 전에는 본인만, 게시 후에는 활성 일반 회원이 볼 수 있다.

Image:

```json
{
  "imageId": 21,
  "storageKey": "private/feed/11111111-2222-3333-4444-555555555555.jpg",
  "width": 1200,
  "height": 1600,
  "contentType": "image/jpeg"
}
```

`storageKey`는 비공개 객체 식별자이며 **공개 CDN URL로 변환하면 안 된다.** 이미지 응답은 `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`다. 프론트도 이 사진에 영구 디스크 캐시를 강제하지 않고 로그아웃·삭제 시 표시를 비운다. 업로드 자체는 멱등하지 않으므로 응답을 받은 `imageId`를 재사용한다. 응답을 잃은 업로드는 만료 정리 대상이다.

POST `/posts`:

```json
{
  "clientPostId": "79bbc1e8-ae4c-4870-b7d0-e1b978517e8b",
  "boardType": "VERIFICATION",
  "content": "오늘 루틴 완료!",
  "imageIds": [21, 22],
  "routineCompletion": { "routineId": 15, "date": "2026-10-04" }
}
```

- `clientPostId`: 필수 UUID. 같은 등록 작업의 네트워크 재시도에는 같은 값, 새 글에는 새 값.
- `boardType`: `FREE` 또는 `VERIFICATION`. 생략/null은 구버전 호환을 위해 `VERIFICATION`. 다른 값은 400.
- `content`: 최대 2,000자, 앞뒤 공백 제거. 사진 없는 자유글은 비어 있지 않은 본문 필수. 사진이 있으면 생략/null/빈 문자열 허용.
- `imageIds`: 자유게시판 0–10개(생략/null은 빈 배열로 처리), 인증게시판 필수 1–10개. 양수, 중복 불가. 본인이 업로드한 미게시·미만료 사진만 허용.
- `routineCompletion`: 인증게시판 **필수**, 자유게시판 **금지**(보내면 400 `FEED_INPUT_INVALID`). 아래 [루틴 완료 연결](#루틴-완료-연결) 규칙을 따른다.
- 동일 사용자·UUID에 같은 게시판·정규화 본문·사진 순서·연결 루틴(`routineId`+`date`)이면 기존 글을 반환한다. 다른 요청 또는 삭제된 글이면 409 `FEED_REQUEST_CONFLICT`. 재시도 판정이 연결 필수 검사보다 먼저이므로, 이 규칙 이전에 연결 없이 등록된 인증글의 재시도도 원래 글을 돌려받는다.

### 루틴 완료 연결

인증게시판 글은 작성자의 루틴 완료 기록 하나를 가리킨다.

- `routineId`: 본인 루틴 id(양수). 오늘 현황·캘린더에서 받은 현재 id를 보낸다. 루틴 수정으로 갈린 옛 버전 id·삭제된 루틴 id도 본인 것이면 같은 계보로 판정한다.
- `date`: 완료한 날의 **Asia/Seoul 달력 날짜** `YYYY-MM-DD`(루틴 완료 기록의 `routineDate`와 같은 기준). 요청 시점 KST **오늘과 그 이전 6일(총 7일)** 만 허용하고 미래 날짜는 거절한다. 예: KST 2026-10-04이면 2026-09-28 ~ 2026-10-04.
- 해당 루틴 계보에 그 날짜의 `COMPLETED` 기록이 있어야 한다. 건너뜀(`SKIPPED`)·실패·미완료는 연결할 수 없다. 투두 완료는 연결 대상이 아니다.
- 위 조건 중 하나라도 어기면(남의 루틴·없는 루틴 포함) 400 `FEED_ROUTINE_COMPLETION_INVALID`. 루틴 존재 여부를 드러내지 않도록 사유를 구분하지 않는다. 형식이 틀린 날짜·`routineId` 누락은 공통 validation 400이다.
- 응답의 루틴 제목은 **연결 시점 스냅샷**이다(계보의 현재 살아 있는 버전 제목, 모두 삭제됐으면 요청한 버전의 제목). 연결 후 루틴 이름 변경·삭제·완료 취소는 기존 글의 배지를 바꾸지 않는다. 공개되는 것은 작성자가 고른 그 루틴의 제목·날짜뿐이다.

### 미니게임 기록 연결 (2026-10-14)

자유게시판 글은 작성자가 끝낸 랭킹전 한 판을 **기록 카드**로 붙일 수 있다. 앱은 새 최고 기록 + 그 게임 10판 이상일 때 [자랑하기]로 제안한다(서버는 이 조건을 검사하지 않는다).

- 요청: `minigameRecord: { "runId": "<UUID>" }`(선택). 자유게시판에서만 — `boardType` 생략은 이 필드가 있을 때만 `FREE`로 본다. `VERIFICATION`과 함께, 또는 `routineCompletion`과 함께 보내면 400 `FEED_INPUT_INVALID`.
- 그 판이 작성자의 것이고 서버 리플레이 검증을 통과해 끝난 판이어야 한다. 없음·남의 판·미완료는 구분 없이 400 `FEED_MINIGAME_RECORD_INVALID`.
- 응답 `minigameRecord`(nullable): `gameCode`, `score`(그 판의 검증 점수), `rank`(게시 시점 작성자 최고점 기준 순위 — 랭킹의 내 순위와 같은 식, 최고점 기록이 없으면 null), `personalBest`(그 판 점수 = 게시 시점 작성자 최고점), `achievedAt`(그 판 완료 시각, ISO instant). **게시 시점 스냅샷**이라 이후 랭킹이 바뀌어도 카드는 그대로다.
- 수정으로 기록을 붙이거나 바꿀 수 없다(`FeedUpdateRequest`에 필드 없음). 기록 있는 글을 `VERIFICATION`으로 바꾸면 400 `FEED_INPUT_INVALID`. 그 밖의 수정은 기록을 유지한다.
- 공개되는 것은 작성자 본인의 기록뿐이다(다른 회원 정보 없음). 같은 판을 여러 글에 붙이는 것은 막지 않는다.

### 게시물 수정

PATCH `/posts/{postId}`의 모든 필드는 선택이며 **생략한 필드는 유지**한다. `{ "content": "..." }`만 보내는 기존 요청은 이전과 똑같이 본문만 바꾼다.

```json
{
  "content": "수정할 본문",
  "boardType": "VERIFICATION",
  "routineCompletion": { "routineId": 15, "date": "2026-10-03" }
}
```

- `content`: 최대 2,000자. 결과 게시판이 인증게시판이거나 사진이 있는 글에만 빈 문자열을 허용한다. 세 필드를 모두 생략하면 400 `FEED_INPUT_INVALID`.
- `boardType` → `VERIFICATION`(자유글에서 전환): 사진이 1장 이상 있는 글만 가능하다(사진은 수정 불가, 없으면 400 `FEED_INPUT_INVALID`). 유효한 `routineCompletion`이 필요하다(없으면 400 `FEED_ROUTINE_COMPLETION_REQUIRED`).
- `boardType` → `FREE`(인증글에서 전환): 루틴 연결을 해제하고 응답 `routine`이 null이 된다. 사진 없는 글이 되는 경우는 없지만, 결과가 사진 없는 자유글이면 비어 있지 않은 본문이 필요하다.
- 인증글로 남는 수정: `routineCompletion`을 보내면 검증 후 교체, 생략하면 기존 연결(또는 연결 없음)을 유지한다. 기간 제한은 수정 요청 시점 KST 기준이다.
- 결과가 자유게시판인데 `routineCompletion`을 보내면 400 `FEED_INPUT_INVALID`.
- 게시판을 바꾼 글에 원래 등록 요청을 같은 `clientPostId`로 재전송하면 게시판이 달라 409다. 본문·연결 루틴만 바꾼 경우는 기존처럼 현재 글을 반환한다.

Post:

```json
{
  "postId": 100,
  "author": { "userId": 7, "nickname": "루틴친구", "profileImageKey": null },
  "boardType": "VERIFICATION",
  "content": "오늘 루틴 완료!",
  "routine": { "routineId": 15, "title": "아침 스트레칭", "date": "2026-10-04" },
  "images": [
    { "imageId": 21, "storageKey": "private/feed/11111111-2222-3333-4444-555555555555.jpg", "width": 1200, "height": 1600, "contentType": "image/jpeg" }
  ],
  "likeCount": 3,
  "commentCount": 1,
  "likedByMe": false,
  "mine": true,
  "createdAt": "2026-09-22T03:00:00Z",
  "updatedAt": "2026-09-22T03:00:00Z"
}
```

`images`는 요청한 순서다. `routine`은 인증글의 연결 루틴이며 자유글과 연결 없는 기존 인증글은 `null`이다(필드는 항상 존재). `nickname`, `profileImageKey`는 null 가능하므로 앱 기본 표시를 사용한다. `mine`/`likedByMe`는 요청자 기준이다. 본인 글에도 좋아요·댓글을 달 수 있다.

자유글 등록 예시(사진 업로드 없이 요청):

```json
{
  "clientPostId": "481e86b3-09bd-46ab-82fd-d834a1f3e7fc",
  "boardType": "FREE",
  "content": "오늘 하루는 어땠나요?",
  "imageIds": []
}
```

`Post.boardType`은 항상 `FREE` 또는 `VERIFICATION`이며 사진 없는 자유글의 `images`는 빈 배열이다. 기존 게시물은 `VERIFICATION`으로 반환한다. 인증게시판의 `routine`은 연결 시점에 서버가 완료 기록을 확인했다는 뜻이며, 사진 내용 자체를 검증하지는 않는다.

## 피드·게시판별·작성자별 목록

GET `/posts?boardType=FREE&size=20&cursor=100&authorId=7`

- `boardType`: `FREE` 또는 `VERIFICATION`. 생략하면 통합 피드다. 작성자·커서 조건과 함께 적용하며 잘못된 값은 400이다. 게시판 전환 시 cursor 없이 첫 페이지부터 조회한다.

- `authorId` 생략: 전체 피드, 지정: 해당 사용자 공개 게시물. 내 ID를 넣으면 내 목록이다. 존재하지 않거나 탈퇴한 작성자는 빈 목록이다.
- `size`: 기본 20, 1–50.
- `cursor`: 첫 페이지 생략. 이후 `nextCursor`를 그대로 전달한다(양수 postId, ID 내림차순).

```json
{ "items": [], "nextCursor": null, "hasNext": false }
```

결과가 있으면 `items`에 Post 배열이 들어간다. `hasNext=true`일 때 `nextCursor`는 현재 페이지 마지막 게시물 ID다. 수정·좋아요로 글 순서가 바뀌지 않는다. 서버는 탈퇴·삭제된 글을 제외한다.

## 댓글과 대댓글

POST `/posts/{postId}/comments`:

```json
{
  "clientCommentId": "c0e16543-cd6d-46a0-ae6e-8d82bf345c43",
  "content": "이 댓글에 대한 답글",
  "replyToCommentId": 301
}
```

- `clientCommentId`는 필수 UUID, `content`는 앞뒤 공백 제거 후 1~500자다. `replyToCommentId`는 선택 양수 ID이며 생략/null은 기존 일반 댓글이다.
- 지정한 대상은 같은 게시물의 삭제되지 않은 댓글이어야 한다. 없는 댓글, 다른 게시물, 탈퇴한 작성자, 요청자가 차단한 댓글/원댓글은 모두 `404 FEED_COMMENT_NOT_FOUND`다.
- 대댓글에 다시 답할 수 있다. 화면의 들여쓰기는 한 단계이며 서버는 `parentCommentId`를 최초 원댓글로 정규화하고 실제 대상은 `replyToCommentId`에 보존한다. 클라이언트가 `parentCommentId`를 결정하지 않는다.
- 같은 게시물, 작성자, UUID, 정규화 본문, 답글 대상이면 기존 결과를 반환한다. 본문/대상이 다르거나 등록 결과 자체가 삭제됐다면 409다. 일반 댓글의 기존 요청 hash는 유지한다. 성공한 답글을 재시도할 때 대상만 삭제/탈퇴했다면 기존 결과를 반환하며 알림을 다시 만들지 않는다.

Comment:

```json
{
  "commentId": 302,
  "postId": 100,
  "author": { "userId": 8, "nickname": "이웃", "profileImageKey": null },
  "content": "이 댓글에 대한 답글",
  "mine": true,
  "createdAt": "2026-10-18T03:02:00Z",
  "parentCommentId": 301,
  "replyToCommentId": 301,
  "deleted": false,
  "replyCount": 0
}
```

일반 댓글의 두 연결 ID는 null이다. `replyCount`는 원댓글에서만 해당 대화의 보이는 답글 수를 반환하며 대댓글에서는 0이다. 게시물 `commentCount`는 요청자가 볼 수 있는 살아 있는 일반 댓글과 대댓글의 합계이며 삭제 안내 자리는 세지 않는다.

- `GET /posts/{postId}/comments?size=20&cursor=301`: 기존처럼 살아 있는 댓글과 대댓글 **전체**를 오래된 ID부터 나열한다. 삭제 안내 자리는 포함하지 않는다.
- `GET /posts/{postId}/comments?topLevelOnly=true&size=20`: 원댓글만 나열한다. 앱은 원댓글별 `replyCount`로 답글 펼치기를 제공한다.
- `GET /posts/{postId}/comments/{commentId}/replies?size=20&cursor=302`: 지정한 **원댓글**의 모든 답글을 오래된 ID부터 나열한다. 답글에 쓴 답글도 같은 목록이며 실제 대상은 각 항목의 `replyToCommentId`다. 대댓글 ID를 원댓글 자리에 넣거나 요청자가 차단한 원댓글을 조회하면 404다.
- 모든 목록은 기존 Page 형식이며 cursor는 각 목록의 마지막 commentId, `size` 기본 20/최대 50이다. 늦게 추가된 답글은 해당 원댓글의 답글 목록을 다시 조회한다. 등록/삭제 후 앱은 해당 답글 목록과 원댓글 개수를 갱신한다.

본인 댓글만 기존 DELETE로 삭제한다. 원댓글을 지워도 다른 사람의 답글은 유지한다. 답글이 남은 삭제/탈퇴 원댓글은 `topLevelOnly=true`에서 다음 자리로 반환한다.

```json
{
  "commentId": 301,
  "postId": 100,
  "author": { "userId": null, "nickname": null, "profileImageKey": null },
  "content": "",
  "mine": false,
  "createdAt": "2026-10-18T03:00:00Z",
  "parentCommentId": null,
  "replyToCommentId": null,
  "deleted": true,
  "replyCount": 1
}
```

앱은 `deleted=true`에서 삭제 안내를 표시하고 작성자 프로필 이동과 해당 원댓글에 답글 쓰기를 제공하지 않는다. 살아 있는 대댓글에는 계속 답할 수 있다. 남은 답글이 없으면 삭제 안내 자리도 제외한다. 삭제/탈퇴한 대댓글은 제외하되 다른 댓글의 대상 ID는 유지할 수 있다. 대상이 없으면 앱은 작성자/본문을 추정하지 않는다. 물리 파기 시 대상 FK는 null로 바뀔 수 있다.

요청자가 차단한 원댓글의 대화는 전체 목록, 원댓글 목록, 답글 목록, 게시물 댓글 수에서 함께 숨긴다. 대댓글 작성자만 차단했다면 그 대댓글만 숨기며 모든 개수도 같은 조건을 따른다. 부모 게시물이 삭제되면 댓글 조회, 작성, 삭제와 답글 목록 모두 404다.

## 오류

기존 공통 ErrorResponse 형식을 따른다. 입력 형식/Bean Validation 오류는 공통 validation code가 나올 수 있다. 프론트는 `message` 원문 대신 `code`를 기준으로 안내 문구를 현지화한다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH_INVALID_TOKEN` 등 인증 코드 | 미인증·탈퇴·봇 접근 불가 |
| 400 | `FEED_INPUT_INVALID` | 본문/사진 수/중복 사진/커서/목록 크기 오류, 자유글에 루틴 연결, 사진 없는 글의 인증게시판 전환, 빈 수정 요청, 인증글·루틴 연결과 함께 보낸 미니게임 기록, 기록 있는 글의 인증게시판 전환 |
| 400 | `FEED_ROUTINE_COMPLETION_REQUIRED` | 인증게시판 등록·전환에 `routineCompletion` 누락 |
| 400 | `FEED_ROUTINE_COMPLETION_INVALID` | 본인 루틴이 아님·없음, 그 날짜 완료 기록 없음, KST 오늘~6일 전 밖·미래 날짜 |
| 400 | `FEED_MINIGAME_RECORD_INVALID` | 붙인 미니게임 판이 없음·남의 판·미완료(검증 전) |
| 400 | `FEED_CONTENT_BANNED` | 본문·댓글 금칙어 |
| 400 | `FEED_IMAGE_INVALID` | 실제 JPEG/PNG 아님, 용량·화소 제한, 손상 이미지 |
| 403 | `FEED_FORBIDDEN` | 다른 사람의 글·댓글·미게시 사진 변경 |
| 404 | `FEED_POST_NOT_FOUND` | 없거나 삭제/탈퇴로 숨긴 글 |
| 404 | `FEED_COMMENT_NOT_FOUND` | 답글 대상이 없거나 다른 글, 삭제/탈퇴/차단으로 숨겨짐, 답글 목록에 원댓글이 아닌 ID 지정 |
| 404 | `FEED_IMAGE_NOT_FOUND` | 없음·만료·삭제·탈퇴·타인의 미게시 사진 |
| 409 | `FEED_REQUEST_CONFLICT` | 재시도 UUID를 다른 요청/삭제 결과에 재사용 |
| 409 | `FEED_IMAGE_UNAVAILABLE` | 사진이 본인 소유/완료/미사용/유효 상태가 아님 |
| 429 | `FEED_UPLOAD_LIMIT` | 미사용 업로드 30개 상한. 취소·만료 정리 후 재시도 |
| 503 | `FEED_STORAGE_UNAVAILABLE` | 사진 저장소 일시 오류 |

HTTP multipart 전역 상한을 넘는 요청은 공통 업로드 오류로 먼저 거절될 수 있다. 삭제·탈퇴·재시도 세부 정책은 [기능 계약](features.md)을 따른다.


## 댓글 알림 연동

서버는 타인의 **새 댓글**에 대해 게시물 작성자에게 알림을 생성하고, 대댓글은 실제 대상 댓글 작성자에게도 답글 알림을 생성한다. 두 수신자가 같으면 답글 알림 하나만 저장한다. 본인 수신, 등록 재시도, 수신자가 작성자를 차단한 경우는 제외한다. 프론트는 별도 발송 API를 호출하지 않는다. 답글 알림도 기존 `FEED_COMMENT`, `FEED` 설정과 게시물 이동 경로를 사용하며 닉네임/원문을 복사하지 않는다.

- `GET /api/v1/notifications`의 `type=FEED_COMMENT`, `refId=postId`를 이용해 `GET /api/v1/feed/posts/{refId}` 상세와 댓글 화면을 연다.
- FCM data는 모든 값이 문자열이다: `{ "type": "FEED_COMMENT", "notificationId": "100", "postId": "42" }`. 알림 탭 시 로그인 상태를 복구한 뒤 게시물 42로 이동한다. `notificationId`는 기존 알림 읽음 처리에 사용한다.
- `GET/PATCH /api/v1/users/me/notification-settings`에 `feed` boolean이 추가된다. 기본 true, PATCH 생략 시 기존 값 유지. 예: `{ "feed": false }`. `all=false`도 피드 푸시를 막는다. 두 경우 모두 알림함 내역은 저장된다.
- 삭제·탈퇴로 게시물 상세가 404이면 삭제 안내 후 피드로 돌아간다. 이미 삭제된 댓글의 도착 알림일 수 있으므로 특정 댓글이 반드시 남아 있다고 가정하지 않는다.
- 기기 FCM 토큰 등록·알림 권한과 위 화면 이동/설정 UI 반영은 프론트 담당이다. 좋아요 알림은 이번 추가 범위에 포함하지 않는다.


### AI 답글의 대상 처리

사람이 AI 댓글에 직접 답하면 해당 AI 계정의 응답만 우선 예약한다. AI가 자동 응답할 때는 들어온 사람 댓글의 ID를 `replyToCommentId`로 고정하고 `parentCommentId`는 기존 작성 규칙으로 정규화한다. 사람이 보낸 API 요청이나 일반 댓글 계약은 바꾸지 않는다. AI 댓글로 자동 응답 작업이 재귀 생성되지 않으며 AI가 기존 댓글을 자발적으로 선택하는 경우 실제 관찰한 대상과 같은 게시물/접근권을 다시 검증한다.
