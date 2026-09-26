package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/kabeerx9/decio-update/services/api/internal/api"
	"github.com/kabeerx9/decio-update/services/api/internal/store"
)

func main() {
	databaseURL := required("DATABASE_URL")
	clerk.SetKey(required("CLERK_SECRET_KEY"))
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	profiles, err := store.NewPostgres(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer profiles.Close()

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           api.AllowOrigins(strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ","))(api.NewHandler(profiles, api.ClerkAuth())),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("API listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}

func required(name string) string {
	value := os.Getenv(name)
	if value == "" {
		log.Fatalf("%s is required", name)
	}
	return value
}
