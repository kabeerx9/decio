package postgres

import (
	"context"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

func (s *Store) FindOrCreate(ctx context.Context, clerkUserID string) (domain.Profile, error) {
	_, err := s.pool.Exec(ctx, `INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, clerkUserID)
	if err != nil {
		return domain.Profile{}, err
	}
	var profile domain.Profile
	err = s.pool.QueryRow(ctx, `SELECT id, display_name, city, bio, headline, interests, image_url FROM profiles WHERE id = $1`, clerkUserID).
		Scan(&profile.ID, &profile.DisplayName, &profile.City, &profile.Bio, &profile.Headline, &profile.Interests, &profile.ImageURL)
	return profile, err
}

func (s *Store) Update(ctx context.Context, clerkUserID string, input domain.ProfileInput) (domain.Profile, error) {
	var profile domain.Profile
	err := s.pool.QueryRow(ctx, `
		INSERT INTO profiles (id, display_name, city, bio, headline, interests)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			city = EXCLUDED.city,
			bio = EXCLUDED.bio,
			headline = EXCLUDED.headline,
			interests = EXCLUDED.interests
		RETURNING id, display_name, city, bio, headline, interests, image_url
	`, clerkUserID, input.DisplayName, input.City, input.Bio, input.Headline, input.Interests).
		Scan(&profile.ID, &profile.DisplayName, &profile.City, &profile.Bio, &profile.Headline, &profile.Interests, &profile.ImageURL)
	return profile, err
}

func (s *Store) SetProfileImageURL(ctx context.Context, userID, imageURL string) (domain.Profile, error) {
	var profile domain.Profile
	err := s.pool.QueryRow(ctx, `
		INSERT INTO profiles (id, image_url) VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET image_url = EXCLUDED.image_url
		RETURNING id, display_name, city, bio, headline, interests, image_url
	`, userID, imageURL).Scan(&profile.ID, &profile.DisplayName, &profile.City, &profile.Bio, &profile.Headline, &profile.Interests, &profile.ImageURL)
	return profile, err
}
