ALTER TABLE places ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE trips ADD COLUMN activity bigint NOT NULL DEFAULT 0;
CREATE TABLE trip_links (
 id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips ON DELETE CASCADE,
 hash text NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('invite','public','login','members')),
 role text NOT NULL CHECK(role IN ('viewer','editor','admin')), expires_at timestamptz NOT NULL
);
CREATE INDEX trip_links_trip ON trip_links(trip_id);
CREATE FUNCTION bump_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE trips SET activity=activity+1 WHERE id=COALESCE(NEW.trip_id,OLD.trip_id);
 RETURN NULL;
END $$;
CREATE TRIGGER places_activity AFTER INSERT OR UPDATE OR DELETE ON places FOR EACH ROW EXECUTE FUNCTION bump_activity();
CREATE TRIGGER member_activity AFTER INSERT OR UPDATE OR DELETE ON trip_members FOR EACH ROW EXECUTE FUNCTION bump_activity();
CREATE TRIGGER links_activity AFTER INSERT OR UPDATE OR DELETE ON trip_links FOR EACH ROW EXECUTE FUNCTION bump_activity();
INSERT INTO schema_migrations VALUES ('004');
