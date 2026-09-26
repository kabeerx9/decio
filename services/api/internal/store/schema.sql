CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS connections (
    user_low TEXT NOT NULL REFERENCES profiles(id),
    user_high TEXT NOT NULL REFERENCES profiles(id),
    requester_id TEXT NOT NULL REFERENCES profiles(id),
    recipient_id TEXT NOT NULL REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    PRIMARY KEY (user_low, user_high),
    CHECK (user_low < user_high),
    CHECK ((requester_id = user_low AND recipient_id = user_high) OR (requester_id = user_high AND recipient_id = user_low))
);

CREATE INDEX IF NOT EXISTS connections_recipient_idx ON connections (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connections_requester_idx ON connections (requester_id, created_at DESC);
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
