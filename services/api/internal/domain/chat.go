package domain

import (
	"errors"
	"time"
)

var ErrChatUnavailable = errors.New("chat requires an accepted connection")
var ErrMessageConflict = errors.New("client message ID already used for another message")

type DirectMessage struct {
	ID        string    `json:"id"`
	SenderID  string    `json:"senderId"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

type MessagePage struct {
	Messages   []DirectMessage `json:"messages"`
	NextCursor string          `json:"nextCursor"`
}
