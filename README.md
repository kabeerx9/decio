# Decio

A people-first city network rebuilt with Expo, Go, Clerk, Postgres, and Ably. The first milestone is intentionally small: sign-in, profile, people search, connections, city posts, and direct chat. The current code implements sign-in, profile editing, people search, connection requests, city posts, and direct chat.

## Project map

- [`apps/mobile`](apps/mobile): Expo Router app, Clerk session, TanStack Query, and Decio's mobile UI.
- [`services/api`](services/api): Go HTTP API, Clerk token verification, and Postgres persistence. See its [package and request-flow map](services/api/README.md).
- [`compose.yaml`](compose.yaml): optional local Postgres for development and integration tests.
- [GitHub milestone map](https://github.com/kabeerx9/decio/issues/1): decisions, tickets, and blockers.

## Accounts created

- [Clerk development application](https://dashboard.clerk.com/apps/app_3JrbR8HF0FBC2IL8W7EPX7i0FzL/instances/ins_3JrbRAckWSiUGOwuHN79QciT86K): Native API is enabled. Sign-up and sign-in use email verification codes; passwords are disabled.
- [Supabase project](https://supabase.com/dashboard/project/qxvcqbwnxdgnjowgfcdn): free Postgres in Mumbai. The Data API is disabled; only the Go server should connect to Postgres.
- [Ably development application](https://ably.com/accounts/YCYj8g/apps/hzb_jA): delivers per-user connection change events. The API key stays on the Go server; mobile clients receive short-lived, subscribe-only tokens.

## Local setup

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Put the Clerk **publishable** key in it. Set `EXPO_PUBLIC_API_URL` to `http://localhost:8080` for the iOS simulator, `http://10.0.2.2:8080` for the Android emulator, or your computer's LAN address for a physical phone.
2. Copy `services/api/.env.example` to `services/api/.env.local`. Put the Clerk **secret** key in `CLERK_SECRET_KEY` and a server-side Ably key in `ABLY_API_KEY`. Never put either key in Expo or commit the file. The Go API signs one-hour Ably token requests limited to `subscribe` on `user:<Clerk user ID>:events` via `GET /v1/realtime/token`.
3. For Supabase, open **Connect → Direct → Session pooler** and copy the URI into `DATABASE_URL`. Replace `[YOUR-PASSWORD]` locally with the database password and append `?sslmode=require`. Percent-encode special characters in the password. The session pooler works from IPv4 networks. For an isolated local database instead, run `docker compose up -d postgres` and use the fallback URL in the example file.
4. Apply pending migrations, then start the API:

   ```sh
   cd services/api
   set -a
   source .env.local
   set +a
   go run ./cmd/migrate up
   go run ./cmd/server
   ```

5. Install dependencies and create a development build for the simulator or emulator:

   ```sh
   cd apps/mobile
   npm install
   npm run ios      # iOS simulator
   # or: npm run android  # Android emulator
   ```

   On later runs, start Metro in development-build mode and open the installed Decio build. Rebuild after adding native packages or changing native app configuration:

   ```sh
   npm start
   ```

The API checks the recorded database migration version on startup and does not run DDL. See [the migration workflow](services/api/README.md#database-migrations) before upgrading Supabase. `GET /health` is public. `GET /v1/me` requires `Authorization: Bearer <Clerk session token>` and returns profile fields including `imageUrl` and `onboardingComplete`. `PUT /v1/me` replaces the five editable text fields; it requires a display name and city. The ID comes from verified Clerk claims, never from a client-supplied profile ID. `POST /v1/me/image/sync` verifies the photo with Clerk and copies its URL to Postgres. `POST /v1/me/onboarding/complete` requires saved name, city, and photo; it marks onboarding complete atomically and returns the profile. The app gates its tabs on that server-owned flag. New accounts resume at the details or photo step based on the saved profile. Existing named profiles are marked complete once when the new column is installed; the column and completion timestamps remain after a code revert.

`GET /v1/people?q=<text>&cursor=<id>` requires the same token. It searches completed profiles by name, city, or headline, excludes the caller, and returns `{ "people": [...], "nextCursor": "" }` in pages of at most 20. An empty `q` lists completed profiles. Pass a nonempty `nextCursor` to fetch the next page. `GET /v1/people/{id}` returns one completed public profile or 404. Search uses stable ID order rather than relevance ranking for now.

`GET /v1/connections` returns `{ "connections": [{ "other": <public profile>, "status": "incoming|sent|accepted", "unreadCount": 0 }] }` for the signed-in user. `unreadCount` counts incoming messages in accepted chats since that user's last read marker. `POST /v1/connections` with `{ "userId": "<recipient Clerk ID>" }` creates a pending request; the sender needs a completed profile. `POST /v1/connections/{requesterId}/accept` accepts only a pending request addressed to the signed-in user. A unique unordered user pair prevents duplicate and reverse-direction requests, including simultaneous writes. The `connections` table remains in the database after a code revert. Ably events invalidate each user's connections query after a successful write. The mobile app shows an incoming request count on Discover and unread message counts on Messages and each conversation.

`GET /v1/chats/{otherUserId}/messages?cursor=<messageId>` reads at most 20 messages for an accepted connection, newest first, with a string `nextCursor` for older history. A new conversation returns an empty array. `POST /v1/chats/{otherUserId}/messages` accepts `{ "clientMessageId": "<stable retry ID>", "body": "<1–2000 characters>" }` and returns the saved message. Reusing the same retry ID with the same content returns the original message; changing its content returns 409. `POST /v1/chats/{otherUserId}/read` accepts `{ "messageId": "<newest loaded message ID>" }` and advances only that viewer's read marker, returning 204. Only accepted participants can read, send, or mark read (403 otherwise). Postgres owns message history and read markers. `messages.changed` events on the participants' Ably user channels prompt the app to refetch message history and unread counts. Foreground and reconnect also refetch missed changes. The `direct_messages` and `chat_reads` tables are created by migrations and remain after a code revert. Event delivery is best effort, so a connected client can be briefly stale if Ably publishing fails.

`POST /v1/posts` accepts `multipart/form-data` with required `body` (1–1000 characters) and at most one optional `photo`. The server derives the city from the verified author's completed profile. Photos are decoded, checked, stripped of metadata, and stored in Postgres as JPEG or PNG with a 2 MB output cap. `GET /v1/posts?cursor=<postId>` returns `{ "city", "posts": [...], "nextCursor" }` in pages of at most 20, filtered to the viewer's current profile city. Each post includes a string `id`, author ID and name, city, body, `hasPhoto`, and creation time. `GET /v1/posts/{id}/photo` requires a session and allows only a viewer whose current city matches the post city. An unset city yields an empty feed and blocks creation. The `city_posts` table is created by a migration and persists after a code revert. Photo bytes in Postgres keep this milestone simple, but a separate object store will be preferable as image volume grows.

`GET /v1/posts/{id}/replies?cursor=<replyId>` returns `{ "replies": [...], "nextCursor" }` in oldest-first pages of at most 30. `POST /v1/posts/{id}/replies` accepts JSON `{ "body": "<1–1000 characters>" }` and returns the saved reply. Both routes require a verified session and a current profile city matching the post city; hidden or missing posts return 404. The `post_replies` table is created by a migration and remains after a code revert. The mobile feed opens a conversation screen from each post's Reply action. Discover searches name, city, and headline; each result has a direct Connect action, while tapping the person still opens their profile.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. The example permits Expo web at `http://localhost:8081`; native iOS and Android requests do not use CORS.

## Checks

```sh
cd services/api && go test ./...
cd apps/mobile && npm test && npm run typecheck
```

With local Postgres running and migrated, set `TEST_DATABASE_URL=postgres://decio:decio@localhost:5433/decio?sslmode=disable` while running `go test ./...` to include the storage integration test.

## Design direction

Decio uses a warm social identity: plum for structure, coral for actions, and soft lilac for people and supporting surfaces. The rounded D mark ends at a meeting point; its SVG masters live in [`apps/mobile/assets/brand`](apps/mobile/assets/brand), with PNG exports for native app icons and the in-app header. Onboarding opens with a local Lottie animation, then saves details and a Clerk photo before entering the app. Discover starts with search and incoming requests, then shows connections and people who are still new to the viewer. Connected people do not repeat in the default discovery list. The feed keeps the post composer closed until someone chooses to write, leaving more room for posts. Profile photos are uploaded to Clerk from onboarding or the editor; `POST /v1/me/image/sync` reads the signed-in user's image URL from Clerk on the Go server and stores it in `profiles.image_url` for public profile, connection, post, and reply responses. Clients cannot submit an arbitrary image URL. Removing a photo in Clerk and syncing clears the stored URL. The image column persists after a code revert. City selection uses Expo UI's native-backed modal sheet with a search field and a custom city option; no location permission is requested. TanStack Query owns remote data cache. React Native Keyboard Controller keeps auth and profile forms above the keyboard. People search matches name, city, and headline, while profiles remain visible only to signed-in users.
