# BMW E39 540i (1999, round 20-pin): zero-purchase path

Status: documented hardware plan only. No physical BMW module access has been achieved or verified.

## Existing hardware reported by owner
- Carista/Car Insta BLE adapter: standard emissions OBD session already works, not proof of proprietary BMW module access.
- USB K+DCAN / INPA-compatible cable: user previously supplied a photo, identified as K+DCAN-class. Actual USB chipset, K-line mode, routing and ADS capability NOT verified.
- An R365X device was previously pictured as a possible Android gateway host; actual OS and USB host support NOT confirmed. Do not assume it is an Android tablet.
- Vehicle: model year 1999 BMW E39 540i, round 20-pin engine-bay diagnostic connector confirmed verbally. Vehicle production date, interior 16-pin connector, diagnostic pin 15 occupancy and a 20-to-16-pin adapter owned by user are unknown.

## What can be done without buying anything
1. Keep the existing Carista and verify/read generic Mode 01 PIDs, supported bitmap, and SAE Mode 03/07/0A DTC through the existing phone app. Report actual raw responses and errors. This does not unlock ABS/DSC, IKE, body or BMW-specific DME functions.
2. Inventory what is already owned: photograph both ends of the K+DCAN cable, any round BMW 20-pin adapter already in the toolkit, and the possible R365X USB/OS screens; inspect diagnostic socket pin 15 without probing/shorting contacts. If a suitable 20-pin-to-16-pin adapter and USB host are already owned, use them as the candidate path for a *new* local gateway implementation. Software is NOT yet implemented.
3. If the required 20-pin mating connector/adapter is not owned, borrowing one temporarily (no purchase) is a possible way to test. USB K+DCAN plugs cannot be inserted into BMW round 20-pin sockets; neither GitHub, iPhone, a website nor cloud hosting can replace the missing connector or automotive K-line transceiver.
4. If physical access is available, develop/test an actual USB serial transport with real read-only per-ECU identity requests using the existing draft port `gateway/port.mjs`; authenticate a local Wi-Fi host-to-phone bridge; only promote modules following genuine validated replies. Do not claim full access on the basis of protocol name, ELM ATI, or a successful generic `0100`.

## Critical 1999 checks
- BMW vehicles in the transitional period may have both interior 16-pin emissions connector and round under-hood 20-pin; the interior connector can lack access to BMW proprietary modules. BMW diagnosis documentation: https://www.one-stop-electronics.com/wp-content/uploads/2023/05/General_Introduction_dcan.pdf .
- Presence of a populated round socket pin 15 can indicate the need for an ADS-capable interface for some modules. Confirm physical state and vehicle-specific compatibility, not just the model year. Reference background: https://www.bimmerforums.com/forum/archive/index.php/t-2174462.html .
- The round socket cap can contain diagnostic routing bridges; leave it intact in normal use. Never recommend bare-wire bridging, improvised pin shorting, or energizing unknown pins: wrong connections can damage vehicle control units. Reference background: https://www.obd-2.de/wartungsintervallanzeige/43-bmw3/96-bmw-mit-20-pol-diagnosestecker-im-motorraum.html .

## Engineering boundary
`gateway/port.mjs` is a software contract and simulated-test target, not a working hardware bridge. A read-only USB driver, verified physical connector/route, BMW DS2/KWP transport profiles, host and iOS integration, and actual-car test are all outstanding. Avoid buying or deploying anything until owned-hardware inventory is complete; no firmware jailbreak or software port can manufacture missing electrical contact.
