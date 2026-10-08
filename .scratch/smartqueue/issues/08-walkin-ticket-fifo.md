# 08 — Owner ออก Walk-in Ticket ให้ลูกค้าไม่มีมือถือ

**What to build:** Owner เลือก Open Queue สร้าง Walk-in Ticket และแสดงเลขให้ลูกค้า โดยอยู่ FIFO เดียวกับ Customer-issued Tickets

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 43, 51, 64; Acceptance scenarios A04, A05, A10, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Owner ของ Shop สร้าง Walk-in พร้อม optional note ใน Open Queue ได้ ผ่าน sheet และ result ที่แสดง Ticket number จริง; Closing/Closed ถูกปฏิเสธตาม acceptance gate ที่มีอยู่
- [ ] Walk-in ใช้ Business day counter/receive order เดียวกับ Customer-issued Tickets และเข้า Waiting list/Call FIFO โดยไม่มีชนเลข
- [ ] ไม่สร้าง Ticket link หรือ push subscription สำหรับ Walk-in; ไม่ใช้ device cookie/active quota ของมือถือ Owner
- [ ] Customer note private ให้ Owner; output สำหรับลูกค้าคือ number/Service ที่ดูจาก public board เมื่อ feature board พร้อม ไม่สร้าง temporary fake board ในใบนี้
- [ ] Start/Complete/Skip ใช้ lifecycle ปกติ และ Walk-in จะอยู่ใต้ Call timeout ของระบบเมื่อ workerพร้อม
- [ ] Boundary tests mixed-origin FIFO/numbering/private access และ browser smoke สร้าง Walk-in → บอกเลข → Call/Start/Complete ผ่านมือถือ Owner
