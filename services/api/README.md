# Go API map

This module follows Go's [server layout guidance](https://go.dev/doc/modules/layout): the executable is in `cmd/server`, and code private to this server is in `internal`.

```text
cmd/server/main.go          configuration and dependency wiring
internal/domain/            shared data shapes, validation, and business errors
internal/httpapi/           Clerk authentication, HTTP routes, request/response handling
internal/service/           connection write orchestration and event delivery policy
internal/postgres/          SQL queries, connection pool, and embedded schema
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

For a connection write, `service.Connections` calls Postgres first, then publishes `connections.changed` through `realtime.Client` to both users' Ably channels. The mobile app fetches a scoped token from `GET /v1/realtime/token`, subscribes to its own channel, and invalidates its connections query when a message arrives. Ably delivery is a best-effort hint; reopening or reconnecting refreshes from Postgres, which remains the source of truth.

Start with `cmd/server/main.go` to see how the concrete Postgres store enters the HTTP handler. For a feature, read its domain type, then its HTTP route, then its Postgres query. For example, a city post flows through `internal/domain/post.go`, `internal/httpapi/posts.go`, and `internal/postgres/posts.go`.

The small store interfaces live with their consumer in `httpapi` and `service`. `postgres.Store` satisfies them implicitly, so the SQL package imports only `domain`; it does not depend on HTTP. The connection service coordinates a database write and Ably notification. It returns the database result to HTTP and logs delivery failures after a successful write. Other use cases call the store directly because they have no orchestration policy.

Go keeps `_test.go` files next to the package they test. They compile only during `go test`; they are not production files. This is also the layout shown in [Go's module guide](https://go.dev/doc/modules/layout). To see only implementation files, use `rg --files internal -g '*.go' -g '!**/*_test.go'`.

Run `go test ./...`. With local Postgres, set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` to include SQL integration tests.
