# SmartQueue

A queue management system for shops run by a single owner-operator. Customers join a line at a shop without registering, track their place live, and the Owner calls them when it is their turn.

## Language

### Places and offerings

**Shop**:
A business (barber, clinic, repair shop, car wash) that runs queues. The root of all shop-owned data; each Shop has its own QR code.
_Avoid_: Store, tenant, business, branch

**Service**:
Something a Shop offers that customers wait for (e.g. "Haircut", "Wash"). Each Service has exactly one Queue.
_Avoid_: Product, treatment, job

**Queue**:
The ordered line of waiting Tickets for one Service of one Shop. Its status is **Open** (accepts new Tickets), **Closing** (accepts none, but the Owner keeps calling until it is empty) or **Closed**. Open does not depend on whether the Owner is currently at work.
_Avoid_: Line, list, "คิว" on its own

**Business day**:
The period from an Owner opening a Queue until its last Ticket is finished after closing. Ticket numbers restart with each Business day, and daily statistics are grouped by it.
_Avoid_: Day, session, shift

**Display board**:
A read-only public screen for a Shop showing the Ticket currently being called, the most recently called ones, and the next Waiting Tickets, by Ticket number only. Needs no login.
_Avoid_: TV, monitor, scoreboard

### People

**Customer**:
A person who takes a Ticket. Never registers or logs in; holds a Ticket only through its Ticket link, except for a Walk-in Ticket.
_Avoid_: User, client, guest

**Owner**:
The person who owns one or more Shops and runs them alone: sets up their Services, calls and serves Tickets, and reads statistics. Anyone can register as an Owner. There is no other operator role. Holds at most one Called or InService Ticket at a time across the whole Shop.
_Avoid_: Admin, staff, employee, manager, merchant

### Tickets

**Ticket**:
One customer's place in one Queue, with its own lifecycle from waiting to finished.
_Avoid_: Entry, slot, reservation, booking

**Walk-in Ticket**:
A Ticket the Owner creates on behalf of a Customer who cannot scan the QR code. It has no Ticket link; the Customer follows it by Ticket number on the Display board.
_Avoid_: Manual ticket, offline ticket

**Ticket number**:
The human-readable label of a Ticket (e.g. `A012`), made of the Service's Prefix and a counter that restarts each Business day. A display label only, never a Ticket's identity.
_Avoid_: Queue number, token, ID

**Prefix**:
The letter(s) an Owner assigns to a Service to start its Ticket numbers.
_Avoid_: Code, series

**Ticket link**:
The unguessable URL that identifies a Ticket and lets its holder follow it from any device.
_Avoid_: Token, session, tracking URL

**Customer note**:
An optional nickname or remark a Customer adds when taking a Ticket, shown only to the Owner.
_Avoid_: Name, comment, details

**Ticket status**:
Where a Ticket is in its life: **Waiting** → **Called** → **InService** → **Completed**, or ended early as **Skipped**, **Cancelled** or **Dropped**. Completed, Skipped, Cancelled and Dropped are final.
_Avoid_: State, stage

**Call**:
The Owner taking the next Waiting Ticket of a Queue, oldest first; the server chooses which one. Moves the Ticket to Called.
_Avoid_: Pick, assign, pull

**Call timeout**:
The time an Owner sets per Service within which a Called Ticket must be taken into service; when it runs out, the Ticket is Skipped automatically.
_Avoid_: Grace period, expiry

**Skip**:
Ending a Called Ticket because its Customer did not show up, done by the Owner or automatically when the Call timeout runs out. Final; the Customer must take a new Ticket.
_Avoid_: No-show (as an action), postpone, defer

**Cancel**:
A Customer ending their own Ticket while it is Waiting or Called.
_Avoid_: Leave, abandon, withdraw

**Drop**:
The Owner closing a Queue immediately, ending every Waiting Ticket in it. Counted separately from Cancel and Skip.
_Avoid_: Force-cancel, purge

**Tickets ahead**:
The number of Waiting Tickets in the same Queue that are in front of a given Ticket. Called and InService Tickets are not counted.
_Avoid_: Position, rank

**Estimated wait**:
Tickets ahead plus a time estimate derived from the real average service time of that Service.
_Avoid_: ETA, wait time
