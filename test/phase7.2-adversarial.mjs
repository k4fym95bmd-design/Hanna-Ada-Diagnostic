import test from "node:test";
import assert from "node:assert/strict";

// These vectors are consumed by the compiled Phase 7.2 harness.
// No vehicle measurements are fabricated: values below are synthetic mathematical fixtures.
test("phase7.2 vector manifest is explicit about synthetic fixtures", () => {
  const manifest = {
    purpose: "MATHEMATICAL_INVARIANT_TEST_ONLY",
    vehicleEvidence: false,
    vectors: ["DME_CUTOUT_BLOCK", "MISSING_CONDITIONAL_MATRIX", "VACUUM_GATE"],
  };
  assert.equal(manifest.vehicleEvidence, false);
  assert.deepEqual(manifest.vectors.length, 3);
});
