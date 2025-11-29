# SCMTP Ticketing Service

A microservice for managing bus/transport ticket bookings with **CQRS (Command Query Responsibility Segregation)** pattern implementation.

## 📋 Overview

The Ticketing Service is part of the SCMTP (Smart City Mass Transport Platform) ecosystem. It handles:

- **Ticket Booking** - Direct booking and reservations
- **CQRS Pattern** - Separate read and write models for scalability
- **Saga Participation** - Works with Payment Service for distributed transactions
- **Event Publishing** - Publishes domain events to Kafka for notifications and other services

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ticketing Service                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   REST API  │    │  Commands   │    │      Queries        │ │
│  │  (Express)  │───►│  Handlers   │    │     Handlers        │ │
│  └─────────────┘    └──────┬──────┘    └──────────┬──────────┘ │
│                            │                       │            │
│                            ▼                       ▼            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Event Publisher                         ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│             ▼               ▼               ▼                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Write DB    │  │   Read DB    │  │    Kafka     │          │
│  │ (PostgreSQL) │  │ (PostgreSQL) │  │   Broker     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                             ▲                                   │
│                             │                                   │
│  ┌──────────────────────────┴──────────────────────────────────┐│
│  │              Ticket Projector (Event Consumer)              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.x
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- Kafka (Confluent Platform 7.x)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd scmtp-ticketing-service

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env with your configuration
```

### Running with Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, Redis, Kafka, Zookeeper, Kafka UI)
docker-compose up -d

# Run database migrations
npm run migrate

# Seed test data (optional)
npm run seed

# Start the service in development mode
npm run dev
```

### Running Locally (Development)

```bash
# Ensure PostgreSQL, Redis, and Kafka are running

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Building for Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Or build Docker image
docker build -t scmtp-ticketing-service:latest .
```

## 📚 API Reference

### Base URL

```
http://localhost:3002/api
```

### Authentication

All endpoints (except health) require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Command Endpoints (Write Operations)

#### Book a Ticket

```http
POST /api/tickets/commands/book
Content-Type: application/json
Authorization: Bearer <token>

{
  "routeId": "uuid",
  "scheduleId": "uuid",
  "seatNumber": "A1",           // optional
  "passengerName": "John Doe",
  "passengerEmail": "john@example.com",
  "passengerPhone": "+1234567890",  // optional
  "price": 25.00,
  "currency": "USD"             // optional, defaults to USD
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "routeId": "uuid",
    "scheduleId": "uuid",
    "status": "PENDING",
    "price": 25.00,
    "currency": "USD",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "correlationId": "uuid"
  }
}
```

#### Reserve a Ticket (Saga Step)

```http
POST /api/tickets/commands/reserve
```

Creates a temporary reservation that expires after a specified duration.

#### Confirm a Ticket (Saga Step)

```http
POST /api/tickets/commands/confirm

{
  "bookingId": "uuid",
  "paymentId": "uuid"
}
```

#### Cancel a Ticket

```http
POST /api/tickets/commands/cancel

{
  "bookingId": "uuid",
  "reason": "Customer requested cancellation"  // optional
}
```

### Query Endpoints (Read Operations)

#### Get My Tickets

```http
GET /api/tickets/queries/my-tickets?status=CONFIRMED&page=1&limit=10
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "routeName": "Downtown Express",
      "departureTime": "2024-01-16T08:00:00.000Z",
      "arrivalTime": "2024-01-16T09:00:00.000Z",
      "originStop": "Central Station",
      "destinationStop": "Airport Terminal",
      "seatNumber": "A1",
      "status": "CONFIRMED",
      "price": 25.00
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

#### Get Ticket Details

```http
GET /api/tickets/queries/:bookingId
```

### Health Endpoints

```http
GET /api/health          # Basic health check
GET /api/health/live     # Kubernetes liveness probe
GET /api/health/ready    # Kubernetes readiness probe (checks DB, Redis)
```

## 📦 Project Structure

```
scmtp-ticketing-service/
├── src/
│   ├── commands/           # CQRS Command Handlers
│   │   ├── bookTicket.ts
│   │   ├── reserveTicket.ts
│   │   ├── confirmTicket.ts
│   │   ├── cancelTicket.ts
│   │   └── index.ts
│   ├── queries/            # CQRS Query Handlers
│   │   ├── getUserTickets.ts
│   │   ├── getTicketDetails.ts
│   │   └── index.ts
│   ├── events/             # Domain Events
│   │   ├── types.ts
│   │   └── publisher.ts
│   ├── projections/        # Event Projectors (Read Model Updates)
│   │   └── ticketProjector.ts
│   ├── models/             # Data Models & DTOs
│   │   └── booking.ts
│   ├── routes/             # Express Routes
│   │   ├── commands.ts
│   │   ├── queries.ts
│   │   ├── health.ts
│   │   └── index.ts
│   ├── middleware/         # Express Middleware
│   │   ├── auth.ts
│   │   ├── validate.ts
│   │   └── errorHandler.ts
│   ├── infrastructure/     # Infrastructure Layer
│   │   ├── database/
│   │   │   ├── writeDb.ts
│   │   │   ├── readDb.ts
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   ├── cache/
│   │   │   └── redis.ts
│   │   └── messaging/
│   │       └── kafka.ts
│   ├── utils/              # Utilities
│   │   ├── logger.ts
│   │   └── errors.ts
│   ├── config/             # Configuration
│   │   └── index.ts
│   └── index.ts            # Application Entry Point
├── k8s/                    # Kubernetes Manifests
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3002 |
| `POSTGRES_WRITE_HOST` | Write DB host | localhost |
| `POSTGRES_WRITE_PORT` | Write DB port | 5432 |
| `POSTGRES_WRITE_USER` | Write DB user | postgres |
| `POSTGRES_WRITE_PASSWORD` | Write DB password | postgres |
| `POSTGRES_WRITE_DB` | Write DB name | ticketing_write |
| `POSTGRES_READ_*` | Read DB config | Same as write |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `KAFKA_BROKERS` | Kafka broker addresses | localhost:9092 |
| `JWT_SECRET` | JWT signing secret | - |

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📊 CQRS Pattern Implementation

### Command Side (Write Model)

- Uses PostgreSQL as the primary write database
- Stores complete booking records with full transaction support
- Maintains event store for audit trail
- Publishes domain events to Kafka after successful writes

### Query Side (Read Model)

- Separate PostgreSQL database optimized for reads
- Denormalized views for fast query performance
- Redis caching for frequently accessed data
- Updated asynchronously via event projections

### Event Flow

1. Command handler receives request
2. Validates and processes in transaction
3. Stores event in event store
4. Publishes event to Kafka
5. Projector consumes event and updates read model
6. Query handlers serve from read model

## 🔄 Saga Integration

The service participates in the Payment Saga:

1. **Reserve** - Creates temporary booking (15 min expiry)
2. **Confirm** - Confirms booking after payment success
3. **Cancel** - Rollback on payment failure

## 📡 Kafka Topics

| Topic | Description |
|-------|-------------|
| `ticket-events` | All ticket domain events |
| `payment-events` | Payment events (consumed) |
| `wallet-events` | Wallet events (consumed) |

## 🚢 Deployment

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -l app=ticketing-service
```

### Docker

```bash
# Build image
docker build -t scmtp-ticketing-service:latest .

# Push to registry
docker push your-registry/scmtp-ticketing-service:latest
```

## 🔒 Security

- JWT-based authentication
- Rate limiting (100 requests/15 min per IP)
- Helmet.js security headers
- Input validation with Zod
- Non-root Docker user

## 📝 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

