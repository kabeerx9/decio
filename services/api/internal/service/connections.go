package service

import (
	"context"
	"log"
	"time"
)

type ConnectionStore interface {
	RequestConnection(ctx context.Context, requesterID, recipientID string) error
	AcceptConnection(ctx context.Context, recipientID, requesterID string) error
}

type ConnectionPublisher interface {
	PublishConnectionChange(ctx context.Context, userID string) error
}

type Connections struct {
	store     ConnectionStore
	publisher ConnectionPublisher
}

func NewConnections(store ConnectionStore, publisher ConnectionPublisher) *Connections {
	return &Connections{store: store, publisher: publisher}
}

func (s *Connections) Request(ctx context.Context, requesterID, recipientID string) error {
	if err := s.store.RequestConnection(ctx, requesterID, recipientID); err != nil {
		return err
	}
	s.publish(ctx, requesterID, recipientID)
	return nil
}

func (s *Connections) Accept(ctx context.Context, recipientID, requesterID string) error {
	if err := s.store.AcceptConnection(ctx, recipientID, requesterID); err != nil {
		return err
	}
	s.publish(ctx, recipientID, requesterID)
	return nil
}

// A committed write remains successful if event delivery fails. Each recipient
// gets its own bounded attempt so one timeout does not skip the other.
func (s *Connections) publish(requestContext context.Context, userIDs ...string) {
	if s.publisher == nil {
		return
	}
	for _, id := range userIDs {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(requestContext), time.Second)
		if err := s.publisher.PublishConnectionChange(ctx, id); err != nil {
			log.Printf("publish connection change: %v", err)
		}
		cancel()
	}
}
