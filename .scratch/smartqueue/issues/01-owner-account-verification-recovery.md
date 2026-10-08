# 01 — Owner สมัคร ยืนยันอีเมล และเข้าใช้งาน

**What to build:** Owner สมัครด้วย email/password เปิดลิงก์ยืนยันจากอีเมลจริง แล้ว login/logout หรือกู้รหัสผ่านจากมือถือได้

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 31, 32; Acceptance scenarios A01, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Register → email verification → sign in และ password recovery ทำงานผ่านหน้า mobile web กับ ASP.NET Core Identity และข้อมูลที่ persist ใน PostgreSQL; ไม่ใช้ demo bypass สำหรับ real account
- [ ] บัญชีที่ยังไม่ verify จัดการ Shop ไม่ได้; verification/recovery tokens ที่ invalid หรือ expired ให้ผลชัดเจน โดยไม่สร้าง session หรือเปลี่ยน credential ผิดบัญชี
- [ ] SMTP ใช้ configuration จริง; development เปิดลิงก์ที่ application ส่งจาก local capture mailbox ได้ ไม่ตรวจด้วย mocked send echo
- [ ] Session cookie เป็น Secure/HttpOnly เมื่อใช้ HTTPS, mutations ที่อาศัย cookie มี CSRF protection และ sign out ยกเลิกการใช้งาน session ตาม contract
- [ ] Mobile UI ใช้ Warm Minimal, Thai/English, visible field labels, pending/inline errors, password manager/paste และ deep-link verification/recovery ที่ refresh ได้; ยังไม่ใส่ปุ่ม demo ที่กดแล้วไม่มีผล
- [ ] รัน public-boundary tests กับ DB จริงสำหรับ verification/access/recovery และ browser smoke สมัคร → verify → login → logout → recovery; ไม่มี standalone scaffold-only delivery
