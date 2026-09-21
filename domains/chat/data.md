# 채팅 데이터

기능/API 및 상태는 [api.md](api.md)를 따릅니다. 서버 migration은 `V77__add_chat.sql`입니다.

| 테이블 | 주요 데이터 | 제약/인덱스 |
| --- | --- | --- |
| chat_rooms | id, room_type, house_id, last_sequence | house_id UNIQUE, house FK |
| chat_messages | id, room_id, message_sequence, sender_user_id, client_message_id, content, created_at | UNIQUE(room_id,message_sequence), UNIQUE(room_id,sender_user_id,client_message_id), room/user FK |
| chat_read_states | id, room_id, user_id, last_read_sequence | UNIQUE(room_id,user_id), room/user FK |

채팅방은 집 기능과 별도 식별자를 사용합니다. `house_id`는 HOUSE 유형의 소유 맥락이며, 미래 전체 채팅을 위한 nullable 컬럼입니다. 현재 허용 유형은 HOUSE뿐이고 GLOBAL은 활성화하지 않습니다. 메시지는 house_id 대신 room_id에 속합니다.

쓰기 잠금 순서는 user → house → membership → chat_room → message/read_state입니다. 집 입주/탈퇴/강퇴와 house 잠금을 공유합니다. 방 잠금 아래 순서를 증가시켜 롤백과 동시 전송에도 커서가 커밋 이전 메시지를 건너뛰지 않게 합니다. 메시지 고유 제약은 재전송 중복을 방어합니다.

이력 조회는 (room_id,message_sequence) 인덱스로 keyset pagination을 수행합니다. 읽음 위치를 메시지별·사람별 행으로 늘리지 않고 사용자별 한 행으로 관리합니다.

Redis에는 채팅방 ID 변경 알림만 보내고 본문/읽음 정본을 저장하지 않습니다. 커밋 전에는 알림을 보내지 않습니다. DB에 저장된 순서와 읽음 상태로 유실된 Pub/Sub 알림을 복구합니다.

## 후속 결정 항목

정책 미정값과 알림 도메인 의존성은 [open-questions.md](../../open-questions.md#채팅)에서 통합 관리합니다.
