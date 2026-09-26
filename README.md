# Decio Update

A people-first city network rebuilt with Expo, Go, Clerk, Postgres, and later Ably. The first milestone is intentionally small: sign-in, profile, people search, connections, city posts, and direct chat. The current code implements the first sign-in/profile slice.

## Project map

- [`apps/mobile`](apps/mobile): Expo Router app, Clerk session, TanStack Query, Street Atlas UI.
- [`services/api`](services/api): Go HTTP API, Clerk token verification, Postgres profile storage.
- [`compose.yaml`](compose.yaml): optional local Postgres for development and integration tests.
- [GitHub milestone map](https://github.com/kabeerx9/decio-update/issues/1): decisions, tickets, and blockers.

## Accounts created

- [Clerk development application](https://dashboard.clerk.com/apps/app_3JrbR8HF0FBC2IL8W7EPX7i0FzL/instances/ins_3JrbRAckWSiUGOwuHN79QciT86K): Native API is enabled. Sign-up and sign-in use email verification codes; passwords are disabled.
- [Supabase project](https://supabase.com/dashboard/project/qxvcqbwnxdgnjowgfcdn): free Postgres in Mumbai. The Data API is disabled; only the Go server should connect to Postgres.

## Local setup

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Put the Clerk **publishable** key in it. Set `EXPO_PUBLIC_API_URL` to `http://localhost:8080` for the iOS simulator, `http://10.0.2.2:8080` for the Android emulator, or your computer's LAN address for a physical phone.
2. Copy `services/api/.env.example` to `services/api/.env.local`. Put the Clerk **secret** key in `CLERK_SECRET_KEY`. Never put this key in Expo or commit the file.
3. For Supabase, open **Connect → Direct → Session pooler** and copy the URI into `DATABASE_URL`. Replace `[YOUR-PASSWORD]` locally with the database password and append `?sslmode=require`. Percent-encode special characters in the password. The session pooler works from IPv4 networks. For an isolated local database instead, run `docker compose up -d postgres` and use the fallback URL in the example file.
4. Start the API:

   ```sh
   cd services/api
   set -a
   source .env.local
   set +a
   go run ./cmd/server
   ```

5. Start Expo in another terminal:

   ```sh
   cd apps/mobile
   npm install
   npm start
   ```

The API creates or extends the `profiles` table on startup. `GET /health` is public. `GET /v1/me` requires `Authorization: Bearer <Clerk session token>` and returns `{ "id", "displayName", "city", "bio", "headline", "interests" }`. `PUT /v1/me` replaces those five editable fields; it requires a display name and city. The ID comes from verified Clerk claims, never from a client-supplied profile ID. The current schema update adds `bio`, `headline`, and `interests` columns to the Supabase project; these columns remain after a code revert.

`GET /v1/people?q=<text>&cursor=<id>` requires the same token. It searches completed profiles by name, city, or headline, excludes the caller, and returns `{ "people": [...], "nextCursor": "" }` in pages of at most 20. An empty `q` lists completed profiles. Pass a nonempty `nextCursor` to fetch the next page. `GET /v1/people/{id}` returns one completed public profile or 404. Search uses stable ID order rather than relevance ranking for now.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. The example permits Expo web at `http://localhost:8081`; native iOS and Android requests do not use CORS.

## Checks

```sh
cd services/api && go test ./...
cd apps/mobile && npm test && npm run typecheck
```

With local Postgres running, set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` while running `go test ./...` to include the storage integration test.

## Design direction

The current UI keeps the existing basic theme while functionality is built out. City selection uses Expo UI's native-backed modal sheet with a search field and a custom city option; no location permission is requested. TanStack Query owns remote data cache. React Native Keyboard Controller keeps auth and profile forms above the keyboard. People search matches name, city, and headline, while profiles remain visible only to signed-in users. Visual design will be revisited after the core flows work.
