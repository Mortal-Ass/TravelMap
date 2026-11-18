BEGIN;
CREATE TABLE places (
 id uuid PRIMARY KEY,
 trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 name text NOT NULL,
 category text NOT NULL CHECK(category IN ('景点','酒店','餐厅','交通','其他')),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 notes text NOT NULL DEFAULT ''
);
CREATE INDEX places_trip ON places(trip_id);
INSERT INTO schema_migrations VALUES ('002');
COMMIT;
