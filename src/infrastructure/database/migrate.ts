import { Pool } from 'pg';
import { config } from '../../config';

// Write Database Schema
const writeDbSchema = `
-- Bookings table (Write Model)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    route_id UUID NOT NULL,
    schedule_id UUID NOT NULL,
    seat_number VARCHAR(10),
    passenger_name VARCHAR(255) NOT NULL,
    passenger_email VARCHAR(255) NOT NULL,
    passenger_phone VARCHAR(20),
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_id UUID,
    reserved_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Write Model
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_route_schedule ON bookings(route_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_bookings_expires_at ON bookings(expires_at) WHERE status = 'RESERVED';

-- Event Store (for event sourcing/audit)
CREATE TABLE IF NOT EXISTS booking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB,
    correlation_id UUID,
    causation_id UUID,
    version INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_events_aggregate ON booking_events(aggregate_id, version);
CREATE INDEX IF NOT EXISTS idx_booking_events_type ON booking_events(event_type);

-- Seat availability tracking
CREATE TABLE IF NOT EXISTS seat_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    seat_number VARCHAR(10) NOT NULL,
    booking_id UUID REFERENCES bookings(id),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_seat_availability_schedule ON seat_availability(schedule_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_seat_availability_updated_at ON seat_availability;
CREATE TRIGGER update_seat_availability_updated_at
    BEFORE UPDATE ON seat_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Read Database Schema (CQRS Read Model)
const readDbSchema = `
-- User Tickets View (Read Model - Optimized for queries)
CREATE TABLE IF NOT EXISTS user_tickets_view (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    route_id UUID NOT NULL,
    route_name VARCHAR(255),
    schedule_id UUID NOT NULL,
    departure_time TIMESTAMP,
    arrival_time TIMESTAMP,
    origin_stop VARCHAR(255),
    destination_stop VARCHAR(255),
    seat_number VARCHAR(10),
    passenger_name VARCHAR(255) NOT NULL,
    passenger_email VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Read Model (optimized for common queries)
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_id ON user_tickets_view(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tickets_status ON user_tickets_view(status);
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_status ON user_tickets_view(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_tickets_departure ON user_tickets_view(departure_time);

-- Schedule Availability View (for checking seat availability)
CREATE TABLE IF NOT EXISTS schedule_availability_view (
    schedule_id UUID NOT NULL,
    total_seats INTEGER NOT NULL DEFAULT 50,
    booked_seats INTEGER NOT NULL DEFAULT 0,
    available_seats INTEGER GENERATED ALWAYS AS (total_seats - booked_seats) STORED,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_id)
);

-- Projection tracking (to track which events have been processed)
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(100) PRIMARY KEY,
    last_processed_event_id UUID,
    last_processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_user_tickets_view_updated_at ON user_tickets_view;
CREATE TRIGGER update_user_tickets_view_updated_at
    BEFORE UPDATE ON user_tickets_view
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

async function createDatabase(poolConfig: typeof config.writeDb, dbName: string): Promise<void> {
  const pool = new Pool({
    host: poolConfig.host,
    port: poolConfig.port,
    user: poolConfig.user,
    password: poolConfig.password,
    database: 'postgres', // Connect to default database first
  });

  try {
    const result = await pool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length === 0) {
      await pool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database ${dbName} created successfully`);
    } else {
      console.log(`Database ${dbName} already exists`);
    }
  } catch (error) {
    console.error(`Error creating database ${dbName}:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function runMigration(poolConfig: typeof config.writeDb, schema: string, dbType: string): Promise<void> {
  const pool = new Pool({
    host: poolConfig.host,
    port: poolConfig.port,
    user: poolConfig.user,
    password: poolConfig.password,
    database: poolConfig.database,
  });

  try {
    await pool.query(schema);
    console.log(`${dbType} database migration completed successfully`);
  } catch (error) {
    console.error(`Error running ${dbType} migration:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function migrate(): Promise<void> {
  console.log('Starting database migrations...\n');

  try {
    // Create databases if they don't exist
    console.log('Creating databases...');
    await createDatabase(config.writeDb, config.writeDb.database);
    await createDatabase(config.readDb, config.readDb.database);

    // Run migrations
    console.log('\nRunning Write DB migrations...');
    await runMigration(config.writeDb, writeDbSchema, 'Write');

    console.log('\nRunning Read DB migrations...');
    await runMigration(config.readDb, readDbSchema, 'Read');

    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
migrate();

