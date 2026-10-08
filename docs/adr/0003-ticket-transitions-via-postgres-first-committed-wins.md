# Ticket status changes go through PostgreSQL transactions, first committed wins

Every Ticket status transition (Call, Start, Complete, Skip, Cancel, Drop, auto-Skip) is decided in a PostgreSQL transaction, not by in-memory locks or a single-process actor. The first committed transition wins; the loser receives an explicit refusal and its UI refreshes. This keeps behaviour correct when the API runs as more than one instance, at the cost of a database round trip per transition. Races to cover: Owner on two devices, Customer Cancel vs Call, auto-Skip vs Start, simultaneous joins allocating Ticket numbers.

## Considered Options

- In-memory lock per Queue: rejected, wrong as soon as there are two instances.
- Single-writer actor/channel per Queue: rejected, same single-instance limit and extra moving parts.

## Consequences

- Ticket number allocation and the Owner's one-Ticket-at-a-time hold must be enforced by database constraints or atomic statements, not by application checks alone.
- The auto-Skip timer must itself transition through the same transaction path.
