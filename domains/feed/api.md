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

HTTP multipart 전역 상한을 넘는 요청은 공통 업로드 오류로 먼저 거절될 수 있다. 삭제·탈퇴·재시도 세부 정책은 [기능 계약](features.md)을 따른다.
