# BMW E39 540i V8 — Ignition Coils 1–8

Hanna & Ada exposes an explicit **Ignition Coils 1–8** diagnostic workspace for BMW E39 540i V8.

## User-facing path

- BMW E39 V8 → **Ignition Coils 1–8**
- Active Test → **Ignition Coil / Cylinder Cut-out**

## Generic OBD-II / Carista scope

The Carista/iPhone path may read stored generic misfire DTCs and correlate:

- P0300 — random / multiple-cylinder misfire
- P0301 — cylinder 1
- P0302 — cylinder 2
- P0303 — cylinder 3
- P0304 — cylinder 4
- P0305 — cylinder 5
- P0306 — cylinder 6
- P0307 — cylinder 7
- P0308 — cylinder 8

A P030x code identifies a cylinder misfire and must **not** be presented as proof that the ignition coil itself is defective.

The app also exposes a read-only guided coil swap workflow: record the cylinder code, move the suspected coil to another cylinder, reproduce the symptom, and re-read the fault memory. If the misfire follows the moved coil, the coil becomes the primary suspect.

## BMW active-test scope

Cylinder cut-out / coil activation is a BMW-specific bi-directional DME operation. It must remain capability-gated until all of the following are true:

1. BMW K-Line / DS2 / KWP-capable transport is verified.
2. Exact DME family is identified (M5.2/M5.2.1 PRE-TU or ME7.2 TU).
3. The DME-specific active-test job is validated on real hardware.
4. Required engine-state preconditions and an explicit stop path are implemented.

Carista generic OBD-II must not pretend to perform a BMW cylinder cut-out test.
