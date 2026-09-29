# 공개 SNS 피드 API

Prefix: `/api/v1/feed`. 모든 경로는 활성 일반 회원의 `Authorization: Bearer <accessToken>`이 필요하다. 요청 body의 작성자 ID를 받지 않는다. 피드 시각은 ISO-8601 UTC `Z`로 반환하며 표시 시 기기 시간대로 변환한다.

## 엔드포인트

| Method | Path | 결과 |
| --- | --- | --- |
| POST | `/images` | multipart `file` 한 장 업로드 → 201 Image |
| GET | `/images/{imageId}` | 권한 확인 후 JPEG 바이너리 → 200 |
| DELETE | `/images/{imageId}` | 본인의 미게시 업로드 취소 → 204 |
| POST | `/posts` | 게시물 등록 → 201 Post (재시도도 201) |
| GET | `/posts` | 전체/작성자별 커서 목록 → 200 Page<Post> |
| GET | `/posts/{postId}` | 게시물 상세 → 200 Post |
| PATCH | `/posts/{postId}` | 본인 본문 수정 → 200 Post |
| DELETE | `/posts/{postId}` | 본인 게시물 삭제 → 204 |
| PUT | `/posts/{postId}/like` | 좋아요 → 204 |
| DELETE | `/posts/{postId}/like` | 좋아요 취소 → 204 |
| GET | `/posts/{postId}/comments` | 댓글 커서 목록 → 200 Page<Comment> |
| POST | `/posts/{postId}/comments` | 댓글 등록 → 201 Comment (재시도도 201) |
| DELETE | `/posts/{postId}/comments/{commentId}` | 본인 댓글 삭제 → 204 |
| POST | `/posts/{postId}/reports` | 게시물 신고 → 201 Report (재신고도 201) |
| POST | `/posts/{postId}/comments/{commentId}/reports` | 댓글 신고 → 201 Report (재신고도 201) |

사용자 차단은 피드 prefix 밖의 `PUT/DELETE /api/v1/users/{userId}/block`, `GET /api/v1/me/blocks`다. [신고·차단](#신고차단) 절을 따른다.

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
  "content": "오늘 루틴 완료!",
  "imageIds": [21, 22]
}
```

- `clientPostId`: 필수 UUID. 같은 등록 작업의 네트워크 재시도에는 같은 값, 새 글에는 새 값.
- `content`: 생략/null/빈 문자열 허용, 최대 2,000자. 앞뒤 공백 제거.
- `imageIds`: 필수 1–10개, 양수, 중복 불가. 본인이 업로드한 미게시·미만료 사진만 허용.
- 동일 사용자·UUID에 같은 정규화 본문과 같은 사진 순서이면 기존 글을 반환한다. 다른 요청 또는 삭제된 글이면 409 `FEED_REQUEST_CONFLICT`.

PATCH `/posts/{postId}`는 `{ "content": "수정할 본문" }`만 받는다. `content`는 필수이고 빈 문자열은 허용한다. 사진 변경은 지원하지 않는다.

Post:

```json
{
  "postId": 100,
  "author": { "userId": 7, "nickname": "루틴친구", "profileImageKey": null },
  "content": "오늘 루틴 완료!",
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

`images`는 요청한 순서다. `nickname`, `profileImageKey`는 null 가능하므로 앱 기본 표시를 사용한다. `mine`/`likedByMe`는 요청자 기준이다. 본인 글에도 좋아요·댓글을 달 수 있다.

## 피드·작성자별 목록

GET `/posts?size=20&cursor=100&authorId=7`

- `authorId` 생략: 전체 피드, 지정: 해당 사용자 공개 게시물. 내 ID를 넣으면 내 목록이다. 존재하지 않거나 탈퇴한 작성자는 빈 목록이다.
- `size`: 기본 20, 1–50.
- `cursor`: 첫 페이지 생략. 이후 `nextCursor`를 그대로 전달한다(양수 postId, ID 내림차순).

```json
{ "items": [], "nextCursor": null, "hasNext": false }
```

결과가 있으면 `items`에 Post 배열이 들어간다. `hasNext=true`일 때 `nextCursor`는 현재 페이지 마지막 게시물 ID다. 수정·좋아요로 글 순서가 바뀌지 않는다. 서버는 탈퇴·삭제된 글을 제외한다.

## 댓글

POST `/posts/{postId}/comments`:

```json
{ "clientCommentId": "c0e16543-cd6d-46a0-ae6e-8d82bf345c43", "content": "멋져요!" }
```

`clientCommentId`는 필수 UUID다. 같은 게시물·작성자·UUID와 같은 정규화 본문이면 기존 댓글을 반환하고, 본문이 다르거나 댓글을 삭제했다면 409다. `content`는 공백만으로 구성할 수 없고 최대 500자다.

Comment:

```json
{
  "commentId": 301,
  "postId": 100,
  "author": { "userId": 8, "nickname": "이웃", "profileImageKey": null },
  "content": "멋져요!",
  "mine": true,
  "createdAt": "2026-09-22T03:02:00Z"
}
```

GET `/posts/{postId}/comments?size=20&cursor=301`은 **오래된 ID부터** 나열한다. 피드와 같은 Page 형식이며 cursor는 마지막 commentId, `size` 기본 20/최대 50이다. 댓글 작성 직후 반환된 Comment를 화면에 추가할 수 있다. 게시물 작성자도 타인의 댓글을 삭제할 수 없다. 부모 글이 삭제되면 댓글 조회·작성·삭제 모두 404다.

## 오류

기존 공통 ErrorResponse 형식을 따른다. 입력 형식/Bean Validation 오류는 공통 validation code가 나올 수 있다. 프론트는 `message` 원문 대신 `code`를 기준으로 안내 문구를 현지화한다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH_INVALID_TOKEN` 등 인증 코드 | 미인증·탈퇴·봇 접근 불가 |
| 400 | `FEED_INPUT_INVALID` | 본문/사진 수/중복 사진/커서/목록 크기 오류 |
| 400 | `FEED_CONTENT_BANNED` | 본문·댓글 금칙어 |
| 400 | `FEED_IMAGE_INVALID` | 실제 JPEG/PNG 아님, 용량·화소 제한, 손상 이미지 |
| 403 | `FEED_FORBIDDEN` | 다른 사람의 글·댓글·미게시 사진 변경 |
| 404 | `FEED_POST_NOT_FOUND` | 없거나 삭제/탈퇴로 숨긴 글 |
| 404 | `FEED_COMMENT_NOT_FOUND` | 해당 글의 댓글이 없음 |
| 404 | `FEED_IMAGE_NOT_FOUND` | 없음·만료·삭제·탈퇴·타인의 미게시 사진 |
| 409 | `FEED_REQUEST_CONFLICT` | 재시도 UUID를 다른 요청/삭제 결과에 재사용 |
| 409 | `FEED_IMAGE_UNAVAILABLE` | 사진이 본인 소유/완료/미사용/유효 상태가 아님 |
| 429 | `FEED_UPLOAD_LIMIT` | 미사용 업로드 30개 상한. 취소·만료 정리 후 재시도 |
| 503 | `FEED_STORAGE_UNAVAILABLE` | 사진 저장소 일시 오류 |
| 400 | `REPORT_SELF_TARGET` | 내 글·댓글·가구를 신고 |
| 400 | `BLOCK_SELF` | 나 자신을 차단 |
| 404 | `USER_NOT_FOUND` | 차단 대상이 없거나 탈퇴·봇 계정 |

HTTP multipart 전역 상한을 넘는 요청은 공통 업로드 오류로 먼저 거절될 수 있다. 삭제·탈퇴·재시도 세부 정책은 [기능 계약](features.md)을 따른다.


## 댓글 알림 연동

댓글 등록 성공 응답은 그대로다. 서버가 타인이 쓴 **새 댓글**에 대해 게시물 작성자에게 알림을 생성하므로 프론트가 별도 발송 API를 호출하지 않는다. 본인 댓글·등록 재시도는 제외한다.

- `GET /api/v1/notifications`의 `type=FEED_COMMENT`, `refId=postId`를 이용해 `GET /api/v1/feed/posts/{refId}` 상세와 댓글 화면을 연다.
- FCM data는 모든 값이 문자열이다: `{ "type": "FEED_COMMENT", "notificationId": "100", "postId": "42" }`. 알림 탭 시 로그인 상태를 복구한 뒤 게시물 42로 이동한다. `notificationId`는 기존 알림 읽음 처리에 사용한다.
- `GET/PATCH /api/v1/users/me/notification-settings`에 `feed` boolean이 추가된다. 기본 true, PATCH 생략 시 기존 값 유지. 예: `{ "feed": false }`. `all=false`도 피드 푸시를 막는다. 두 경우 모두 알림함 내역은 저장된다.
- 삭제·탈퇴로 게시물 상세가 404이면 삭제 안내 후 피드로 돌아간다. 이미 삭제된 댓글의 도착 알림일 수 있으므로 특정 댓글이 반드시 남아 있다고 가정하지 않는다.
- 기기 FCM 토큰 등록·알림 권한과 위 화면 이동/설정 UI 반영은 프론트 담당이다. 좋아요 알림은 이번 추가 범위에 포함하지 않는다.


## 신고·차단

App Store 심사 지침 1.2(사용자 생성 콘텐츠)의 신고·차단·운영자 조치 요건을 위한 API다. 가구 거래소 종목 신고도 같은 형식이다([거래소 API](../market/api.md#신고)).

### 신고

POST `/posts/{postId}/reports`, POST `/posts/{postId}/comments/{commentId}/reports`:

```json
{ "reason": "ABUSE", "detail": "욕설이 포함돼 있어요" }
```

- `reason`: 필수. `SPAM`(스팸·광고) / `ABUSE`(욕설·괴롭힘) / `SEXUAL`(선정적) / `VIOLENCE`(폭력·위협) / `PERSONAL_INFO`(개인정보 노출) / `COPYRIGHT`(저작권 침해) / `OTHER`(기타). 허용값 밖이면 요청 본문 오류(400)다.
- `detail`: 선택, 최대 500자. 앞뒤 공백을 제거하고 빈 문자열은 null로 저장한다. 금칙어 검사를 하지 않는다(운영자만 본다).
- 응답 201 Report: `{ "reportId": 12, "status": "RECEIVED" }`. `status`는 `RECEIVED`(검토 대기) / `ACTIONED`(숨김 조치) / `DISMISSED`(조치 없음 종료)다.
- **멱등**: 같은 사용자가 같은 대상을 다시 신고하면 새로 저장하지 않고 **기존 신고를 201로** 돌려준다(피드 등록 재시도와 같은 규칙). 사유·설명은 처음 값이 유지되고, 이미 처리된 신고면 처리 결과 `status`가 그대로 나온다.
- 신고해도 콘텐츠는 자동으로 숨겨지지 않는다(신고 수 임계값 없음). 운영자가 검토해 숨기거나 종료한다. 앱은 접수 즉시 "검토 중" 안내만 한다.
- 이미 차단한 사용자의 글·댓글도 ID를 알면 신고할 수 있다(차단은 조회만 막는다). 내 콘텐츠는 신고할 수 없다 → 400 `REPORT_SELF_TARGET`.
- 대상이 없거나 삭제·탈퇴로 숨겨졌으면 기존 404 코드다: 글 `FEED_POST_NOT_FOUND`, 댓글 `FEED_COMMENT_NOT_FOUND`(부모 글이 없으면 `FEED_POST_NOT_FOUND`).

### 사용자 차단

| Method | Path | 결과 |
| --- | --- | --- |
| PUT | `/api/v1/users/{userId}/block` | 차단 → 204 (이미 차단해도 204) |
| DELETE | `/api/v1/users/{userId}/block` | 차단 해제 → 204 (차단하지 않았어도 204) |
| GET | `/api/v1/me/blocks?cursor=&size=20` | 내가 차단한 사용자 커서 목록 → 200 Page<BlockedUser> |

BlockedUser:

```json
{ "userId": 8, "nickname": "이웃", "profileImageKey": null, "blockedAt": "2026-09-29T03:00:00Z" }
```

- 목록은 최근에 차단한 순서다. 피드와 같은 Page 형식(`items`, `nextCursor`, `hasNext`)이며 `size` 기본 20·1–50, `cursor`는 이전 응답의 `nextCursor`를 그대로 전달한다(차단 기록 ID라 `userId`와 다르다).
- 나 자신 차단은 400 `BLOCK_SELF`, 없거나 탈퇴한 회원·봇 계정은 404 `USER_NOT_FOUND`다. 해제는 대상이 탈퇴했어도 204다.
- **차단은 한 방향이다.** 차단한 사람의 화면에서만 상대를 숨기고, 상대에게 차단 사실을 알리지 않는다. 상대는 내 글을 계속 보고 댓글도 달 수 있다(내 목록에서는 보이지 않는다).
- 차단한 사람 기준으로:
  - 피드 목록·작성자별 목록에서 상대 게시물을 뺀다. 상대 게시물 상세·댓글 목록·좋아요·댓글 작성은 삭제된 글처럼 404 `FEED_POST_NOT_FOUND`다.
  - 다른 글의 댓글 목록에서 상대 댓글을 뺀다. **`commentCount`도 요청자 기준으로 상대 댓글을 빼고 센다.** `likeCount`는 누가 눌렀는지 드러나지 않으므로 전체 기준 그대로다.
  - 상대가 내 글에 댓글을 달아도 `FEED_COMMENT` 알림을 만들지 않는다(알림함·푸시 모두 없음).
  - 거래소 종목 목록에서 상대가 만든 가구를 뺀다([거래소 API](../market/api.md#차단)).
- 차단·해제는 즉시 반영된다. 이미 받아 둔 화면은 프론트가 차단 직후 상대 콘텐츠를 목록에서 지우고 새로고침한다.
- 회원탈퇴 시 그 회원이 한 차단과 그 회원을 대상으로 한 차단을 모두 지운다.
