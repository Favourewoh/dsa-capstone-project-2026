PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
  role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('organizer', 'attendee', 'staff')),
  password_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  venue TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL CHECK (length(trim(starts_at)) > 0),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0 AND sold <= capacity),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE CHECK (length(trim(reference)) > 0),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id TEXT NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL CHECK (length(trim(attendee_name)) > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  created_at TEXT NOT NULL,
  paid_at TEXT,
  cancelled_at TEXT,
  payment_transaction_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tier_id ON bookings(tier_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);