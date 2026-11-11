# 공개 SNS 피드 API

Prefix: `/api/v1/feed`. 모든 경로는 활성 일반 회원의 `Authorization: Bearer <accessToken>`이 필요하다. 요청 body의 작성자 ID를 받지 않는다. 피드 시각은 ISO-8601 UTC `Z`로 반환하며 표시 시 기기 시간대로 변환한다.

## 엔드포인트

| Method | Path | 결과 |
| --- | --- | --- |
| POST | `/images` | multipart `file` 한 장 업로드 → 201 Image |
| GET | `/images/{imageId}` | 권한 확인 후 JPEG 바이너리 → 200 |
| DELETE | `/images/{imageId}` | 본인의 미게시 업로드 취소 → 204 |
| POST | `/posts` | 게시물 등록 → 201 Post (재시도도 201) |
| GET | `/posts` | 전체/게시판별/작성자별/집별 커서 목록 → 200 Page<Post> |
| GET | `/posts/{postId}` | 게시물 상세 → 200 Post |
| GET | `/posts/{postId}/houses` | 작성자가 참여 중인 집 선택 목록 → 200 `{ items }` |
| POST | `/posts/{postId}/houses/{houseId}/join` | 설정에 따른 즉시입주 또는 승인 대기 신청 → 200 HouseJoinResponse |
| PATCH | `/posts/{postId}` | 본인 본문·게시판·연결 루틴 수정 → 200 Post |
| DELETE | `/posts/{postId}` | 본인 게시물 삭제(집 글은 그 집의 현재 방장도 가능) → 204 |
| PUT | `/posts/{postId}/like` | 좋아요 → 204 |
| DELETE | `/posts/{postId}/like` | 좋아요 취소 → 204 |
| GET | `/posts/{postId}/comments` | 전체 댓글 또는 원댓글 커서 목록 → 200 Page<Comment> |
| GET | `/posts/{postId}/comments/{commentId}/replies` | 원댓글의 대댓글 커서 목록 → 200 Page<Comment> |
| POST | `/posts/{postId}/comments` | 댓글 등록 → 201 Comment (재시도도 201) |
| DELETE | `/posts/{postId}/comments/{commentId}` | 본인 댓글 삭제(집 글의 댓글은 그 집의 현재 방장도 가능) → 204 |

집별 새 글 푸시 설정은 prefix가 다른 `/api/v1/houses/{houseId}/feed/notification`을 쓴다. [집 피드 새 글 푸시와 집별 알림 설정](#집-피드-새-글-푸시와-집별-알림-설정)을 따른다.

## 게시물에서 작성자의 집에 참여 (2026-11-11)

게시물의 버튼 문구는 **입주 신청**으로 통일합니다. 누르면 작성자가 현재 ACTIVE 구성원인 집을 최신 생성순으로 보여주고 사용자가 어느 집에 신청할지 선택합니다. 작성자가 방장인 집뿐 아니라 일반 구성원으로 참여한 집도 포함하며 **비공개 집도 포함**합니다. 삭제된 집과 작성자가 탈퇴 또는 강퇴된 집은 제외합니다. 집이 없으면 `items=[]`입니다.

GET `/posts/{postId}/houses`의 항목 필드:

- `houseId`, `name`, `coverImageKey`, `level`, `displayMode`(`DIORAMA` 또는 `CLASSIC`), `isPublic`
- `requiresApproval`: 기존 [자동 입주 설정](../house/api.md#온보딩-자동-입주-허용-설정)이 꺼져 있으면 true, 켜져 있으면 false입니다. 공개 여부와 독립적으로 판정합니다.
- `currentMemberCount`: 동거 봇을 제외한 실사용자 수. `maxMembers=null`은 무제한입니다.
- `isMember`, `isFull`, `myMembershipStatus`(ACTIVE, LEFT, KICKED 또는 이력 없으면 null)
- `myJoinRequestStatus`: PENDING, REJECTED 또는 null. 이미 구성원이면 null입니다.
- `canJoin`: 구성원, 강퇴 이력, 실사용자로 만석인 집은 false입니다. 승인 필요 집의 PENDING도 false이며, 바로 입주 설정 집의 PENDING은 true입니다.

초대코드와 구성원 활동 정보는 반환하지 않습니다. 집별 안내 문구로 승인 후 입주와 신청 즉시 입주를 구분하되 참여 버튼은 입주 신청으로 표시합니다. 이미 구성원인 집은 집으로 가기를 제공합니다.

POST `/posts/{postId}/houses/{houseId}/join`은 요청 본문 없이 인증된 사용자로 참여합니다. 서버는 집 행 락 아래 작성자가 해당 집의 ACTIVE 구성원인지, 정원과 신청자 강퇴 이력을 다시 확인합니다. 임의의 비공개 집 ID만으로 참여할 수 없습니다.

- **바로 입주 설정이 켜진 집**: 즉시 MEMBER, ACTIVE 구성원으로 입주하고 구성원 수를 증가시킵니다. LEFT 이력은 재활성화하며 기존 PENDING 신청은 ACCEPTED로 종결합니다. 응답은 `{ membershipId, houseId, status: "ACTIVE", pendingApproval: false, joinRequestId: null }`입니다.
- **설정이 꺼진 집**: 공개 여부와 무관하게 방장 승인 대기 신청을 생성하고 실제 방장에게 신청 도착 알림을 저장합니다. 거절된 신청은 재오픈합니다. 멤버십과 구성원 수는 변경하지 않습니다. 응답은 `{ membershipId: null, houseId, status: null, pendingApproval: true, joinRequestId }`입니다. 기존 집 신청 수락 및 거절 API를 사용합니다.
- 즉시입주와 신청 모두 코드 입력이 필요 없습니다. 동거 봇이 채운 자리는 신청할 수 있으며 실제 입주 때 봇이 양보합니다. 정원 검사, 가입 상태 변경, 신청 종결, 입주 알림 저장은 한 트랜잭션으로 처리합니다.

오류:

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH_INVALID_TOKEN` | 미인증, 탈퇴 회원 또는 동거 봇 |
| 404 | `FEED_POST_NOT_FOUND` | 없는 게시물, 삭제, 작성자 탈퇴, 요청자가 작성자를 차단, [집 글](#집-글-집-구성원-한정)(요청자가 그 집 구성원이어도 동일) |
| 404 | `HOUSE_NOT_FOUND` | 없는 집, 삭제된 집 또는 작성자가 현재 ACTIVE 구성원이 아님 |
| 409 | `HOUSE_FULL` | 실사용자로 만석 |
| 409 | `HOUSE_KICKED_MEMBER` | 신청자 강퇴 이력 |
| 409 | `HOUSE_ALREADY_MEMBER` | 이미 구성원. 앱은 해당 집으로 이동할 수 있음 |
| 409 | `HOUSE_JOIN_REQUEST_ALREADY_PENDING` | 승인 필요 집에 이미 신청 중 |

비공개 집의 기존 preview는 비구성원에게 열지 않습니다. 목록 카드에서 집을 선택하며, 실제 입주 확정 후 기존 집 상세를 조회합니다. 기존 탐색의 공개 집 필터와 초대코드의 계약은 유지합니다.

## 사진 업로드 → 게시

1. JPEG/PNG 사진을 한 장씩 `POST /images`의 `file`에 전송한다. 파일당 최대 **10MiB**. 서버가 JPEG로 변환하므로 반환된 치수/형식을 사용한다.
2. 응답의 `imageId`를 원하는 표시 순서대로 게시 요청에 담는다. `storageKey`를 클라이언트가 만들어 보내지 않는다.
3. 업로드 완료 후 24시간 안에 게시한다. 작성 취소 시 `DELETE /images/{imageId}`로 만료 처리할 수 있다. 정리가 끝나기 전까지 업로드 30개 한도에 포함된다.
4. 사진은 `GET /images/{imageId}`에 Authorization 헤더를 넣어 표시한다. 게시 전에는 본인만, 게시 후에는 활성 일반 회원이 볼 수 있다. [집 글](#집-글-집-구성원-한정)에 연결된 사진은 그 집 구성원만 볼 수 있다.

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
- `content`: 최대 2,000자, 앞뒤 공백 제거. 사진 없는 자유글은 비어 있지 않은 본문 필수. 인증게시판이거나 사진이 있으면 생략/null/빈 문자열 허용.
- `imageIds`: 자유게시판 0–10개(생략/null은 빈 배열로 처리), 인증게시판 0–10개(선택). 양수, 중복 불가. 본인이 업로드한 미게시·미만료 사진만 허용.
- `routineCompletion`: 인증게시판 **필수**, 자유게시판 **금지**(보내면 400 `FEED_INPUT_INVALID`). 아래 [루틴 완료 연결](#루틴-완료-연결) 규칙을 따른다.
- `houseId`: 선택, 양수. 지정하면 그 집 구성원만 보는 집 글로 등록하고 생략/null이면 공개 글로 등록한다. 등록 뒤에는 바꿀 수 없다. [집 글](#집-글-집-구성원-한정) 규칙을 따른다.
- 동일 사용자·UUID에 같은 게시판·정규화 본문·사진 순서·연결 루틴(`routineId`+`date`)·`houseId`이면 기존 글을 반환한다. 다른 요청 또는 삭제된 글이면 409 `FEED_REQUEST_CONFLICT`. 재시도 판정이 연결 필수 검사보다 먼저이므로, 이 규칙 이전에 연결 없이 등록된 인증글의 재시도도 원래 글을 돌려받는다.

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
- `boardType` → `VERIFICATION`(자유글에서 전환): 유효한 `routineCompletion`이 필요하다(없으면 400 `FEED_ROUTINE_COMPLETION_REQUIRED`).
- `boardType` → `FREE`(인증글에서 전환): 루틴 연결을 해제하고 응답 `routine`이 null이 된다. 결과가 사진 없는 자유글이면 비어 있지 않은 본문이 필요하다.
- 인증글로 남는 수정: `routineCompletion`을 보내면 검증 후 교체, 생략하면 기존 연결(또는 연결 없음)을 유지한다. 기간 제한은 수정 요청 시점 KST 기준이다.
- 결과가 자유게시판인데 `routineCompletion`을 보내면 400 `FEED_INPUT_INVALID`.
- 게시판을 바꾼 글에 원래 등록 요청을 같은 `clientPostId`로 재전송하면 게시판이 달라 409다. 본문·연결 루틴만 바꾼 경우는 기존처럼 현재 글을 반환한다.

Post:

```json
{
  "postId": 100,
  "author": { "userId": 7, "nickname": "루틴친구", "profileImageKey": null },
  "boardType": "VERIFICATION",
  "houseId": null,
  "content": "오늘 루틴 완료!",
  "routine": { "routineId": 15, "title": "아침 스트레칭", "date": "2026-10-04" },
  "images": [
    { "imageId": 21, "storageKey": "private/feed/11111111-2222-3333-4444-555555555555.jpg", "width": 1200, "height": 1600, "contentType": "image/jpeg" }
  ],
  "likeCount": 3,
  "commentCount": 1,
  "likedByMe": false,
  "mine": true,
  "deletable": true,
  "createdAt": "2026-09-22T03:00:00Z",
  "updatedAt": "2026-09-22T03:00:00Z"
}
```

`images`는 요청한 순서다. `routine`은 인증글의 연결 루틴이며 자유글과 연결 없는 기존 인증글은 `null`이다(필드는 항상 존재). `houseId`는 글이 속한 집 ID이며 공개 글은 `null`이다(필드는 항상 존재). `nickname`, `profileImageKey`는 null 가능하므로 앱 기본 표시를 사용한다. `mine`/`likedByMe`/`deletable`은 요청자 기준이다. `deletable`은 요청자가 이 글을 지울 수 있는지이며, 본인 글이거나 [집 글](#집-글-집-구성원-한정)에서 요청자가 그 집의 현재 방장이면 true다. 공개 글에서는 `mine`과 같다. 수정은 본인만 할 수 있으므로 수정 가능 여부는 기존 `mine`으로 판단한다. 본인 글에도 좋아요·댓글을 달 수 있다.

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
- `houseId`: 선택, 양수. 생략하면 공개 글만 조회한다(집 글은 전체·게시판별·작성자별 목록에 섞이지 않는다). 지정하면 구성원 검사 후 그 집 글만 조회하며 `boardType`·`authorId`·`cursor`·`size`를 그대로 조합할 수 있다. 구성원이 아니면 403 `HOUSE_NOT_MEMBER`, 없는 집·삭제된 집이면 404 `HOUSE_NOT_FOUND`다.
- `size`: 기본 20, 1–50.
- `cursor`: 첫 페이지 생략. 이후 `nextCursor`를 그대로 전달한다(양수 postId, ID 내림차순).

```json
{ "items": [], "nextCursor": null, "hasNext": false }
```

결과가 있으면 `items`에 Post 배열이 들어간다. `hasNext=true`일 때 `nextCursor`는 현재 페이지 마지막 게시물 ID다. 수정·좋아요로 글 순서가 바뀌지 않는다. 서버는 탈퇴·삭제된 글을 제외한다.

## 집 글 (집 구성원 한정)

글·댓글·좋아요·사진에는 새 경로가 없다. 기존 `/api/v1/feed` 경로에 집 범위를 더한다. 집별 새 글 푸시 설정만 [별도 경로](#집-피드-새-글-푸시와-집별-알림-설정)를 쓴다. `houseId`가 있는 글은 그 집 구성원만 읽고 쓰는 집 글이고, `houseId`가 null인 글은 기존 공개 글이다. 한 글은 한 집에만 속하며 등록 뒤 범위를 바꿀 수 없다(PATCH 요청에 `houseId` 필드가 없다).

집 글 등록 예시:

```json
{
  "clientPostId": "5d0b8a4e-3f0c-4f0e-9a43-0a3a6d1f2b77",
  "boardType": "FREE",
  "content": "이번 주 청소 당번 정해요",
  "imageIds": [],
  "houseId": 12
}
```

- **참여 대상**: 삭제되지 않은 집의 ACTIVE 구성원인 활성 일반 회원이다. 집을 나갔거나(LEFT) 강퇴된(KICKED) 회원, 동거 봇, AI 계정은 구성원이 아닌 것으로 응답한다.
- **글 종류·제한**: 공개 글과 같은 요청 필드와 검증을 쓴다(`boardType`, `content`, `imageIds`, `routineCompletion`, `minigameRecord`). 응답도 같은 Post이며 `houseId`만 채워진다.
- **집을 직접 지정한 요청** — `POST /posts`의 `houseId`, `GET /posts?houseId=`:
  - 집이 없거나 삭제됐으면 404 `HOUSE_NOT_FOUND`.
  - 집은 있지만 요청자가 참여 대상이 아니면 403 `HOUSE_NOT_MEMBER`.
  - 등록에서는 이 검사가 재시도 판정보다 먼저다. 집을 나간 뒤 같은 `clientPostId`로 재시도해도 기존 글을 돌려받지 않고 403이다.
- **글 ID로 접근하는 요청** — `GET·PATCH·DELETE /posts/{postId}`, `PUT·DELETE /posts/{postId}/like`, `GET·POST /posts/{postId}/comments`, `GET /posts/{postId}/comments/{commentId}/replies`, `DELETE /posts/{postId}/comments/{commentId}`: 집 글인데 요청자가 참여 대상이 아니거나 집이 삭제됐으면 404 `FEED_POST_NOT_FOUND`다. 없는 글과 같은 응답으로 집 글의 존재를 숨긴다. 본인이 쓴 글·댓글이어도 집을 나간 뒤에는 같은 404이며 재입주하면 다시 접근할 수 있다.
- **사진** — `GET /images/{imageId}`: 집 글에 연결된 사진은 참여 대상만 조회한다. 그 외에는 404 `FEED_IMAGE_NOT_FOUND`(집을 나간 업로더 본인 포함).
- **신고** — `POST /posts/{postId}/reports`, `POST /posts/{postId}/comments/{commentId}/reports`: 집 글과 그 댓글은 참여 대상만 신고할 수 있다. 그 외에는 404 `FEED_POST_NOT_FOUND`.
- **입주 신청** — `GET /posts/{postId}/houses`, `POST /posts/{postId}/houses/{houseId}/join`: 집 글이면 요청자가 그 집 구성원이어도 404 `FEED_POST_NOT_FOUND`다.
- **수정 권한**: 공개 글과 같이 작성자 본인만 수정한다. 방장을 포함해 다른 사람의 글을 수정하면 403 `FEED_FORBIDDEN`이다.
- **삭제 권한** — `DELETE /posts/{postId}`, `DELETE /posts/{postId}/comments/{commentId}`: 집 글과 그 글의 댓글·답글은 작성자 본인 또는 그 집의 현재 방장이 삭제한다.
  - 방장은 요청 시점에 그 집의 방장 역할(`OWNER`)인 참여 대상이다. 방장이 바뀌면 새 방장만 이 권한을 갖는다.
  - 방장이 아닌 구성원이 다른 사람의 글·댓글을 삭제하면 403 `FEED_FORBIDDEN`이다. 참여 대상이 아니면 위 규칙대로 404 `FEED_POST_NOT_FOUND`다.
  - 공개 글과 그 댓글에는 방장 권한이 없다. 기존대로 본인만 삭제한다.
  - 방장 삭제의 효과는 본인 삭제와 같다. 글은 본문·연결 루틴·미니게임 기록을 비우고 댓글·좋아요를 제거하며 사진은 비동기 정리한다. 댓글은 본문을 비우는 삭제이며 다른 사람의 답글은 유지한다.
  - 방장이 지워도 작성자에게 알림을 보내지 않는다.
  - 요청자가 지울 수 있는지는 글·댓글 응답의 `deletable`로 알린다.
- **재시도**: 같은 `clientPostId`를 다른 `houseId`로 보내거나, 집 글로 올린 값을 `houseId` 없이(또는 공개 글로 올린 값을 `houseId`와 함께) 다시 보내면 409 `FEED_REQUEST_CONFLICT`다.
- **차단**: 요청자가 차단한 작성자의 글·댓글은 같은 집 안에서도 기존 규칙대로 숨긴다(목록 제외, 상세 404).
- 나간·강퇴된 구성원이 쓴 글·댓글·사진은 남은 구성원에게 계속 보이고, 새로 입주한 구성원은 입주 전에 올라온 글도 조회한다. 그 밖의 규칙은 [기능 계약](features.md#집-피드-집-구성원-한정)을 따른다.

## 집 피드 새 글 푸시와 집별 알림 설정

집에 새 글이 올라오면 그 집 구성원에게 FCM 푸시를 보낸다. 구성원은 집마다 자유글·인증글 푸시를 따로 켜고 끈다. 이 설정만 `/api/v1/feed`가 아닌 집 경로를 쓴다.

| Method | Path | 결과 |
| --- | --- | --- |
| GET | `/api/v1/houses/{houseId}/feed/notification` | 본인의 이 집 새 글 푸시 설정 조회 → 200 HouseFeedNotification |
| PUT | `/api/v1/houses/{houseId}/feed/notification` | 본인의 이 집 새 글 푸시 설정 변경 → 200 HouseFeedNotification |

HouseFeedNotification:

```json
{ "houseId": 12, "freePostPush": true, "verificationPostPush": false }
```

- `freePostPush`: 이 집의 자유글 새 글 푸시를 받을지. 기본 true.
- `verificationPostPush`: 이 집의 인증글 새 글 푸시를 받을지. 기본 false.
- 한 번도 바꾸지 않았으면 기본값을 응답한다. 조회만으로는 설정을 저장하지 않는다.
- PUT 요청은 `{ "verificationPostPush": true }`처럼 바꿀 필드만 보낸다. 두 필드 모두 선택 boolean이며 생략/null인 쪽은 기존 값을 유지한다. 둘 다 생략하면 400 `FEED_INPUT_INVALID`다. 응답은 변경이 반영된 전체 설정이며 GET과 같은 형태다.
- 권한: 그 집의 [참여 대상](#집-글-집-구성원-한정)만 조회·변경한다. 집이 없거나 삭제됐으면 404 `HOUSE_NOT_FOUND`, 집은 있지만 참여 대상이 아니면 403 `HOUSE_NOT_MEMBER`다.
- 설정은 집마다 따로 저장한다. 집을 나가도 값은 남아 재입주하면 그대로 적용된다. 집 채팅의 방별 음소거와는 독립이다.

### 새 글 푸시

- 발송 시점: 집 글이 새로 등록돼 커밋된 뒤 비동기로 보낸다. 같은 `clientPostId` 재시도로 기존 글을 돌려주는 경우, 수정, 게시판 전환에는 보내지 않는다. 공개 글에는 보내지 않는다. 푸시 실패는 글 등록 응답에 영향을 주지 않으며 자동 재발송하지 않는다(best-effort).
- 푸시 전용이다. 알림함(`notification`)에는 저장하지 않으므로 `GET /api/v1/notifications`에 나타나지 않고 `notificationId`도 없다. 알림 타입은 `HOUSE_FEED_POST`, 설정 그룹은 `FEED`다(집 채팅의 `CHAT_MESSAGE`와 같은 방식).
- 수신 대상: 그 집의 ACTIVE 구성원 중 작성자 본인, 동거 봇, AI 계정, 탈퇴 회원을 제외한 인원이다. 그중 다음에 해당하면 보내지 않는다.
  - 그 글 종류의 집별 설정이 꺼져 있음(자유글은 `freePostPush`, 인증글은 `verificationPostPush`). 설정을 바꾼 적이 없으면 기본값으로 판정하므로 자유글은 받고 인증글은 받지 않는다.
  - 수신자가 작성자를 차단함.
  - 수신자가 알림 설정(`/api/v1/users/me/notification-settings`)의 마스터 `all` 또는 `feed`를 끔.
- 발송 직전에 글이 삭제됐거나 작성자가 탈퇴했거나 집이 삭제됐으면 보내지 않는다.
- 문구는 수신자의 저장 언어를 따른다. 제목은 집 이름이고 본문에 글 내용은 싣지 않는다.
  - 자유글: `{닉네임}님이 새 글을 올렸어요` / `{nickname} shared a new post`
  - 인증글: `{닉네임}님이 '{루틴 제목}' 인증글을 올렸어요` / `{nickname} shared a check-in for '{routine}'`. 루틴 제목은 글에 연결된 스냅샷이다.
  - 연결 루틴이 없는 인증글: `{닉네임}님이 인증글을 올렸어요` / `{nickname} shared a check-in`
  - 작성자 닉네임이 없으면 `이웃` / `A neighbor`를 쓴다.
- FCM data는 모든 값이 문자열이다: `{ "type": "HOUSE_FEED_POST", "houseId": "12", "postId": "42", "boardType": "FREE" }`. `boardType`은 `FREE` 또는 `VERIFICATION`이다.
- 배포 후 유예: 집 피드 화면이 없는 구버전 앱에 열 수 없는 푸시가 가지 않도록, 집별 설정 테이블(`house_feed_notification_settings`)의 migration이 서버에 적용된 시각부터 24시간 동안은 새 글 푸시를 아무에게도 보내지 않는다. 유예 시간은 서버 설정 `feed.house-post-push.grace`(기본 `24h`, `0s`면 유예 없음)다. 적용 시각을 읽지 못하면 보내지 않는다. 글 등록·조회와 위 설정 API는 유예와 무관하게 동작한다.

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
  "replyCount": 0,
  "deletable": true
}
```

일반 댓글의 두 연결 ID는 null이다. `replyCount`는 원댓글에서만 해당 대화의 보이는 답글 수를 반환하며 대댓글에서는 0이다. 게시물 `commentCount`는 요청자가 볼 수 있는 살아 있는 일반 댓글과 대댓글의 합계이며 삭제 안내 자리는 세지 않는다. `deletable`은 요청자가 이 댓글을 지울 수 있는지이며, 본인 댓글이거나 [집 글](#집-글-집-구성원-한정)의 댓글에서 요청자가 그 집의 현재 방장이면 true다. 삭제 안내 자리는 항상 false다.

- `GET /posts/{postId}/comments?size=20&cursor=301`: 기존처럼 살아 있는 댓글과 대댓글 **전체**를 오래된 ID부터 나열한다. 삭제 안내 자리는 포함하지 않는다.
- `GET /posts/{postId}/comments?topLevelOnly=true&size=20`: 원댓글만 나열한다. 앱은 원댓글별 `replyCount`로 답글 펼치기를 제공한다.
- `GET /posts/{postId}/comments/{commentId}/replies?size=20&cursor=302`: 지정한 **원댓글**의 모든 답글을 오래된 ID부터 나열한다. 답글에 쓴 답글도 같은 목록이며 실제 대상은 각 항목의 `replyToCommentId`다. 대댓글 ID를 원댓글 자리에 넣거나 요청자가 차단한 원댓글을 조회하면 404다.
- 모든 목록은 기존 Page 형식이며 cursor는 각 목록의 마지막 commentId, `size` 기본 20/최대 50이다. 늦게 추가된 답글은 해당 원댓글의 답글 목록을 다시 조회한다. 등록/삭제 후 앱은 해당 답글 목록과 원댓글 개수를 갱신한다.

댓글은 작성자 본인이 기존 DELETE로 삭제한다. [집 글](#집-글-집-구성원-한정)의 댓글은 그 집의 현재 방장도 삭제할 수 있고, 그 밖의 요청자는 403 `FEED_FORBIDDEN`이다. 원댓글을 지워도 다른 사람의 답글은 유지한다. 답글이 남은 삭제/탈퇴 원댓글은 `topLevelOnly=true`에서 다음 자리로 반환한다.

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
  "replyCount": 1,
  "deletable": false
}
```

앱은 `deleted=true`에서 삭제 안내를 표시하고 작성자 프로필 이동과 해당 원댓글에 답글 쓰기를 제공하지 않는다. 살아 있는 대댓글에는 계속 답할 수 있다. 남은 답글이 없으면 삭제 안내 자리도 제외한다. 삭제/탈퇴한 대댓글은 제외하되 다른 댓글의 대상 ID는 유지할 수 있다. 대상이 없으면 앱은 작성자/본문을 추정하지 않는다. 물리 파기 시 대상 FK는 null로 바뀔 수 있다.

요청자가 차단한 원댓글의 대화는 전체 목록, 원댓글 목록, 답글 목록, 게시물 댓글 수에서 함께 숨긴다. 대댓글 작성자만 차단했다면 그 대댓글만 숨기며 모든 개수도 같은 조건을 따른다. 부모 게시물이 삭제되면 댓글 조회, 작성, 삭제와 답글 목록 모두 404다.

## 오류

기존 공통 ErrorResponse 형식을 따른다. 입력 형식/Bean Validation 오류는 공통 validation code가 나올 수 있다. 프론트는 `message` 원문 대신 `code`를 기준으로 안내 문구를 현지화한다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH_INVALID_TOKEN` 등 인증 코드 | 미인증·탈퇴·봇 접근 불가 |
| 400 | `FEED_INPUT_INVALID` | 본문/사진 수/중복 사진/커서/목록 크기 오류, 자유글에 루틴 연결, 빈 수정 요청, 인증글·루틴 연결과 함께 보낸 미니게임 기록, 기록 있는 글의 인증게시판 전환, 집별 새 글 푸시 설정 변경에 두 필드 모두 생략 |
| 400 | `FEED_ROUTINE_COMPLETION_REQUIRED` | 인증게시판 등록·전환에 `routineCompletion` 누락 |
| 400 | `FEED_ROUTINE_COMPLETION_INVALID` | 본인 루틴이 아님·없음, 그 날짜 완료 기록 없음, KST 오늘~6일 전 밖·미래 날짜 |
| 400 | `FEED_MINIGAME_RECORD_INVALID` | 붙인 미니게임 판이 없음·남의 판·미완료(검증 전) |
| 400 | `FEED_CONTENT_BANNED` | 본문·댓글 금칙어 |
| 400 | `FEED_IMAGE_INVALID` | 실제 JPEG/PNG 아님, 용량·화소 제한, 손상 이미지 |
| 403 | `FEED_FORBIDDEN` | 다른 사람의 글·댓글·미게시 사진 변경. 단 집 글과 그 댓글의 삭제는 그 집의 현재 방장에게 허용 |
| 403 | `HOUSE_NOT_MEMBER` | `houseId`를 지정한 등록·목록과 집별 새 글 푸시 설정에서 요청자가 그 집 ACTIVE 구성원(일반 회원)이 아님 |
| 404 | `HOUSE_NOT_FOUND` | `houseId`를 지정한 등록·목록과 집별 새 글 푸시 설정에서 없는 집·삭제된 집 |
| 404 | `FEED_POST_NOT_FOUND` | 없거나 삭제/탈퇴로 숨긴 글, 요청자가 구성원이 아닌 집의 글·삭제된 집의 글 |
| 404 | `FEED_COMMENT_NOT_FOUND` | 답글 대상이 없거나 다른 글, 삭제/탈퇴/차단으로 숨겨짐, 답글 목록에 원댓글이 아닌 ID 지정 |
| 404 | `FEED_IMAGE_NOT_FOUND` | 없음·만료·삭제·탈퇴·타인의 미게시 사진, 요청자가 구성원이 아닌 집 글의 사진 |
| 409 | `FEED_REQUEST_CONFLICT` | 재시도 UUID를 다른 요청/삭제 결과에 재사용(다른 `houseId` 포함) |
| 409 | `FEED_IMAGE_UNAVAILABLE` | 사진이 본인 소유/완료/미사용/유효 상태가 아님 |
| 429 | `FEED_UPLOAD_LIMIT` | 미사용 업로드 30개 상한. 취소·만료 정리 후 재시도 |
| 503 | `FEED_STORAGE_UNAVAILABLE` | 사진 저장소 일시 오류, 사진 디코딩 차례를 5초 안에 얻지 못함(서버 프로세스당 동시 1개, 채팅 업로드와 공유) |

HTTP multipart 전역 상한을 넘는 요청은 공통 업로드 오류로 먼저 거절될 수 있다. 삭제·탈퇴·재시도 세부 정책은 [기능 계약](features.md)을 따른다.


## 댓글 알림 연동

서버는 타인의 **새 댓글**에 대해 게시물 작성자에게 알림을 생성하고, 대댓글은 실제 대상 댓글 작성자에게도 답글 알림을 생성한다. 두 수신자가 같으면 답글 알림 하나만 저장한다. 본인 수신, 등록 재시도, 수신자가 작성자를 차단한 경우는 제외한다. 프론트는 별도 발송 API를 호출하지 않는다. 답글 알림도 기존 `FEED_COMMENT`, `FEED` 설정과 게시물 이동 경로를 사용하며 닉네임/원문을 복사하지 않는다.

- `GET /api/v1/notifications`의 `type=FEED_COMMENT`, `refId=postId`를 이용해 `GET /api/v1/feed/posts/{refId}` 상세와 댓글 화면을 연다.
- FCM data는 모든 값이 문자열이다: `{ "type": "FEED_COMMENT", "notificationId": "100", "postId": "42" }`. 알림 탭 시 로그인 상태를 복구한 뒤 게시물 42로 이동한다. `notificationId`는 기존 알림 읽음 처리에 사용한다.
- `GET/PATCH /api/v1/users/me/notification-settings`에 `feed` boolean이 추가된다. 기본 true, PATCH 생략 시 기존 값 유지. 예: `{ "feed": false }`. `all=false`도 피드 푸시를 막는다. 두 경우 모두 알림함 내역은 저장된다.
- `feed=false`와 `all=false`는 [집 피드 새 글 푸시](#새-글-푸시)도 막는다. 새 글 푸시는 알림함에 저장하지 않으므로 이때는 아무것도 남지 않는다.
- 삭제·탈퇴로 게시물 상세가 404이면 삭제 안내 후 피드로 돌아간다. 이미 삭제된 댓글의 도착 알림일 수 있으므로 특정 댓글이 반드시 남아 있다고 가정하지 않는다.
- [집 글](#집-글-집-구성원-한정)의 댓글도 같은 `FEED_COMMENT`와 `postId`를 쓴다. 수신자(글 작성자·답글 대상)가 그 집의 ACTIVE 구성원이 아니면 알림을 생성하지 않는다. 알림을 받은 뒤 집을 나갔다면 상세가 404이므로 위와 같이 처리한다.
- 기기 FCM 토큰 등록·알림 권한과 위 화면 이동/설정 UI 반영은 프론트 담당이다. 좋아요 알림은 이번 추가 범위에 포함하지 않는다.


### AI 답글의 대상 처리

사람이 AI 댓글에 직접 답하면 해당 AI 계정의 응답만 우선 예약한다. AI가 자동 응답할 때는 들어온 사람 댓글의 ID를 `replyToCommentId`로 고정하고 `parentCommentId`는 기존 작성 규칙으로 정규화한다. 사람이 보낸 API 요청이나 일반 댓글 계약은 바꾸지 않는다. AI 댓글로 자동 응답 작업이 재귀 생성되지 않으며 AI가 기존 댓글을 자발적으로 선택하는 경우 실제 관찰한 대상과 같은 게시물/접근권을 다시 검증한다. [집 글](#집-글-집-구성원-한정)과 그 댓글에는 AI 자동 응답을 예약하지 않으며 AI 계정은 집 글을 읽거나 쓸 수 없다.
