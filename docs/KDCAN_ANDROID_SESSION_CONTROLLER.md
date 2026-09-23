# K+DCAN Android transport session controller

`KdcanTransportSession` is the fail-closed state owner between physical USB evidence and the legacy DS2/KWP evidence ladder.

## Invariants

- Exactly one active logical cable session per controller.
- Every new bind increments a monotonic epoch.
- A stale session id or stale epoch is rejected.
- Only one request-correlation token may be outstanding.
- A response attempt consumes the token, including a failed/mismatched response.
- Disconnect, close and timeout purge pending evidence.
- Watchdog expiry invalidates the whole session.
- Unknown USB-serial families remain `UNKNOWN`.
- No state can set `ecuVerified=true` or `writesEnabled=true`.

## State progression

```
IDLE
  → BOUND
  → PORT_OPEN
  → REQUEST_BOUND
  → correlated evidence result
  → PORT_OPEN / explicit next request
```

Any disconnect or timeout:
```
* → DISCONNECTED / SESSION_EXPIRED
```

A reconnect creates a new epoch. Evidence from the previous epoch cannot be reused.

## Deliberate omissions

The controller has no Android USB handles, no serial read/write calls and no BMW command bytes. Those belong to a later transport adapter and must obey this controller's epoch/request gates.
