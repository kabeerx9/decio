package domain

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var ErrProfileNotFound = errors.New("profile not found")
var ErrProfileIncomplete = errors.New("complete your profile first")

type Profile struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"displayName"`
	City        string   `json:"city"`
	Bio         string   `json:"bio"`
	Headline    string   `json:"headline"`
	Interests   []string `json:"interests"`
}

type ProfileInput struct {
	DisplayName string   `json:"displayName"`
	City        string   `json:"city"`
	Bio         string   `json:"bio"`
	Headline    string   `json:"headline"`
	Interests   []string `json:"interests"`
}

func (input *ProfileInput) NormalizeAndValidate() string {
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.City = strings.TrimSpace(input.City)
	input.Bio = strings.TrimSpace(input.Bio)
	input.Headline = strings.TrimSpace(input.Headline)
	if n := utf8.RuneCountInString(input.DisplayName); n < 2 || n > 60 || strings.ContainsAny(input.DisplayName, "\r\n") {
		return "display name must be 2–60 characters on one line"
	}
	if n := utf8.RuneCountInString(input.City); n < 2 || n > 80 || strings.ContainsAny(input.City, "\r\n") {
		return "city must be 2–80 characters on one line"
	}
	if utf8.RuneCountInString(input.Bio) > 280 {
		return "bio must be 280 characters or fewer"
	}
	if utf8.RuneCountInString(input.Headline) > 80 || strings.ContainsAny(input.Headline, "\r\n") {
		return "headline must be 80 characters or fewer on one line"
	}
	if len(input.Interests) > 3 {
		return "choose no more than three interests"
	}
	seen := make(map[string]bool, len(input.Interests))
	for index, interest := range input.Interests {
		interest = strings.TrimSpace(interest)
		if n := utf8.RuneCountInString(interest); n < 2 || n > 24 || strings.ContainsAny(interest, "\r\n") {
			return "each interest must be 2–24 characters on one line"
		}
		key := strings.ToLower(interest)
		if seen[key] {
			return "interests must be different"
		}
		seen[key] = true
		input.Interests[index] = interest
	}
	if input.Interests == nil {
		input.Interests = []string{}
	}
	return ""
}
