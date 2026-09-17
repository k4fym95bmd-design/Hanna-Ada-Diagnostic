# BMW E39 540i (1999) — 20-pin VCI hardware gate

Vehicle information confirmed by owner: BMW E39 540i model year 1999; round 20-pin diagnostic socket under the hood. **Actual production date, socket pin population, continuity, engine ECU identity and electronics remain unverified.** Do not infer that the in-cabin 16-pin socket provides full module coverage.

## Vehicle-specific transport decision

1. Use the under-hood 20-pin socket as the candidate **full BMW diagnostic access** port. The period BMW vehicle communication manual documents that cars with both diagnostic connectors generally expose only limited systems via the under-dash 16-pin port; E39 dropped the under-hood connector beginning September 2000. Source: https://www.hc.lv/inc/Upload/news_290/File/BMWVehicleCommunicationSoftwareManual_EAZ0025B42B.pdf .
2. Obtain a close, well-lit photograph of the **actual vehicle socket** showing all numbered metal contacts, especially the position numbered 15, with ignition OFF. Do not insert wires, jump unknown contacts, disassemble the socket, or apply battery power to contacts. A contact shell's presence alone does not prove a functional ADS line; consult the vehicle-specific wiring diagram / professionally measure if required.
3. Confirm that the purchased BMW 20-pin-to-16-pin adapter has the right K-line / power / ground / ignition mapping for the physical vehicle, from a reliable vendor. An inexpensive adapter with only the emissions-related K-line exposed can cause the same symptom as generic Carista: DME reachable, body/chassis modules missing. Do not assume every adapter internally bridges pins 17 and 20, or advise DIY bridging; pin routing must be checked against the correct wiring diagram and vehicle hardware.
4. Candidate device path if vehicle pin configuration allows it: FTDI-based BMW K+DCAN cable with documented K-line compatibility + vetted 20-pin converter + local USB host (Android OTG or Pi-class) + local authenticated Wi-Fi bridge + iOS app. If vehicle requires ADS/L-line for specific modules, this ordinary K+DCAN route may be insufficient; choose a verified ADS-capable interface/appropriate host or manufacturer BMW diagnostic equipment. Selection is conditional on pin investigation, not based on the model year alone.
5. A cable is not a BMW protocol stack. Implement verified ECU-specific DS2/KWP read-only addressing and framing, then prove identities for DME/EGS/DSC/IKE one module at a time before enabling any UI states. Keep actuation, adaptations, coding and flash gated.

## Next owner input

A close photo of the round **socket itself** under the hood showing the pin cavities/metal contacts and molded pin numbers; a second photo of the socket cap and its markings, and if easily available the production month from the vehicle's identification label. No need to share full VIN or registration plates.

## Known implementation status

`gateway/port.mjs` is a local VCI API contract and response-validation prototype only. No USB driver, physical BMW interface, authenticated local network server, BMW DS2/KWP ECU implementation or completed car test exists in this PR. Synthetic test frames do not establish compatibility. The production app and Carista BLE generic OBD path are unchanged by this checklist.
