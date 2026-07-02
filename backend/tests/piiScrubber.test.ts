import { describe, expect, it } from "vitest";
import { scrubObject, scrubPii } from "../utils/piiScrubber";

describe("scrubPii", () => {
  it("scrubs email and phone", () => {
    const out = scrubPii("Contact john@example.com or +48 600 123 456");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).not.toContain("john@example.com");
  });
});

describe("scrubObject", () => {
  it("scrubs PII in string values but preserves numbers and structure", () => {
    const input = {
      cost_usd: 0.0302,
      total_tokens: 45123,
      note: "dzwoń +48 600 123 456",
      nested: { email: "a@b.com", latency_ms: 1234 },
      list: [{ score: 9 }, "napisz na a@b.com"],
    };
    const out = scrubObject(input);

    // Liczby nienaruszone (to był rdzeń buga — cost_usd stawał się [PHONE]).
    expect(out.cost_usd).toBe(0.0302);
    expect(out.total_tokens).toBe(45123);
    expect(out.nested.latency_ms).toBe(1234);
    expect(out.list[0]).toEqual({ score: 9 });

    // PII w stringach wyczyszczone.
    expect(out.note).toContain("[PHONE]");
    expect(out.nested.email).toBe("[EMAIL]");
    expect(out.list[1]).toContain("[EMAIL]");
  });

  it("round-trips through JSON.stringify without throwing", () => {
    const obj = { cost_usd: 0.05, msg: "tel: 600 700 800" };
    expect(() => JSON.stringify(scrubObject(obj))).not.toThrow();
  });
});
