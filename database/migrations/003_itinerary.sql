ALTER TABLE trips ADD COLUMN itinerary jsonb NOT NULL DEFAULT '[]', ADD COLUMN itinerary_version integer NOT NULL DEFAULT 0;
INSERT INTO schema_migrations VALUES ('003');
