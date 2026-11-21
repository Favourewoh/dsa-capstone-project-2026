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

## Build 3: Architecture, State Machine, Server Skeleton

### Summary of Work
- Created `docs/architecture.md` with Mermaid diagrams for the layered architecture (with one sentence per layer stating what it may and may not do), the data model (`users`, `events`, `ticket tiers`, `bookings`), and the booking life cycle.
- Implemented `src/domain/bookingStateMachine.js` with states `pending`, `paid`, `cancelled`, `refunded`, and `checked_in`, exporting `canTransition` and `assertTransition` and throwing a `DomainError` with code `INVALID_TRANSITION` on illegal moves or terminal-state exits.
- Implemented `src/http/router.js` (method + path matching with `:params`) and `src/http/app.js` using `node:http` only, with `GET /health` returning `{"status":"ok"}`, uniform JSON error responses (`{"error":{"code","message"}}`), JSON 404s for unknown `/api` paths, JSON 400s for bad JSON, no stack traces leaked to clients, and path-traversal-safe static serving from `public/`.
- Added `src/config.js` and `src/server.js` using `PORT` (default `3000`) and added `"start": "node src/server.js"` to `package.json`.
- Added `test/build-3.test.js` covering all allowed and illegal booking transitions, router parameter matching, and HTTP integration checks (`/health`, `/api` 404, bad JSON 400, static files, and path traversal).

### Verification
- Verified `GET http://localhost:3000/health` returns HTTP `200` with `{"status":"ok"}`[cite: 3].
- Ran `npm test` and confirmed all 12 tests pass across Build 3 and Build 2 (`pass 12`, `fail 0`)[cite: 4].

### Uncertainties & Things to Double-Check
- **Error code definition in `errors.js`:** `src/domain/bookingStateMachine.js` falls back to `"INVALID_TRANSITION"` if `ErrorCodes.INVALID_TRANSITION` is not explicitly defined in `src/domain/errors.js`; confirm `INVALID_TRANSITION` is present in `ErrorCodes` if centralized error codes are enforced.
- **State casing vs. existing domain code:** Build 3 specifies lowercase booking states (`pending`, `paid`, `cancelled`, `refunded`, `checked_in`), whereas earlier domain code used uppercase statuses (`"CANCELLED"`). Existing `src/domain/inventory.js` behavior was left untouched and will be aligned when wiring the state machine into booking flows.
- **Traversal status code:** Blocked path-traversal requests outside `public/` return HTTP `403` (`FORBIDDEN_PATH`) in the `{"error":{"code","message"}}` JSON format.