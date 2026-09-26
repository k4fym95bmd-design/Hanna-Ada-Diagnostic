# External CI fallback for PR #35

GitHub-hosted Actions are intentionally guarded while GitHub fails before runner allocation.

This fallback is CI-only and provider-separated:

- CircleCI: Linux JavaScript regression tests, Windows Desktop PRO JavaScript/Rust policy tests, and Android USB-probe tests/build.
- Codemagic: native iOS simulator build and unit tests on macOS.

## Safety boundary

The fallback validates code only. It must not add or exercise vehicle write operations, arbitrary TX, DTC clearing, coding, actuation, flashing, tuning, or vehicle control.

Real K+DCAN hardware validation is a separate field-test step.

## CircleCI

Connect only the private repository:

`k4fym95bmd-design/Hanna-Ada-Diagnostic`

Use branch:

`feat/read-only-workshop-fusion-20260922`

Trigger the pipeline manually and set the enum parameter:

`fallback_target`

Allowed values:

- `core` — full JavaScript regression suite.
- `windows` — Desktop PRO JavaScript plus native Rust transport-policy tests.
- `android` — Android USB-probe unit tests plus debug APK.
- `all` — all three targets.
- `none` — default; allocates no fallback job.

Prefer one target at a time to conserve CI credits.

## Codemagic

Add the same private GitHub repository, choose branch:

`feat/read-only-workshop-fusion-20260922`

Then manually start workflow:

`ios-native-readonly`

There is deliberately no `triggering` section, so this workflow remains manual-only.

Expected retained artifacts include:

- Xcode simulator-build log.
- Xcode unit-test log.
- simulator `.app` output when produced.

## Interpreting results

A provider PASS is evidence only for the exact commit SHA reported by that provider. It is not proof of real vehicle connectivity.

Hardware acceptance still requires a real read-only session with captured evidence and no stale-data promotion.

## Secret handling

Do not commit CI tokens or GitHub credentials.

Use provider GitHub Apps/integrations or encrypted secret stores only.

## GitHub Actions

Keep the PR #35 draft guards in place until a controlled GitHub-hosted runner probe receives a real runner and starts executing steps.
