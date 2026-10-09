# 05 — Customer ยกเลิก Ticket และดูผลผ่านลิงก์ 24 ชั่วโมง

**What to build:** Customer Cancel Waiting/Called จาก Ticket link ได้ เห็น final result และ expired view หลัง Ticket จบครบ 24 ชั่วโมง

**Blocked by:** 04 — Owner เรียกและให้บริการ Ticket แบบ FIFO

**Status:** ready-for-agent
**State:** closed

**Source:** SmartQueue spec — User Stories 9, 23, 24, 25, 26, 28; Acceptance scenarios A04, A08, A13, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [x] Valid Ticket link Cancel Waiting/Called ได้พร้อม confirmation; Called cancellation release Shop hold; InService และ terminal Cancel ไม่ได้
- [x] Expected status/version กัน stale overwrite เมื่อ Cancel แข่งกับ Call หรือ Start; หลัง refresh อนุญาตคำสั่งใหม่ที่ valid ตาม status ไม่แปล first-committed-wins ว่าห้ามทุก sequential command
- [x] Terminal ไม่กิน active quota และไม่กลับมา active; Customer รับ Ticket ใหม่ได้ถ้ากฎ Open/quota อนุญาต
- [x] ผล Completed/Skipped/Cancelled และ terminal variants แสดงผ่าน link ได้ก่อนหมด 24 ชั่วโมงจาก terminal timestamp แล้วกลายเป็น expired view; framework ของผลสุดท้ายรองรับ Dropped เมื่อเพิ่ม operation นั้น
- [x] Invalid/expired link ไม่เปิด private details; expiry ของ link ไม่ลบ Ticket history/statistics และไม่อ้างว่า Customer note ถูกลบทั้งหมด
- [x] Browser smoke Cancel จากอีกเครื่อง, final/expired view และ public-boundary Cancel/Call race, Cancel-after-Start rejection, exact expiry boundary กับ controllable server time

## Comments

- Resolved on `integration/smartqueue` after review. Real HTTP Cancel/Call races and exact 24h−1ms/24h boundaries passed. Browser Cancel showed terminal result; isolated real-Kestrel/PostgreSQL clock smoke advanced 24h and Refresh returned HTTP410 with the expired message, no old Ticket number or horizontal overflow. Final runtime 57/57 and integration 30/30 passed.

