/**
 * Step 2 — Website review (5 criteria).
 */
import { parse, visibleText, links, sameHost, excerpt, attr } from "@/lib/providers/html";
import { detectTech, platformLabel, hasAccessibilityWidget } from "@/lib/providers/tech";
import { getPageSpeed } from "@/lib/providers/pagespeed";
import { evidence, finding, summariseCategory } from "@/lib/scoring/rubric";
import type { CategoryResult, Finding } from "@/lib/types";
import type { Ctx } from "../context";

const STOCK_HOSTS = [
  "unsplash.com", "pexels.com", "pixabay.com", "shutterstock.com",
  "istockphoto.com", "gettyimages.com", "stock.adobe.com", "freepik.com",
  "depositphotos.com", "dreamstime.com", "123rf.com",
];

const STOCK_FILENAME = /(shutterstock|istock|getty|adobe[-_]?stock|depositphotos|stock[-_]?photo|placeholder|dummy|sample[-_]?image|hero[-_]?bg[-_]?\d)/i;

const CTA_PATTERNS = [
  /book (an )?appointment/i, /schedule (an )?(appointment|service)/i,
  /request (an )?(appointment|estimate|quote)/i, /get (a )?(quote|estimate)/i,
  /call (us )?(now|today)/i, /contact us/i, /make an appointment/i,
  /book now/i, /schedule now/i, /free estimate/i,
];

export async function reviewWebsite(ctx: Ctx): Promise<CategoryResult> {
  const findings: Finding[] = [];
  const captured: Record<string, string | null> = {
    "Website URL": ctx.siteUrl,
    "Platform / CMS": null,
    "Mobile performance": null,
    "Desktop performance": null,
    "Accessibility tooling": null,
  };

  if (!ctx.siteUrl) {
    // No site at all: every criterion fails on the merits, which is a real,
    // reportable result — not an error.
    for (let i = 1; i <= 5; i++) {
      findings.push(
        finding({
          category: "website",
          index: i,
          outcome: "fail",
          status: "confirmed",
          confidence: 0.95,
          summary: "The shop has no reachable website.",
          reasoning:
            "No website address was supplied on the discovery-call form, or the address supplied could not be reached. With no website, this criterion cannot be satisfied.",
          evidence: [
            evidence("observed_value", "Submitted website", {
              value: ctx.prospect.websiteUrl ?? "(none supplied)",
            }),
          ],
        }),
      );
    }
    return summariseCategory("website", findings, captured, [
      "No website was inspected. Confirm with the prospect whether one exists before presenting this section.",
    ]);
  }

  const home = await ctx.page(ctx.siteUrl);
  if (!home.ok) {
    const blocked = home.blocked;
    for (let i = 1; i <= 5; i++) {
      findings.push(
        finding({
          category: "website",
          index: i,
          outcome: "undetermined",
          status: "unable_to_evaluate",
          confidence: 0.1,
          summary: blocked
            ? "The website blocks automated inspection."
            : "The website could not be loaded.",
          reasoning: blocked
            ? `The site returned HTTP ${home.status} or a bot-challenge page to our crawler. A human needs to open it in a browser.`
            : `Request failed: ${home.error ?? `HTTP ${home.status}`}.`,
          evidence: [
            evidence("url", "Homepage", { source: ctx.siteUrl, value: `HTTP ${home.status ?? "n/a"}`, checkedAt: home.checkedAt }),
          ],
        }),
      );
    }
    ctx.review({
      category: "website",
      reason: blocked ? "Website blocks automated inspection" : "Website unreachable",
      question: `Open ${ctx.siteUrl} in a browser and score the five website criteria manually.`,
      instruction:
        "Record pass/fail for each of the five website criteria in the resolution box, with a one-line reason each.",
    });
    return summariseCategory("website", findings, captured, [home.blocked ? "Bot protection blocked the crawler." : `Fetch error: ${home.error}`]);
  }

  const $ = parse(home.body);
  const body = visibleText($);
  const tech = detectTech(home.body, home.headers);
  captured["Platform / CMS"] = platformLabel(tech) ?? "Not detected";
  const allLinks = links($, home.finalUrl);

  /* ------------------------------------ 1. identity, contact, custom design */
  {
    const logo = $('img[src*="logo" i], img[alt*="logo" i], header img').length > 0;
    const phoneLinks = $('a[href^="tel:"]').length;
    const phoneInText = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(body.slice(0, 4000));
    const addressish =
      $('address').length > 0 ||
      /\b\d{1,6}\s+[A-Z][A-Za-z.]+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|hwy|highway|ln|lane|pkwy|way)\b/i.test(body) ||
      /\b[A-Z][a-z]+,\s*[A-Z]{2}\s*\d{5}\b/.test(body);
    const nameOnPage = body.toLowerCase().includes(ctx.prospect.shopName.toLowerCase());
    const templatey = tech.some((t) => t.category === "builder" || t.category === "automotive_vendor");

    const have = [
      logo && "a logo image",
      (phoneLinks > 0 || phoneInText) && "a phone number",
      addressish && "a street address or city/state/ZIP",
      nameOnPage && "the shop name",
    ].filter(Boolean) as string[];
    const missing = [
      !logo && "logo",
      !(phoneLinks > 0 || phoneInText) && "phone number",
      !addressish && "location",
      !nameOnPage && "shop name",
    ].filter(Boolean) as string[];

    const pass = have.length >= 4;
    findings.push(
      finding({
        category: "website",
        index: 1,
        // "Professional, custom design" is a human judgement; we confirm the
        // objective half and hand the aesthetic half to a person when the
        // site is on an off-the-shelf template.
        outcome: pass && !templatey ? "pass" : pass ? "undetermined" : "fail",
        status: pass && !templatey ? "confirmed" : pass ? "requires_human_review" : "confirmed",
        confidence: pass ? 0.75 : 0.85,
        summary: pass
          ? `Homepage shows ${have.join(", ")}.${templatey ? " Design appears to use an off-the-shelf template." : ""}`
          : `Homepage is missing: ${missing.join(", ")}.`,
        reasoning: pass
          ? templatey
            ? `All four identity elements are present, but the site runs on ${platformLabel(tech)}, which usually means a stock template rather than a custom design. Whether it "reflects the shop's brand" is a judgement call — flagged for a human.`
            : "Logo, shop name, location and contact details were all found in the homepage markup, and no off-the-shelf template signature was detected."
          : `Only ${have.length} of the four identity elements were found. Missing: ${missing.join(", ")}.`,
        evidence: [
          evidence("html_excerpt", "Identity elements found", { source: home.finalUrl, value: have.join(", ") || "none", checkedAt: home.checkedAt }),
          evidence("observed_value", "tel: links on homepage", { value: String(phoneLinks) }),
          evidence("observed_value", "Detected platform", { value: platformLabel(tech) ?? "not detected" }),
        ],
      }),
    );
    if (pass && templatey) {
      ctx.review({
        category: "website",
        findingId: "website.1",
        reason: "Design quality is a human judgement",
        question: `Does ${ctx.siteUrl} look like a professional, custom design that reflects the shop's brand, or a stock ${platformLabel(tech)} template?`,
        instruction: "Open the site and answer 'custom' or 'template'. Award the point only for a design that reflects the shop's own brand.",
      });
    }
  }

  /* -------------------------------------- 2. readability + accessibility */
  {
    const widget = hasAccessibilityWidget(tech);
    const navItems = $('nav a, header a').length;
    const imgs = $("img").toArray();
    const withAlt = imgs.filter((el) => ($(el).attr("alt") ?? "").trim().length > 0).length;
    const altRatio = imgs.length ? withAlt / imgs.length : null;
    const langSet = Boolean($("html").attr("lang"));
    const skipLink = $('a[href^="#main"], a[href^="#content"], .skip-link, a:contains("Skip to")').length > 0;
    const ariaLandmarks = $("[role=main], main, [role=navigation]").length > 0;

    const supports = [
      widget && `an accessibility widget (${widget.name})`,
      langSet && "a declared page language",
      skipLink && "a skip-to-content link",
      ariaLandmarks && "landmark regions",
      altRatio !== null && altRatio >= 0.8 && `alt text on ${Math.round(altRatio * 100)}% of images`,
    ].filter(Boolean) as string[];
    captured["Accessibility tooling"] = widget ? widget.name : supports.length ? "Native markup only" : "None detected";

    const pass = Boolean(widget) || supports.length >= 3;
    findings.push(
      finding({
        category: "website",
        index: 2,
        outcome: pass ? "pass" : "fail",
        status: "confirmed",
        confidence: widget ? 0.95 : 0.7,
        summary: widget
          ? `Accessibility support provided by ${widget.name}.`
          : supports.length
            ? `No accessibility widget, but the markup provides: ${supports.join(", ")}.`
            : "No ADA accessibility option or comparable accessibility support was found.",
        reasoning: `Navigation links found: ${navItems}. Images with alt text: ${withAlt}/${imgs.length}. Accessibility widget: ${widget?.name ?? "none"}. The criterion is satisfied by a dedicated widget or by at least three native accessibility supports.`,
        evidence: [
          evidence("observed_value", "Accessibility widget", { source: home.finalUrl, value: widget ? `${widget.name} (matched on ${widget.matchedOn})` : "none detected", checkedAt: home.checkedAt }),
          evidence("observed_value", "Image alt-text coverage", { value: imgs.length ? `${withAlt}/${imgs.length} (${Math.round((altRatio ?? 0) * 100)}%)` : "no images" }),
          evidence("observed_value", "Native supports", { value: supports.join(", ") || "none" }),
        ],
      }),
    );
  }

  /* ------------------------------------------------- 3. call to action */
  {
    // "Immediately visible" is approximated as: inside the first screenful of
    // markup (header/hero), which is where these sites put their CTA.
    const headerHtml = ($("header").html() ?? "") + ($("nav").html() ?? "") + home.body.slice(0, 6000);
    const heroCta = CTA_PATTERNS.filter((p) => p.test(headerHtml));
    const siteWide = CTA_PATTERNS.filter((p) => p.test(home.body));
    const ctaLinks = allLinks.filter((l) => CTA_PATTERNS.some((p) => p.test(l.text)));
    const telTop = /href="tel:/i.test(headerHtml);

    const pass = (heroCta.length > 0 || telTop) && (siteWide.length > 0 || ctaLinks.length >= 2);
    const examples = [...new Set(ctaLinks.map((l) => l.text).filter(Boolean))].slice(0, 4);
    findings.push(
      finding({
        category: "website",
        index: 3,
        outcome: pass ? "pass" : "fail",
        status: "confirmed",
        confidence: 0.75,
        summary: pass
          ? `A call to action appears above the fold${examples.length ? ` (e.g. "${examples[0]}")` : ""} and ${ctaLinks.length} CTA link(s) appear across the page.`
          : "No clear call to action was found in the top of the homepage.",
        reasoning: `Above-the-fold CTA matches: ${heroCta.length}${telTop ? " (plus a click-to-call link in the header)" : ""}. CTA links anywhere on the page: ${ctaLinks.length}${examples.length ? ` — ${examples.map((e) => `"${e}"`).join(", ")}` : ""}.`,
        evidence: [
          evidence("html_excerpt", "CTA text found near the top of the page", { source: home.finalUrl, value: examples.join(" | ") || "none", checkedAt: home.checkedAt }),
          evidence("observed_value", "Click-to-call in header", { value: telTop ? "yes" : "no" }),
        ],
      }),
    );
  }

  /* -------------------------------------------- 4. authentic imagery */
  {
    const imgs = $("img").toArray().map((el) => $(el).attr("src") ?? "").filter(Boolean);
    const abs = imgs.map((src) => {
      try { return new URL(src, home.finalUrl).toString(); } catch { return src; }
    });
    const stockHosted = abs.filter((u) => STOCK_HOSTS.some((h) => u.includes(h)));
    const stockNamed = abs.filter((u) => STOCK_FILENAME.test(u));
    const firstParty = abs.filter((u) => sameHost(u, home.finalUrl));
    const videos = $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length;
    const stockCount = new Set([...stockHosted, ...stockNamed]).size;

    if (abs.length === 0) {
      findings.push(
        finding({
          category: "website",
          index: 4,
          outcome: "undetermined",
          status: "unable_to_evaluate",
          confidence: 0.2,
          summary: "No images were found in the homepage HTML.",
          reasoning: "The homepage markup contains no <img> elements — imagery is probably loaded by JavaScript or set as CSS backgrounds, which this check cannot read.",
          evidence: [evidence("observed_value", "img elements", { source: home.finalUrl, value: "0", checkedAt: home.checkedAt })],
        }),
      );
      ctx.review({
        category: "website",
        findingId: "website.4",
        reason: "Imagery is not readable from the HTML",
        question: `Does ${ctx.siteUrl} use authentic photos of the shop, team or work rather than stock imagery?`,
        instruction: "Open the site, look at the hero and gallery images, and answer yes/no with one example.",
      });
    } else {
      const ratio = stockCount / abs.length;
      // First-party hosting is necessary but not sufficient — plenty of shops
      // self-host purchased stock — so a clean result still gets a soft check.
      const clearlyStock = ratio > 0.3;
      const pass = !clearlyStock && firstParty.length >= Math.max(3, abs.length * 0.5);
      findings.push(
        finding({
          category: "website",
          index: 4,
          outcome: clearlyStock ? "fail" : pass ? "pass" : "undetermined",
          status: clearlyStock ? "confirmed" : pass ? "confirmed" : "requires_human_review",
          confidence: clearlyStock ? 0.8 : 0.6,
          summary: clearlyStock
            ? `${stockCount} of ${abs.length} images look like stock photography.`
            : `${firstParty.length} of ${abs.length} images are hosted on the shop's own domain${videos ? `, plus ${videos} embedded video(s)` : ""}.`,
          reasoning: clearlyStock
            ? `Images matched known stock hosts or stock filename patterns: ${[...new Set([...stockHosted, ...stockNamed])].slice(0, 3).join(", ")}.`
            : `No stock-library hosts or stock filename patterns were detected, and most images are self-hosted. Self-hosting does not prove the photos are of this shop, so this remains a visual check when it is borderline.`,
          evidence: [
            evidence("observed_value", "Images on homepage", { source: home.finalUrl, value: String(abs.length), checkedAt: home.checkedAt }),
            evidence("observed_value", "Self-hosted images", { value: String(firstParty.length) }),
            evidence("observed_value", "Stock-signature images", { value: stockCount ? [...new Set([...stockHosted, ...stockNamed])].slice(0, 3).join(", ") : "none" }),
            evidence("observed_value", "Embedded videos", { value: String(videos) }),
          ],
        }),
      );
      if (!clearlyStock && !pass) {
        ctx.review({
          category: "website",
          findingId: "website.4",
          reason: "Image authenticity is borderline",
          question: `Are the photos on ${ctx.siteUrl} of this actual shop, team and work?`,
          instruction: "Open the site. If the hero and gallery show the real shop, award the point.",
        });
      }
    }
  }

  /* ------------------------------- 5. responsive + performance >= 80 */
  {
    const viewport = attr($, 'meta[name="viewport"]', "content");
    const responsive = Boolean(viewport && /width=device-width/i.test(viewport));
    const psi = await getPageSpeed(ctx.siteUrl);
    const mobile = psi.mobile?.performance ?? null;
    const desktop = psi.desktop?.performance ?? null;
    captured["Mobile performance"] = mobile === null ? "Not measured" : String(mobile);
    captured["Desktop performance"] = desktop === null ? "Not measured" : String(desktop);

    if (mobile === null || desktop === null) {
      findings.push(
        finding({
          category: "website",
          index: 5,
          outcome: "undetermined",
          status: psi.status === "confirmed" ? "requires_human_review" : psi.status,
          confidence: 0.2,
          summary: "Performance scores could not be measured automatically.",
          reasoning: `${psi.note} Responsive viewport meta tag: ${responsive ? "present" : "missing"}.`,
          evidence: [
            evidence("api_response", "PageSpeed Insights", { source: psi.source, value: psi.note }),
            evidence("observed_value", "Viewport meta tag", { source: home.finalUrl, value: viewport ?? "(absent)", checkedAt: home.checkedAt }),
          ],
        }),
      );
      ctx.review({
        category: "website",
        findingId: "website.5",
        reason: "PageSpeed could not be measured",
        question: `Run PageSpeed Insights on ${ctx.siteUrl} and record the mobile and desktop performance scores.`,
        instruction: "https://pagespeed.web.dev/ — award the point only if both scores are 80 or above.",
      });
    } else {
      const pass = responsive && mobile >= 80 && desktop >= 80;
      findings.push(
        finding({
          category: "website",
          index: 5,
          outcome: pass ? "pass" : "fail",
          status: "confirmed",
          confidence: psi.mocked ? 0.5 : 0.95,
          summary: `Mobile ${mobile}/100, desktop ${desktop}/100${responsive ? ", responsive viewport present" : ", NO responsive viewport tag"}.`,
          reasoning: `The benchmark is 80 or above on both. Mobile scored ${mobile} (${mobile >= 80 ? "pass" : "below benchmark"}), desktop scored ${desktop} (${desktop >= 80 ? "pass" : "below benchmark"}). ${psi.note}${psi.mobile?.lcpSeconds ? ` Mobile LCP ${psi.mobile.lcpSeconds}s.` : ""}`,
          evidence: [
            evidence("api_response", "PageSpeed Insights (mobile)", { source: psi.source, value: `performance ${mobile}${psi.mobile?.lcpSeconds ? `, LCP ${psi.mobile.lcpSeconds}s` : ""}${psi.mobile?.cls !== null && psi.mobile?.cls !== undefined ? `, CLS ${psi.mobile.cls}` : ""}` }),
            evidence("api_response", "PageSpeed Insights (desktop)", { source: psi.source, value: `performance ${desktop}` }),
            evidence("observed_value", "Viewport meta tag", { source: home.finalUrl, value: viewport ?? "(absent)", checkedAt: home.checkedAt }),
          ],
        }),
      );
    }
  }

  const notes: string[] = [];
  if (tech.length) {
    notes.push(`Technology detected: ${[...new Set(tech.map((t) => t.name))].join(", ")}.`);
  }
  return summariseCategory("website", findings, captured, notes);
}
