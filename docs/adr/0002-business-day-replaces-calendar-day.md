# Business day, not calendar day, resets numbers and groups statistics

A Business day starts when the Owner opens a Queue and ends when its last Ticket is finished after closing. Ticket numbers restart and daily statistics group by Business day. A calendar-day reset would split shops that open past midnight into two days with a restarted counter mid-shift. Timestamps are stored in UTC and displayed in Asia/Bangkok; there is no per-Shop timezone.

## Consequences

- A Queue reopened the same calendar day starts a new Business day, so a Ticket number such as `A001` can appear twice on one date. Ticket identity is never the number.
- Hourly statistics (peak hours) still bucket by Asia/Bangkok clock hour.
- Shops outside Asia/Bangkok are not supported.
