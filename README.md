# SmartQueue

Mobile-first queue management for a single Owner per Shop. The approved specification and implementation tickets are in the local issue tracker. Domain vocabulary remains in `CONTEXT.md`.

## Run locally

Requirements: .NET 10 SDK, Node 24, Docker Compose.

```sh
docker compose up -d --wait
npm --prefix web ci
dotnet restore server/SmartQueue.Api.csproj --locked-mode
dotnet tool restore
```

Start the API:

```sh
ASPNETCORE_ENVIRONMENT=Development dotnet run --project server/SmartQueue.Api.csproj --no-launch-profile --urls http://127.0.0.1:5290
```

Start the mobile web app in another terminal:

```sh
npm run dev
```

- App: http://127.0.0.1:5179
- Local email capture: http://127.0.0.1:8026
- PostgreSQL: loopback port 5449; SMTP: loopback port 1026.
- The development database password is local-only. Set `SMARTQUEUE_DB_PASSWORD` and matching `ConnectionStrings__Database` when overriding it.
- Database migrations apply on API startup. Do not delete the database volume to update the application.

## Verify

With the API, PostgreSQL and Mailpit running:

```sh
npm test
npm run build
dotnet test tests/SmartQueue.IntegrationTests/SmartQueue.IntegrationTests.csproj
```

The API tests use real HTTP sessions, PostgreSQL and delivered messages in the local capture mailbox, not an in-memory database or mocked verification link. Test users have unique addresses. Set `SMARTQUEUE_URL` and `MAILPIT_URL` to change the test endpoints.

## Accounts

Owner registration requires email verification before sign-in. Verification and password recovery send real SMTP messages; open their links from the capture mailbox in development. The app supports Thai and English, cookie sessions and CSRF-protected mutations.

Production requires an HTTPS origin, `PublicOrigin`, a PostgreSQL connection string, and SMTP settings (`Smtp__Host`, `Smtp__Port`, `Smtp__From`, `Smtp__UseTls`, and credentials if required). Configure `DataProtection__KeyPath` as persistent private storage shared by application instances. Development keys default to the user's local application data directory. Protect key storage and add an appropriate at-rest encryptor for production.

Production SPA assets are built into the API's web root by `npm --prefix web run build`; development uses Vite's same-origin API proxy.

## Shops and Services

Verified Owners create and switch between their Shops. Each Service has its own Queue, a distinct active Prefix within the Shop, a positive Call timeout and a non-negative near-turn threshold. Other Owners cannot read or mutate these private resources. Service edits do not change the Shop that owns the Service.

## Taking a Ticket

The Owner opens a Service Queue to start its Business day. The public Shop link lets Customers join without an account and obtain a private Ticket link. That link remains the identity across devices; the device cookie only limits active Tickets to three per Queue, with confirmation required for extras.

Ticket numbers are allocated under a PostgreSQL Shop row lock, stored as a Prefix snapshot plus the Business day counter, and expand beyond three digits without wrapping. Customer notes are not returned in public Shop or Ticket views.

Unknown API resources return a JSON 404 rather than the SPA page. Private Ticket link replay cannot bypass terminal-link expiry.

## Serving Tickets

The mobile Queue console calls the oldest Waiting Ticket in the selected Queue. Each Shop holds at most one Called or InService Ticket. Call checks the observed Shop version; Start, Complete and Skip check the Ticket version. Stale actions return a conflict and fresh state, not an automatic retry against another Ticket.

Call deadlines and elapsed service time are anchored to server timestamps. The Customer view distinguishes Waiting, Called, InService and terminal outcomes; notes remain Owner-only.

## Live workflows and timing

Customers can explicitly cancel Waiting or Called Tickets. InService cannot be cancelled. Terminal Ticket links remain readable for 24 hours after the recorded end time; a repeat receive request cannot restore an expired link.

Walk-in Tickets use the same Business-day counter and receive FIFO as Customer Tickets, but have no bearer link or device quota. A durable server worker checks Called deadlines every five seconds, including after a restart, and never auto-completes or auto-skips InService work.

SignalR subscriptions are scoped to an owned Shop, public Shop or private Ticket. PostgreSQL commit notifications fan out across API instances. Reconnect and foreground resume resync the snapshot and clock; unsafe Owner actions are unavailable while the connection is not live.

Wait estimates use the latest twenty usable Completed durations of the same Service, with at least five samples. They count only Waiting Tickets ahead; zero ahead is not a promise that the Owner is free.

Try demo signs into an isolated PostgreSQL-backed Shop with seeded Business days and Tickets. Sessions expire after exactly 24 hours, including after Identity refresh; cleanup never resets a real Owner's data. Start another demo to obtain a separate session.

The .NET boundary suite creates isolated PostgreSQL databases and uses the public HTTP seam with a controlled server clock for deadlines, restart races, terminal-link expiry, estimate windows and demo cleanup.

## Closing and display boards

Stop accepting changes an Open Queue to Closing: new Customer and Walk-in Tickets are refused, but existing work remains callable. Every terminal operation closes a drained Queue and ends its Business day in the same Shop transaction. Midnight never resets the counter; reopening a Closed Queue starts a distinct Business day at 1.

Close now requires confirmation and drops only Waiting Tickets. Called or InService work continues; Dropped is distinct from Cancelled and Skipped. The console keeps its selected Service while draining rather than jumping to another Open Queue.

The Shop page exports a scannable PNG QR and copies its public join URL. The anonymous `/board/{publicId}` page displays the Shop-wide Called Ticket, recent Calls and per-Service Waiting FIFO without notes or bearer links. Owner Shop state, Customer status and the board resync through committed live updates.

Multi-query Owner, Customer and board snapshots use PostgreSQL repeatable-read views; live fan-out reads the Shop version and its payload from the same committed snapshot. A concurrent Start cannot display one Ticket as both Called and InService in the same board response.

