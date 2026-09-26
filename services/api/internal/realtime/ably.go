package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ably/ably-go/ably"
)

const connectionEvent = "connections.changed"
const messageEvent = "messages.changed"

type Client struct {
	rest *ably.REST
}

func New(apiKey string) (*Client, error) {
	rest, err := ably.NewREST(ably.WithKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("initialize Ably: %w", err)
	}
	return &Client{rest: rest}, nil
}

func Channel(userID string) string { return "user:" + userID + ":events" }

func (c *Client) TokenRequest(_ context.Context, userID string) (json.RawMessage, error) {
	capability, err := json.Marshal(map[string][]string{Channel(userID): {"subscribe"}})
	if err != nil {
		return nil, fmt.Errorf("encode Ably capability: %w", err)
	}
	request, err := c.rest.Auth.CreateTokenRequest(&ably.TokenParams{
		ClientID: userID, Capability: string(capability), TTL: int64(time.Hour / time.Millisecond),
	})
	if err != nil {
		return nil, fmt.Errorf("sign Ably token request: %w", err)
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("encode Ably token request: %w", err)
	}
	return encoded, nil
}

func (c *Client) PublishConnectionChange(ctx context.Context, userID string) error {
	return c.rest.Channels.Get(Channel(userID)).Publish(ctx, connectionEvent, nil)
}

func (c *Client) PublishMessageChange(ctx context.Context, userID, otherID, messageID string) error {
	return c.rest.Channels.Get(Channel(userID)).Publish(ctx, messageEvent, struct {
		OtherUserID string `json:"otherUserId"`
		MessageID   string `json:"messageId"`
	}{otherID, messageID})
}
