# Go API map

This module follows Go's [server layout guidance](https://go.dev/doc/modules/layout): the executable is in `cmd/server`, and code private to this server is in `internal`.

```text
cmd/server/main.go          configuration and dependency wiring
internal/domain/            shared data shapes, validation, and business errors
internal/httpapi/           Clerk authentication, HTTP routes, request/response handling
internal/service/           connection and chat write orchestration, event delivery policy
internal/postgres/          SQL queries, connection pool, and schema-version check
internal/migrations/        versioned SQL migrations and migration runner
cmd/migrate/                explicit database upgrade command
internal/realtime/          Ably token signing and event publishing
```

## Follow a request

```text
Clerk bearer token
  → httpapi.ClerkAuth verifies identity
  → httpapi route validates the HTTP request
  → postgres.Store runs the query using domain types
  → httpapi writes the HTTP response
```

For a connection write, `service.Connections` calls Postgres first, then publishes `connections.changed` through `realtime.Client` to both users' Ably channels. For direct chat, `service.Chat` saves the message before publishing `messages.changed` to both users. The mobile app fetches a scoped token from `GET /v1/realtime/token`, subscribes to its own channel, and invalidates the relevant query when an event arrives. Ably delivery is a best-effort hint; foreground and reconnect refresh from Postgres, which remains the source of truth.

Start with `cmd/server/main.go` to see how the concrete Postgres store enters the HTTP handler. For a feature, read its domain type, then its HTTP route, then its Postgres query. For example, a city post flows through `internal/domain/post.go`, `internal/httpapi/posts.go`, and `internal/postgres/posts.go`.

The small store interfaces live with their consumer in `httpapi` and `service`. `postgres.Store` satisfies them implicitly, so the SQL package imports only `domain`; it does not depend on HTTP. The connection and chat services coordinate database writes and Ably notifications. They return the database result to HTTP and log delivery failures after a successful write. Other use cases call the store directly because they have no orchestration policy.

Go keeps `_test.go` files next to the package they test. They compile only during `go test`; they are not production files. This is also the layout shown in [Go's module guide](https://go.dev/doc/modules/layout). To see only implementation files, use `rg --files internal -g '*.go' -g '!**/*_test.go'`.

## Database migrations

The API never changes schema at startup. From `services/api`, set `DATABASE_URL`, then run `go run ./cmd/migrate up` before starting a new API version. `go run ./cmd/migrate version` shows the recorded version and dirty state. An unmigrated, outdated, or dirty database prevents API startup.

SQL files in `internal/migrations/sql/` are append-only. `000001` represents the original five-table schema; `000002` adds replies, `000003` adds profile images, and `000004` adds onboarding completion with a one-time backfill for existing named profiles. These transition migrations accept schema changes already made by the former API startup behavior. For future changes, add a new numbered `.up.sql` file and increment `CurrentVersion` in `internal/migrations/migrations.go`; never edit a migration after it has been deployed. Production migrations are forward-only: fix a bad migration with a new one rather than dropping tables or columns to roll back.

Back up Supabase's `public` schema and data before a production migration. For example, with `DATABASE_URL` set, run `umask 077; pg_dump "$DATABASE_URL" --schema=public --format=custom --no-owner --no-acl --file=/private/backup/location/decio-before-migration.dump`. Keep the backup outside the repository. Run only one migrator at a time. If a run leaves a dirty version, inspect the database and the failed SQL before repairing its recorded state; do not blindly force a version.

For local development, run `docker compose up -d postgres` from the repository root and `DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable go run ./cmd/migrate up` from `services/api`. Then run `go test ./...`. Set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` to include SQL integration tests; they require the main local test database to have been migrated first. Migration tests create and drop their own temporary databases.
