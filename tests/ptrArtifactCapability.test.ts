// @vitest-environment node
import { expect, it, vi } from "vitest";
import { assertPtrSourceBuiltArtifact } from "../scripts/ptr-production-publisher.mjs";

it("rejects caller-constructed artifacts before running their attestation callback", () => {
  const attest = vi.fn();
  expect(() =>
    assertPtrSourceBuiltArtifact(
      Object.freeze({ assertSourceAndArtifact: attest }),
    ),
  ).toThrow();
  expect(attest).not.toHaveBeenCalled();
});
