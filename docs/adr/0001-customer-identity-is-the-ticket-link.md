# Customer identity is the Ticket link, not an account

Customers never register. A Ticket is held through its unguessable Ticket link, which works from any device, so losing a cookie or switching phones does not lose the Ticket. A device cookie exists only to enforce the limit of 3 active Tickets per Queue per device; it is best-effort and clearing it bypasses the limit, which we accept because the Owner can Skip no-shows.

## Considered Options

- Cookie/localStorage as the identity: rejected, loses the Ticket when the browser data is cleared.
- Optional phone number for notifications: rejected, adds personal data and an SMS/LINE integration; Web Push (opt-in) covers notification.

## Consequences

- Anyone with the link can view or Cancel that Ticket.
- Walk-in Tickets have no link and are followed on the Display board by Ticket number.
