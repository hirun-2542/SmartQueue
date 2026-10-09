# 11 — QR ของ Shop และ Display board แบบ real-time

**What to build:** Owner ดาวน์โหลด QR/คัดลอกลิงก์; ลูกค้าสแกนเข้ารับ Ticket และจอหน้าร้านเห็น current Called, recent และ Waiting แยก Service แบบสด

**Blocked by:** 10 — Customer และ Owner เห็นสถานะสดและ reconnect อย่างถูกต้อง

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 1, 39, 40, 64, 65, 68; Acceptance scenarios A02, A05, A06, A13, A14, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] สร้าง QR ที่ scan ได้จริงจาก public Shop URL ไม่ใช้ลาย QR รูปตัวอย่าง; download image/copy link มี success/error feedback และ deep link เปิด public Shop ถูกอัน
- [x] Public Display board ไม่ต้อง login; warm espresso landscape UI อ่าน Ticket number/Service/status ได้ พร้อม QR ของ Shop
- [x] แสดง at most one current Called ทั้ง Shop; InService ไม่กลายเป็น Called ใบใหม่; recent list แยกจาก current และ Waiting แยกตาม Service ไม่อ้าง FIFO รวมข้าม Queue
- [x] Board payload ไม่เผย Customer note, bearer links, subscription endpoints หรือ private Owner fields รวมใน recent/history
- [x] Board รับ commit-only live updates ผ่าน fan-out ที่มีอยู่และ initial/reconnect snapshots; phase change/expired old data ไม่ค้างเป็น current Calls
- [x] Boundary tests anonymous board/isolation/order/current-hold และ browser smoke scan QR → join → Call/Start/Complete เห็น Owner/Customer/Board ตรงกัน; บันทึก visual proof บนจอแนวนอน

## Comments

- Resolved on `integration/smartqueue`. Actual downloaded QR PNG decoded with ZXing to the correct public Shop URL; clipboard link matched. 1440px three-view Call/Start/Complete kept the same Ticket and removed current Called on Start. Privacy/live/isolation runtime cases passed. Review clock fix naturally ticked 08:07→08:08 Bangkok with device timezone America/Los_Angeles; no browser errors or recorded new requests. Final 57/57 runtime and 30/30 integration gates passed.

