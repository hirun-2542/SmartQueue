# SmartQueue — Mobile-first Owner-operated Queue Management

Type: spec
Status: ready-for-agent
Audience: implementation agent / developer

## Problem Statement

ร้านหรือธุรกิจขนาดเล็ก เช่น ร้านตัดผม คลินิก ร้านซ่อม และร้านล้างรถ ต้องรับคิวและบอกลูกค้าว่าเมื่อไรถึงคิว ขณะเดียวกัน Owner คนเดียวต้องให้บริการด้วย การเรียกคิวด้วยเสียงหรือจดกระดาษทำให้ลูกค้าไม่รู้สถานะ ต้องยืนรอ และ Owner สลับจากงานบริการไปจัดการคิวบ่อย

ลูกค้าควรรับ Ticket โดยไม่สมัครสมาชิก ใช้มือถือดูสถานะและรับแจ้งเตือนได้ ส่วน Owner ต้องจัดการทั้งหมดจากมือถือ ไม่ต้องมี Staff หรือแผง dashboard ที่ซับซ้อน หากเปิดหลายแท็บ กดซ้ำ หรือกดพร้อมกับ Customer และ timer ระบบต้องไม่แจกเลขซ้ำหรือทำให้ Ticket อยู่ผิดสถานะ

โปรเจกต์มีเป้าหมายเป็น portfolio demo ที่ interviewer เข้าใจ workflow ได้เร็วและลองเองได้ โดยแสดง Real-time, SignalR, QR, Notification และ Concurrency ผ่านพฤติกรรมจริง ไม่ใช่หน้าจอจำลองที่ไม่มี backend

## Solution

สร้าง SmartQueue เป็น mobile-first web app มีสองบทบาทคือ **Customer** และ **Owner** เท่านั้น หลาย Owner สมัครได้ แต่ละคนเป็นเจ้าของหลาย Shop และแต่ละ Shop มีหลาย Service โดยหนึ่ง Service มีหนึ่ง Queue

Customer สแกน QR ของ Shop เลือก Service รับ Ticket แล้วติดตามผ่าน Ticket link ที่ไม่ต้อง login เลขคิวและจำนวน Tickets ahead อ่านได้ทันที การเปลี่ยนสถานะปรากฏแบบ real-time และแจ้งเตือนผ่านหน้าเว็บกับ Web Push เมื่ออนุญาต

Owner เปิดหรือปิด Queue เลือก Queue แล้ว Call next ตาม FIFO เริ่มให้บริการ เสร็จสิ้น หรือ Skip จากมือถือได้ ถือ Called/InService Ticket ได้ไม่เกินหนึ่งใบต่อ Shop ออก Walk-in Ticket ให้ลูกค้าที่ไม่มีมือถือได้ จัดการ Service และ QR รวมถึงอ่านสถิติจาก workflow เดียวกัน

ใช้ UX/UI **Warm Minimal**: พื้นครีม หมึกเข้ม terracotta เป็นปุ่มหลัก บัตรคิวมีรอยบาก สี saffron สื่อ Called และ sage สื่อ Open/InService/Completed แท็บ Owner มีสามรายการคือ คิว / สถิติ / ร้าน ไม่มี Staff management หรือการ์ด KPI เต็มหน้าจอ

มี Display board อ่านอย่างเดียวสำหรับจอหน้าร้าน และ Try demo ที่เข้าเป็น Owner ของ Shop ตัวอย่างได้โดยไม่ต้องสมัคร พร้อม seed data และการจำลอง Customer ผ่าน workflow จริง

## User Stories

### Customer — การรับและถือ Ticket

1. As a Customer, I want to scan a Shop QR code, so that I can find its available Services without registering.
2. As a Customer, I want to see which Queues are Open, Closing or Closed, so that I do not try to join a Queue that is no longer accepting Tickets.
3. As a Customer, I want to choose one Service, so that my Ticket belongs to the line for the work I need.
4. As a Customer, I want to see the number of Waiting Tickets before joining, so that I can decide whether to wait.
5. As a Customer, I want to see an Estimated wait when there is enough real service history, so that I can plan without mistaking an estimate for a guarantee.
6. As a Customer, I want to take a Ticket without creating an account or providing a phone number, so that joining is quick and private.
7. As a Customer, I want to optionally add a Customer note, so that the Owner can identify my request without making personal information mandatory.
8. As a Customer, I want to receive a readable Ticket number and a private Ticket link, so that I can follow the correct Ticket.
9. As a Customer, I want to copy my Ticket link and open it on another device, so that clearing browser data or changing phones does not lose my Ticket.
10. As a Customer, I want to be warned before requesting another active Ticket in the same Queue, so that accidental repeated taps do not create extra places.
11. As a Customer, I want to confirm extra Tickets for people with me, so that a family can use one phone, up to three active Tickets per Queue per device.
12. As a Customer, I want to be told when I have reached that limit, so that I understand why another Ticket cannot be issued.
13. As a Customer, I want failed or repeated submission of the same join request not to silently create multiple Tickets, so that I do not occupy the Queue twice by accident.

### Customer — การรอ การแจ้งเตือน และสถานะสุดท้าย

14. As a Customer, I want my Tickets ahead and Ticket status to update live, so that I do not need to refresh manually.
15. As a Customer, I want to see which Ticket is currently Called, so that I can understand the Queue's progress.
16. As a Customer, I want to opt into notifications, so that I can step away from the Queue without being required to provide contact details.
17. As a Customer, I want to be notified when Tickets ahead crosses the Service's near-turn threshold, so that I have time to return.
18. As a Customer, I want a prominent Called screen and notification when my Ticket is Called, so that I do not miss my turn.
19. As a Customer, I want to see the time left to reach the counter, so that I understand when my Ticket will be auto-Skipped.
20. As a Customer using an iPhone, I want clear Home Screen installation guidance and an accurate notification status, so that I am not promised Web Push in an unsupported browsing context.
21. As a Customer, I want to keep using my Ticket when notification permission is denied or unsupported, so that optional notifications do not prevent joining.
22. As a Customer, I want stale connection status to be visible and my Ticket to re-sync after unlocking the phone, so that I do not act on old information.
23. As a Customer, I want to Cancel my Waiting or Called Ticket, so that the Owner can continue without waiting for me.
24. As a Customer, I want cancellation to be unavailable after service starts, so that I do not accidentally end work already in progress.
25. As a Customer, I want to see Completed, Skipped, Cancelled or Dropped with a clear explanation, so that I know why my Ticket has ended.
26. As a Customer, I want to take a new Ticket after being Skipped, so that I can return without reopening a finished Ticket.
27. As a Customer, I want to see that the Shop has Dropped my Waiting Ticket and receive a notification when enabled, so that I stop waiting for service the Shop will not provide.
28. As a Customer, I want the final result to remain visible through my Ticket link for 24 hours, so that I can understand what happened even if I return later.
29. As a Customer, I want my notifications to stop when the Ticket ends, so that I do not keep receiving irrelevant updates.
30. As a Customer, I want Thai and English labels with large readable numbers and clear status words, so that I can understand my place quickly on a phone.

### Owner — บัญชี Shop และ Service

31. As an Owner, I want to register using email and password and verify my email, so that I can establish a valid Owner account before managing Shops.
32. As an Owner, I want to sign in, sign out and recover my password, so that I can regain access without sharing credentials.
33. As an Owner, I want to create and manage more than one Shop and switch between them, so that I can keep each business's Queue data separate.
34. As an Owner, I want other Owners to be unable to read or change my private Shop data, so that customers' notes and business operations stay private.
35. As an Owner, I want to add and edit Services, so that Customers can choose the work my Shop offers.
36. As an Owner, I want to assign a distinct Prefix to each Service, so that Ticket numbers on the Display board are easy to distinguish.
37. As an Owner, I want to configure Call timeout and the near-turn notification threshold per Service, so that each Queue fits its business workflow.
38. As an Owner, I want to archive a Service instead of deleting its history, so that it disappears from the Customer choices without erasing statistics.
39. As an Owner, I want to copy my Shop link and download its QR image, so that Customers can join from signage or a shared link.
40. As an Owner, I want to open a read-only Display board without exposing Customer notes, so that people in the Shop can follow Tickets safely.

### Owner — การให้บริการและการปิด Queue

41. As an Owner, I want to Open a Queue and start a Business day, so that Customers can begin taking Tickets with a restarted number counter.
42. As an Owner, I want an Open Queue to accept Tickets even when I am not connected, so that my phone's connection does not decide whether the Shop is accepting Customers.
43. As an Owner, I want to see Waiting Tickets, Customer notes and how long each has waited, so that I can prepare for the next Customer.
44. As an Owner, I want to choose a Queue and Call its oldest Waiting Ticket, so that service follows FIFO within that Queue.
45. As an Owner, I want the Shop-wide one-held-Ticket rule enforced across devices and Queues, so that I cannot accidentally Call two Customers at once.
46. As an Owner, I want to Start service for a Called Ticket, so that the call deadline ends and actual service duration can be measured.
47. As an Owner, I want to Complete an InService Ticket, so that the Shop becomes available for its next Call.
48. As an Owner, I want to Skip a Called Ticket whose Customer did not arrive, so that I can continue serving the Queue.
49. As an Owner, I want an unattended Called Ticket to be auto-Skipped after its Call timeout, so that my Shop is not blocked indefinitely in Called.
50. As an Owner, I want a clear refusal and fresh state when another operation wins a conflict, so that two tabs or a timer cannot silently overwrite each other.
51. As an Owner, I want to create a Walk-in Ticket and show its number, so that Customers without a smartphone can join the same FIFO Queue.
52. As an Owner, I want to stop accepting new Tickets while serving existing ones, so that I can close without abandoning Customers already waiting.
53. As an Owner, I want to Drop Waiting Tickets with explicit confirmation when closing immediately, so that I can stop the Queue while keeping this outcome distinct from Customer cancellation.
54. As an Owner, I want already Called or InService Tickets to continue after Drop, so that work in progress is not silently terminated.
55. As an Owner, I want Business days to follow Queue opening and closing rather than midnight, so that an overnight shift keeps its Ticket counter and statistics together.
56. As an Owner, I want my console to re-sync and show connection changes after backgrounding the phone, so that I serve the latest Ticket state.
57. As an Owner, I want the primary action to change from Call next to Start to Complete in thumb reach, so that I operate the Queue quickly with one hand.

### Owner — สถิติ

58. As an Owner, I want Ticket counts per Business day and Bangkok clock hour, so that I understand demand without confusing calendar days with Queue opening periods.
59. As an Owner, I want average waiting and service durations, so that I can understand how quickly Customers move through my Shop.
60. As an Owner, I want Skipped, Cancelled and Dropped reported separately, so that no-shows, Customer choices and Shop closures are not mixed together.
61. As an Owner, I want to filter statistics by Service and recent Business days, so that I can compare relevant operating periods.
62. As an Owner, I want a peak-hours view, so that I know when more Customers usually join.
63. As an Owner, I want zero-data and insufficient-history states to be explicit, so that missing measurements are not presented as a zero-minute wait.

### Display board และ portfolio demo

64. As a visitor in a Shop, I want the Display board to show the current Called Ticket, recently Called Tickets and Waiting Tickets per Service, so that I can follow the Queue without signing in.
65. As a visitor in a Shop, I want only Ticket numbers, Service names and public status shown, so that Customer notes or private links are never displayed publicly.
66. As an interviewer, I want a Try demo entry that requires no registration, so that I can explore the Owner flow immediately.
67. As an interviewer, I want realistic seed data and a Customer simulation action, so that I can observe the actual Queue, estimates and statistics without setting everything up myself.
68. As an interviewer, I want to open Customer, Owner and Display board views together and observe the same transitions, so that Real-time and SignalR are understandable from the demo.
69. As an interviewer, I want concurrent actions to demonstrate safe outcomes rather than duplicate Tickets or Calls, so that the system's Concurrency design is visible.
70. As an interviewer, I want demo state isolated from other users and reset automatically, so that I can explore without damaging real Shop data or another demo session.

## Implementation Decisions

### 1. ข้อตกลงหลักและลำดับความสำคัญ

- ใช้ศัพท์จาก domain glossary และเคารพ ADR-0001, ADR-0002 และ ADR-0003 โดยไม่สร้าง Customer account, Staff, calendar-day reset หรือ in-memory concurrency lock มาแทน
- Stack ที่ตกลงแล้ว: ASP.NET Core 10, SignalR, React/Vite with TypeScript และ PostgreSQL
- Owner คนเดียวเป็นผู้ดำเนินการทั้งหมดภายใน Shop ไม่มี Admin/Staff role เพิ่ม ไม่มี account สำหรับ Customer
- ถือได้หนึ่ง Called หรือ InService Ticket **ต่อ Shop** ไม่ใช่หนึ่งใบต่อ Queue และไม่ใช่หนึ่งใบรวมทุก Shop ของ Owner
- Business day เป็นของ **Queue** ไม่มี Business day ร่วมของทั้ง Shop โดยปริยาย
- ข้อกำหนดพฤติกรรมและ ADR มีลำดับเหนือ sample numbers, timestamps และข้อความตัวอย่างใน UI frames
- รายละเอียดที่บทสนทนายังไม่ได้ระบุแต่จำเป็นต่อ implementation กำหนดไว้ในหัวข้อ “Implementation defaults” ด้านล่าง เป็นการเลือกวิธีทำ ไม่อ้างว่าเป็นคำตอบใหม่จากผู้ใช้

### 2. ขอบเขต module และ interfaces

ใช้ module ตามความรับผิดชอบ ไม่แยก microservices หรือเพิ่ม event-sourcing framework

| Module | Responsibility / public behavior |
|---|---|
| Owner identity and Shop management | Register, verify email, sign in/out, password recovery, manage own Shops, edit/archive Services, configure Prefix, timeout and notification threshold |
| Queue operations | Open, stop accepting, Drop, receive Ticket, create Walk-in Ticket, Call next, Start, Complete, Skip, Cancel, auto-Skip; enforce lifecycle and number allocation |
| Live views and notifications | Public Shop view, private Ticket view, Owner console, Display board snapshots, SignalR updates, optional Web Push and subscription removal |
| Statistics | Aggregate Ticket count, waiting/service durations, outcome rates and peak hours from recorded transitions |
| Mobile web and demo | Warm Minimal screens, Thai/English, install guidance, Try demo, seed data and Customer simulation through real operations |

- Public interfaces expose **intent**, เช่น Receive Ticket, Call next และ Stop accepting; ไม่มี generic “set any status” API
- ทุก private Owner request ตรวจ ownership จาก authenticated Owner และ resource ที่โหลดจริง ไม่เชื่อ Shop identifier จาก client โดยไม่ตรวจสิทธิ์
- Private resource ของอีก Owner ต้องอ่านหรือเปลี่ยนไม่ได้ ส่วน Public Shop และ Display board เปิดได้โดยตั้งใจ แต่ไม่มี private fields
- Register/verify/password recovery ส่งอีเมลจริงผ่าน configurable SMTP; email provider รายใดไม่ถูกผูกไว้ใน domain model
- Owner auth ใช้มาตรฐาน ASP.NET Core Identity; SPA และ API ใช้ deployment origin เดียวกันสำหรับ session cookie พร้อม Secure/HttpOnly และ CSRF protection ของ mutation ที่ใช้ cookie

### 3. โมเดลข้อมูลที่ต้องรองรับ

| Concept | Required information / invariant |
|---|---|
| Owner | Account, password credential management, email verification, ownership of Shops |
| Shop | Internal identity, public join/board identifier, name and Owner; ไม่มี Staff membership |
| Service | Shop, name, Prefix, Call timeout, near-turn threshold N, archive state; มี Queue เดียว |
| Queue | Service, Open/Closing/Closed, current Business day; ไม่มี capacity limit |
| Business day | Queue, opening timestamp, closing timestamp, own number counter; ปิดได้เมื่อไม่มี active Ticket ใน Queue |
| Ticket | Internal identity, Queue and Business day, Ticket number, immutable receive order, status/version, Customer note, timestamps of actual transitions, origin Customer/Walk-in |
| Ticket link access | Unguessable bearer secret สำหรับ Customer-issued Ticket, terminal expiry; Walk-in ไม่มี link |
| Device limit | Pseudonymous device cookie and association with Customer-issued Tickets, เพื่อจำกัด active count ไม่ใช่ Customer identity |
| Push subscription | Explicit opt-in, endpoint association with Ticket, language; access validated through Ticket link |

- เก็บ receive, Called, Start, terminal และ Business day times เป็น UTC แสดงและ bucket นาฬิกาเป็น Asia/Bangkok เท่านั้น ไม่มี timezone setting ต่อ Shop
- Active Ticket คือ Waiting, Called หรือ InService; terminal คือ Completed, Skipped, Cancelled หรือ Dropped
- Snapshot Ticket number และ Prefix ตอนออก Ticket เพื่อไม่เปลี่ยนหมายเลข Ticket เดิมเมื่อแก้ Service
- Prefix ไม่ซ้ำระหว่าง Services ที่ใช้งานใน Shop เพื่อให้เลขบน Display board แยกบริการได้; ตัวเลขไม่ใช่ primary identity
- Counter เริ่มที่ 1 ต่อ Business day แสดงอย่างน้อยสามหลัก เช่น A001; เกิน 999 ให้แสดงเพิ่มหลัก ไม่วนกลับและไม่ตัดเลข
- Archive ซ่อน Service จากรายการรับ Ticket และป้องกันการเปิด Business day ใหม่ แต่ไม่ลบประวัติ; Tickets ที่ออกแล้วต้องจบตาม lifecycle เดิมได้

### 4. Queue และ Business day lifecycle

| Current Queue status | Action | Result |
|---|---|---|
| Closed | Open | สร้าง Business day ใหม่ รีเซ็ต counter แล้วเปลี่ยนเป็น Open |
| Open | Receive Ticket / Walk-in | ออก Waiting Ticket ใน Business day ปัจจุบัน |
| Open | Stop accepting | เปลี่ยนเป็น Closing; ไม่รับ Ticket ใหม่ เรียก Waiting ที่ค้างต่อได้ |
| Open หรือ Closing | Drop | ทำ Waiting ทั้งหมดใน Queue เป็น Dropped; Called/InService ไม่เปลี่ยน; Queue เป็น Closing หากยังมี active Ticket |
| Closing | Active count becomes zero | เปลี่ยนเป็น Closed และบันทึกเวลาสิ้นสุด Business day |
| Open | Stop accepting หรือ Drop เมื่อไม่มี active Ticket | ปิดและจบ Business day ใน operation เดียว |

- Open Queue ที่ยังไม่มี Ticket ไม่ปิดเอง และ Open ไม่ขึ้นกับ connection/presence ของ Owner
- Closing/Closed รับ Ticket ใหม่ไม่ได้ รวมถึง Walk-in; เมื่อ Closing ห้ามเปิดรอบใหม่ทับ Business day เดิม
- ปิด Queue ว่างต้องมีเวลาจบ Business day โดยไม่ต้องรอ “last Ticket” ที่ไม่มีอยู่จริง
- เปิด Queue ใหม่หลัง Closed แม้อยู่วันปฏิทินเดียวกัน เป็น Business day ใหม่; เลขที่เคยออกอาจซ้ำข้าม Business days ได้โดยไม่ใช่ Ticket เดียวกัน
- Join แข่งกับ Stop accepting/Drop ตัดสินแบบ transaction: ถ้า Join สำเร็จก่อน Ticket เป็นส่วนหนึ่งของงานค้างนั้น; ถ้าปิดชนะก่อน Join ต้องถูกปฏิเสธ ไม่มี Ticket แอบออกหลังปิด

### 5. Ticket lifecycle และสิทธิ์แต่ละ action

| Action | Actor | Allowed source | Target / visible effect |
|---|---|---|---|
| Receive Ticket | Customer | Open Queue | Waiting + Ticket number + Ticket link |
| Create Walk-in Ticket | Owner | Open Queue | Waiting + Ticket number; ไม่มี Ticket link/push |
| Call next | Owner | Waiting ใน Queue ที่เลือก; Shop ไม่มี held Ticket | Called; เลือกเก่าสุด เปิด deadline |
| Start | Owner | Called | InService; เริ่มนับเวลาให้บริการ; deadline เรียกไม่ทำงานกับใบนี้อีก |
| Complete | Owner | InService | Completed; ปลด Shop-wide hold |
| Skip | Owner | Called | Skipped; ปลด hold; ลูกค้ารับ Ticket ใหม่เท่านั้น |
| auto-Skip | Server | Called ที่ deadline ถึงแล้ว | Skipped ผ่านกฎ transaction เดียวกับ manual Skip |
| Cancel | Holder of Ticket link | Waiting หรือ Called | Cancelled; ถ้า Called ปลด hold |
| Drop | Owner | Waiting ใน Queue ที่ปิดทันที | Dropped; ไม่เปลี่ยน Called/InService |

- Call next เรียงตาม immutable receive order ของ Queue ที่เลือก ไม่ใช้ Prefix หรือตัวเลขที่แสดงเป็นตัวตัดสิน และ Walk-in ใช้ order เดียวกับ Customer-issued Ticket
- ไม่มีการ recall, ย้าย Ticket กลับไป Waiting, เลือกใบแซง FIFO หรือให้ Customer Start เอง
- ไม่มี force-complete/release ของ role อื่นและไม่มี auto-Complete สำหรับ InService; Owner เป็นผู้ Complete เอง
- ทุก terminal status เป็น final; ไม่มี operation ที่ทำให้ Completed/Skipped/Cancelled/Dropped กลับมา active
- UI Idle มี primary Call next; Called มี primary Start และ secondary Skip; InService มี primary Complete; ไม่วาง Call next ที่ใช้งานได้ขณะ Shop ถือ Ticket

### 6. Concurrency และเวลา

- PostgreSQL transaction เป็นผู้ตัดสิน number allocation, active Ticket limit, Shop-wide hold และ status transition ตาม ADR-0003
- First-committed-wins หมายถึงคำสั่งที่ใช้ status/version เดิมแข่งขันกัน ไม่ใช่บังคับว่าคำสั่งที่ถูกต้องทุกคู่ต้องสำเร็จได้เพียงอันเดียวแม้ทำต่อเนื่องกันตาม lifecycle
- Ticket mutations ใช้ expected version/status จาก snapshot; stale command ต้องถูกปฏิเสธ พร้อม current state ให้ UI refresh ไม่ silent overwrite
- Call next ต้องตรวจ Shop-wide hold แบบ atomic รวมข้าม Queue; concurrency control ต่อ Queue อย่างเดียวไม่พอ
- Owner สองแท็บ Call พร้อมกันได้ Called Ticket ไม่เกินหนึ่งใบทั้ง Shop; อีกคำขอได้รับ conflict ไม่ Call ใบถัดไปตามมาจนเป็นสองใบ
- Customer Cancel vs Call: ถ้า Cancel ชนะ Ticket นั้นถูกข้ามในการเลือก FIFO; ถ้า Call ชนะก่อน Cancel จาก Waiting snapshot ต้องไม่ overwrite แบบ stale แต่หลัง refresh Customer ยัง Cancel Called ได้ตามกฎ
- Start vs auto-Skip: version/status เดียวกันสำเร็จหนึ่ง transition; ถ้า InService ชนะ timer ห้าม Skip; ถ้า Skipped ชนะ Start ต้องปฏิเสธ
- Deadline บันทึกเมื่อ Call จากค่าของ Service ขณะนั้น; การแก้ timeout ไม่เปลี่ยน deadline ที่กำลังทำงาน
- Timer อ่าน deadline จากข้อมูลที่ durable; restart process หรือทำงานหลาย instance แล้วต้องไม่ลืม Called ที่หมดเวลา หรือ Skip ซ้ำจนเกิดผลซ้ำ
- Timer ไม่ต้องต่อ SignalR เพื่อทำงาน และเวลาถือ Ticket ไม่ขึ้นกับมือถือออนไลน์
- Countdown ส่ง deadline และ server time ไป client; ใช้ server-derived time offset ไม่ใช่เวลาของอุปกรณ์ล้วน เมื่อ reconnect ให้ anchor ใหม่; เลข 00:00 ฝั่ง client ไม่ได้เปลี่ยนสถานะใน DB เอง

### 7. Customer identity, limit และข้อมูลสาธารณะ

- Ticket link คือ bearer capability: ใครถือ link ดู Ticket และ Cancel เมื่อสถานะอนุญาตได้ โดยไม่ต้อง cookie เดิม ไม่มีการยืนยันเบอร์โทร
- ใช้ cryptographically unguessable secret และแยกจาก Ticket number/internal identity; เก็บ secret อย่างปลอดภัย ไม่ expose link ใน Public Shop/Display board/telemetry
- Device cookie ใช้นับ Customer-issued active Tickets ต่อ Queue เท่านั้น เป็น best-effort ไม่ใช่กลไกพิสูจน์ว่าลูกค้าอยู่หน้าร้าน; ล้าง cookie หรือเปลี่ยนเบราว์เซอร์แล้วข้ามได้ตาม ADR-0001
- ใบแรกขอได้โดยตรง เมื่อมี active Ticket ใน Queue เดียวกันต้องยืนยันก่อนขอเพิ่ม; สูงสุดสาม active ต่อ device ต่อ Queue แบบ atomic และข้าม Service ได้
- Walk-in ไม่ต้องมี device cookie และไม่ถูกจำกัดด้วย quota อุปกรณ์ของ Owner
- Terminal Ticket ไม่กิน active quota อีก; invalid/expired Ticket link ไม่เผยรายละเอียดส่วนตัว
- Customer note เป็น optional และเข้าถึงใน Owner console เท่านั้น; ไม่ส่งใน public board, public join listing หรือ notification payload
- Terminal Ticket link เปิดดูผลสุดท้ายได้จน 24 ชั่วโมงหลัง terminal timestamp แล้วเป็น expired view ไม่เปิด Ticket เดิมกลับมา
- Link expiry ไม่ลบข้อมูลสถิติ; retention ของ Customer note ที่นานกว่านี้ยังไม่มีนโยบายที่ตกลง ไม่อ้างว่า “ลบข้อมูลส่วนตัวทั้งหมดใน 24 ชั่วโมง”

### 8. Public API contracts

สรุปเป็น resource/operation contract โดยไม่ล็อกชื่อ endpoint หรือโครงสร้างไฟล์

| Interface | Request essentials | Success / errors visible to consumer |
|---|---|---|
| Owner account | Email/password or valid verification/recovery token | Session หลัง verified; field errors, invalid/expired verification and recovery state |
| Own Shop/Service commands | Authenticated Owner, target Shop/Service, edits | Owned resource snapshot; access denied/not found, invalid edit; history retained on archive |
| Public Shop snapshot | Public Shop identifier | Services, Queue acceptance status, Waiting count and available estimates; ไม่มี Customer note/link |
| Receive Ticket | Open Queue, optional note, device context, explicit extra-Ticket acknowledgement, join request identity | One issued Ticket + private link; closed/closing, limit reached, extra confirmation required |
| Walk-in create | Owner's Open Queue, optional note | Ticket number + Owner snapshot; no public link/push |
| Call next | Owner's selected Queue | Oldest Waiting Ticket now Called + deadline/version; empty Queue, Shop already holding Ticket, unauthorized |
| Start/Complete/Skip | Owner, target Ticket, expected version | Updated snapshot; wrong state or stale version conflict |
| Cancel | Valid Ticket link, expected version | Cancelled snapshot; invalid/expired link, InService/terminal, stale version conflict |
| Stop accepting/Drop | Owner's Queue, explicit confirmation for Drop | Queue and Business day state, affected Waiting outcome/count; held Ticket unchanged |
| Ticket snapshot | Valid Ticket link | Status, Ticket number, Service, Tickets ahead/estimate when Waiting, deadline when Called, terminal/expired information |
| Push subscribe/unsubscribe | Valid link, explicit browser permission/subscription, UI language | Enabled/disabled status; unsupported/denied must not prevent Ticket usage |
| Board snapshot | Public Shop identifier | At most one current Called Ticket, recent Calls, Waiting per Service; no private fields |
| Statistics | Owned Shop, Service selection, Business day range | Defined counts, averages/rates, clock-hour demand; no fake zeros for unavailable averages |

- Success and failure are localized by client, with stable machine-readable error meaning; stale/wrong-state/hold/closed/quota conflict may use HTTP 409, validation HTTP 400, unauthenticated Owner HTTP 401
- Unknown private resources and another Owner's resources must not disclose private details; consistent not-found response is the default
- ไม่เพิ่ม catch-all status patch API, priority controls หรือ Staff assignment fields

### 9. SignalR, snapshots และ reconnect

- Customer Ticket view, Owner console และ Display board subscribe เฉพาะ scope ที่มีสิทธิ์ พร้อม snapshot initial load
- Live messages ออกหลัง transaction commit เท่านั้น ไม่ประกาศ Ticket/status ที่ rollback
- ส่ง version/order ที่ทำให้ client ไม่ย้อนสถานะเมื่อ message มาช้าหรือซ้ำ ไม่พึ่ง client-side countdown เปลี่ยน Ticket status
- ผู้ใช้เห็น reconnecting/stale state ขณะ connection หาย; กลับจาก background/ล็อกจอแล้วต้องรับ snapshot ล่าสุดก่อนให้ UI เชื่อสถานะเก่า
- ระหว่าง resync Owner action ที่อาจใช้ stale stateต้องแสดง pending/unavailable; หลัง conflict ให้ refresh state ไม่ retry เรียก Ticket ใหม่เอง
- Multi-instance correctness มาจาก PostgreSQL ไม่ใช่ instance-local lock; live updates ข้าม instance ต้องมี fan-out ไม่สมมติว่าทุก browser อยู่ process เดียว
- Display board ต้องแสดง **at most one current Called Ticket**; เมื่อเป็น InService ไม่แสดงว่าเป็นอีก Called ใบ และ recent listไม่ใช่ current calls หลายใบ
- Owner เลือก Queue ถัดไปเอง จึงไม่มี FIFO รวมข้าม Services; Waiting cards บน board ต้องแยก/ระบุ Service และไม่อ้างว่า cross-Service order เป็นคำสัญญาว่าใครถูกเรียกถัดไป

### 10. Notifications

- In-page SignalR แสดง current state; Called ต้องมีข้อความชัด สี saffron และเสียง/สั่นเมื่อ browser และ user gesture อนุญาต ไม่อ้างว่าเสียงทำงานได้ทุกเครื่อง
- Web Push เป็น opt-in ต้องใช้ HTTPS หรือ localhost สำหรับ development, service worker และ VAPID configuration; ไม่มี SMS/LINE/เบอร์โทร
- ข้อความใกล้ถึงคิว: ต่อ Service กำหนด N ค่าเริ่มต้น 2; แจ้งเมื่อ Waiting Tickets ahead เปลี่ยนจากมากกว่า N ลงมาไม่เกิน N เพื่อรองรับการกระโดดหลายตำแหน่ง โดยไม่ส่งทุกครั้งที่เลขเปลี่ยน
- Called เป็นอีก notification event; Drop แจ้งเหตุร้านปิดคิวตามข้อตกลง Close now; terminal statuses อื่นยังปรากฏบน live Ticket view
- เมื่อ terminal ให้เลิก association push ของ Ticket นั้นทันที; หาก subscription endpoint ใช้กับ active Ticket อีกใบจากเครื่องเดียวกัน ห้ามลบจนทำให้ใบอื่นหยุดแจ้งเตือน
- Drop notification ใช้ subscription snapshot ก่อนถอน association ของ Ticket ที่จบ; ไม่เก็บ subscription ที่ไม่มี active Ticket ไว้เพื่อ notifications ภายหลัง
- Push permission denied, unsupported, delivery failure หรือ unsubscribe ไม่ rollback Ticket และไม่ขัดขวางการรับ/ดู Ticket
- iOS/iPadOS Web Push ต้องอยู่ใน supported Home Screen-installed web app context; หน้า Safari ทั่วไปต้องไม่แสดงว่าเปิด Web Push ได้แล้ว ต้องมี guidance ให้เพิ่มหน้าจอโฮมและกลับมา opt in เมื่อรองรับ
- ไม่มีการรับประกัน push delivery, exact-second timer execution หรือ real-time connection คงอยู่ขณะมือถือหลับ; UI บอกความสามารถจริง

### 11. Tickets ahead และ Estimated wait

- Tickets ahead นับเฉพาะ Waiting ที่ receive order อยู่ก่อน Ticket นั้นใน Queue เดียวกัน; ไม่รวม Called, InService, terminal หรือ Queue อื่น
- Estimated wait = Tickets ahead × average service duration ของ 20 Completed Tickets ล่าสุดใน Service เดียวกัน ซึ่งมี Start/Complete timestamps จริง
- มี usable samples น้อยกว่า 5 ไม่แสดงเวลาประมาณ แต่ยังแสดง Tickets ahead; ไม่สร้างเวลาเริ่มต้นให้ดูเหมือนคำนวณจากข้อมูลจริง
- เมื่อ 0 Tickets ahead หมายถึงถัดไปใน Queue ที่เลือก ไม่รับประกัน “ให้บริการทันที” เพราะ Owner อาจถือ Ticket จาก Queue อื่น
- ไม่หารด้วยจำนวน Staff เพราะไม่มี Staff และไม่รวมงานจาก Queue อื่นในการประมาณ ผู้ใช้ยอมรับข้อจำกัดนี้แล้ว ต้องระบุว่าเป็นประมาณการ
- ค่าเฉลี่ยเปลี่ยนจากงานจริงที่ Completed เท่านั้น ไม่เติมเวลาจาก auto-Complete ที่ไม่มีใน scope

### 12. สถิติและความหมายตัวเลข

- **จำนวน Ticket** คือ issued Tickets ทั้ง Customer และ Walk-in ตาม Business day ที่รับ Ticket ไม่ใช่จำนวน Completed อย่างเดียว
- **เวลารอเฉลี่ย** คือ Called timestamp ลบ received timestamp ของ Tickets ที่เคย Called ใน selection; Waiting ที่ยังไม่ Called และ Dropped/Cancelled ก่อน Call ไม่มี measurement นี้
- **เวลาให้บริการเฉลี่ย** คือ Completed timestamp ลบ Start timestamp เฉพาะ Completed ที่มีเวลาจริง; Skipped, Cancelled, Dropped และ InService ที่ยังทำไม่จบไม่สร้าง duration สมมติ
- รายงาน Completed, Skipped, Cancelled และ Dropped แยกกัน; Customer cancellation ไม่ปนกับ Drop ของ Owner
- **Skipped/Cancelled rates** ใช้จำนวนผลลัพธ์นั้นหาร terminal Tickets ทั้งหมดใน selection; Waiting/Called/InService ไม่อยู่ใน denominator; ถ้า denominator เป็นศูนย์ให้แสดงไม่มีข้อมูล ไม่ใช่ error หรือจำนวนที่ fabricated
- Peak-hours และ Ticket counts ต่อชั่วโมงใช้ receive timestamp bucket เป็น Bangkok clock hour; hourly metric เป็นความต้องการรับคิว ไม่ใช่จำนวน Call/Complete ในชั่วโมงนั้น
- กรอง Shop, Service และ Business day range ได้ ไม่มีสถิติต่อ Staff, billing หรือรายได้
- ทุก aggregationใช้ Ticket internal identity และ Business day membership ไม่ใช้ Ticket number เป็น unique identifier หรือจับกลุ่มผิดหลังเลข reset

### 13. UX/UI และ flows ที่ต้องสมบูรณ์

- Mobile-first reference 390×844 และทดสอบ small phone 375 px; phone landscape/tablet ต้อง usable แม้ไม่มี dedicated desktop design
- Warm Minimal: cream/paper backgrounds, dark warm ink, terracotta primary, saffron Called, sage Open/InService/Complete, brick destructive; หลีกเลี่ยง purple gradients, pill soup, sidebar desktop และ generic KPI grid
- Typography: Noto Sans Thai สำหรับ UI และ IBM Plex Mono สำหรับ Ticket number/timer/count; แยกหน่วยภาษาไทยออกจาก mono; รองรับเลขที่ยาวขึ้นโดยไม่ตัดข้อมูล
- Contrast text >=4.5:1; control/focus ที่สื่อความหมายต้องแยกได้ชัด ไม่ใช้เส้น decorative อ่อนเป็นขอบเขต interactive เพียงอย่างเดียว
- Tap area >=48×48 CSS pixels รวม icon/text buttons แม้ glyph เล็ก; primary action 56–62 px อยู่โซนนิ้วโป้ง มี safe-area inset และ list padding ไม่ซ่อน rows/focus ใต้ action bar/tab bar
- ภาษาไทยและอังกฤษสลับได้ รวม error messages และ push copy; language ไม่เปลี่ยน canonical domain/API status
- ทุก submit มี pending feedback ป้องกัน repeated taps ขณะ processing; error แสดงใกล้จุด action/field และรักษาข้อมูลที่กรอก ไม่ปล่อยปุ่มหน้าตาใช้งานได้แต่กดแล้วไม่มีผล
- One primary action per state; คิว / สถิติ / ร้าน เป็น navigation หลัก QR/Services อยู่ใต้ร้าน; กลับจาก sheet แล้วกลับ context เดิม
- Customer flow: Shop → choose Service → take/extra-confirm Ticket → Waiting → Called → InService/terminal → final/expired; Cancel มี confirmation และผลชัดเจน ไม่มีปุ่ม Cancel ใน InService
- Owner flow: Register → email verification → sign in, sign out/recovery; Shop create/switch/edit; Service create/edit/archive; Open/Closing/Drop; Idle/Called/InService console; Walk-in sheet/result; QR; statistics; demo
- หน้าที่ mockup ยังไม่มี เช่น registration, verification/recovery, Shop creation/edit, empty states, InService Customer และ final variants ต้องทำจริงตาม flow เดียวกัน ไม่แทนด้วย placeholder หรือ dead navigation
- Ticket link/Shop/board เปิดจาก deep link และ refresh ได้; copy QR/links มี success/error feedback; invalid resource/expired link มีข้อความที่ตรงเหตุ
- Dynamic text/zoom ต้องไม่ตัด action และตัวเลข; status words ไม่ใช้สีอย่างเดียว; keyboard focus มองเห็น, sheet จัดการ focus/back, icon/toggle มี accessible name
- Live regions ประกาศ semantic change เช่น Called ไม่ announce timer ทุกวินาที; progress/heatmap มีตัวเลข label/legend หรือ text alternative ไม่ใช้สีเป็นข้อมูลเดียว
- รองรับ reduced motion โดยเอา slide/fill effects ออก; motion token ตาม design ที่ตกลง ใช้ micro-interaction ไม่ใช่ landing-page animation
- Phone UI เป็น light theme เท่านั้น; Display board ใช้ warm espresso dark สำหรับจอแนวนอน มี current, recent และ Waiting-per-Service กับ QR

### 14. Demo และ implementation defaults

ข้อต่อไปนี้เลือกเพื่อให้ implement ได้ครบโดยไม่เปิด interview ใหม่ ไม่ใช่ข้อตกลงธุรกิจที่อ้างว่าผู้ใช้ตอบไว้แล้ว

- **Duplicate join submission:** ใช้ identity ของ join request เดิมให้ submission/replay ของ intent เดิมคืน Ticket เดิม ไม่ออกใบใหม่และไม่คิด active quota เพิ่ม; intent ใหม่สำหรับใบเพิ่มยังต้อง confirm และอยู่ใต้เพดานสาม
- **Near-turn notification:** ส่งอย่างมากหนึ่งครั้งต่อ Ticket เมื่อ crossing threshold; Ticket ที่ออกตอนอยู่ใน threshold อยู่แล้วแสดงสถานะใกล้ถึงคิวทันที แต่ไม่ส่ง extra near-turn push ขณะรับ Ticket; Called notification แยก event
- **Statistics range:** เนื่องจาก Business day อยู่ระดับ Queue ตัวเลือก current/latest, latest 7 และ latest 30 หมายถึง Business days ของแต่ละ Queue ที่เลือก ก่อนรวมผล; ต้องแสดงว่าเป็นรอบเปิดคิว ไม่อ้างว่าเป็น 7/30 วันปฏิทิน ถ้าเลือก current/latest และ Queue ปิด ให้ใช้รอบล่าสุดพร้อม label ว่าปิดแล้ว
- **Demo isolation/reset:** Try demo สร้าง session-bound Owner/Shop fixture แยกจาก real accounts และ demo sessions อื่น; fixture seed ใหม่เมื่อ session ใหม่ และหมดอายุ/cleanup อัตโนมัติหลัง 24 ชั่วโมงที่แสดงให้ผู้ใช้ทราบ ไม่ force-reset ของ session อื่นกลางงาน
- Demo seed มีประวัติ Completed จริงแบบ consistent timestamps เพียงพอสำหรับ estimates และ statistics แต่ระบุว่าเป็นข้อมูล demo; Customer simulation ออก Tickets ผ่าน application operations เดียวกับ Customer จริง ไม่แก้เฉพาะตัวเลขหน้าจอ
- Fixture permissions ไม่ใช่ public unrestricted Owner token; demonstration link และ endpoints ต้องเข้าถึงได้เฉพาะ demo data ที่ตั้งใจ public ตาม role
- **Cross-instance live fan-out:** ใช้ PostgreSQL post-commit notification เป็น fan-out ของการเปลี่ยน resource ให้แต่ละ API instance ส่ง SignalR updates/snapshots; DB ยังเป็น source of truth และ reconnect ต้อง resync เพราะ fan-out ไม่ใช่ durable event log; ไม่เพิ่ม Redis หรือ message broker ใน scope นี้
- **Prefix readability:** unique Prefix ต่อ Shop เป็น invariant สำหรับ board; คำแนะนำห้าม O/I ใน UI design เป็น recommendation ที่ยังไม่ใช่ข้อยืนยันธุรกิจ จึงไม่ทำเป็นข้อห้ามใหม่ใน spec นี้
- **Archive กับ active work:** archive หยุดรับ Ticket ใหม่เข้าสู่ Queue และ drain ตาม Closing; ถ้าต้องการทิ้ง Waiting ต้องใช้ Drop ที่ยืนยันแล้ว ไม่ลบ Customer อัตโนมัติผ่าน archive

## Testing Decisions

### Test seam ที่เลือก

- ปัจจุบันไม่มี application code หรือ prior test suite จึงไม่มี existing seam ให้ reuse; ไม่อ้างว่า framework/fixtures/test pattern มีอยู่แล้ว
- Primary seam เดียวคือ **public application boundary**: HTTP operations และ SignalR subscriptions บน running ASP.NET Core application กับ **PostgreSQL จริง**; ทดสอบจาก responses, snapshots และ notifications ที่ consumer เห็น ไม่เรียก internal repositories/status setters เพื่อทำให้ test ง่าย
- ใช้ authenticated Owner sessions, anonymous Customer browsers/Ticket links และ public Display board เป็น actors; multi-instance/race cases ให้ request วิ่งเข้า application instances ที่ใช้ DB เดียวกัน
- เลือก seam นี้ตาม intent ของผู้ใช้ให้เห็นระบบ end-to-end; ไม่อ้างว่ามีการอนุมัติ seam ผ่านคำถามใหม่ในรอบ to-spec
- Browser smoke เป็นการพิสูจน์ UX ของ seam เดียวกัน ไม่สร้างชุด unit tests ซ้ำทุกชั้น; คง permanent tests สำหรับ domain boundaries, permissions, races และ observable regressions ที่มีเหตุให้พังจริง
- Permanent tests ไม่ assert SVG/source text, filenames, class names, exact Thai wording, font hex copies, mock forwarding หรือ incidental defaults; assertions ระบุ behavior/result ที่มีผลต่อลูกค้า
- Test data แยกตาม run ทำงานได้ทั้ง suite; concurrent scenarios ใช้ synchronized starts และ bounded observation แทน arbitrary sleep/สุ่มโชค
- Time-sensitive scenarios มี controllable server time สำหรับ application boundary test และอย่างน้อยหนึ่ง runtime smoke กับ worker/time จริง; ไม่ใช้เวลาเครื่อง client ตัดสิน expected server behavior
- Email ใช้ local SMTP capture sink เพื่อเปิด verification/recovery link ที่ application ส่งจริง; push payload/completion ใช้ test sink ใน boundary tests ได้ แต่ต้องมี supported-browser Web Push smoke ของจริง ไม่เรียก mocked echo ว่า delivery proof

### Acceptance scenarios

| ID | Scenario | Observable acceptance |
|---|---|---|
| A01 | Owner registration, verify and recovery | ก่อน verify จัดการ Shop ไม่ได้; valid email link ทำให้ sign in ใช้งานได้; invalid/expired token มีผลชัด; recovery เปลี่ยน credential ของบัญชีที่ถูกต้อง |
| A02 | Two Owners and multiple Shops | Owner A อ่าน/mutate private Shop/Service/Ticket/statistics ของ B ไม่ได้ และ A สลับ own Shops ได้; public board ไม่เผย private notes |
| A03 | Open, issue, concurrent numbering | Closed เปิดรอบใหม่ได้; simultaneous joins ออก distinct Ticket identities/numbers ใน Business day เดียว ทุกใบอยู่ Waiting และ receive order คงที่ |
| A04 | Device limit and duplicate join | ใบแรกสำเร็จ; intent เดิมไม่ออกซ้ำ; ใบเพิ่มต้อง confirm; active ถึงสามแล้วใบที่สี่และ racing requests ถูกกันแบบ atomic; terminal ลด quota และอีก Queue ไม่ติด quota ของ Queue แรก |
| A05 | FIFO including Walk-in | ใบที่เข้าก่อนถูก Call ก่อนใน Queue เดียว ไม่ว่ามาจาก Customer หรือ Walk-in; Walk-in ไม่มี Ticket link/push และอ่านเลขจาก board ได้ |
| A06 | Shop-wide hold race | Call สองแท็บทั้ง Queue เดียวและคนละ Queue ใน Shop เดียวเกิด at most one Called; ฝ่ายแพ้เห็น conflict/current state; คนละ Shop ไม่ถูกล็อกรวมผิด |
| A07 | Happy lifecycle and action permissions | Waiting → Called → InService → Completed ให้ timestamps/result ถูกต้อง; wrong actor/source stateถูกปฏิเสธ และ terminal ย้อนกลับไม่ได้ |
| A08 | Cancel race and state boundary | Cancel Waiting/Called ได้, InService ไม่ได้; Cancel/Call แข่งกันไม่มี stale overwrite หรือ hold ค้าง; refresh แล้ว action ใหม่ตาม statusจริงได้ |
| A09 | auto-Skip vs Start, restart and two workers | มี single winning transition; timer ไม่ Skip InService; due Called หลัง restart ถูก Skip; workers ซ้ำไม่สร้างผลซ้ำ และ Shop รับ Call ใหม่ได้หลัง Skip |
| A10 | Stop accepting and drain | Open → Closing กัน joins/Walk-in แต่ Call Waiting ต่อได้; จบใบสุดท้ายแล้ว Closed/Business day end; Queue ว่างปิดทันที |
| A11 | Drop with held Ticket and join race | Waiting เป็น Dropped, Customer เห็นเหตุ/notification เมื่อ enabled; Called/InService คงเดิม; close-vs-join ผลสอดคล้องกับ commit orderและไม่มี issued Ticket หลังปิด |
| A12 | Business day across midnight and reopening | ไม่ reset ตอน Bangkok midnight; ปิดและเปิดใหม่วันเดียวกัน reset เป็น A001 ใหม่โดย identity ต่างกัน; statistics ไม่ merge สองรอบเพราะเลขเดียวกัน |
| A13 | Ticket links and privacy | link เดิมข้ามเครื่อง/ล้าง cookie แล้วยังดูและ Cancel ได้ตามสถานะ; invalid/expired ไม่มี private leakage; terminal linkเห็นผลภายใน 24h และ expired หลัง boundary; notes/linkไม่หลุดไป board/push |
| A14 | Live updates and reconnect | Customer, Owner และ board เห็น committed changeเดียวกันรวมข้าม instances; background/unlock re-sync ล่าสุด; delayed/duplicate messageไม่ย้อน state; countdownไม่เพี้ยนเพราะ device clockต่าง |
| A15 | Optional notifications and shared endpoint | Near-turn crossing และ Called ส่งตามกฎ ไม่ spam; denied/unsupportedยังรับ Ticket ได้; Drop แล้วถอน association แต่ active Ticket อีกใบบน endpointเดียวกันยังแจ้งได้ |
| A16 | Estimate boundaries | <5 Completed samples ซ่อนเวลา; >=5 ใช้ last20 usable jobs; aheadไม่นับ Called/InService/terminal/Queueอื่น; 0 aheadไม่สัญญาว่า Owner ว่าง |
| A17 | Statistics definitions | Counts/durations/rates ตรง records รวม Walk-in; Cancel-before-Callไม่มี wait duration; Dropped แยก, pendingไม่อยู่ denominator; Bangkok hour และ per-Queue Business day selectionไม่ double count |
| A18 | Archive and Prefix edits | archiveไม่ลบ history ไม่ออก Ticket ใหม่ แต่ Ticketเดิมจบได้; Prefixเปลี่ยนไม่เปลี่ยนเลขใบเดิม; duplicate active Prefixใน Shopถูกปฏิเสธ |
| A19 | Demo end to end | Try demo ไม่ต้องสมัคร; simulationเปลี่ยน stateผ่าน operationsจริงทั้ง3 views; seed ทำให้ estimates/statsทำงาน; reset/expiryไม่แตะ dataของคนอื่น |
| A20 | Phone UX and real notification smoke | ที่ 375/390 px, landscape, zoom/large text เลข/ปุ่มไม่ถูกตัด; safe area/keyboardไม่บัง focus; Thai/English, back/deep links, permission states, reduced motion และ real supported-browser push ตรวจจากการใช้งานจริง |

### Runtime / browser proof ก่อนรับงาน implementation

- เปิด Owner console บน phone viewport และ Customer Ticket view อีก browser context พร้อม Display board จาก application จริง
- ใช้ Try demo → simulate Customer → Call → Start → Complete และ Walk-in → Skip/auto-Skip; สังเกตสามหน้าปรับจาก backend จริง ไม่เปลี่ยนเฉพาะ mock UI
- ยิง concurrent joins และ Calls อย่างน้อยสอง requests; เก็บผล HTTP/conflict และ snapshots ที่พิสูจน์ number uniqueness/one-held rule
- เปิด verification email จาก SMTP capture, opt into supported Web Push, แสดง notification ที่ส่งจาก backendจริง และทดลอง denied permission
- background/disconnect แล้ว reconnect Ticket view และ Owner console ดู state/deadline ที่เปลี่ยนระหว่างหายไป
- ระบุ platform ที่ทดสอบจริงและข้อจำกัด iOS หากไม่มีอุปกรณ์รองรับ; emulator/test sink ไม่ทดแทน claim ว่าทดสอบ notification delivery บน iPhone แล้ว

## Out of Scope

- Staff, Admin role แยก, Staff assignment/presence/schedules และสถิติต่อ Staff
- Branch hierarchy, shared ownership/delegated managers และ collaboration ระหว่างหลาย operator ใน Shop เดียว
- Customer registration/login, SMS, LINE integration, phone number collection
- Billing, subscription, payment, revenue analytics และ production compliance certification
- Appointments, reservations, priority/VIP, choose-a-specific-Ticket, recall Skipped หรือเลื่อน Ticket ไปท้าย Queue
- Queue capacity ceiling และ scheduled weekly opening/holiday calendar
- Rotating QR, geolocation, IP identity หรือการรับประกันว่ารับ Ticket ได้เฉพาะคนที่อยู่หน้าร้าน
- Calendar-midnight number reset, per-Shop timezone และการ normalize Business days ให้เป็นวันปฏิทินทั้ง Shop
- Exact accurate ETA ข้าม Queue, Staff-count estimate และ guaranteed Web Push delivery
- Auto-Complete หรือ owner-override operator role สำหรับ InService
- Dark phone theme, native mobile app และ dedicated desktop Owner dashboard; responsive usable web UI ยังอยู่ใน scope
- Offline Queue mutations, offline service operation และ caching stateเพื่อให้ดูเหมือนยัง live; connectivity feedback/resync อยู่ใน scope
- Redis/message-broker platform, microservices/event sourcing และทั่วไป infrastructure/telemetry expansion
- เปลี่ยนการสังเคราะห์ spec นี้เป็น implementation หรือแตก tickets โดยไม่มีคำขอเพิ่มเติม

## Further Notes

### สถานะโปรเจกต์และแหล่งอ้างอิง

- มี domain glossary, ADR 3 ฉบับ, Warm Minimal design guide และ SVG 18 frames; **ยังไม่มี application code หรือ tests** ณ วันที่เขียน spec
- อ้างอิง [Domain glossary](../../CONTEXT.md), [ADR-0001 — Ticket link](../../docs/adr/0001-customer-identity-is-the-ticket-link.md), [ADR-0002 — Business day](../../docs/adr/0002-business-day-replaces-calendar-day.md), [ADR-0003 — PostgreSQL transitions](../../docs/adr/0003-ticket-transitions-via-postgres-first-committed-wins.md) และ [Warm Minimal UI guide](../../docs/design/DESIGN.md)
- [UI SVG frames](../../docs/design/) เป็น visual reference ไม่ใช่ implementation ที่ทำงานแล้ว; ไม่อ้างว่าทดสอบ import/edit ใน Figma หรือ interaction ของภาพนิ่งแล้ว
- Published ใน [local issue tracker](../../docs/agents/issue-tracker.md) พร้อม canonical triage label `ready-for-agent` เพราะโปรเจกต์ยังไม่มี Git remote; ไม่ได้สร้าง GitHub Issue และไม่ได้เพิ่ม AGENTS/CLAUDE instruction files

### สิ่งที่สเปกนี้ทำให้ชัดจากข้อความเดิม

- การตัด Staff ไม่ได้ตัด concurrency: Owner หลาย device, Cancel/Call, Start/auto-Skip, Join/close และ allocation ยังต้องพิสูจน์
- ไม่เปลี่ยนกฎหนึ่ง held Ticket ต่อ Shop เป็นต่อ Queue จาก mockup และไม่แสดง current Called หลายใบใน board
- Stop accepting รักษาคิวค้าง; Drop เปลี่ยนเฉพาะ Waiting และไม่ปล่อยให้ชื่อ “Close now” แอบ Complete/Skip งานปัจจุบัน
- Open ข้ามคืนไม่ reset; zero-active Closing จบ Business day ทันที ไม่รอ background event ที่ไม่มี
- ข้อความตัวอย่าง “0 คิวถึงคิวทันที” และคำว่า “วันนี้” ใน mockups ต้องปรับให้ตรงความหมาย Queue position/Business day ไม่เปลี่ยน business rule เพื่อให้ตรงภาพ
- คำแนะนำ Prefix O/I ใน design guide ยังเป็นข้อเสนอ ไม่ถูกยกระดับเป็น validated requirement โดยไม่มีคำตอบผู้ใช้

### Prerequisites ของ implementation

- PostgreSQL, configured SMTP (local capture sink ใน development), HTTPS deploymentสำหรับ Web Push, service worker และ VAPID keys; provider/deployment secrets ยังไม่ถูกกำหนด และไม่ต้องมี secretเพื่อทำ spec ฉบับนี้
- Local tracker configuration ใช้ default vocabularyและ single-context docs; ไม่สร้าง remote repository หรือตั้ง credentials แทนผู้ใช้
- Acceptance scenarios เป็นสิ่งที่ต้องรันเมื่อมี implementation จริง สเปกนี้ไม่อ้างว่า application tests หรือ browser flows ผ่านแล้ว
