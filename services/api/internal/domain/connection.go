package domain

import "errors"

var ErrConnectionExists = errors.New("connection already exists")
var ErrConnectionNotFound = errors.New("pending connection not found")

type Connection struct {
	Other  Profile `json:"other"`
	Status string  `json:"status"`
}
