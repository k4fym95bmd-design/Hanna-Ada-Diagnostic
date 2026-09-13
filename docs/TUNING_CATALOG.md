# Hanna & Ada — Tuning / Map Store

Canonical tuning catalog for Hanna & Ada DIAG PRO.

## Product structure

There are exactly **three numbered tuning stages** plus a **separate M5 Character / Booster product**. M5 is **not Stage 4**.

| Product | Price | Marketing ceiling* | Intended use |
|---|---:|---|---|
| Stage 1 — Road Performance | €89 / VIN | UP TO +50 hp / +80 Nm | Compatible stock or near-stock hardware |
| Stage 2 — Sport Hardware | €149 / VIN | UP TO +80 hp / +130 Nm | Requires compatible supporting hardware |
| Stage 3 — Track / Forced Induction | €249 base | UP TO +120 hp | Custom/track/forced-induction workflows only after hardware validation |
| M5 Character / Booster | €179 | Vehicle-specific character calibration | Premium separate product; never a blind S62/M5 file copy |

\* All output figures are platform-, engine-, hardware-, fuel-, condition- and calibration-dependent. They are ceilings, not guaranteed gains.

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
7. Present a clear change summary and explicit user confirmation.
8. Program using the verified transport/protocol only.
9. Verify after write, rescan DTCs and retain an audit record.
10. Offer stock restore/recovery only through a validated recovery path.

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

Capability labels used in UI:
- `SUPPORTED`
- `HARDWARE REQUIRED`
- `PROTOCOL REQUIRED`
- `NOT AVAILABLE FOR THIS VEHICLE`
- `EXPERIMENTAL`

## M5 Character / Booster rule

The M5 product is a **compatible vehicle-specific behavior/calibration package** for the supported M62/M62TU target. It must never install an S62/M5 binary or calibration blindly into an M62/M62TU ECU. The UI must describe it as a separate premium product, visually next to Stage 1/2/3, not as a fourth stage.

## Prohibited shortcuts

- No emissions-delete/defeat features.
- No immobilizer bypass.
- No arbitrary binary writing.
- No write merely because an adapter identifies as `ELM327 v1.5`.
- No claiming a calibration is ready until it has been validated for the exact ECU/stock base.

## UI contract

The TUNING / MAP STORE screen presents four primary product cards in this order:

1. STAGE 1 — Road Performance
2. STAGE 2 — Sport Hardware
3. STAGE 3 — Track / Forced Induction
4. M5 CHARACTER / BOOSTER — Premium separate product

Each card must show compatibility state before purchase/flash. A purchased product still remains blocked from writing until the complete safety preflight succeeds.
