# SmartQueue

Mobile-first queue management for a single Owner per Shop. The approved specification and implementation tickets are in the local issue tracker. Domain vocabulary remains in `CONTEXT.md`.

## Run locally

Requirements: .NET 10 SDK, Node 24, Docker Compose.

```sh
docker compose up -d --wait
npm ci
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

### Browser end-to-end tests (Playwright)

Start PostgreSQL and Mailpit with `docker compose up -d --wait`, install both root and web dependencies as above, then:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

The runner builds the production SPA/API and starts a real application on loopback port 5310. Each launch provisions its own PostgreSQL database through the existing integration-test host, uses the real server clock and SMTP mailbox, and removes that database on graceful shutdown. A startup guard checks the actual database name. Data Protection and VAPID keys use a separate run-local temporary directory, removed on exit; the developer's key ring and development database are not reset. The database account must have `CREATE DATABASE` permission; `SMARTQUEUE_TEST_CONNECTION` or the existing `SMARTQUEUE_TEST_DB_*` settings override the local administrative connection.

Tests run on touch-enabled 375×812 Chromium and desktop 1280×900 Chromium, with independent Customer contexts and unique Owner accounts/Shops. Behaviors under test use the actual UI, HTTP, SignalR and worker; no API responses are mocked. Coverage includes:

- Registration, delivered email verification, rejected unverified login, password recovery, Shop/Service editing and isolation.
- Anonymous receipts, private notes, mixed Customer/Walk-in FIFO, extra-Ticket confirmation/quota, Call/Start/Complete/Cancel/Skip, Stop/drain/reopen, Drop and Archive.
- Simultaneous Owner Calls, real no-show auto-Skip, three-view demo, independent demo sessions and offline/reconnect resynchronization. Genuine HTTP replies are paused through CDP to exercise slow negotiation and out-of-order resync completion, without fabricating responses.
- Actual downloaded QR PNG pixels decoded with an independent reader, then followed through anonymous receipt and a live Call.
- Statistics/outcomes/rates, separate Business-day rounds, Service filters and real received-hour demand.
- Invalid/foreign links, fresh-context Ticket-link paste/recovery, unsupported notifications and Safari-tab installation guidance.
- Responsive 320/375px, tablet/desktop breakpoint boundaries, 844×390 landscape, Board column boundaries, reduced motion, keyboard focus and 200% text; long queue identifiers remain on one line.

Failures retain screenshots, videos and traces under `test-results/e2e/`; the HTML report is in `playwright-report/` and machine-readable results in `test-results/e2e-results.json`. These ignored artifacts can contain private Ticket links/session data: do not publish them publicly. Passing responsive/QR cases also save evidence images in their per-test output directory.

```sh
npm run test:e2e -- --project=mobile-chromium
npm run test:e2e -- --grep "offline Owner"
npm run test:e2e:ui
npx playwright show-trace test-results/e2e/<failed-test>/trace.zip
```

Set `SMARTQUEUE_E2E_PORT` to choose another managed loopback port. An explicit `SMARTQUEUE_E2E_URL` uses an already-running target instead: no test server/database is provisioned or removed, and real fixture accounts/Shops are created there. Use only a disposable test/staging target, never a production Shop.

Chromium mobile emulation is not a physical-phone test. The deterministic suite checks notification capability/installation UX, not delivery through external push providers or actual iPhone Home Screen installation. Durable notification policy and exact 24-hour expiry boundaries remain covered by the PostgreSQL integration suite. On supported Linux CI images, `npx playwright install --with-deps chromium` installs the browser's system dependencies.

### Responsive working areas

Phones retain bottom navigation and a viewport-pinned primary command. From 1024px, Owner pages use a persistent side navigation and a bounded computer workspace; the Queue command sits beside the current Ticket instead of occupying a stretched phone footer. Queue operation/backlog, Shop QR/Services, Statistics outcomes/demand and Demo receipt/reference regions appear in parallel when the content area can fit them. The shell is capped at 1320px, and the two-column work area requires 41.5rem of actual content width, so large text can fall back to one column.

Sheets remain bottom-aligned on phones and centered on larger screens. Short phone-landscape windows reduce navigation height without shrinking touch targets. Ticket stubs reflow with available content width, while queue-number and countdown sizes are bounded by their containers rather than wrapping or overflowing when text is enlarged. The Owner shell is never a query container: older engines can otherwise contain its fixed bars (the layout-containment behavior changed in [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)). Desktop content becomes a query container only while its command bar is in normal flow and the navigation is outside that container.

Browser `offline` immediately marks live data stale and disables unsafe Owner actions even if an existing WebSocket has not closed yet. Returning online re-subscribes and refreshes the authoritative snapshot before commands are enabled. Only the newest resync attempt may publish readiness, and concurrent foreground recovery shares a pending SignalR start.


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

The mobile Queue console calls the oldest Waiting Ticket in the selected Queue under the Shop row lock. Each Shop holds at most one Called or InService Ticket. Call next does not require a global Shop-version token: unrelated receiving or notification changes must not invalidate it. Start, Complete and Skip check the Ticket version; conflicts return fresh state and are never automatically retried.

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

## Retained history and statistics

Hiding a Service is a one-way archive, not deletion or Drop. It disappears from Customer join choices but existing Waiting and held work drains normally. Ticket links, Prefix snapshots, Business days and statistics survive; the console changes selection only after the archived Queue is fully closed.

Private statistics select the current/latest or latest 7/30 Business days of each Queue before combining them. They are opening rounds, not calendar days. Issued counts include Customer and Walk-in Tickets; wait measures receive-to-Call, service measures Start-to-Completed. Skipped, Cancelled and Dropped remain separate, and rates divide only by terminal Tickets. Missing measurements display no data; a measured zero remains zero.

Historical selection is bounded in PostgreSQL per Queue; the app does not load every old Business day to display seven rounds. Archived Services remain selectable for history.

Statistics also expose issued counts for each individual Business day, shown as ruled rows with Bangkok opening times. The board clock advances from a server-time anchor and always displays Asia/Bangkok, irrespective of the display device's timezone.

## Demand and optional notifications

Hourly demand and weekday patterns reuse the statistics selection and count the original receive timestamps in Asia/Bangkok. Call or completion time never moves a received Ticket into another demand bucket. The mobile heatmap splits the day into two labelled halves and prints counts as well as intensity.

Customers opt into Web Push from a valid Ticket link. Denied or unsupported notifications never block receiving or serving a Ticket. iPhone/iPad Safari tabs show Home Screen installation guidance instead of claiming Push is enabled.

Near-turn fires once per Ticket on a threshold crossing; the durable marker survives threshold edits and re-opt-in. Called and Drop are separate events. Terminal transitions atomically withdraw that Ticket's associations; disabling one Ticket does not unsubscribe a shared browser endpoint used by another.

Development creates a persistent owner-only VAPID key file. Production must provide `Push__PublicKey`, `Push__PrivateKey` and a `Push__Subject` contact URI; `Push__VapidKeyPath` overrides development key storage. Keep the same identity across instances and deployments. Push delivery is best effort, after the database commit, with no retries or network work inside the transaction.

Payloads carry only Ticket ID, event, number and language. Private links stay in the opted-in browser's IndexedDB; the service worker resolves the notification deep link locally. Supported provider endpoints are HTTPS-only and delivery does not follow redirects.

## Guided demo

Enter demo mode, then choose **Try three views**. The simulator issues ordinary Customer Tickets through the same receipt command as the public join page, preserving intent replay, extra-Ticket confirmation and the device quota. Its authenticated API refuses other demo sessions and real Shops.

Open the Owner, Customer and Display board links in separate tabs. The guide includes a two-Owner Call race and concurrent receiving. Its optional 10-second timeout changes the selected demo Service through the normal edit API; existing Called deadlines remain unchanged and the real five-second worker determines when to Skip.

The installed app starts at `/resume`, offering the last validated Ticket link, a same-site link paste form and the Owner entry. Copy the Ticket link before adding the app to the Home Screen: installed iOS storage may be isolated from Safari. The public manifest never contains a bearer secret. Every resumed or pasted link is checked by the normal API, including expiry; browser storage is convenience, not an alternative Customer identity.

