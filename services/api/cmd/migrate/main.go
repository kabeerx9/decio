package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	"github.com/kabeerx9/decio/services/api/internal/migrations"
)

func main() {
	if len(os.Args) != 2 || (os.Args[1] != "up" && os.Args[1] != "version") {
		log.Fatal("usage: go run ./cmd/migrate {up|version}")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	switch os.Args[1] {
	case "up":
		if err := migrations.Up(databaseURL); err != nil {
			log.Fatal(err)
		}
		version, dirty, err := migrations.Version(databaseURL)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("database at migration %d (dirty=%t)\n", version, dirty)
	case "version":
		version, dirty, err := migrations.Version(databaseURL)
		if errors.Is(err, migrate.ErrNilVersion) {
			fmt.Println("database has no recorded migration")
			return
		}
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("database at migration %d (dirty=%t)\n", version, dirty)
	}
}
