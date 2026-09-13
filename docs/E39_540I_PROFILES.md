# BMW E39 540i Vehicle Profiles

Hanna & Ada treats the E39 540i as two separate powertrain families. Features are resolved from the exact vehicle/ECU profile, not from the model badge alone.

## PRE-TU — 1997–1998

- Chassis: BMW E39
- Model: 540i / 540i Touring where applicable
- Engine: M62B44
- DME: Bosch M5.2 / M5.2.1
- Automatic transmission: ZF 5HP24 / EGS where fitted
- Primary diagnostic transport: K-Line / BMW DS2 plus generic OBD-II where supported
- VANOS-specific functions: not applicable to the non-TU M62B44 profile

## TU — 1999–2003

- Chassis: BMW E39
- Model: 540i / 540i Touring
- Engine: M62TUB44
- DME: Bosch ME7.2
- Automatic transmission: ZF 5HP24 / EGS where fitted
- Primary diagnostic transport: K-Line / BMW DS2 / BMW KWP2000 plus generic OBD-II
- VANOS-specific functions: available only when the ECU job/protocol is implemented and verified

## Shared target control units

DME/DDE where applicable, EGS, ABS/DSC, IKE/KOMBI, LCM, GM/ZKE, EWS, IHKA and other vehicle-installed modules discovered by a verified BMW transport session.

## V8 specialist views

- Bank 1 vs Bank 2 comparison
- lambda/O2 and fuel trims
- MAF, coolant, intake temperature and throttle
- cylinder 1–8 misfire/roughness where the BMW ECU exposes it
- VANOS target/actual and cam adaptation only on compatible TU vehicles
- combined DME + EGS dashboard
- 5HP24 gear, slip and temperature where exposed by EGS

## Rules

1. Never assign ME7.2 to every E39 540i.
2. Never attach VANOS functions to PRE-TU M62B44.
3. Never expose a BMW-specific value only because a generic OBD value exists with a similar name.
4. Vehicle year, ECU identification and transport verification must agree before a feature becomes `SUPPORTED`.
