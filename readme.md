# ukvdb - unreliable key value database

etcd 또는 zookeeper 와 비슷한 웹 기반의 분산 키-값 저장소입니다  
특징으로는 더욱 믿음직스럽지 못하고 신뢰할 수 없습니다  
webrtc를 기반으로 gossip protocol을 사용합니다  
최소한의 연결로 많은 노드와 연결되는 것이 목적입니다

```
let u = await new Ukvdb().init()
u.join('id')
u.set('key', {value:"value"})
u.get('key')
u.storage.onData('key.*',(key, record)=>{})
u.members.onConnMember((type, id, member)=>{})
```

기능

1. 저장소에 $member_id, $conn_id 로 된 멤버 정보를 공유
2. 멤버 정보를 바탕으로 적절한 수준의 연결 유지
3. 데이터 변경 감지
4. 데이터 전파

### join

```mermaid
sequenceDiagram
    participant a as A
    participant b as B
    a->>b: join
    a->>a: wait open
    a<<->>b: set me, <br/>{connCount:1, uuid:myId...}
    a<<->>b: set my connection, <br/>[connectedIds]
    opt A와 B의 거리가 inf이면
        a->>b: copySpecial<br/>(members info)
        a->>a: reconnect other if exist
        a->>b: set me for other
        a->>b: sync
    end
    loop
        a<<->>b: set
    end
```

### set

```mermaid
flowchart TD
    a(set)
    b(저장되어 있는 record와 생성 시간 및 counter 비교)
    a-->b
    b-->_1(discard)
    b-->c(setRecord)
    c-->d(if ttl>0)
    d-->e(gossip data)
```

### sync

```mermaid
sequenceDiagram
    participant a as A
    participant b as B
    a->>b: sync_req,<br/>A와 B의 거리가 inf이면 gossip <br/>{allIds:[dataId], gossip:boolean}
    b->>a: sync_req&ret, <br/>{updatedDatas:[record], requestIds:[dataId]}
    b->>b: setRecord, if gossip, gossip
    a->>b: sync_ret, <br/>{updatedDatas:[record]}
    a->>a: setRecord, if gossip, gossip
```

### heartbeat

```mermaid
flowchart TD
    a("heartbeat")
    a-->b("send heartbeat, {now}")
    b-->fail("heartbeat timeout")
    fail-->fail_1("if retry>0")
    fail_1-->b
    fail_1-->fail_2("fail heartbeat")
    b-->c("wait heartbeat_ret")
    c-->d("success heartbeat")
```

![data](sample/data.png)
![chat&2d](sample/chatAnd2d.png)
