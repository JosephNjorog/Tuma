-- AutoPayKe migration 0004: legal consent tracking on users
-- Records the timestamp, IP address, and document version when a user
-- explicitly accepts the Terms of Service and Privacy Policy during signup.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "terms_accepted_ip" text,
  ADD COLUMN IF NOT EXISTS "terms_version" text;
