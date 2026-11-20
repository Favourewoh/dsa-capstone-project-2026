# AI Log

## Build 1: Domain core in the terminal

### Prompt & Initial Build
- **What I asked:** Created the Build 1 Event Ticketing domain modules (`errors.js`, `ids.js`, `waitlistQueue.js`, `inventory.js`), scripts (`demo.js`, `benchmark-lookup.js`), and `package.json` (`"type": "module"`) following `README.md` and `docs/build-1.md` rules (whole cents, input validation with `DomainError`, no state mutation on failed bookings, `node:crypto` IDs/references, linked-list FIFO queue, and `Map` lookup).
- **What came back:** Plain ES module implementations of `DomainError`, `newId()`/`newReference()`, `WaitlistQueue` with private fields (`#head`, `#tail`, `#size`), `createStore()` in `inventory.js`, `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What was wrong (and what I changed):**
  - At first glance at the benchmark output (`Array.find: 853.561 ms`, `Map.get: 1.338 ms`), I misread `Array.find` as faster because its number appeared first, whereas lower milliseconds means faster execution (`Map.get` was ~637.9x faster).
  - *Review check:* Verified `cancelBooking` behavior (releases seats and peeks at the next person in line rather than dequeuing prematurely before a waitlist offer flow exists), confirmed `bookTickets` checks `tier.seatsLeft < qty` before mutating seats, and checked that `findBookingByReference` returns a shallow copy.


## Build 2: Event Search, Sorting, Publishing & Domain Tests

### Summary of Work
- Implemented `src/domain/sorting.js` (stable `mergeSort` without input mutation), `src/domain/inventory.js` (event creation, tier management, publishing/unpublishing, event summaries, and domain error enforcement), and `src/domain/eventSearch.js` (pure filtering, sorting, and search).
- Expanded `test/test.js` to verify `S02`–`S06` behaviors, immutability, tie-breaking/stability, and `DomainError` codes (`VALIDATION`, `NOT_FOUND`, `SOLD_OUT`, `CONFLICT`, `INVALID_STATE`).
- Verified `npm test` and `npm run demo` pass on the `build-2` branch.

### AI Issues & Fixes
- **What I asked:** Debugged `Missing expected exception` in `test/test.js` around line 269[cite: 2, 5].
- **What came back:** Initially pointed toward `bookTickets` capacity handling, while line 269 in `test/test.js` actually called `publishEvent(store, ev.id)` expecting `INVALID_STATE` on an event that already had a tier attached.
- **What was wrong (and what I changed):** Isolated the `ErrorCodes.INVALID_STATE` check onto a tierless event (`noTierEv`) in `test/test.js`[cite: 2], and updated `scripts/demo.js` to pass a non-empty `city` to `store.createEvent(...)` after `createEvent` required `city`.