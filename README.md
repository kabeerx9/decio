# Decio Update

A people-first city network rebuilt with Expo, Go, Clerk, Postgres, and Ably. The first milestone is intentionally small: sign-in, profile, people search, connections, city posts, and direct chat. The current code implements sign-in, profile editing, people search, connection requests, city posts, and realtime connection updates.

## Project map

- [`apps/mobile`](apps/mobile): Expo Router app, Clerk session, TanStack Query, Street Atlas UI.
- [`services/api`](services/api): Go HTTP API, Clerk token verification, and Postgres persistence. See its [package and request-flow map](services/api/README.md).
- [`compose.yaml`](compose.yaml): optional local Postgres for development and integration tests.
- [GitHub milestone map](https://github.com/kabeerx9/decio-update/issues/1): decisions, tickets, and blockers.

## Accounts created

- [Clerk development application](https://dashboard.clerk.com/apps/app_3JrbR8HF0FBC2IL8W7EPX7i0FzL/instances/ins_3JrbRAckWSiUGOwuHN79QciT86K): Native API is enabled. Sign-up and sign-in use email verification codes; passwords are disabled.
- [Supabase project](https://supabase.com/dashboard/project/qxvcqbwnxdgnjowgfcdn): free Postgres in Mumbai. The Data API is disabled; only the Go server should connect to Postgres.
- [Ably development application](https://ably.com/accounts/YCYj8g/apps/hzb_jA): delivers per-user connection change events. The API key stays on the Go server; mobile clients receive short-lived, subscribe-only tokens.

## Local setup

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Put the Clerk **publishable** key in it. Set `EXPO_PUBLIC_API_URL` to `http://localhost:8080` for the iOS simulator, `http://10.0.2.2:8080` for the Android emulator, or your computer's LAN address for a physical phone.
2. Copy `services/api/.env.example` to `services/api/.env.local`. Put the Clerk **secret** key in `CLERK_SECRET_KEY` and a server-side Ably key in `ABLY_API_KEY`. Never put either key in Expo or commit the file. The Go API signs one-hour Ably token requests limited to `subscribe` on `user:<Clerk user ID>:events` via `GET /v1/realtime/token`.
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

`GET /v1/connections` returns `{ "connections": [{ "other": <public profile>, "status": "incoming|sent|accepted" }] }` for the signed-in user. `POST /v1/connections` with `{ "userId": "<recipient Clerk ID>" }` creates a pending request; the sender needs a completed profile. `POST /v1/connections/{requesterId}/accept` accepts only a pending request addressed to the signed-in user. A unique unordered user pair prevents duplicate and reverse-direction requests, including simultaneous writes. The new `connections` table is created by the API at startup and remains in the database after a code revert. There is no notification or realtime delivery in this slice; recipients can refresh the Connections section to see new requests.

`POST /v1/posts` accepts `multipart/form-data` with required `body` (1–1000 characters) and at most one optional `photo`. The server derives the city from the verified author's completed profile. Photos are decoded, checked, stripped of metadata, and stored in Postgres as JPEG or PNG with a 2 MB output cap. `GET /v1/posts?cursor=<postId>` returns `{ "city", "posts": [...], "nextCursor" }` in pages of at most 20, filtered to the viewer's current profile city. Each post includes a string `id`, author ID and name, city, body, `hasPhoto`, and creation time. `GET /v1/posts/{id}/photo` requires a session and allows only a viewer whose current city matches the post city. An unset city yields an empty feed and blocks creation. The `city_posts` table is created on API startup and persists after a code revert. Photo bytes in Postgres keep this milestone simple, but a separate object store will be preferable as image volume grows.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. The example permits Expo web at `http://localhost:8081`; native iOS and Android requests do not use CORS.

## Checks

```sh
cd services/api && go test ./...
cd apps/mobile && npm test && npm run typecheck
```

With local Postgres running, set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` while running `go test ./...` to include the storage integration test.

## Design direction

The signed-in Discover screen follows the Street Atlas direction: city context, a prominent search field, large member placeholders, and compact results. The API has no member-photo field yet, so the app uses initials instead of stock portraits. A curated [Mumbai city photo by Shamoil on Unsplash](https://unsplash.com/photos/a-large-body-of-water-with-a-city-in-the-background-67mH8hKs_Ao) appears only when the selected city is Mumbai, under the [Unsplash License](https://unsplash.com/license). Other cities use the ink-color header until an accurate photo is curated. City selection uses Expo UI's native-backed modal sheet with a search field and a custom city option; no location permission is requested. TanStack Query owns remote data cache. React Native Keyboard Controller keeps auth and profile forms above the keyboard. People search matches name, city, and headline, while profiles remain visible only to signed-in users.
