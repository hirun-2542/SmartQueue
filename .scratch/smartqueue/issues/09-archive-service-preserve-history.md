# 09 — Archive Service โดยรักษา Ticket และประวัติเดิม

**What to build:** Owner ซ่อน Service ที่เลิกใช้โดยไม่ทิ้งงานค้าง และแก้ Prefix โดยเลข Ticket เดิมไม่เปลี่ยน

**Blocked by:** 07 — ปิดรับคิว Drop และจบ Business day

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 35, 36, 38; Acceptance scenarios A02, A12, A18, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Archive own Service ซ่อนจากรายการรับ Ticket และไม่เปิด Business day ใหม่ แต่ไม่ลบ Queue/Business day/Ticket history
- [x] ถ้า Service มี active work ให้หยุดรับผ่าน Closing/drain; Waiting ยังคงเรียกได้และ held Ticket ทำต่อจนจบ; Archive ไม่แอบ Drop งาน
- [x] ถ้าต้องทิ้ง Waiting ให้ใช้ explicit Drop ที่มีอยู่ ไม่ทำเป็น side effect ของปุ่มซ่อนบริการ
- [x] Prefix edits รักษา snapshot number ของทุก Ticket เดิม; new issued numbers ใช้ Prefix ที่กำหนดตอน issue และ uniqueness ของ Services ที่ใช้งานยังถูก enforce
- [x] Archived history ยังอ่านได้ใน own historical views และพร้อมใช้ aggregate โดยไม่คืน Service นั้นเป็น public join choice
- [x] Boundary tests archive with active/history, edited Prefix and duplicate-prefix rejection; browser smoke archive ขณะยังมี Ticket แล้ว serve จนปิดโดย number ไม่เปลี่ยน

## Comments

- Resolved on `integration/smartqueue`. Archive runtime cases covered Waiting/held/empty/ended rounds, Prefix snapshots and reuse, isolation and no implicit Drop. 375px archive of held B001 kept its number/work, Complete closed the archived Queue and console recovered selection; stats retained its three Completed jobs. Final 57/57 runtime and 30/30 integration gates passed.

