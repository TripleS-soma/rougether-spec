# 채팅 데이터

기능/API 및 상태는 [api.md](api.md)를 따릅니다. 서버 migration은 `V77__add_chat.sql`이며, 방별 푸시 음소거 컬럼은 `V85`, 사진 테이블은 `V102`, 메시지 유형은 `V103`, 메시지 삭제 컬럼과 신고 대상 `CHAT_MESSAGE`는 `V104`, 사진 여러 장·함께 보낸 글·이모티콘·공감은 `V108__add_chat_rich_messages.sql`에서 추가합니다.

| 테이블 | 주요 데이터 | 제약/인덱스 |
| --- | --- | --- |
| chat_rooms | id, room_type, house_id, last_sequence | house_id UNIQUE, house FK |
| chat_messages | id, room_id, message_sequence, sender_user_id, client_message_id, content, created_at, message_type, deleted_at, caption, emoticon_key | UNIQUE(room_id,message_sequence), UNIQUE(room_id,sender_user_id,client_message_id), CHECK(message_type IN TEXT/IMAGE/EMOTICON), room/user FK |
| chat_images | id, room_id, owner_id, message_id, sort_order, storage_key, width, height, ready, expires_at, created_at | UNIQUE(storage_key), INDEX(message_id,sort_order), INDEX(owner_id,created_at), INDEX(room_id), INDEX(expires_at,id), room/user/message FK |
| chat_message_reactions | id, message_id, room_id, user_id, reaction_type, created_at | UNIQUE(message_id,user_id), INDEX(room_id), CHECK(reaction_type IN HEART/LIKE/CHECK/LAUGH/SURPRISE/SAD), message/user FK |
| chat_read_states | id, room_id, user_id, last_read_sequence, push_muted | UNIQUE(room_id,user_id), room/user FK |

채팅방은 집 기능과 별도 식별자를 사용합니다. `house_id`는 HOUSE 유형의 소유 맥락이며, 미래 전체 채팅을 위한 nullable 컬럼입니다. 현재 허용 유형은 HOUSE뿐이고 GLOBAL은 활성화하지 않습니다. 메시지는 house_id 대신 room_id에 속합니다.

`chat_messages.message_type`은 `TEXT`, `IMAGE`, `EMOTICON`이고 기본값은 `TEXT`입니다. `content`는 계속 NOT NULL이며 `IMAGE`·`EMOTICON`에는 구버전 앱 표시용 문구를 저장합니다(`IMAGE`는 함께 보낸 글이 있으면 그 글). nullable `caption`(VARCHAR(2000))은 사진 메시지에 함께 보낸 글 원문이고 없으면 null입니다. nullable `emoticon_key`(VARCHAR(64))는 이모티콘 메시지의 key이며 그림은 앱 번들에 있습니다. nullable `deleted_at`은 운영자 삭제 시 설정합니다. `content`·`caption`·`emoticon_key` 원문은 DB에 남고 응답에서만 삭제 문구로 바꾸거나 비웁니다. 새 컬럼은 NULL 허용이거나 DEFAULT가 있어 배포 전환 중 구버전 코드의 INSERT가 그대로 동작합니다.

`chat_images`는 업로드부터 메시지 연결까지 한 행으로 관리합니다. `message_id`는 nullable이며 null이면 미전송 업로드입니다. 메시지 하나에 사진을 최대 10장까지 연결하므로 `message_id`의 UNIQUE(`uk_chat_image_message`)는 제거하고 INDEX(message_id,sort_order)(`idx_chat_image_message_order`)로 바꿉니다. `sort_order`(INT NOT NULL DEFAULT 0)는 메시지 안에서의 순서로, 전송 요청에 적힌 순서를 0부터 저장합니다. 사진 하나는 메시지 하나에만 연결합니다. `storage_key`는 비공개 `private/chat/<uuid>.jpg`이고 `width`·`height`는 변환 후 치수입니다. 업로드 시 행을 먼저 커밋하고 S3 저장이 끝나면 `ready=true`가 됩니다. `expires_at`은 미전송 사진에만 적용합니다. 정리 조건은 [api.md](api.md#사진-보관과-정리)를 따릅니다.

`chat_message_reactions`는 메시지 공감을 사람별 한 행으로 저장합니다. UNIQUE(message_id,user_id)(`uk_chat_reaction_message_user`)로 한 사람이 메시지당 하나만 가지며, 유형을 바꾸면 같은 행의 `reaction_type`과 `created_at`을 고칩니다. 취소하면 행을 지웁니다. `reaction_type`(VARCHAR(20))은 `HEART`, `LIKE`, `CHECK`, `LAUGH`, `SURPRISE`, `SAD`입니다. 응답의 누른 순서는 `created_at`, `id` 오름차순입니다. `room_id`는 메시지의 방을 함께 저장한 값이며 INDEX(`idx_chat_reaction_room`)를 둡니다. 탈퇴한 회원과 운영자가 삭제한 메시지의 공감 행은 지우지 않고 응답에서만 뺍니다.

`content_reports.target_type`의 CHECK 허용값에 `CHAT_MESSAGE`를 추가하며 이때 `target_id`는 `chat_messages.id`입니다.

쓰기 잠금 순서는 user → house → membership → chat_room → message/read_state입니다. 집 입주/탈퇴/강퇴와 house 잠금을 공유합니다. 방 잠금 아래 순서를 증가시켜 롤백과 동시 전송에도 커서가 커밋 이전 메시지를 건너뛰지 않게 합니다. 메시지 고유 제약은 재전송 중복을 방어합니다. 사진 전송은 방 잠금 다음에 `chat_images` 행을 id 오름차순으로 잠근 채 메시지 저장과 사진 연결을 한 트랜잭션으로 처리합니다. 한 장이라도 쓸 수 없으면 전체를 롤백합니다. 공감은 회원 행 잠금으로 같은 사람의 동시 요청을 직렬화하며 방 잠금을 잡지 않고 순서를 증가시키지 않습니다. 업로드 한도는 사용자 행 잠금 안에서 셉니다.

이력 조회는 (room_id,message_sequence) 인덱스로 keyset pagination을 수행합니다. 사진과 공감은 페이지 단위로 한 번씩만 조회합니다. 읽음 위치를 메시지별·사람별 행으로 늘리지 않고 사용자별 한 행으로 관리합니다. 같은 행의 `push_muted`(BOOLEAN NOT NULL DEFAULT FALSE)에 사용자별 방 푸시 음소거 여부를 저장합니다.

Redis에는 채팅방 ID 변경 알림과 공감 변경 알림(방 ID·메시지 ID)만 보내고 본문/읽음/공감 정본을 저장하지 않습니다. 커밋 전에는 알림을 보내지 않습니다. DB에 저장된 순서와 읽음 상태로 유실된 Pub/Sub 알림을 복구합니다. 본문 직접 수신 모드에서도 Redis 알림 형식은 유지하며, 수신 노드가 현재 권한을 검사하고 DB 커서 이후의 본문을 즉시 조회해 소켓으로 전달합니다. 연결별 소켓 쓰기 위치는 메모리에만 두며 클라이언트 수신 확인이나 `chat_read_states`로 저장하지 않습니다.

공감 변경은 기존 방 변경 채널(`rougether:chat:room-changed:v1`, 내용은 방 ID)의 형식을 바꾸지 않고 공감 전용 채널 `rougether:chat:reactions-changed:v1`에 `방 ID:메시지 ID`를 보냅니다. 배포 전환 중 구버전 노드가 기존 채널을 그대로 읽을 수 있게 하기 위해서이며, 구버전 노드는 공감 채널을 구독하지 않습니다. 공감 내용은 Redis에 싣지 않고 수신 노드가 소켓에 쓰기 직전에 DB에서 읽습니다. 발행 실패나 유실은 재전송하지 않으며 기록 재조회의 `reactions`로 복구합니다.

## 후속 결정 항목

정책 미정값과 알림 도메인 의존성은 [open-questions.md](../../open-questions.md#채팅)에서 통합 관리합니다.
