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

## Build 4: Working REST API (in memory)

### What Was Asked
- Implement Build 4 of the Event Ticketing capstone in plain ES modules (Node 22.13+, no external packages) following the layered architecture (`Routes -> Services -> Rules -> Repositories`)[cite: 3, 5].
- Add an async in-memory repository (`src/repositories/memory.js`), services (`src/services/eventService.js`, `src/services/bookingService.js`) reusing `src/domain/` rules, a mock payment gateway (`src/lib/mockPaymentGateway.js`) that never handles card numbers, REST routes with `x-user-id` caller identification, `docs/api-examples.md`, and API tests using `node:test` on a free port[cite: 3].
- Enforce whole-cent money handling, leave bookings `pending` on declined payments, and allow only the booking owner to pay[cite: 3].

### What Came Back & What Was Checked / Adjusted
- Added `INVALID_TRANSITION` and `PAYMENT_DECLINED` to `ErrorCodes` in `src/domain/errors.js`[cite: 3, 12].
- Created `src/repositories/memory.js` with async methods for events, tiers, and bookings, and injected it into `eventService` and `bookingService` rather than importing the repository inside services[cite: 3].
- Built `src/services/eventService.js` and `src/services/bookingService.js` reusing `searchEvents` and `assertTransition` from `src/domain/`[cite: 3, 11, 13].
- Built `src/lib/mockPaymentGateway.js` with an async `charge()` method that returns approval or throws `PAYMENT_DECLINED` without accepting card numbers[cite: 3].
- Added REST route handlers in `src/http/routes/apiRoutes.js`, wired services in `src/server.js`, and mapped `PAYMENT_DECLINED` to HTTP `402` in `src/http/app.js` while keeping uniform `{"error":{"code","message"}}` error responses[cite: 3, 9].
- Added `docs/api-examples.md` with `curl` examples (create, tier, publish, search, book, pay, decline, and cancel) and `test/build-4.test.js` starting the server on a free port[cite: 3].

### Verification & Open Questions
- Ran `npm test` and confirmed all 14 tests pass (`pass 14`, `fail 0`) across Build 3, Build 4 REST API, and Build 2 Domain & Search[cite: 18].
- **Uncertainties to verify:** Whether `PAYMENT_DECLINED` should map to HTTP `402` or another status code (`400`/`409`), whether `CONFLICT` (`409`) is the preferred code when a non-owner attempts to pay or cancel a booking, and whether any full role/organizer ownership checks should wait until Build 7[cite: 3, 4].

## Build 5: SQLite and the overselling fix

### What Was Asked
- **Prompt 1:** Move storage to SQLite (`node:sqlite`, plain ES modules, Node 22.13+, no outside packages) with `src/db/schema.sql`, `src/db/connection.js`, and `src/repositories/sqlite.js` matching `memory.js` using parameterized `?` queries[cite: 17]. Add an idempotent `scripts/seed.js` (`npm run seed`) and an unfixed `scripts/oversell-demo.js` (`npm run oversell`) firing 50 concurrent bookings at 1 remaining seat[cite: 17].
- **Prompt 2:** Fix overselling in the database using a single atomic `UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity` statement checking `changes`, without lock variables or double-checking in JavaScript[cite: 17]. Add `test/oversell.test.js` and compare before-and-after demo results[cite: 17].

### What Came Back & What Was Caught / Fixed
- Added `src/db/schema.sql` (`users`, `events`, `ticket_tiers`, `bookings` with `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, and `CHECK (sold >= 0 AND sold <= capacity)` constraints), `src/db/connection.js`, and `src/repositories/sqlite.js`[cite: 17].
- Added `scripts/seed.js`, `scripts/oversell-demo.js`, `"seed"` and `"oversell"` scripts in `package.json`, and updated `src/server.js` to persist data in SQLite across restarts[cite: 17].
- **Bug caught during Prompt 2 verification:** After adding `reserveSeats` to `src/repositories/sqlite.js`, `test/oversell.test.js` initially failed (`50 !== 1`) because `src/services/bookingService.js` was still reading `tier.seatsLeft` in JavaScript and calling `saveTier` instead of delegating to `repository.reserveSeats`[cite: 20, 21, 22]. Updated `createBooking` in `src/services/bookingService.js` to call `repository.reserveSeats` directly[cite: 17].
- **Before vs. After (`npm run oversell`):**
  - Before fix: `Bookings succeeded: 50`, `Seats sold: 0` (race condition overwrote `sold`)[cite: 19].
  - After fix: `Bookings succeeded: 1`, `Seats sold: 1` (49 rejected with `SOLD_OUT`)[cite: 17, 23].
- **Why locks and double-checks fail:** A JS lock variable only coordinates within a single process and breaks across multiple processes or database connections, while checking seat availability twice still leaves a race window between the read and write[cite: 17].

### Verification & Open Questions
- Verified `npm run oversell` outputs `Bookings succeeded: 1` and `Seats sold: 1`[cite: 23].
- Verified `npm test` passes all 15 tests across 5 suites (`pass 15`, `fail 0`), including `test/oversell.test.js`[cite: 23, 24].
- **Uncertainties:** `sqlite.js` inserts a lightweight placeholder row into `users` when saving an event or booking with a new `x-user-id` so foreign key constraints pass before Build 7 authentication is implemented; also, `reserveSeats` checks tier existence first so missing tiers return `NOT_FOUND` while sold-out tiers return `SOLD_OUT`[cite: 17].