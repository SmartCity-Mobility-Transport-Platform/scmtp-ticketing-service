import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';

// Seed data for testing
const seedData = async (): Promise<void> => {
  console.log('Seeding database with test data...\n');

  const writePool = new Pool({
    host: config.writeDb.host,
    port: config.writeDb.port,
    user: config.writeDb.user,
    password: config.writeDb.password,
    database: config.writeDb.database,
  });

  const readPool = new Pool({
    host: config.readDb.host,
    port: config.readDb.port,
    user: config.readDb.user,
    password: config.readDb.password,
    database: config.readDb.database,
  });

  try {
    // Generate sample data
    const testUserId = uuidv4();
    const testRouteId = uuidv4();
    const testScheduleId = uuidv4();

    console.log('Test User ID:', testUserId);
    console.log('Test Route ID:', testRouteId);
    console.log('Test Schedule ID:', testScheduleId);

    // Seed seat availability for a schedule
    console.log('\nSeeding seat availability...');
    const seats = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2'];
    
    for (const seat of seats) {
      await writePool.query(
        `INSERT INTO seat_availability (id, schedule_id, seat_number, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (schedule_id, seat_number) DO NOTHING`,
        [uuidv4(), testScheduleId, seat, 'AVAILABLE']
      );
    }
    console.log(`Created ${seats.length} seat availability records`);

    // Seed a sample confirmed booking
    const bookingId = uuidv4();
    console.log('\nSeeding sample booking...');
    
    await writePool.query(
      `INSERT INTO bookings (
        id, user_id, route_id, schedule_id, seat_number,
        passenger_name, passenger_email, passenger_phone,
        price, currency, status, confirmed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING`,
      [
        bookingId,
        testUserId,
        testRouteId,
        testScheduleId,
        'A1',
        'John Doe',
        'john.doe@example.com',
        '+1234567890',
        25.00,
        'USD',
        'CONFIRMED',
        new Date(),
      ]
    );
    console.log('Created sample booking:', bookingId);

    // Seed read model
    console.log('\nSeeding read model...');
    await readPool.query(
      `INSERT INTO user_tickets_view (
        id, user_id, route_id, route_name, schedule_id,
        departure_time, arrival_time, origin_stop, destination_stop,
        seat_number, passenger_name, passenger_email,
        price, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING`,
      [
        bookingId,
        testUserId,
        testRouteId,
        'Downtown Express',
        testScheduleId,
        new Date(Date.now() + 86400000), // Tomorrow
        new Date(Date.now() + 86400000 + 3600000), // 1 hour later
        'Central Station',
        'Airport Terminal',
        'A1',
        'John Doe',
        'john.doe@example.com',
        25.00,
        'USD',
        'CONFIRMED',
      ]
    );
    console.log('Created read model entry');

    // Seed schedule availability
    await readPool.query(
      `INSERT INTO schedule_availability_view (schedule_id, total_seats, booked_seats)
       VALUES ($1, $2, $3)
       ON CONFLICT (schedule_id) DO UPDATE SET booked_seats = $3`,
      [testScheduleId, 50, 1]
    );
    console.log('Created schedule availability record');

    console.log('\n✅ Seed data created successfully!');
    console.log('\nUse these IDs for testing:');
    console.log(`  User ID: ${testUserId}`);
    console.log(`  Route ID: ${testRouteId}`);
    console.log(`  Schedule ID: ${testScheduleId}`);
    console.log(`  Booking ID: ${bookingId}`);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    await writePool.end();
    await readPool.end();
  }
};

seedData();

