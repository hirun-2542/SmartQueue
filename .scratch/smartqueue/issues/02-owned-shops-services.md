# 02 — Owner จัดการ Shop และ Service ของตนเอง

**What to build:** Owner สร้าง แก้ไข และสลับหลาย Shop เพิ่ม Service พร้อม Prefix, Call timeout และเกณฑ์แจ้งเตือน โดยข้อมูลไม่รั่วข้าม Owner

**Blocked by:** 01 — Owner สมัคร ยืนยันอีเมล และเข้าใช้งาน

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 33, 34, 35, 36, 37; Acceptance scenarios A02, A18, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Verified Owner สร้าง/แก้ Shop และสลับ own Shops ผ่าน UI จริง; อีก Owner อ่านหรือแก้ private resources ไม่ได้ แม้ส่ง target identifiers ที่รู้มา
- [x] เพิ่ม/แก้ Service ใน own Shop ได้ แต่ละ Service มี Queue เดียวในสถานะ Closed เริ่มต้น พร้อม public Shop identifier สำหรับ join/board ใน workflow ต่อไป
- [x] Prefix ของ Services ที่ใช้งานต้องไม่ซ้ำภายใน Shop; ไม่เพิ่มข้อห้าม O/I ที่ยังเป็นเพียง design recommendation
- [x] ตั้ง Call timeout และ near-turn threshold ต่อ Service ได้ โดยค่าเริ่มต้น threshold คือ 2; API errors มี meaning ชัด ไม่อนุญาต non-positive timeout หรือ negative threshold
- [x] เก็บเวลาข้อมูลเป็น UTC; ไม่มี Staff, Branch, presence หรือ per-Shop timezone fields เพิ่ม
- [x] หน้าร้าน/บริการเป็น Warm Minimal และ Thai/English; create/edit/switch มี pending/validation และ empty states จริง ไม่ใช้ fake public counts หรือ dead navigation
- [x] รันสอง Owner sessions ผ่าน public boundary เพื่อพิสูจน์ isolation, Service configuration persistence และ duplicate Prefix rejection; browser smoke สร้างสอง Shops แล้วสลับและแก้ Service

## Comments

- Red observed: creating a Shop returned 405 before Shop endpoints existed.
- Verified `npm test`: 2 passed, 0 failed, including independent Owner sessions, cross-Owner 404, duplicate active Prefix and invalid timeout.
- .NET and Vite production builds passed. Browser smoke at 375×812 created two Shops, switched between them, created/edited a Service and accepted Prefix O.
- Browser width remained 375 px with no horizontal overflow; observed button hit areas were at least 48×48 and browser errors were empty.
- Resolved on `integration/smartqueue` after whole-branch review. Final runtime 57/57 and PostgreSQL integration 30/30 passed; configuration, isolation and mobile create/edit/switch evidence above remains valid.
