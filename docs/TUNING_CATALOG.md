# Hanna & Ada — Tuning / Map Store

Canonical tuning catalog for Hanna & Ada DIAG PRO.

## Product structure

Hanna & Ada supports **Stage 1–7** as numbered tuning tiers. **Stage 1–3** are the current commercial preset catalog. **Stage 4–7** are advanced custom tiers and are never treated as one-click generic maps: they require an exact ECU/stock-base match, validated hardware, logs/dyno data and engineering review where applicable.

**M5 Character / Booster remains a separate premium product**. It is not a numbered stage and must never be implemented as a blind S62/M5 binary copy into an M62/M62TU ECU.

| Product | Price | Marketing / availability | Intended use |
|---|---:|---|---|
| Stage 1 — Road Performance | €89 / VIN | UP TO +50 hp / +80 Nm | Compatible stock or near-stock hardware |
| Stage 2 — Sport Hardware | €149 / VIN | UP TO +80 hp / +130 Nm | Requires compatible supporting hardware |
| Stage 3 — Track / Forced Induction | €249 base | UP TO +120 hp | Custom/track/forced-induction workflow after hardware validation |
| Stage 4 — Custom Performance | Custom | Dyno/log + hardware validation required | Individually calibrated advanced setup |
| Stage 5 — Race / Track+ | Custom | Track hardware required | Advanced track-only custom build |
| Stage 6 — Motorsport / FI+ | Custom | Motorsport validation required | Motorsport / advanced forced-induction custom build |
| Stage 7 — Bespoke Engineering | Custom | Engineering review required | Fully bespoke calibration project |
| M5 Character / Booster | €179 | Vehicle-specific character calibration | Separate premium package; never a numbered stage |

\* All output figures are platform-, engine-, hardware-, fuel-, condition- and calibration-dependent. They are ceilings, not guaranteed gains. Stages 4–7 intentionally have no generic power promise or fixed retail price.

### Optional add-ons

- M5 Character Booster: +€49
- Exhaust Pack: +€39, compatible hardware only
- Throttle Sport+: +€29
- Custom Dyno: +€199

## BMW E39 540i compatibility baseline

### PRE-TU 1997–1998
- Engine: M62B44
- DME: Bosch M5.2 / M5.2.1
- No VANOS feature set
- Calibration must be matched to exact ECU HW/SW and stock image

### TU 1999–2003
- Engine: M62TUB44
- DME: Bosch ME7.2
- VANOS-related data/calibration only where supported and verified
- Calibration must be matched to exact ECU HW/SW and stock image

Automatic cars may use ZF 5HP24 / EGS. DME and EGS are treated as separate control-unit targets with independent compatibility rules.

## Mandatory safe workflow

No tuning product may expose a WRITE/FLASH action until all preconditions pass:

1. Identify VIN, vehicle profile, DME family, ECU HW/SW and communication path.
2. Read and archive stock ECU metadata and, where supported, a complete stock backup.
3. Hash the stock image and bind the purchase/license to user + VIN + ECU HW/SW + stock hash + product.
4. Select only a calibration explicitly compatible with the detected ECU and stock base.
5. Validate file size/segments, compatibility metadata and checksum/signature requirements.
6. Run battery/voltage and communication preflight.
7. For Stage 4–7, require the custom hardware/log/dyno/engineering gates declared for that stage.
8. Present a clear change summary and explicit user confirmation.
9. Program using the verified transport/protocol only.
10. Verify after write, rescan DTCs and retain an audit record.
11. Offer stock restore/recovery only through a validated recovery path.

## Hard safety gates

The application must block flashing when any of these are unknown or invalid:

- ECU family / HW / SW identity
- Stock backup requirement
- Stock hash
- Calibration compatibility
- Checksum/signature state
- Required VCI / protocol
- Minimum stable voltage
- Active session integrity
- User authorization / VIN entitlement
- For Stage 4–7: required hardware, log/dyno validation and engineering review state

Capability labels used in UI:
- `SUPPORTED`
- `HARDWARE REQUIRED`
- `PROTOCOL REQUIRED`
- `NOT AVAILABLE FOR THIS VEHICLE`
- `EXPERIMENTAL`

## M5 Character / Booster rule

The M5 product is a **compatible vehicle-specific behavior/calibration package** for supported M62/M62TU targets. It stays visually next to the numbered stages but is not part of the Stage 1–7 sequence.

## Prohibited shortcuts

- No emissions-delete/defeat features.
- No immobilizer bypass.
- No arbitrary binary writing.
- No write merely because an adapter identifies as `ELM327 v1.5`.
- No claiming a calibration is ready until it has been validated for the exact ECU/stock base.

## UI contract

The TUNING / MAP STORE screen should present:

1. Stage 1 — Road Performance
2. Stage 2 — Sport Hardware
3. Stage 3 — Track / Forced Induction
4. Stage 4 — Custom Performance
5. Stage 5 — Race / Track+
6. Stage 6 — Motorsport / FI+
7. Stage 7 — Bespoke Engineering
8. M5 Character / Booster — separate premium product

Stages 4–7 must visibly show `CUSTOM` / `VALIDATION REQUIRED` rather than a fake fixed output promise. Every product remains blocked from writing until the complete safety preflight succeeds.
