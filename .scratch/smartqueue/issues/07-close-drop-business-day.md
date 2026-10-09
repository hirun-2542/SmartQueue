# 07 — ปิดรับคิว Drop และจบ Business day

**What to build:** Owner หยุดรับ Ticket แล้วเรียกจนหมด หรือ Drop เฉพาะ Waiting; ปิดรอบได้และเปิดใหม่รีเซ็ตเลขโดยไม่ reset ตอนเที่ยงคืน

**Blocked by:** 05 — Customer ยกเลิก Ticket และดูผลผ่านลิงก์ 24 ชั่วโมง

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 2, 25, 27, 41, 52, 53, 54, 55; Acceptance scenarios A03, A07, A10, A11, A12, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Stop accepting เปลี่ยน Open → Closing ปฏิเสธ new joins/Walk-in แต่ให้ Call Waiting ที่ค้างได้; active count เป็นศูนย์แล้ว Closed และ Business day ended
- [x] Open ที่ว่างปิด/Drop ได้ใน operation เดียว ไม่รอ nonexistent last Ticket; Closed เปิดรอบใหม่ได้แต่ Closing ห้ามเปิดรอบใหม่ทับ
- [x] Drop ต้อง explicit confirmation ทำ Waiting เป็น Dropped เท่านั้น; held Called/InService ทำต่อ, Queue ยังคง Closing จนงานหมด; Customer เห็นเหตุร้านปิดคิวไม่ปน Cancelled
- [x] Join vs Stop accepting/Drop ถูกตัดสินด้วย transaction commit order ไม่มี Ticket issued หลังปิด และไม่มี join สำเร็จก่อน Drop ที่หลุดออกจากงานที่ถูก Drop
- [x] เก็บ Business day ต่อ Queue พร้อม UTC times; ข้าม Bangkok midnight ไม่ reset, ปิดและเปิดวันเดียวกัน reset counter แต่ Ticket identity/history ไม่ merge
- [x] ทุก terminal action ที่มีอยู่ รวม Cancel/Complete/Skip ทำให้ Closing ที่ไม่มีงานจบได้โดยไม่รอ worker; terminal transitions ต่อไปต้องใช้ invariant นี้เช่นกัน
- [x] Customer final/expired view รองรับ Dropped; Open/Closing/Closed ใน Owner/public Shop ตรง DB, ไม่มี exact-second/auto-close schedule ที่เพิ่มเอง
- [x] Boundary tests close-empty/drain/Drop-held/close-vs-join/overnight/reopen และ browser smoke ปิดแบบ drain แล้วเปิดรอบใหม่ และ Drop พร้อม held Ticket

## Comments

- Resolved on `integration/smartqueue`. Real HTTP close-empty/drain/Drop-held, join races and worker closure passed; controlled Bangkok-midnight/reopen behavior preserved separate Business days. Mobile Stop → Closing → Drop Waiting while held work survives → Complete → Closed → Open issued fresh A001. Final runtime 57/57 and PostgreSQL integration 30/30 passed.

