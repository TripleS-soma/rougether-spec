# 채팅 데이터

기능/API 및 상태는 [api.md](api.md)를 따릅니다. 서버 migration은 `V77__add_chat.sql`이며, 방별 푸시 음소거 컬럼은 `V85`, 사진 테이블은 `V102`, 메시지 유형은 `V103`, 메시지 삭제 컬럼과 신고 대상 `CHAT_MESSAGE`는 `V104`에서 추가합니다.

| 테이블 | 주요 데이터 | 제약/인덱스 |
| --- | --- | --- |
| chat_rooms | id, room_type, house_id, last_sequence | house_id UNIQUE, house FK |
| chat_messages | id, room_id, message_sequence, sender_user_id, client_message_id, content, created_at, message_type, deleted_at | UNIQUE(room_id,message_sequence), UNIQUE(room_id,sender_user_id,client_message_id), CHECK(message_type IN TEXT/IMAGE), room/user FK |
| chat_images | id, room_id, owner_id, message_id, storage_key, width, height, ready, expires_at, created_at | UNIQUE(storage_key), UNIQUE(message_id), INDEX(owner_id,created_at), INDEX(room_id), INDEX(expires_at,id), room/user/message FK |
| chat_read_states | id, room_id, user_id, last_read_sequence, push_muted | UNIQUE(room_id,user_id), room/user FK |

채팅방은 집 기능과 별도 식별자를 사용합니다. `house_id`는 HOUSE 유형의 소유 맥락이며, 미래 전체 채팅을 위한 nullable 컬럼입니다. 현재 허용 유형은 HOUSE뿐이고 GLOBAL은 활성화하지 않습니다. 메시지는 house_id 대신 room_id에 속합니다.

`chat_messages.message_type`은 `TEXT` 또는 `IMAGE`이고 기본값은 `TEXT`입니다. `IMAGE`의 `content`에는 구버전 앱 표시용 문구를 저장합니다. nullable `deleted_at`은 운영자 삭제 시 설정합니다. `content` 원문은 DB에 남고 응답에서만 삭제 문구로 바꿉니다.

`chat_images`는 업로드부터 메시지 연결까지 한 행으로 관리합니다. `message_id`는 nullable이며 null이면 미전송 업로드입니다. UNIQUE로 사진 1장이 메시지 1개임을 보장합니다. `storage_key`는 비공개 `private/chat/<uuid>.jpg`이고 `width`·`height`는 변환 후 치수입니다. 업로드 시 행을 먼저 커밋하고 S3 저장이 끝나면 `ready=true`가 됩니다. `expires_at`은 미전송 사진에만 적용합니다. 정리 조건은 [api.md](api.md#사진-보관과-정리)를 따릅니다.

`content_reports.target_type`의 CHECK 허용값에 `CHAT_MESSAGE`를 추가하며 이때 `target_id`는 `chat_messages.id`입니다.

쓰기 잠금 순서는 user → house → membership → chat_room → message/read_state입니다. 집 입주/탈퇴/강퇴와 house 잠금을 공유합니다. 방 잠금 아래 순서를 증가시켜 롤백과 동시 전송에도 커서가 커밋 이전 메시지를 건너뛰지 않게 합니다. 메시지 고유 제약은 재전송 중복을 방어합니다. 사진 전송은 방 잠금 다음에 `chat_images` 행을 잠근 채 메시지 저장과 사진 연결을 한 트랜잭션으로 처리합니다. 업로드 한도는 사용자 행 잠금 안에서 셉니다.

이력 조회는 (room_id,message_sequence) 인덱스로 keyset pagination을 수행합니다. 읽음 위치를 메시지별·사람별 행으로 늘리지 않고 사용자별 한 행으로 관리합니다. 같은 행의 `push_muted`(BOOLEAN NOT NULL DEFAULT FALSE)에 사용자별 방 푸시 음소거 여부를 저장합니다.

Redis에는 채팅방 ID 변경 알림만 보내고 본문/읽음 정본을 저장하지 않습니다. 커밋 전에는 알림을 보내지 않습니다. DB에 저장된 순서와 읽음 상태로 유실된 Pub/Sub 알림을 복구합니다. 본문 직접 수신 모드에서도 Redis 알림 형식은 유지하며, 수신 노드가 현재 권한을 검사하고 DB 커서 이후의 본문을 즉시 조회해 소켓으로 전달합니다. 연결별 소켓 쓰기 위치는 메모리에만 두며 클라이언트 수신 확인이나 `chat_read_states`로 저장하지 않습니다. 스키마 변경은 없습니다.

## 후속 결정 항목

정책 미정값과 알림 도메인 의존성은 [open-questions.md](../../open-questions.md#채팅)에서 통합 관리합니다.
