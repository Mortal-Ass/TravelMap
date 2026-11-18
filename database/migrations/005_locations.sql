CREATE TABLE location_shares (
 trip_id uuid NOT NULL, user_id uuid NOT NULL, grant_id uuid NOT NULL UNIQUE,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 recipients uuid[], expires_at timestamptz, latitude double precision, longitude double precision,
 accuracy double precision, sampled_at timestamptz, received_at timestamptz,
 PRIMARY KEY(trip_id,user_id),
 FOREIGN KEY(trip_id,user_id) REFERENCES trip_members(trip_id,user_id) ON DELETE CASCADE
);
CREATE INDEX location_expiry ON location_shares(expires_at);
CREATE FUNCTION remove_location_recipient() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE location_shares SET recipients=array_remove(recipients,OLD.user_id)
 WHERE trip_id=OLD.trip_id AND OLD.user_id=ANY(recipients);
 RETURN NULL;
END $$;
CREATE TRIGGER remove_recipient AFTER DELETE ON trip_members FOR EACH ROW EXECUTE FUNCTION remove_location_recipient();
INSERT INTO schema_migrations VALUES ('005');
