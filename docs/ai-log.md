# AI Log

## Build 1: Domain core in the terminal

### Prompt & Initial Build
- **What I asked:** Created the Build 1 Event Ticketing domain modules (`errors.js`, `ids.js`, `waitlistQueue.js`, `inventory.js`), scripts (`demo.js`, `benchmark-lookup.js`), and `package.json` (`"type": "module"`) following `README.md` and `docs/build-1.md` rules (whole cents, input validation with `DomainError`, no state mutation on failed bookings, `node:crypto` IDs/references, linked-list FIFO queue, and `Map` lookup).
- **What came back:** Plain ES module implementations of `DomainError`, `newId()`/`newReference()`, `WaitlistQueue` with private fields (`#head`, `#tail`, `#size`), `createStore()` in `inventory.js`, `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What was wrong (and what I changed):**
  - At first glance at the benchmark output (`Array.find: 853.561 ms`, `Map.get: 1.338 ms`), I misread `Array.find` as faster because its number appeared first, whereas lower milliseconds means faster execution (`Map.get` was ~637.9x faster).
  - *Review check:* Verified `cancelBooking` behavior (releases seats and peeks at the next person in line rather than dequeuing prematurely before a waitlist offer flow exists), confirmed `bookTickets` checks `tier.seatsLeft < qty` before mutating seats, and checked that `findBookingByReference` returns a shallow copy.