package realtime

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/ably/ably-go/ably"
)

func TestTokenRequestIsScopedToOneUsersSubscribeChannel(t *testing.T) {
	client, err := New("testApp.testKey:secret")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := client.TokenRequest(context.Background(), "user_verified")
	if err != nil {
		t.Fatal(err)
	}
	var token ably.TokenRequest
	if err := json.Unmarshal(raw, &token); err != nil {
		t.Fatal(err)
	}
	if token.ClientID != "user_verified" || token.TTL != 3600000 || token.MAC == "" {
		t.Fatalf("token identity, TTL, or signature missing: clientID=%q ttl=%d signed=%t", token.ClientID, token.TTL, token.MAC != "")
	}
	var capability map[string][]string
	if err := json.Unmarshal([]byte(token.Capability), &capability); err != nil {
		t.Fatal(err)
	}
	if len(capability) != 1 || len(capability["user:user_verified:events"]) != 1 || capability["user:user_verified:events"][0] != "subscribe" {
		t.Fatalf("unexpected token capability: %v", capability)
	}
}

func TestLiveAblyToken(t *testing.T) {
	if os.Getenv("ABLY_LIVE_TEST") != "1" {
		t.Skip("set ABLY_LIVE_TEST=1 to verify the configured key with Ably")
	}
	client, err := New(os.Getenv("ABLY_API_KEY"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	token, err := client.rest.Auth.RequestToken(ctx, &ably.TokenParams{
		ClientID: "decio_smoke", Capability: `{"user:decio_smoke:events":["subscribe"]}`, TTL: 60000,
	})
	if err != nil {
		t.Fatalf("Ably rejected a scoped token request: %v", err)
	}
	if token.ClientID != "decio_smoke" {
		t.Fatalf("unexpected token identity: %q", token.ClientID)
	}
	if err := client.PublishConnectionChange(ctx, "decio_smoke"); err != nil {
		t.Fatalf("Ably rejected a connection event: %v", err)
	}
}
