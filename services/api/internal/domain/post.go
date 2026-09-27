package domain

import (
	"errors"
	"time"
)

var ErrPostNotFound = errors.New("post not found")

type Post struct {
	ID             string    `json:"id"`
	AuthorID       string    `json:"authorId"`
	AuthorName     string    `json:"authorName"`
	AuthorImageURL string    `json:"authorImageUrl"`
	City           string    `json:"city"`
	Body           string    `json:"body"`
	HasPhoto       bool      `json:"hasPhoto"`
	CreatedAt      time.Time `json:"createdAt"`
}

type PostPage struct {
	City       string `json:"city"`
	Posts      []Post `json:"posts"`
	NextCursor string `json:"nextCursor"`
}

type PostReply struct {
	ID             string    `json:"id"`
	PostID         string    `json:"postId"`
	AuthorID       string    `json:"authorId"`
	AuthorName     string    `json:"authorName"`
	AuthorImageURL string    `json:"authorImageUrl"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
}

type ReplyPage struct {
	Replies    []PostReply `json:"replies"`
	NextCursor string      `json:"nextCursor"`
}
