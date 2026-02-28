-- Add Expo push token support to push_subscriptions
-- This allows native iOS apps using Expo to receive push notifications
-- alongside existing web push subscriptions.

-- expo_push_token: nullable TEXT column; populated when a native app registers
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Allow rows where there is only an expo token (no web-push endpoint/keys).
-- Web push rows have a unique endpoint; expo-only rows will have endpoint = expo_push_token.
-- We store the expo token in endpoint too so the UNIQUE constraint still works,
-- but keys can be null for expo-only rows.
ALTER TABLE push_subscriptions
  ALTER COLUMN keys DROP NOT NULL;
