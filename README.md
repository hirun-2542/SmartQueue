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
```

The API tests use real HTTP sessions, PostgreSQL and delivered messages in the local capture mailbox, not an in-memory database or mocked verification link. Test users have unique addresses. Set `SMARTQUEUE_URL` and `MAILPIT_URL` to change the test endpoints.

## Accounts

Owner registration requires email verification before sign-in. Verification and password recovery send real SMTP messages; open their links from the capture mailbox in development. The app supports Thai and English, cookie sessions and CSRF-protected mutations.

Production requires an HTTPS origin, `PublicOrigin`, a PostgreSQL connection string, and SMTP settings (`Smtp__Host`, `Smtp__Port`, `Smtp__From`, `Smtp__UseTls`, and credentials if required). Configure `DataProtection__KeyPath` as persistent private storage shared by application instances. Development keys default to the user's local application data directory. Protect key storage and add an appropriate at-rest encryptor for production.

Production SPA assets are built into the API's web root by `npm --prefix web run build`; development uses Vite's same-origin API proxy.
