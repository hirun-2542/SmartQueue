# 12 — Estimated wait จากงาน Completed จริง

**What to build:** Customer เห็น Tickets ahead และเวลาประมาณเมื่อมีข้อมูลจริงเพียงพอ โดยไม่สัญญาว่า Owner ว่างหรือใช้เวลาเดา

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 4, 5, 14, 63; Acceptance scenarios A07, A16, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Tickets ahead นับ Waiting ที่เก่ากว่าใน Queue เดียว ไม่รวม Called/InService/terminal หรือ Service อื่น
- [ ] Estimated wait = ahead × mean service duration ของ last 20 usable Completed ใน Service เดียวที่มี Start/Complete จริง; <5 samples ซ่อนเวลาแต่ยังแสดง ahead
- [ ] ไม่หารด้วย Staff count และไม่รวม Queue อื่น; 0 ahead แปลว่าถัดไปใน Queue ไม่รับประกันให้บริการทันที
- [ ] ค่าเปลี่ยนจาก real Completed history; Skipped/Cancelled/Dropped/in-progress ไม่เติม duration สมมติ; empty state ไม่แสดง zero-minute fake average
- [ ] Public Shop และ private Ticket snapshots/UI แสดงข้อมูลเดียวกันโดยไม่ leak private fields; เมื่อ live module พร้อมประมาณการต้องอัปเดตจาก path นั้น ไม่สร้าง mock refresh
- [ ] Boundary tests 4/5/20/21 sample boundaries, mixed states/Queues และ zero ahead ขณะ Shop ถืออีก Queue; browser smoke ให้บริการหลายใบแล้วเห็น estimate ที่คำนวณได้จริง
