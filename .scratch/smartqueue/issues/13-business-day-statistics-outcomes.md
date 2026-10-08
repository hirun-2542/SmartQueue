# 13 — สถิติ Business day และผลลัพธ์ Ticket

**What to build:** Owner ดูจำนวนคิว เวลารอ/ให้บริการ และ Skipped/Cancelled/Dropped แยกกัน กรองตาม Service และรอบเปิดคิวได้

**Blocked by:** 07 — ปิดรับคิว Drop และจบ Business day; 08 — Owner ออก Walk-in Ticket ให้ลูกค้าไม่มีมือถือ

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 58, 59, 60, 61, 63; Acceptance scenarios A02, A12, A17, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Private stats กรอง own Shop/Service กับ current/latest หรือ last 7/30 Business days ต่อ Queue ก่อนรวมผล ไม่สับสนกับวันปฏิทินหรือ Business day ทั้ง Shop
- [ ] Issued count รวม Customer และ Walk-in; average wait ใช้ Called-received สำหรับใบที่เคย Called; average service ใช้ Completed-Start ของ Completed ที่มี measurementจริง
- [ ] Outcomes Completed/Skipped/Cancelled/Dropped แยกกัน; Skipped/Cancelled rates denominator คือ terminal count ใน selection ไม่รวม pending; zero denominator/missing averages แสดงไม่มีข้อมูล
- [ ] Ticket identity/Business day membership กัน double-count หลังเลข reset; archive ที่เพิ่มภายหลังต้องรักษาข้อมูลใน aggregate และไม่ลบ history
- [ ] Warm Minimal stats เป็น hero summary + ruled rows ไม่มี KPI grid; filters, units และ empty states Thai/English อธิบาย scope ของรอบเปิดคิว
- [ ] Boundary tests ทั้ง origins/states/overnight/reopen/selection/isolation เทียบค่าที่คำนวณได้แน่นอน; browser smoke ดูผลจาก Tickets ที่ serve/cancel/drop ผ่าน operations จริง
