# 17 — จำลอง Customer และสาธิต workflow ผ่านสามหน้าจอ

**What to build:** Interviewer จำลอง Customer จาก demo เปิด Customer/Owner/Board เห็นคิวสด แจ้งเตือน timeout estimates และสถิติจาก operations จริง

**Blocked by:** 06 — auto-Skip และ countdown จากเวลาของ server; 11 — QR ของ Shop และ Display board แบบ real-time; 12 — Estimated wait จากงาน Completed จริง; 14 — จำนวนคิวรายชั่วโมงและ peak-hours view; 15 — Web Push เมื่อใกล้ถึงคิว ถูกเรียก หรือร้าน Drop; 16 — Try demo ที่แยก session และ reset อัตโนมัติ

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 67, 68, 69, 70; Acceptance scenarios A03, A06, A09, A14, A16, A17, A19, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] ปุ่มจำลองCustomerใช้Receive Ticket operationจริงในdemo Queue พร้อมการควบคุมintent/devicequotaตามcontract ไม่แก้ตัวเลขหน้าจอหรือinsertrowsข้ามdomaincommands
- [ ] แสดงTicket linkของsimulatedCustomerและlinksเปิด Owner/Board ในseparatecontextsได้โดยไม่เผยprivatepermissionsหรือnotesในboard
- [ ] Demonstrate Call → Start → Complete, no-show auto-Skip และ notificationsที่opt inแล้วในสามviewsพร้อมค่าestimated wait/statsจากhistoryจริง
- [ ] ให้instructionทดลองพร้อมกันจากสองOwnertabs/Customerrequests แล้วเห็นrealconflicts/no-duplicatenumbers/no-double-heldโดยไม่สร้างfake success/failureevents
- [ ] Simulation/action controls session-scoped; demo sessionอื่นและrealdataไม่ถูกเปลี่ยน;หมดอายุแล้วแสดงชัด ไม่คง fake-live data
- [ ] Browser smoke mobile375/390px, landscape, Thai/English, zoom/keyboard/safearea/reduced-motionและactualsupportedpushในdemoflow;บันทึกเฉพาะแพลตฟอร์ม/verificationที่รันจริง
- [ ] DeliveryรวมUI,API,DBและpublic-boundary isolation/simulator tests;fulldemoใช้live modulesจริงและไม่มี scaffolds,TODOหรือ dead links
