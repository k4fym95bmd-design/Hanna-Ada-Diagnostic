# Desktop PRO local self-test

GitHub Actions for this repository can currently fail before the first workflow step, so Desktop PRO has a local verification path that does not depend on the hosted runner.

Run from the repository root:

```
npm run selftest:desktop-pro
```

The self-test performs:
- syntax checks for the Desktop PRO/evidence JavaScript modules;
- all Desktop PRO read-only/evidence regression tests;
- trusted identity replay/echo/stale/conflict/fault-injection tests;
- Rust `cargo test` for the Tauri host when Cargo is installed.

Cargo is optional for the JavaScript/evidence part; the report will mark Rust tests as `SKIP` when the Rust toolchain is unavailable.

A local PASS does not prove physical K+DCAN/vehicle compatibility. Hardware validation remains a separate gate.
