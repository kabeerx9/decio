package migrations

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const CurrentVersion = 4

//go:embed sql/*.sql
var files embed.FS

func newRunner(databaseURL string) (*migrate.Migrate, error) {
	source, err := iofs.New(files, "sql")
	if err != nil {
		return nil, fmt.Errorf("open migration files: %w", err)
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		_ = source.Close()
		return nil, fmt.Errorf("open database: %w", err)
	}
	driver, err := pgxmigrate.WithInstance(db, &pgxmigrate.Config{})
	if err != nil {
		_ = db.Close()
		_ = source.Close()
		return nil, fmt.Errorf("open migration database: %w", err)
	}
	runner, err := migrate.NewWithInstance("iofs", source, "pgx5", driver)
	if err != nil {
		_ = driver.Close()
		_ = source.Close()
		return nil, fmt.Errorf("create migration runner: %w", err)
	}
	return runner, nil
}

// Up applies every pending migration. Run it as a deployment step before starting the API.
func Up(databaseURL string) error {
	runner, err := newRunner(databaseURL)
	if err != nil {
		return err
	}
	defer runner.Close()
	if err := runner.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}

// Version returns the recorded migration state, including whether a run failed.
func Version(databaseURL string) (uint, bool, error) {
	runner, err := newRunner(databaseURL)
	if err != nil {
		return 0, false, err
	}
	defer runner.Close()
	version, dirty, err := runner.Version()
	return version, dirty, err
}
