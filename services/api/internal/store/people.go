package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio-update/services/api/internal/api"
)

const peoplePageSize = 20

func (s *Postgres) SearchPeople(ctx context.Context, viewerID, query, cursor string) (api.PeoplePage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, display_name, city, bio, headline, interests
		FROM profiles
		WHERE id <> $1 AND id > $3 AND display_name <> ''
		  AND (strpos(lower(display_name), lower($2)) > 0
		    OR strpos(lower(city), lower($2)) > 0
		    OR strpos(lower(headline), lower($2)) > 0)
		ORDER BY id
		LIMIT $4
	`, viewerID, query, cursor, peoplePageSize+1)
	if err != nil {
		return api.PeoplePage{}, err
	}
	defer rows.Close()
	page := api.PeoplePage{People: []api.Profile{}}
	for rows.Next() {
		var person api.Profile
		if err := rows.Scan(&person.ID, &person.DisplayName, &person.City, &person.Bio, &person.Headline, &person.Interests); err != nil {
			return api.PeoplePage{}, err
		}
		page.People = append(page.People, person)
	}
	if err := rows.Err(); err != nil {
		return api.PeoplePage{}, err
	}
	if len(page.People) > peoplePageSize {
		page.People = page.People[:peoplePageSize]
		page.NextCursor = page.People[len(page.People)-1].ID
	}
	return page, nil
}

func (s *Postgres) PublicProfile(ctx context.Context, id string) (api.Profile, error) {
	var person api.Profile
	err := s.pool.QueryRow(ctx, `
		SELECT id, display_name, city, bio, headline, interests
		FROM profiles WHERE id = $1 AND display_name <> ''
	`, id).Scan(&person.ID, &person.DisplayName, &person.City, &person.Bio, &person.Headline, &person.Interests)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.Profile{}, api.ErrProfileNotFound
	}
	return person, err
}
