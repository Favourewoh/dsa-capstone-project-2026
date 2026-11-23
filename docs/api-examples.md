# Build 4 API Examples (`curl`)

Start the server first:

```bash
npm run start
```

All money values are in **whole cents** (`5000` = $50.00). Caller identity uses `x-user-id`.

## 1. Create an Event (`POST /api/events`)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "title": "Lagos Tech Summit",
    "city": "Lagos",
    "venue": "Landmark Centre",
    "startsAt": "2026-12-15T10:00:00.000Z"
  }'
```

## 2. Add a Ticket Tier (`POST /api/events/:id/tiers`)

Replace `<EVENT_ID>` with the `id` returned from step 1:

```bash
curl -s -X POST http://localhost:3000/api/events/<EVENT_ID>/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "name": "Regular Pass",
    "priceCents": 2500,
    "capacity": 100
  }'
```

## 3. Publish the Event (`POST /api/events/:id/publish`)

```bash
curl -s -X POST http://localhost:3000/api/events/<EVENT_ID>/publish \
  -H "x-user-id: organizer-1"
```

## 4. Search, Filter, and Sort Published Events (`GET /api/events`)

```bash
curl -s "http://localhost:3000/api/events?q=Summit&city=Lagos&maxPriceCents=5000&onlyAvailable=true&sortBy=price"
```

## 5. Book Tickets (`POST /api/bookings`)

Replace `<TIER_ID>` with the `id` returned from step 2:

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{
    "tierId": "<TIER_ID>",
    "attendeeName": "Ada Lovelace",
    "quantity": 2
  }'
```

## 6. Pay for a Booking (`POST /api/bookings/:reference/pay`)

Replace `<REFERENCE>` with `reference` (for example `TKT-...`) from step 5:

```bash
curl -s -X POST http://localhost:3000/api/bookings/<REFERENCE>/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{}'
```

### Declined Payment Example (`PAYMENT_DECLINED`)

A declined payment leaves the booking `pending` so you can retry:

```bash
curl -s -X POST http://localhost:3000/api/bookings/<REFERENCE>/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{"decline": true}'
```

## 7. Cancel an Unpaid Booking (`POST /api/bookings/:reference/cancel`)

```bash
curl -s -X POST http://localhost:3000/api/bookings/<REFERENCE>/cancel \
  -H "x-user-id: attendee-1"
```