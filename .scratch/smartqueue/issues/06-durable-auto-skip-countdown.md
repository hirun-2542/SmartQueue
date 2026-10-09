# 06 — auto-Skip และ countdown จากเวลาของ server

**What to build:** Called Ticket ที่ไม่มาในเวลากลายเป็น Skipped แม้ Owner ล็อกจอหรือ worker restart; Start กับ timer แข่งกันได้ผลเดียว

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 19, 49, 50; Acceptance scenarios A06, A07, A09, A14, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Background worker หา Called deadlines ที่ durable แล้ว auto-Skip ผ่าน transaction/version rules เดียวกับ manual Skip ไม่ผูกกับ browser timer หรือ SignalR connection
- [x] Restart แล้ว Called ที่หมดเวลายังถูกประมวลผล; workers หลายตัวไม่ทำ transition หรือ terminal side effects ซ้ำ
- [x] Start vs auto-Skip ใช้ version/status เดียวกันมี winning transition หนึ่งอัน; InService ชนะแล้ว timer ห้าม Skip, Skipped ชนะแล้ว Start ถูกปฏิเสธ;ไม่มี auto-Complete
- [x] Timeout release Shop hold/device quota และ snapshots ให้ Owner กลับ Call next ได้; Customer เห็น Skipped พร้อมเหตุและทางรับ Ticket ใหม่
- [x] Countdown ของ Owner/Customer ใช้ server time/deadline กับ measured offset และ anchor ใหม่เมื่อรับ snapshot ไม่เชื่อ device clock; 00:00 ไม่ client-mutate status
- [x] รัน boundary tests เวลา deadline, Start race, two workers/restart และ runtime smoke worker จริงโดยปล่อย Called ให้ timeout ตอน Owner disconnect

## Comments

- Resolved on `integration/smartqueue`. Controlled server-clock boundary, restart/two-worker and Start races passed through public HTTP; real background worker skipped disconnected no-shows and never skipped InService. Demo used a normal 10-second Service edit and observed Skipped without a client mutation. Final runtime 57/57 and integration 30/30 passed.

