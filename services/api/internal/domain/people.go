package domain

type PeoplePage struct {
	People     []Profile `json:"people"`
	NextCursor string    `json:"nextCursor"`
}
