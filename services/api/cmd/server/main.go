package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/kabeerx9/decio-update/services/api/internal/httpapi"
	"github.com/kabeerx9/decio-update/services/api/internal/postgres"
	"github.com/kabeerx9/decio-update/services/api/internal/realtime"
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
	storage, err := postgres.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer storage.Close()
	events, err := realtime.New(required("ABLY_API_KEY"))
	if err != nil {
		log.Fatalf("configure realtime: %v", err)
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.AllowOrigins(strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ","))(httpapi.NewHandler(storage, httpapi.ClerkAuth(), events)),
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
