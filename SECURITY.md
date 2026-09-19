# Security policy — Hanna & Ada Diagnostics

## Supported code

This repository is a development prototype (`0.1.0`). Security fixes are applied to the latest `main` branch only; there are no supported 4.x or 5.x releases. An existing published site may lag behind `main` until its hosting provider allows a deployment.

The web interface is a diagnostic/catalog shell, not proof of a working physical BMW interface. A successful adapter handshake does not prove that an ECU was read. BMW module access requires verified hardware and an independently tested read-only transport. ECU writing, coding and flashing are not enabled in the web shell.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting option under this repository's **Security** tab if it is available. If it is not enabled, contact the repository owner privately instead of posting exploit details, vehicle identifiers, credentials or diagnostic logs in a public issue. No response time or security-support SLA is promised.

Do not include API tokens, VINs, Bluetooth device identifiers or other personal data in bug reports. Revoke any exposed credential at its provider before sharing a redacted reproduction.
