# 16 — Try demo ที่แยก session และ reset อัตโนมัติ

**What to build:** Interviewer กด Try demo เข้าเป็น Owner ของข้อมูลตัวอย่างจริงโดยไม่สมัคร แต่ละ session แยกและหมดอายุหลัง 24 ชั่วโมง

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 66, 67, 70; Acceptance scenarios A02, A07, A19, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Try demo สร้าง session-bound demo Owner/Shop/Services และ Tickets/historyในDBจริง; ไม่ใช้ public unrestricted Owner tokenหรือbypassสิทธิ์ real account
- [ ] Seedมี timestamps/stateที่consistent รวม Completed historyอย่างน้อย5งานในServiceหนึ่งเพื่อให้ estimate/stats modulesใช้ข้อมูลจริงเมื่อพร้อม;ทุกหน้าlabelว่าdemo
- [ ] Demo Ownerเปิด console/Call/Start/Complete/Skipผ่าน application commandsปกติ และ customer-facing recordsมีpublicscopeตามroleไม่ใช่ fake backend
- [ ] Sessionใหม่มี fixtureใหม่ไม่ resetคนอื่น;แสดงexpiry24hและserver cleanupอัตโนมัติที่แตะเฉพาะdemo data; expired sessionไม่เปิดprivatefixtureต่อได้
- [ ] Shared identity/session/resource modelรองรับmodulesที่เพิ่มภายหลังและcleanup associationsของ demo resourcesโดยไม่ทำให้ real Push/Ticket recordsเสีย
- [ ] Boundary testsสองdemo sessionsกับrealOwnerพิสูจน์isolation/reset/expiryและ browser smoke Try demo → serve seeded Ticket → เปิดอีก sessionเห็นข้อมูลคนละชุด
