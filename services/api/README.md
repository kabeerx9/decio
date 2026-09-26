# Go API map

This module follows Go's [server layout guidance](https://go.dev/doc/modules/layout): the executable is in `cmd/server`, and code private to this server is in `internal`.

```text
cmd/server/main.go          configuration and dependency wiring
internal/domain/            shared data shapes, validation, and business errors
internal/httpapi/           Clerk authentication, HTTP routes, request/response handling
internal/postgres/          SQL queries, connection pool, and embedded schema
```

## Follow a request

```text
Clerk bearer token
  → httpapi.ClerkAuth verifies identity
  → httpapi route validates the HTTP request
  → postgres.Store runs the query using domain types
  → httpapi writes the HTTP response
```

Start with `cmd/server/main.go` to see how the concrete Postgres store enters the HTTP handler. For a feature, read its domain type, then its HTTP route, then its Postgres query. For example, a city post flows through `internal/domain/post.go`, `internal/httpapi/posts.go`, and `internal/postgres/posts.go`.

The small store interfaces live with their consumer in `httpapi`. `postgres.Store` satisfies them implicitly, so the SQL package imports only `domain`; it does not depend on HTTP. There is no separate service package yet because it would only forward calls. Introduce one when a use case needs orchestration or policy beyond HTTP validation and one repository operation.

Go keeps `_test.go` files next to the package they test. They compile only during `go test`; they are not production files. This is also the layout shown in [Go's module guide](https://go.dev/doc/modules/layout). To see only implementation files, use `rg --files internal -g '*.go' -g '!**/*_test.go'`.

Run `go test ./...`. With local Postgres, set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` to include SQL integration tests.
