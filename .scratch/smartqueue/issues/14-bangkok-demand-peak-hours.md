# 14 — จำนวนคิวรายชั่วโมงและ peak-hours view

**What to build:** Owner เห็นชั่วโมงที่ลูกค้ารับ Ticket มากที่สุดและรูปแบบตามวันในสัปดาห์ จากข้อมูลจริงใน Asia/Bangkok

**Blocked by:** 13 — สถิติ Business day และผลลัพธ์ Ticket

**Status:** ready-for-agent

**Source:** SmartQueue spec — User Stories 58, 61, 62; Acceptance scenarios A12, A17, A20. IDs ที่ใช้ร่วมกับใบอื่นหมายถึงร่วมกันส่งมอบ scenario ทั้งหมด ไม่อ้างว่าใบนี้ครอบคลุมส่วนที่ยังต้องรอ feature อื่นเพียงใบเดียว.

**Completion contract:** ทำ vertical slice นี้ให้ใช้ได้ผ่าน UI/API/PostgreSQL จริง ตาม SmartQueue spec และ ADR-0001/0002/0003; ไม่มี Staff หรือ scope เพิ่มนอก spec. ทุกหน้าที่ใบนี้เพิ่มต้องเป็น Warm Minimal, Thai/English, touch targets อย่างน้อย 48×48, pending/error/empty states และ accessible focus/status; ทดสอบ consumer-visible behavior ที่ public boundary ด้วย PostgreSQL จริงและทำ browser/runtime smoke ของ flow ที่เพิ่ม. ห้ามทดสอบ source text, copied defaults หรือ mock forwarding แทนพฤติกรรมจริง. หลัง smoke ปรับเอกสารพฤติกรรมที่เปลี่ยนและลบ scaffolds/throwaway scripts.

- [ ] Hourly demand/weekday heatmap bucket จาก received timestamp ที่เก็บ UTC เป็น Bangkok hour/day ไม่ใช้ Call/Complete time และไม่เปลี่ยน Business day grouping
- [ ] Reuse own Shop/Service/Business day filters ที่มีอยู่ โดย metrics ใหม่มี API aggregation จริง ไม่ใส่ hardcoded bars, seeded chart-only arrays หรือ prose claim ที่ไม่ตรงข้อมูล
- [ ] รวม issued origins ตาม selection; reopen/overnightไม่สร้าง duplicate records และไม่มีข้อมูลต้องมี empty state
- [ ] Chart มี hour/day labels, legend และ text alternative/values ไม่ใช้สีบอกความหนาแน่นอย่างเดียว; small phone/large textยังอ่านได้
- [ ] Boundary tests UTC-to-Bangkok midnight/clock buckets และ mixed received-vs-called times; browser smoke เปลี่ยน Service/range แล้ว chart และ summaryเปลี่ยนตามข้อมูลจริง
