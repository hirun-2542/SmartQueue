# 03 — เปิด Queue และรับ Ticket โดยไม่สมัครสมาชิก

**What to build:** Owner เปิด Queue; Customer เปิด public Shop เลือก Service รับ Ticket พร้อมเลขและลิงก์ลับ ยืนยันใบเพิ่มได้สูงสุดสามใบ

**Blocked by:** 02 — Owner จัดการ Shop และ Service ของตนเอง

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 41, 42; Acceptance scenarios A02, A03, A04, A13, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Open จาก Closed สร้าง Business day ของ Queue และเริ่ม counter ที่ 1; Open ไม่ขึ้นกับการ online ของ Owner และ Queue ว่างไม่ปิดเอง
- [ ] Customer ใช้ public Shop deep link เลือก Open Service รับ Waiting Ticket กับ optional Customer note ได้โดยไม่มีบัญชีหรือเบอร์โทร; Closing/Closed และ archived Service รับ Ticket ใหม่ไม่ได้
- [ ] PostgreSQL ทำ receive order และ number allocation แบบ atomic; simultaneous joins ไม่ได้ Ticket number ซ้ำใน Business day เดียว; แสดงเลขอย่างน้อยสามหลักและไม่วนกลับหลัง 999
- [ ] Ticket number/Prefix snapshot ไม่ใช่ identity; Ticket link เป็น unguessable bearer secret ที่ข้ามเครื่องหรือล้าง cookie แล้วยังเปิด Ticket เดิมได้ และไม่ expose ใน public Shop
- [ ] Device cookie เป็น best-effort quota ต่อ Queue; ใบเพิ่มต้อง explicit confirmation, สูงสุดสาม active Waiting/Called/InService ต่อ device ต่อ Queue แบบ atomic, อีก Queue มี quota แยก
- [ ] Replay ของ join request identity เดิมคืน Ticket เดิม ไม่แจกซ้ำหรือเพิ่ม quota; new intent สำหรับใบเพิ่มยังต้อง confirm; Walk-in quota จะไม่ผูกกับอุปกรณ์ Owner
- [ ] Public Shop และ Ticket view แสดงข้อมูลที่มีจริง เช่น acceptance state, Waiting count/Tickets ahead; Customer note ไม่ออกใน public response; 0 ahead ไม่อ้างว่า Owner ว่างทันที
- [ ] Browser smoke Open → join → copy link → เปิดอีก browser พร้อม quota/confirmation errors และ public-boundary concurrent-numbering/duplicate-submit tests บน DB จริง; estimates และ push ไม่ถูกทำเป็นข้อมูลสมมติ
