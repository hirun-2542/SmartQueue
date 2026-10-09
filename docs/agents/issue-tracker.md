# Issue tracker: Local Markdown

โปรเจกต์นี้ยังไม่มี Git repository หรือ remote ตอนสร้าง spec แรก จึงใช้ local Markdown เป็น issue tracker โดยไม่สร้าง remote repository หรือแก้ agent instruction files

## Conventions

- Issues และ specs อยู่ใน `.scratch/`
- หนึ่ง feature ต่อ directory: `.scratch/<feature-slug>/`
- Spec: `.scratch/<feature-slug>/spec.md`
- Implementation tickets เมื่อมีคำขอให้แตกงาน: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` เริ่มที่ `01` แยกหนึ่งไฟล์ต่อ ticket
- Triage label บันทึกเป็น `Status:` ใกล้ส่วนต้นของไฟล์ ตาม [triage-labels.md](triage-labels.md)
- “Publish to the issue tracker” หมายถึงสร้างไฟล์ใน directory ของ feature ไม่ใช่สร้าง GitHub Issue
- Comments ถ้ามี ให้ต่อท้ายใต้ `## Comments`
- เมื่อ implementation ผ่าน acceptance และ review แล้ว ให้คง `Status:` เป็น triage label เดิม เพิ่ม `State: closed`, ทำเครื่องหมาย acceptance checkboxes และบันทึก resolution/evidence ใน `## Comments`; ไม่ปิดหรือแก้ parent spec

Spec แรก: [SmartQueue](../../.scratch/smartqueue/spec.md)
