import { normalizePhoneToE164 } from "./phone";

describe("normalizePhoneToE164", () => {
  it("normalizes 0241234567 to +233241234567", () => {
    expect(normalizePhoneToE164("0241234567", "GH")).toBe("+233241234567");
  });

  it("normalizes 241234567 to +233241234567", () => {
    expect(normalizePhoneToE164("241234567", "GH")).toBe("+233241234567");
  });

  it("normalizes +233241234567 to +233241234567", () => {
    expect(normalizePhoneToE164("+233241234567", "GH")).toBe("+233241234567");
  });

  it("normalizes 00233241234567 to +233241234567", () => {
    expect(normalizePhoneToE164("00233241234567", "GH")).toBe("+233241234567");
  });

  it("returns null for invalid phone", () => {
    expect(normalizePhoneToE164("invalid", "GH")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhoneToE164("", "GH")).toBeNull();
  });
});
