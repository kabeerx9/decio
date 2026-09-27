-- Preserve access for existing accounts that already supplied a name and city.
-- New accounts must complete onboarding explicitly through the API.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'profiles' AND column_name = 'onboarding_completed_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
        UPDATE profiles SET onboarding_completed_at = NOW() WHERE display_name <> '' AND city <> '';
    END IF;
END $$;
