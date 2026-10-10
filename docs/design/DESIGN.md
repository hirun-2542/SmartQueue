# SmartQueue UI — Warm Minimal

Phone-first (390×844 reference), with a computer workspace in the implemented web app. The Display board also supports a landscape screen. Existing SVG frames in this folder remain the phone/board references; drag into Figma to edit.

## Principles

- **The number is the interface.** Queue state is read from one large Ticket number or one count ("อีก 4 คิว"), never from a grid of KPI cards.
- **One primary action per screen**, 56–62 px. On phones it stays at the bottom; on computers it stays with the current Ticket. Its label changes with state (เรียกคิวถัดไป → เริ่มให้บริการ → เสร็จสิ้น).
- **Paper, not panels.** Rules (hairlines) and whitespace separate content. Cards appear only for a Ticket stub, the Now panel and sheets.
- **Status = dot + words**, never a coloured pill alone.

## Tokens

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `bg` | `#FAF5EC` | page | — |
| `paper` | `#FFFDF9` | stubs, sheets, fields | — |
| `line` / `line-strong` | `#E4D8C3` / `#D2C3A8` | hairlines / control borders | decor |
| `ink` | `#2A2118` | text | 14.6 on bg |
| `ink-2` | `#6B5B4B` | secondary text | 6.0 on bg |
| `terra` | `#B5451B` | brand, primary action, your Ticket | 5.0 on bg, white on it 5.5 |
| `terra-soft` | `#F6E3D6` | avatar / + button fill (never text-on-soft in `terra`; use `#8F3512`) | — |
| `saffron` | `#F2B33D` | **Called** (the "your turn" colour) | ink on it 8.5 |
| `saffron-soft` | `#FCEFD0` | Now panel (Called), hints | ink-2 on it 5.7 |
| `sage` / `sage-soft` | `#3F6B3A` / `#E6EEDD` | Open, InService, Complete | 5.7 / 5.2 |
| `brick` / `brick-soft` | `#A33A2A` / `#F7DDD6` | Cancel, Drop, Skip-warnings | 6.0 / 5.1 |
| `espresso` / `espresso-2` | `#1F1812` / `#2C231A` | Display board only | — |

Saffron is reserved for "called". Do not use it for decoration.

## Type

- UI: **Noto Sans Thai** (400/500/600). Body 15–16, labels 13–14, minimum 12.
- Ticket numbers, timers, counts: **IBM Plex Mono** 700. Chosen because its zero is dotted, so `A016` is never read as `AO16`, and it reads like a printed ticket. Prefix letters `O` and `I` should be disallowed in the Prefix field for the same reason.
- Scale: numeral hero 140 / 108 / 64 / 54 / 25, titles 28–30 / 23, body 15–17.
- Never put Thai text in the mono face; split number and unit (`14` mono + `นาที` UI).

## Shape and spacing

- 4/8 px rhythm; screen gutter 24 (16 for full-bleed panels).
- Radius: buttons 16–18, fields 14, panels 22–24, sheets 28.
- **Stub**: rounded rectangle with semicircular side notches (and optional dashed perforation). Used for a Ticket, the Service prefix tile, and the brand mark.
- Icons: Lucide-style outline, 24 px, stroke 1.75 (2 when active). No emoji, no icon-only meaning without a label or accessible name.

## Components

| Component | Rule |
|---|---|
| Primary button | `terra`, white text 17–18 semibold, 56–62 high. Complete uses `sage`. |
| Skip | `ink` outline beside the primary, never the same weight. |
| Destructive | `brick` outline; fill only on the final confirm sheet if needed. |
| Text button | 15–16 semibold, **48 px minimum hit area** even though the glyph is smaller (`เพิ่มบริการ`, `ลืมรหัสผ่าน?`, `ยกเลิก`). |
| Queue tabs (Owner) | text + mono count, 3 px `terra` underline on the active one; horizontally scrollable. |
| Waiting list | ruled rows, 60 px, Ticket number left, note and wait time right of it. No cards. |
| Sheets | bottom sheets with scrim `ink` @ 55%; primary action stays in thumb reach. |
| Tab bar | 3 items: คิว · สถิติ · ร้าน (QR and Services live under ร้าน). |

## Screens

| File | Purpose |
|---|---|
| `C1` | pick a Service; rows, not cards |
| `C2` / `C2b` | take Ticket; confirm extra Ticket (2 of 3) |
| `C3` | waiting: hero count, track from "now serving" to you, stub, notify, link |
| `C4` | **called**: whole screen turns saffron, number + countdown |
| `C5` | final state (Skipped shown; Completed, Cancelled, Dropped, expired reuse it) |
| `O1` | Owner login, demo, sign-up |
| `O2-*` | console: called, in service, idle, Walk-in sheet and result, Drop confirm |
| `O3-*` | ร้าน: QR, Display board link, Services; edit-service sheet |
| `O4`, `O4b` | stats as a sentence and list; peak hours |
| `B1` | Display board on espresso, 3 sections: calling, recent, next |

## Motion

Static frames; for implementation:
- Number change on C3/C4/Board: 200 ms fade + 8 px vertical slide. Called transition: 250 ms colour fill from saffron edge. Sheets: 280 ms ease-out in, 200 ms out. Press feedback: opacity/colour only, 100 ms, no layout shift.
- With `prefers-reduced-motion`, drop slides and fills; keep instant state changes.
- Called must also vibrate (`navigator.vibrate`) and play a short sound where allowed; colour alone is not the signal.

## Accessibility

- Ticket number and tickets-ahead are live regions (`aria-live="polite"`; Called is `assertive`).
- Every state has a word, not only colour (dot + "เปิดรับคิว", "กำลังปิด", "ปิดอยู่").
- Toggles and icon buttons need accessible names (`แจ้งเตือนเมื่อใกล้ถึงคิว`, `เพิ่มคิว Walk-in`, `เมนูคิว`).
- Respect OS text size: rows grow, nothing is fixed-height except buttons.
- Light theme only for phone screens. A dark phone theme is not designed.

## Computer adaptation

- Operate mode: the Owner sees current work and Waiting Tickets together; no marketing chrome or KPI-card grid.
- From 1024px, the same three navigation destinations become a persistent left rail. The Shop selector, language and account controls remain in the top row.
- The workspace is bounded at 1320px rather than stretched across large monitors. A 176px navigation rail, 32px separation, 64px outer gutters and 64px content insets leave room for a classic scrollbar at the 1024px boundary.
- Parallel regions require 41.5rem (664px) of actual content width: approximately 344px current work + 288px backlog + 32px separation. The Queue gives current work slightly more room; if text or the window needs more, stack them.
- Queue: current/next Ticket and commands left, ruled Waiting list right. Secondary Stop/Drop controls follow the primary command.
- Shop: QR/access left, Services right. Statistics: sentence/ruled outcomes left, real demand right. Demo: receipt task left, walkthrough/no-show controls right.
- Mobile keeps the existing single-column reading order, bottom navigation, fixed primary action and bottom sheets. Desktop uses centered sheets and normal-flow commands.
- Query containment never wraps phone viewport-fixed controls. On desktop the content may be a query container because commands are static and navigation is outside it.

