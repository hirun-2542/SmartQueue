# 15 — Web Push เมื่อใกล้ถึงคิว ถูกเรียก หรือร้าน Drop

**What to build:** Customer opt in Web Push ได้และรับ near-turn/Called/Drop โดย iPhone ได้คำแนะนำติดตั้งที่ถูกต้อง และ Ticket ใช้ได้แม้ไม่อนุญาต

**Blocked by:** 07 — ปิดรับคิว Drop และจบ Business day; 10 — Customer และ Owner เห็นสถานะสดและ reconnect อย่างถูกต้อง

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 16, 17, 18, 20, 21, 27, 29, 30; Acceptance scenarios A11, A13, A14, A15, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Service worker/VAPID ใช้ HTTPS หรือ localhost dev; opt-in ผ่าน valid Ticket link และ user permission จริง; UI แสดง enabled/denied/unsupported ไม่บังคับ join
- [x] Near-turn ส่งอย่างมากหนึ่งครั้งเมื่อ ahead crossing >N → <=N; threshold เริ่มต้น2แต่ใช้ค่าต่อ Service; joinsที่เริ่มอยู่ใน thresholdไม่ส่ง extra near-turn push, CalledและDropเป็น eventsแยก
- [x] Event/payload ออกหลัง commitและไม่มี Customer note/secret/Owner private fields; denial/failure/unsubscribeไม่ rollback TicketหรือQueue operations
- [x] Terminalทันทีถอน association ของใบที่จบ; shared endpointของ active Ticketอื่นยังแจ้งได้; Dropส่งจาก subscription snapshotก่อนถอนและไม่เก็บ orphanเพื่อแจ้งต่อ
- [x] iOS Home Screen-supported contextจึงเปิด Pushได้; Safari-tab visitorได้ install guidanceไม่ถูกบอกว่าenabled; sounds/vibrationเป็น optional browser capabilities
- [x] Thai/English notificationcopyและdeep linkเข้าหน้าTicketที่ถูกต้องพร้อมinvalid/expired outcome; togglesมีaccessible nameและ48px hitarea
- [x] Boundary tests crossing leaps/duplicate suppression/shared-endpoint/terminal/permission failures ด้วย test sink และ real supported-browser Web Push smoke; ระบุแพลตฟอร์มจริงไม่อ้าง sinkว่าdelivery proofบน iPhone

## Comments

- Resolved on `integration/smartqueue`. PostgreSQL boundary tests parse actual delivery JSON and cover crossing leaps/once-ever suppression, threshold edits/re-opt-in, terminal withdrawal, shared endpoints and sender failure. Review fixed subscription commits so they do not invalidate lifecycle versions.
- Actual production Web Push delivered through FCM to managed Chromium150: English near-turn/Called and Thai Drop with correct locally resolved private links; latest reviewed V001 Call delivered “Your turn · V001”, then Skip returned200 and associationfalse. Test sink is not this delivery evidence.
- Denied/unsupported states preserved Ticket use. iPhone-UA Safari guidance shows copy-before-install/paste recovery; actual same-origin paste and HTTP410 expiry screens exercised. Physical iPhone installation/delivery was not available and is not claimed. Final runtime 57/57, integration 30/30 and production build passed.

