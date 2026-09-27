package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

type PostStore interface {
	CreatePost(ctx context.Context, authorID, body string, photo []byte, photoType string) (domain.Post, error)
	ListPosts(ctx context.Context, viewerID, cursor string) (domain.PostPage, error)
	PostPhoto(ctx context.Context, viewerID, postID string) ([]byte, string, error)
	CreateReply(ctx context.Context, authorID, postID, body string) (domain.PostReply, error)
	ListReplies(ctx context.Context, viewerID, postID, cursor string) (domain.ReplyPage, error)
}

func registerPostRoutes(mux *http.ServeMux, store PostStore, authenticate Middleware) {
	mux.Handle("POST /v1/posts/{id}/replies", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		postID := r.PathValue("id")
		if !validPostID(postID) {
			http.Error(w, "invalid post ID", http.StatusBadRequest)
			return
		}
		var input struct {
			Body string `json:"body"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			http.Error(w, "invalid reply JSON", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "expected one reply object", http.StatusBadRequest)
			return
		}
		body := strings.TrimSpace(input.Body)
		if n := utf8.RuneCountInString(body); n < 1 || n > 1000 || !utf8.ValidString(body) {
			http.Error(w, "reply text must be 1–1000 characters", http.StatusBadRequest)
			return
		}
		reply, err := store.CreateReply(r.Context(), id, postID, body)
		switch {
		case errors.Is(err, domain.ErrPostNotFound):
			http.Error(w, "post not found", http.StatusNotFound)
		case err != nil:
			log.Printf("create reply: %v", err)
			http.Error(w, "reply unavailable", http.StatusInternalServerError)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(reply)
		}
	})))
	mux.Handle("GET /v1/posts/{id}/replies", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		postID := r.PathValue("id")
		if !validPostID(postID) {
			http.Error(w, "invalid post ID", http.StatusBadRequest)
			return
		}
		cursor := r.URL.Query().Get("cursor")
		if cursor != "" && !validPostID(cursor) {
			http.Error(w, "invalid cursor", http.StatusBadRequest)
			return
		}
		page, err := store.ListReplies(r.Context(), id, postID, cursor)
		switch {
		case errors.Is(err, domain.ErrPostNotFound):
			http.Error(w, "post not found", http.StatusNotFound)
		case err != nil:
			log.Printf("list replies: %v", err)
			http.Error(w, "replies unavailable", http.StatusInternalServerError)
		default:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(page)
		}
	})))
	mux.Handle("POST /v1/posts", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 7<<20)
		if err := r.ParseMultipartForm(3 << 20); err != nil {
			http.Error(w, "invalid or oversized post", http.StatusBadRequest)
			return
		}
		defer r.MultipartForm.RemoveAll()
		if len(r.MultipartForm.Value["body"]) != 1 || len(r.MultipartForm.File["photo"]) > 1 {
			http.Error(w, "expected text and at most one photo", http.StatusBadRequest)
			return
		}
		body := strings.TrimSpace(r.FormValue("body"))
		if n := utf8.RuneCountInString(body); n < 1 || n > 1000 || !utf8.ValidString(body) {
			http.Error(w, "post text must be 1–1000 characters", http.StatusBadRequest)
			return
		}
		var photo []byte
		var photoType string
		if files := r.MultipartForm.File["photo"]; len(files) == 1 {
			file, err := files[0].Open()
			if err != nil {
				http.Error(w, "invalid photo", http.StatusBadRequest)
				return
			}
			defer file.Close()
			photo, err = io.ReadAll(io.LimitReader(file, 6<<20))
			if err != nil || len(photo) >= 6<<20 {
				http.Error(w, "photo is too large", http.StatusBadRequest)
				return
			}
			photo, photoType, err = cleanPhoto(photo)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
		post, err := store.CreatePost(r.Context(), id, body, photo, photoType)
		switch {
		case errors.Is(err, domain.ErrProfileIncomplete):
			http.Error(w, "add your city to your profile first", http.StatusBadRequest)
		case err != nil:
			log.Printf("create post: %v", err)
			http.Error(w, "post unavailable", http.StatusInternalServerError)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(post)
		}
	})))
	mux.Handle("GET /v1/posts", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		cursor := r.URL.Query().Get("cursor")
		if cursor != "" {
			value, err := strconv.ParseInt(cursor, 10, 64)
			if err != nil || value < 1 {
				http.Error(w, "invalid cursor", http.StatusBadRequest)
				return
			}
		}
		page, err := store.ListPosts(r.Context(), id, cursor)
		if err != nil {
			log.Printf("list posts: %v", err)
			http.Error(w, "posts unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(page)
	})))
	mux.Handle("GET /v1/posts/{id}/photo", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		postID := r.PathValue("id")
		value, err := strconv.ParseInt(postID, 10, 64)
		if err != nil || value < 1 {
			http.Error(w, "invalid post ID", http.StatusBadRequest)
			return
		}
		photo, kind, err := store.PostPhoto(r.Context(), id, postID)
		if errors.Is(err, domain.ErrPostNotFound) {
			http.Error(w, "photo not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("load post photo: %v", err)
			http.Error(w, "photo unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", kind)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = w.Write(photo)
	})))
}

func validPostID(id string) bool {
	value, err := strconv.ParseInt(id, 10, 64)
	return err == nil && value > 0
}

// Re-encoding strips metadata and fixes the stored media type to decoded pixels.
func cleanPhoto(raw []byte) ([]byte, string, error) {
	var decoded image.Image
	var err error
	contentType := http.DetectContentType(raw)
	if contentType != "image/jpeg" && contentType != "image/png" {
		return nil, "", errors.New("choose a JPEG or PNG photo")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || int64(config.Width)*int64(config.Height) > 12_000_000 {
		return nil, "", errors.New("photo dimensions are too large or invalid")
	}
	decoded, _, err = image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", errors.New("invalid photo")
	}
	var output bytes.Buffer
	if contentType == "image/jpeg" {
		err = jpeg.Encode(&output, decoded, &jpeg.Options{Quality: 80})
	} else {
		err = png.Encode(&output, decoded)
	}
	if err != nil || output.Len() > 2<<20 {
		return nil, "", errors.New("photo must be 2 MB or smaller after processing")
	}
	return output.Bytes(), contentType, nil
}
