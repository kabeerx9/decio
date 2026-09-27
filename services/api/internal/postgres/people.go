package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio/services/api/internal/domain"
)

const peoplePageSize = 20

func (s *Store) SearchPeople(ctx context.Context, viewerID, query, cursor string) (domain.PeoplePage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, display_name, city, bio, headline, interests, image_url, onboarding_completed_at IS NOT NULL
		FROM profiles
		WHERE id <> $1 AND id > $3 AND onboarding_completed_at IS NOT NULL
		  AND (strpos(lower(display_name), lower($2)) > 0
		    OR strpos(lower(city), lower($2)) > 0
		    OR strpos(lower(headline), lower($2)) > 0)
		ORDER BY id
		LIMIT $4
	`, viewerID, query, cursor, peoplePageSize+1)
	if err != nil {
		return domain.PeoplePage{}, err
	}
	defer rows.Close()
	page := domain.PeoplePage{People: []domain.Profile{}}
	for rows.Next() {
		var person domain.Profile
		if err := rows.Scan(&person.ID, &person.DisplayName, &person.City, &person.Bio, &person.Headline, &person.Interests, &person.ImageURL, &person.OnboardingComplete); err != nil {
			return domain.PeoplePage{}, err
		}
		page.People = append(page.People, person)
	}
	if err := rows.Err(); err != nil {
		return domain.PeoplePage{}, err
	}
	if len(page.People) > peoplePageSize {
		page.People = page.People[:peoplePageSize]
		page.NextCursor = page.People[len(page.People)-1].ID
	}
	return page, nil
}

func (s *Store) PublicProfile(ctx context.Context, id string) (domain.Profile, error) {
	var person domain.Profile
	err := s.pool.QueryRow(ctx, `
		SELECT id, display_name, city, bio, headline, interests, image_url, onboarding_completed_at IS NOT NULL
		FROM profiles WHERE id = $1 AND onboarding_completed_at IS NOT NULL
	`, id).Scan(&person.ID, &person.DisplayName, &person.City, &person.Bio, &person.Headline, &person.Interests, &person.ImageURL, &person.OnboardingComplete)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Profile{}, domain.ErrProfileNotFound
	}
	return person, err
}
