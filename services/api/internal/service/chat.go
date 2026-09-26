package service

import (
	"context"
	"log"
	"time"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

type MessageStore interface {
	SendMessage(ctx context.Context, senderID, otherID, clientMessageID, body string) (domain.DirectMessage, error)
}

type MessagePublisher interface {
	PublishMessageChange(ctx context.Context, userID, otherID, messageID string) error
}

type Chat struct {
	store     MessageStore
	publisher MessagePublisher
}

func NewChat(store MessageStore, publisher MessagePublisher) *Chat {
	return &Chat{store: store, publisher: publisher}
}

func (s *Chat) Send(ctx context.Context, senderID, otherID, clientMessageID, body string) (domain.DirectMessage, error) {
	message, err := s.store.SendMessage(ctx, senderID, otherID, clientMessageID, body)
	if err != nil {
		return domain.DirectMessage{}, err
	}
	if s.publisher != nil {
		for _, recipient := range []struct{ userID, otherID string }{{senderID, otherID}, {otherID, senderID}} {
			publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Second)
			if err := s.publisher.PublishMessageChange(publishCtx, recipient.userID, recipient.otherID, message.ID); err != nil {
				log.Printf("publish message change: %v", err)
			}
			cancel()
		}
	}
	return message, nil
}
