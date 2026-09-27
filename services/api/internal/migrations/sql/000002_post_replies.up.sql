CREATE TABLE IF NOT EXISTS post_replies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES city_posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES profiles(id),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_replies_post_id_idx ON post_replies (post_id, id);
ALTER TABLE post_replies ENABLE ROW LEVEL SECURITY;
