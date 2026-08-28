import { test } from "node:test";
import assert from "node:assert/strict";
import { idempotencyKeyFor, normaliseIntake } from "../src/lib/intake";

test("accepts GoHighLevel/Zapier snake_case and camelCase alike", () => {
  const { prospect } = normaliseIntake({
    first_name: "Ray", last_name: "Miller", company_name: "Miller's Garage",
    website_url: "millersgarage.example", appointmentStartTime: "2026-09-03T18:30:00Z",
    contact_id: "ghl_123",
  });
  assert.equal(prospect.firstName, "Ray");
  assert.equal(prospect.shopName, "Miller's Garage");
  assert.equal(prospect.websiteUrl, "https://millersgarage.example");
  assert.equal(prospect.discoveryCallAt, "2026-09-03T18:30:00.000Z");
  assert.equal(prospect.ghlContactId, "ghl_123");
});

test("missing discovery-call fields are reported, never invented", () => {
  const { prospect, missing } = normaliseIntake({ shopName: "Southside Tire" });
  assert.equal(prospect.email, null);
  assert.equal(prospect.websiteUrl, null);
  assert.ok(missing.includes("email address"));
  assert.ok(missing.includes("website address"));
  assert.ok(missing.includes("discovery-call date and time"));
});

test("unknown discovery-form fields are kept rather than dropped", () => {
  const { prospect } = normaliseIntake({ shopName: "X", numberOfBays: "6", dmsSystem: "Tekmetric" });
  assert.equal(prospect.extra.numberOfBays, "6");
  assert.equal(prospect.extra.dmsSystem, "Tekmetric");
});

test("the same shop, site and call day collapse onto one idempotency key", () => {
  const a = normaliseIntake({ shopName: "Miller's Garage", website: "https://www.millersgarage.example/", discoveryCallAt: "2026-09-03T18:30:00Z" }).prospect;
  const b = normaliseIntake({ company_name: "Millers Garage", website_url: "millersgarage.example", startTime: "2026-09-03T22:00:00Z" }).prospect;
  assert.equal(idempotencyKeyFor(a), idempotencyKeyFor(b));
});

test("a different call date is a different DMI", () => {
  const a = normaliseIntake({ shopName: "Miller's Garage", website: "millersgarage.example", discoveryCallAt: "2026-09-03T18:30:00Z" }).prospect;
  const b = normaliseIntake({ shopName: "Miller's Garage", website: "millersgarage.example", discoveryCallAt: "2026-10-03T18:30:00Z" }).prospect;
  assert.notEqual(idempotencyKeyFor(a), idempotencyKeyFor(b));
});
