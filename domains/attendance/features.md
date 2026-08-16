# 연속 출석 이벤트 기능 명세

## 이벤트 생성 (`attendance_events`, → `items`)

- 운영자는 이벤트 코드·제목·시작일·종료일·목표 연속 일수·기본 코인·보너스 일차·보너스 일차 총 코인·보상 가구를 지정한다.
- 첫 이벤트 설정은 **10일**, 기본 **30코인**, 5일차 **50코인**, 10일차 **30코인 + 가구**다.
- 이벤트 기간은 목표 일수 이상이어야 하며, 활성 이벤트끼리 기간이 겹칠 수 없다.
- 보상은 활성 상태의 `positioned` 가구(`items`)만 지정할 수 있다. 사용자가 출석 요청에서 보상을 고를 수 없다.
- 이벤트 생성 이후 기간·목표·코인·보상은 변경하지 않는다. 후속 운영 변경은 별도 이벤트로 만든다.

## 상태 조회 (`attendance_events`, `attendance_check_ins`)

- KST 오늘 진행 중인 출석 이벤트와 내 상태를 조회한다.
- 응답은 이벤트 기간·목표 일수, 현재 연속 출석일, 오늘 출석 여부, 전체 출석 날짜, 완료 여부, `dailyRewards`, 보상 가구 정보를 포함한다.
- `dailyRewards`는 1일부터 목표일까지의 코인과 가구 지급 여부를 제공한다. `claimed`는 현재 연속 출석 기준으로 해당 일차까지 도달했는지를 뜻한다.
- 마지막 출석이 어제면 오늘 출석 전까지 기존 연속 일수를 유지한다. 마지막 출석이 그제 이전이면 현재 연속 일수는 0이다.

## 오늘 출석 (`attendance_check_ins`, → `user_wallets`, → `wallet_histories`, → `user_items`)

- 출석일은 요청 시점의 KST 날짜로 서버가 정한다. 클라이언트가 임의 날짜를 보낼 수 없다.
- 어제 출석했다면 `streakDay + 1`, 하루 이상 비었다면 1일차로 다시 시작한다.
- 새 출석마다 이벤트 설정에 따라 코인 지갑을 적립하고 실제 지급량을 `coin_reward_amount`에 기록한다.
- 코인 적립 원장은 `reason=ATTENDANCE_REWARD`, `source_type=ATTENDANCE_CHECK_IN`, `source_id=attendance_check_ins.id`로 남긴다.
- 같은 날 재호출은 멱등 성공이다. 코인과 원장을 다시 만들지 않고 `newCheckIn=false`, `coinRewardAmount=0`으로 현재 잔액과 상태를 반환한다.
- 목표 10일차에는 30코인을 적립하고 이벤트의 보상 가구도 `user_items`에 지급한다.
- 보상 가구를 이미 보유했다면 중복 `user_items` row나 대체 재화를 만들지 않는다. 기존 `userItemId`로 완료 처리하며 `rewardGrantedNow=false`다.
- 목표 완료 뒤 같은 이벤트에 추가 출석 row나 코인 지급을 만들지 않는다.
- 출석·코인·원장·가구는 같은 트랜잭션이다. 사용자 행 잠금과 unique `(event_id, user_id, attendance_date)`로 동시 중복 지급을 막는다.

## 탈퇴 데이터 파기

- 탈퇴 잔여 데이터 하드 파기 시 `attendance_check_ins`를 삭제한다. 보상 `user_items`보다 먼저 삭제해 FK 순서를 지킨다.
- 공유 마스터인 `attendance_events`와 `items`는 사용자 파기 대상이 아니다.
