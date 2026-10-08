# 10 — Customer และ Owner เห็นสถานะสดและ reconnect อย่างถูกต้อง

**What to build:** Ticket view และ Owner console รับ committed updates ผ่าน SignalR ข้าม instance พร้อม stale indicator และ snapshot resync เมื่อกลับมาใช้มือถือ

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 14, 15, 18, 22, 50, 56, 57; Acceptance scenarios A02, A13, A14, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Initial snapshot + authorized SignalR subscription ของ Owner/Customer แสดง committed issue/call/start/complete/skip และ operations อื่นที่เสร็จแล้ว; command slices ที่เพิ่มภายหลังต้องเข้าทางเดียวกัน
- [ ] Fan-out ใช้ PostgreSQL post-commit notification และต่อไปส่ง client snapshots/updates บนแต่ละ API instance; ไม่ใช้ Redis, rollback ไม่ประกาศ status ที่ไม่เกิดจริง
- [ ] Client version/order ไม่ถอยเมื่อ messages delayed/duplicated; connection scope กัน private Owner/Ticket data ของคนอื่นและไม่ส่ง Customer note ไป public channels
- [ ] Phone background/disconnect แสดง stale/reconnecting; reconnect/visibility return รับ snapshot ล่าสุดก่อนเปิด Owner mutations; conflict refresh โดยไม่ auto-retry Call
- [ ] Call countdown re-anchor ด้วย server time/deadline จาก live snapshot; client 00:00 ไม่มีอำนาจเปลี่ยน status
- [ ] Called มี in-page alert, saffron + status words และเสียง/สั่นเฉพาะเมื่อ browser/user gesture อนุญาต; accessible live region ไม่ announce timer ทุกวินาที
- [ ] Boundary tests subscribers ต่าง instances, post-rollback silence, stale ordering/isolation; browser smoke two actors live transition → disconnect → เปลี่ยน state → reconnect ได้ผลล่าสุด
