# System Architecture

## Layered Architecture

```mermaid
flowchart TB
    Routes["Routes"]
    Services["Services"]
    Rules["Rules"]
    Repositories["Repositories"]

    Routes --> Services
    Services --> Rules
    Services --> Repositories
    Rules -.-> Repositories
```

- **Routes:** A route may parse incoming HTTP requests and format JSON responses or status codes, and may not contain business rules, state transition logic, or direct repository mutations.
- **Services:** A service may coordinate use cases across rules and repositories, and may not handle raw HTTP transport details or bypass domain rules.
- **Rules:** A rule may enforce domain invariants, validate inputs, and evaluate state transitions, and may not depend on HTTP layers or call upward into services or routes.
- **Repositories:** A repository may store, retrieve, and query domain records and queues, and may not enforce business policy or call services or routes.

## Data Model

```mermaid
erDiagram
    USERS {
        string id PK
        string name
        string email
        string role
    }
    EVENTS {
        string id PK
        string title
        string city
        string venue
        string startsAt
        boolean published
    }
    TICKET_TIERS {
        string id PK
        string eventId FK
        string name
        int priceCents
        int capacity
        int seatsLeft
    }
    BOOKINGS {
        string id PK
        string reference UK
        string eventId FK
        string tierId FK
        string userId FK
        string attendeeName
        int quantity
        int totalCents
        string status
        string createdAt
        string cancelledAt
    }

    EVENTS ||--o{ TICKET_TIERS : has
    EVENTS ||--o{ BOOKINGS : receives
    TICKET_TIERS ||--o{ BOOKINGS : allocates
    USERS ||--o{ BOOKINGS : owns
```

## Booking Life Cycle

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> paid : pay
    pending --> cancelled : cancel
    paid --> checked_in : check in
    paid --> refunded : refund
    paid --> cancelled : cancel
    cancelled --> [*]
    refunded --> [*]
    checked_in --> [*]
```