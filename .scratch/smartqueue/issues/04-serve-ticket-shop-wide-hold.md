# 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**What to build:** Owner Call next → Start → Complete หรือ Skip จากมือถือ; Customer เห็น Called/InService/ผลสุดท้าย และหนึ่ง Shop ถือได้หนึ่งใบแม้กดสองแท็บ

**Blocked by:** 03 — เปิด Queue และรับ Ticket โดยไม่สมัครสมาชิก

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 15, 18, 19, 25, 26, 43, 44, 45, 46, 47, 48, 50, 57; Acceptance scenarios A02, A06, A07, A13, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Call next เลือก oldest Waiting ใน Queue ที่ Owner เลือกตาม immutable receive order; ไม่มี arbitrary Ticket selection หรือ FIFO รวมข้าม Service
- [ ] Enforce at most one Called/InService Ticket ต่อ Shop แบบ atomic ใน PostgreSQL ข้าม Queue และ API instances; คนละ Shop ไม่ถูก lock รวมเป็นหนึ่งใบของ Owner ทั้งบัญชี
- [ ] Called → Start → InService → Complete → Completed และ Called → manual Skip → Skipped มี transition timestamps/version จริง; terminal ไม่ย้อนกลับ และ Skip ต้องรับ Ticket ใหม่
- [ ] Call บันทึก deadline จาก Service timeout ขณะ Call พร้อม server time; edit timeout ภายหลังไม่เปลี่ยน deadline ของใบเดิม; client countdown ไม่เปลี่ยน DB status เอง
- [ ] Wrong actor/state/stale version ต้องถูกปฏิเสธพร้อม current state; conflict ห้าม retry Call ใบถัดไปเองจนกลายเป็นสอง held Tickets
- [ ] Owner console Idle/Called/InService มี primary Call next/Start/Complete ในโซนนิ้วโป้งและ Skip secondary; Customer มี Called screen, InService ที่ยกเลิกไม่ได้, Completed/Skipped final views; pending/error ไม่เป็น silent no-op
- [ ] ทุก command สำเร็จสะท้อน authoritative snapshots ทั้ง Owner/Customer และ release hold/quota เมื่อ terminal; ยังไม่อ้างว่า live ถ้า SignalR ยังไม่พร้อม
- [ ] รัน public-boundary lifecycle/wrong-state และ synchronized concurrent Calls ทั้ง Queue เดียว/ต่าง Queue ใน Shop เดียวบน DB จริง; browser smoke เห็นเลขเดียวกันในสอง actors ผ่าน snapshots

## Comments

- Red observed: Owner console returned 404 before serving operations existed.
- `npm test`: 7 passed, 0 failed, including FIFO, status/version rejection, terminal finality, quota release, parallel Calls across Queues and independent holding in another Shop.
- .NET and Vite production builds passed.
- Browser smoke at 390/375 px: Owner Call → Customer Called screen → Start → Customer InService → Complete → Customer final result; manual Skip exercised next. Both browser error lists were empty.
- Cross-process runtime proof on ports 5290 and 5291: authenticated simultaneous Calls returned 200 and 409 while sharing PostgreSQL and protection keys; the Shop-wide hold was preserved.
