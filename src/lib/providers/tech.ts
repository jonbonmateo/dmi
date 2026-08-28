/**
 * CMS / platform / tracking-pixel detection from the raw homepage HTML.
 *
 * Pure signature matching over markup we already downloaded — no third-party
 * service, so it works offline and never blocks a run.
 */
export interface TechSignal {
  name: string;
  category: "cms" | "builder" | "automotive_vendor" | "analytics" | "ads" | "chat" | "booking";
  matchedOn: string;
}

interface Sig {
  name: string;
  category: TechSignal["category"];
  patterns: RegExp[];
}

const SIGNATURES: Sig[] = [
  { name: "WordPress", category: "cms", patterns: [/wp-content\//i, /wp-includes\//i, /name="generator" content="WordPress/i] },
  { name: "Wix", category: "builder", patterns: [/static\.wixstatic\.com/i, /wix-code/i] },
  { name: "Squarespace", category: "builder", patterns: [/squarespace\.com/i, /static1\.squarespace/i] },
  { name: "Shopify", category: "builder", patterns: [/cdn\.shopify\.com/i] },
  { name: "Webflow", category: "builder", patterns: [/assets\.website-files\.com/i, /webflow\.js/i] },
  { name: "Duda", category: "builder", patterns: [/dudamobile|dudaone|irp\.cdn-website\.com/i] },
  { name: "GoDaddy Website Builder", category: "builder", patterns: [/img1\.wsimg\.com/i] },
  { name: "HubSpot CMS", category: "cms", patterns: [/hs-scripts\.com|hubspot\.net/i] },
  { name: "Kukui", category: "automotive_vendor", patterns: [/kukui\.com|kukuicorp/i] },
  { name: "Repair Shop Websites", category: "automotive_vendor", patterns: [/repairshopwebsites\.com/i] },
  { name: "Autoshop Solutions", category: "automotive_vendor", patterns: [/autoshopsolutions\.com/i] },
  { name: "Shopgenie", category: "automotive_vendor", patterns: [/shopgenie\.io/i] },
  { name: "Mechanic Advisor", category: "automotive_vendor", patterns: [/mechanicadvisor\.com/i] },
  { name: "Shop Boss", category: "automotive_vendor", patterns: [/shopboss\.net/i] },
  { name: "Google Analytics 4", category: "analytics", patterns: [/gtag\('config',\s*'G-/i, /googletagmanager\.com\/gtag\/js\?id=G-/i] },
  { name: "Google Tag Manager", category: "analytics", patterns: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]{4,}/] },
  { name: "Meta Pixel", category: "ads", patterns: [/connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i, /fbq\(\s*['"]init['"]/i] },
  { name: "Google Ads conversion tag", category: "ads", patterns: [/googleadservices\.com\/pagead\/conversion/i, /gtag\('config',\s*'AW-/i, /AW-\d{9,}/] },
  { name: "Google Ads remarketing", category: "ads", patterns: [/googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion/i] },
  { name: "TikTok Pixel", category: "ads", patterns: [/analytics\.tiktok\.com\/i18n\/pixel/i] },
  { name: "LinkedIn Insight Tag", category: "ads", patterns: [/snap\.licdn\.com\/li\.lms-analytics/i] },
  { name: "CallRail", category: "analytics", patterns: [/cdn\.callrail\.com/i] },
  { name: "Podium", category: "chat", patterns: [/connect\.podium\.com/i] },
  { name: "Tekmetric booking", category: "booking", patterns: [/tekmetric\.com/i] },
  { name: "Shopmonkey", category: "booking", patterns: [/shopmonkey\.io/i] },
  { name: "AudioEye", category: "analytics", patterns: [/audioeye\.com/i] },
  { name: "accessiBe", category: "analytics", patterns: [/acsbapp\.com|accessibe\.com/i] },
  { name: "UserWay", category: "analytics", patterns: [/userway\.org/i] },
  { name: "EqualWeb", category: "analytics", patterns: [/equalweb\.com/i] },
];

export function detectTech(html: string, headers: Record<string, string> = {}): TechSignal[] {
  const found: TechSignal[] = [];
  for (const sig of SIGNATURES) {
    for (const p of sig.patterns) {
      const m = html.match(p);
      if (m) {
        found.push({ name: sig.name, category: sig.category, matchedOn: m[0].slice(0, 120) });
        break;
      }
    }
  }
  const powered = headers["x-powered-by"];
  if (powered) found.push({ name: powered, category: "cms", matchedOn: "x-powered-by header" });
  const server = headers["server"];
  if (server) found.push({ name: server, category: "cms", matchedOn: "server header" });
  return found;
}

export function platformLabel(signals: TechSignal[]): string | null {
  const priority: TechSignal["category"][] = ["automotive_vendor", "builder", "cms"];
  for (const cat of priority) {
    const hit = signals.find((s) => s.category === cat);
    if (hit) return hit.name;
  }
  return null;
}

export function hasAccessibilityWidget(signals: TechSignal[]): TechSignal | null {
  const widgets = ["AudioEye", "accessiBe", "UserWay", "EqualWeb"];
  return signals.find((s) => widgets.includes(s.name)) ?? null;
}
