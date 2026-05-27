import { describe, expect, it } from "vitest";
import { scrubPii } from "../utils/piiScrubber";

describe("piiScrubber", () => {
  it("scrubs email and phone", () => {
    const out = scrubPii("Contact john@example.com or +48 600 123 456");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).not.toContain("john@example.com");
  });
});
