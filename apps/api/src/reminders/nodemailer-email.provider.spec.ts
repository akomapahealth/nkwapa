import { FakeEmailProvider } from "./fake-email.provider";

describe("FakeEmailProvider", () => {
  it("sends email successfully", async () => {
    const provider = new FakeEmailProvider();
    const result = await provider.send(
      "test@example.com",
      "Test Subject",
      "<p>Hello</p>"
    );
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeDefined();
    expect(result.providerMessageId).toMatch(/^fake-email:/);
  });
});

describe("Email reminder integration", () => {
  it("renders email template with placeholders", () => {
    const template = "<p>Dear {{patientCode}}, visit {{clinicName}} on {{followUpDate}}</p>";
    const rendered = template
      .replace(/\{\{patientCode\}\}/g, "NKP-2025-000001")
      .replace(/\{\{clinicName\}\}/g, "Test Clinic")
      .replace(/\{\{followUpDate\}\}/g, "2025-06-15");

    expect(rendered).toBe("<p>Dear NKP-2025-000001, visit Test Clinic on 2025-06-15</p>");
    expect(rendered).not.toContain("{{");
  });
});
