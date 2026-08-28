import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseUrl } from "../src/lib/providers/http";
import { detectTech, hasAccessibilityWidget, platformLabel } from "../src/lib/providers/tech";
import { discoverSocialLinks, postingFrequency } from "../src/lib/providers/social";
import { normalisePhone } from "../src/lib/providers/citations";
import { weekOf } from "../src/lib/integrations/tracking";

test("website addresses typed by hand are normalised", () => {
  assert.equal(normaliseUrl("millersgarage.com"), "https://millersgarage.com");
  assert.equal(normaliseUrl("  https://www.shop.com/  "), "https://www.shop.com");
  assert.equal(normaliseUrl("not a url"), null);
  assert.equal(normaliseUrl(""), null);
  assert.equal(normaliseUrl(null), null);
});

test("tracking pixels and platforms are detected from markup", () => {
  const html = `<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
    <script>fbq('init','123');gtag('config', 'AW-987654321');</script>
    <link href="/wp-content/themes/x/style.css">
    <script src="https://cdn.userway.org/widget.js"></script>`;
  const tech = detectTech(html);
  const names = tech.map((t) => t.name);
  assert.ok(names.includes("Meta Pixel"));
  assert.ok(names.includes("Google Ads conversion tag"));
  assert.equal(platformLabel(tech), "WordPress");
  assert.equal(hasAccessibilityWidget(tech)?.name, "UserWay");
});

test("social links are found and share/tracking URLs ignored", () => {
  const found = discoverSocialLinks(
    `<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
     <a href="https://facebook.com/precisionautocareatx">us</a>
     <a href="https://www.instagram.com/p/abc123/">a post</a>
     <a href="https://instagram.com/precisionautocareatx">profile</a>`,
  );
  assert.equal(found.facebook, "https://www.facebook.com/precisionautocareatx");
  assert.equal(found.instagram, "https://www.instagram.com/precisionautocareatx");
});

test("posting frequency needs at least two dated posts", () => {
  assert.equal(postingFrequency([]).perWeek, null);
  const posts = ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29"].map((date) => ({
    date, caption: null, media: "unknown" as const, likes: null, comments: null, businessReplied: null, url: null,
  }));
  const f = postingFrequency(posts);
  assert.equal(f.windowDays, 28);
  assert.equal(f.perWeek, 1.3);
});

test("phone numbers compare on their last ten digits", () => {
  assert.equal(normalisePhone("+1 (512) 555-0142"), "5125550142");
  assert.equal(normalisePhone("512.555.0142"), "5125550142");
  assert.equal(normalisePhone("555-0142"), null);
});

test("tracking weeks start on Monday", () => {
  assert.equal(weekOf(new Date("2026-09-03T18:30:00Z")), "2026-08-31");
  assert.equal(weekOf(new Date("2026-08-31T00:00:00Z")), "2026-08-31");
  assert.equal(weekOf(new Date("2026-09-06T23:59:00Z")), "2026-08-31");
  assert.equal(weekOf(new Date("2026-09-07T00:00:00Z")), "2026-09-07");
});
