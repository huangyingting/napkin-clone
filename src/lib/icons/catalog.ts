/**
 * Offline icon catalog backed by the bundled `lucide-react` package.
 *
 * This module is intentionally framework-free: it only describes which icons
 * exist and how to search them. Resolving a name to a renderable component is
 * left to consumers (e.g. the visual renderer / icon picker) so this file stays
 * pure and unit-testable without pulling in React.
 *
 * `name` is the canonical lucide-react component name (PascalCase), so a
 * consumer can resolve it directly (e.g. `import { ArrowRight } from
 * "lucide-react"`). `keywords` are natural-language synonyms used for search.
 */
export interface IconEntry {
  name: string;
  keywords: string[];
}

export const ICON_CATALOG: IconEntry[] = [
  // Ideas & strategy
  {
    name: "Lightbulb",
    keywords: ["idea", "insight", "innovation", "tip", "think"],
  },
  {
    name: "Brain",
    keywords: ["mind", "think", "intelligence", "memory", "ai"],
  },
  { name: "Sparkles", keywords: ["magic", "ai", "shine", "new", "highlight"] },
  {
    name: "Target",
    keywords: ["goal", "objective", "aim", "focus", "bullseye"],
  },
  { name: "Goal", keywords: ["goal", "objective", "score", "achieve"] },
  {
    name: "Rocket",
    keywords: ["launch", "startup", "boost", "growth", "fast"],
  },
  {
    name: "Flag",
    keywords: ["milestone", "mark", "country", "goal", "report"],
  },
  { name: "Milestone", keywords: ["milestone", "marker", "progress", "step"] },
  { name: "Compass", keywords: ["direction", "navigate", "guide", "explore"] },
  { name: "Map", keywords: ["location", "route", "plan", "geography"] },
  {
    name: "MapPin",
    keywords: ["location", "place", "pin", "marker", "address"],
  },
  { name: "Route", keywords: ["path", "journey", "direction", "navigation"] },
  {
    name: "Telescope",
    keywords: ["vision", "explore", "future", "research", "look"],
  },

  // People & collaboration
  { name: "User", keywords: ["person", "profile", "account", "individual"] },
  {
    name: "Users",
    keywords: ["people", "team", "group", "community", "audience"],
  },
  {
    name: "Handshake",
    keywords: ["deal", "agreement", "partner", "trust", "meeting"],
  },
  {
    name: "Megaphone",
    keywords: ["announce", "marketing", "promote", "broadcast"],
  },
  {
    name: "MessageSquare",
    keywords: ["chat", "comment", "talk", "feedback", "message"],
  },
  {
    name: "Mail",
    keywords: ["email", "message", "inbox", "letter", "contact"],
  },
  { name: "Send", keywords: ["send", "submit", "deliver", "message", "share"] },
  { name: "Inbox", keywords: ["inbox", "incoming", "queue", "mail"] },
  { name: "Bell", keywords: ["notification", "alert", "reminder", "ring"] },
  { name: "Phone", keywords: ["call", "contact", "telephone", "support"] },
  {
    name: "GraduationCap",
    keywords: ["education", "learn", "school", "training", "student"],
  },

  // Process & flow
  {
    name: "Workflow",
    keywords: ["process", "flow", "pipeline", "automation", "steps"],
  },
  { name: "GitBranch", keywords: ["branch", "version", "fork", "git", "flow"] },
  { name: "Split", keywords: ["split", "branch", "divide", "fork"] },
  { name: "Merge", keywords: ["merge", "combine", "join", "converge"] },
  { name: "Shuffle", keywords: ["shuffle", "random", "mix", "swap"] },
  {
    name: "Repeat",
    keywords: ["loop", "cycle", "repeat", "again", "iteration"],
  },
  {
    name: "RefreshCw",
    keywords: ["refresh", "sync", "reload", "update", "cycle"],
  },
  {
    name: "ArrowRight",
    keywords: ["next", "forward", "go", "direction", "right"],
  },
  {
    name: "ArrowLeftRight",
    keywords: ["exchange", "swap", "transfer", "compare", "bidirectional"],
  },
  { name: "MoveRight", keywords: ["move", "advance", "progress", "next"] },
  {
    name: "CornerDownRight",
    keywords: ["sub", "child", "nested", "indent", "reply"],
  },
  {
    name: "ListChecks",
    keywords: ["checklist", "tasks", "todo", "steps", "done"],
  },
  {
    name: "ClipboardList",
    keywords: ["list", "tasks", "plan", "report", "checklist"],
  },
  {
    name: "Filter",
    keywords: ["filter", "funnel", "sort", "refine", "narrow"],
  },

  // Growth & analytics
  {
    name: "TrendingUp",
    keywords: ["growth", "increase", "up", "improve", "chart"],
  },
  {
    name: "TrendingDown",
    keywords: ["decline", "decrease", "down", "loss", "drop"],
  },
  {
    name: "BarChart",
    keywords: ["chart", "graph", "analytics", "stats", "data"],
  },
  {
    name: "LineChart",
    keywords: ["chart", "graph", "trend", "analytics", "line"],
  },
  {
    name: "PieChart",
    keywords: ["chart", "share", "proportion", "analytics", "pie"],
  },
  {
    name: "Activity",
    keywords: ["activity", "pulse", "metrics", "monitor", "health"],
  },
  {
    name: "Gauge",
    keywords: ["speed", "performance", "meter", "dashboard", "measure"],
  },
  {
    name: "Scale",
    keywords: ["balance", "compare", "weigh", "justice", "fair"],
  },
  { name: "Calculator", keywords: ["math", "calculate", "numbers", "finance"] },
  { name: "Percent", keywords: ["percent", "rate", "discount", "ratio"] },

  // Money & business
  {
    name: "DollarSign",
    keywords: ["money", "price", "cost", "revenue", "currency"],
  },
  {
    name: "Banknote",
    keywords: ["money", "cash", "payment", "bill", "currency"],
  },
  {
    name: "Wallet",
    keywords: ["wallet", "money", "budget", "payment", "balance"],
  },
  {
    name: "CreditCard",
    keywords: ["payment", "card", "checkout", "billing", "purchase"],
  },
  {
    name: "Receipt",
    keywords: ["receipt", "invoice", "bill", "expense", "transaction"],
  },
  {
    name: "ShoppingCart",
    keywords: ["cart", "shop", "buy", "ecommerce", "purchase"],
  },
  { name: "Tag", keywords: ["tag", "label", "price", "category", "sale"] },
  {
    name: "Briefcase",
    keywords: ["business", "work", "job", "portfolio", "career"],
  },
  {
    name: "Building",
    keywords: ["company", "office", "business", "organization", "corporate"],
  },
  {
    name: "Factory",
    keywords: ["factory", "production", "industry", "manufacturing"],
  },
  {
    name: "Store",
    keywords: ["store", "shop", "retail", "market", "business"],
  },
  {
    name: "Warehouse",
    keywords: ["warehouse", "storage", "inventory", "logistics"],
  },
  {
    name: "Trophy",
    keywords: ["win", "award", "success", "achievement", "champion"],
  },
  {
    name: "Award",
    keywords: ["award", "prize", "badge", "recognition", "medal"],
  },
  { name: "Crown", keywords: ["premium", "king", "best", "leader", "vip"] },

  // Technology & engineering
  {
    name: "Cpu",
    keywords: ["processor", "chip", "compute", "hardware", "performance"],
  },
  {
    name: "Server",
    keywords: ["server", "backend", "host", "infrastructure", "data"],
  },
  {
    name: "Database",
    keywords: ["database", "data", "storage", "sql", "records"],
  },
  {
    name: "Cloud",
    keywords: ["cloud", "saas", "hosting", "storage", "internet"],
  },
  {
    name: "Code",
    keywords: ["code", "develop", "program", "software", "engineering"],
  },
  {
    name: "Terminal",
    keywords: ["terminal", "cli", "command", "console", "shell"],
  },
  { name: "Bug", keywords: ["bug", "error", "issue", "defect", "debug"] },
  {
    name: "Webhook",
    keywords: ["webhook", "api", "integration", "event", "connect"],
  },
  {
    name: "Network",
    keywords: ["network", "connect", "graph", "nodes", "mesh"],
  },
  {
    name: "Boxes",
    keywords: ["modules", "components", "packages", "blocks", "stack"],
  },
  {
    name: "Component",
    keywords: ["component", "module", "block", "part", "ui"],
  },
  {
    name: "Puzzle",
    keywords: ["puzzle", "integration", "piece", "solution", "fit"],
  },
  {
    name: "Layers",
    keywords: ["layers", "stack", "levels", "structure", "tiers"],
  },
  {
    name: "Package",
    keywords: ["package", "module", "box", "shipment", "bundle"],
  },
  { name: "Bot", keywords: ["bot", "robot", "ai", "automation", "assistant"] },
  {
    name: "Settings",
    keywords: ["settings", "config", "gear", "options", "preferences"],
  },
  {
    name: "Wrench",
    keywords: ["tool", "fix", "repair", "maintenance", "settings"],
  },
  { name: "Hammer", keywords: ["build", "tool", "construct", "fix", "make"] },
  { name: "Smartphone", keywords: ["phone", "mobile", "device", "app"] },
  { name: "Laptop", keywords: ["laptop", "computer", "device", "work"] },

  // Security
  {
    name: "Lock",
    keywords: ["lock", "secure", "private", "password", "protected"],
  },
  {
    name: "ShieldCheck",
    keywords: ["security", "protect", "safe", "verified", "trust"],
  },
  { name: "Key", keywords: ["key", "access", "password", "auth", "unlock"] },
  {
    name: "BadgeCheck",
    keywords: ["verified", "approved", "trusted", "certified", "check"],
  },
  { name: "Eye", keywords: ["view", "visible", "watch", "preview", "monitor"] },

  // Status & feedback
  { name: "Check", keywords: ["done", "complete", "yes", "success", "ok"] },
  {
    name: "CircleCheck",
    keywords: ["done", "complete", "success", "approved", "ok"],
  },
  { name: "X", keywords: ["close", "cancel", "no", "remove", "delete"] },
  {
    name: "TriangleAlert",
    keywords: ["warning", "caution", "alert", "danger", "risk"],
  },
  {
    name: "Info",
    keywords: ["info", "information", "help", "details", "note"],
  },
  {
    name: "CircleHelp",
    keywords: ["help", "question", "support", "faq", "unknown"],
  },
  { name: "Star", keywords: ["star", "favorite", "rating", "feature", "best"] },
  { name: "Heart", keywords: ["love", "like", "favorite", "health", "care"] },
  {
    name: "ThumbsUp",
    keywords: ["like", "approve", "good", "positive", "yes"],
  },
  { name: "Zap", keywords: ["fast", "energy", "power", "speed", "instant"] },
  { name: "Flame", keywords: ["hot", "trending", "fire", "popular", "energy"] },
  {
    name: "Clock",
    keywords: ["time", "schedule", "deadline", "duration", "history"],
  },
  {
    name: "Hourglass",
    keywords: ["time", "wait", "duration", "pending", "deadline"],
  },
  {
    name: "Calendar",
    keywords: ["calendar", "date", "schedule", "event", "plan"],
  },

  // Documents & data
  {
    name: "FileText",
    keywords: ["file", "document", "report", "text", "page"],
  },
  {
    name: "Folder",
    keywords: ["folder", "directory", "files", "organize", "group"],
  },
  {
    name: "Book",
    keywords: ["book", "read", "guide", "documentation", "knowledge"],
  },
  {
    name: "BookOpen",
    keywords: ["read", "learn", "guide", "documentation", "study"],
  },
  {
    name: "Bookmark",
    keywords: ["bookmark", "save", "favorite", "mark", "tag"],
  },
  {
    name: "Search",
    keywords: ["search", "find", "lookup", "explore", "query"],
  },
  {
    name: "Globe",
    keywords: ["global", "world", "internet", "web", "international"],
  },
  { name: "Link", keywords: ["link", "url", "connect", "chain", "reference"] },

  // Nature & misc
  {
    name: "Leaf",
    keywords: ["nature", "eco", "green", "growth", "sustainability"],
  },
  { name: "Sprout", keywords: ["grow", "start", "seed", "new", "nurture"] },
  {
    name: "TreePine",
    keywords: ["tree", "nature", "forest", "environment", "growth"],
  },
  { name: "Sun", keywords: ["sun", "light", "day", "energy", "bright"] },
  {
    name: "Recycle",
    keywords: ["recycle", "reuse", "sustainability", "loop", "green"],
  },
  { name: "Gift", keywords: ["gift", "reward", "bonus", "present", "offer"] },
  {
    name: "Coffee",
    keywords: ["coffee", "break", "energy", "morning", "cafe"],
  },
  { name: "Plane", keywords: ["travel", "flight", "trip", "fast", "delivery"] },
  {
    name: "Truck",
    keywords: ["delivery", "shipping", "logistics", "transport", "freight"],
  },
  {
    name: "Anchor",
    keywords: ["anchor", "stable", "foundation", "fixed", "base"],
  },
];

const ICON_NAME_SET: ReadonlySet<string> = new Set(
  ICON_CATALOG.map((entry) => entry.name),
);

const ICON_BY_NAME: ReadonlyMap<string, IconEntry> = new Map(
  ICON_CATALOG.map((entry) => [entry.name, entry]),
);

/**
 * Curated default set surfaced when the search query is empty. These are the
 * most broadly useful icons for diagrams, in a sensible presentation order.
 */
const DEFAULT_ICON_NAMES: readonly string[] = [
  "Lightbulb",
  "Target",
  "Rocket",
  "Users",
  "TrendingUp",
  "Check",
  "Star",
  "Flag",
  "Workflow",
  "DollarSign",
  "Database",
  "Cloud",
  "ShieldCheck",
  "Zap",
  "Calendar",
  "MessageSquare",
  "Settings",
  "Search",
  "Globe",
  "Heart",
  "Clock",
  "Briefcase",
  "BarChart",
  "Sparkles",
];

const DEFAULT_ICONS: readonly IconEntry[] = DEFAULT_ICON_NAMES.map((name) =>
  ICON_BY_NAME.get(name),
).filter((entry): entry is IconEntry => entry !== undefined);

const DEFAULT_LIMIT = 30;
const DEFAULT_SUGGESTION_LIMIT = 6;

/** Returns true when `name` is a known icon in the catalog. */
export function isKnownIcon(name: string | null | undefined): boolean {
  return name != null && ICON_NAME_SET.has(name);
}

/** Looks up a catalog entry by its canonical name, or `undefined`. */
export function getIconEntry(name: string): IconEntry | undefined {
  return ICON_BY_NAME.get(name);
}

function scoreEntry(entry: IconEntry, query: string): number {
  const name = entry.name.toLowerCase();
  let score = 0;

  if (name === query) score = Math.max(score, 100);
  else if (name.startsWith(query)) score = Math.max(score, 80);
  else if (name.includes(query)) score = Math.max(score, 60);

  for (const keyword of entry.keywords) {
    const value = keyword.toLowerCase();
    if (value === query) score = Math.max(score, 70);
    else if (value.startsWith(query)) score = Math.max(score, 50);
    else if (value.includes(query)) score = Math.max(score, 30);
  }

  return score;
}

/**
 * Ranks catalog icons by relevance to `query`. Matching is case-insensitive and
 * considers both the icon name and its keywords. An empty (or whitespace-only)
 * query returns a curated default set. Results are deterministic: ties break
 * alphabetically by name.
 */
export function searchIcons(
  query: string,
  limit: number = DEFAULT_LIMIT,
): IconEntry[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return DEFAULT_ICONS.slice(0, max);
  }

  const matches: { entry: IconEntry; score: number }[] = [];
  for (const entry of ICON_CATALOG) {
    const score = scoreEntry(entry, normalized);
    if (score > 0) matches.push({ entry, score });
  }

  matches.sort(
    (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name),
  );

  return matches.slice(0, max).map((match) => match.entry);
}

/**
 * Suggests icons for a node label by searching the full label first, then
 * individual words as fallbacks. Results are de-duplicated in discovery order.
 */
export function suggestIconsForLabel(
  label: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): IconEntry[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const trimmed = label.trim();
  if (!trimmed) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: IconEntry[] = [];
  const queries = [
    trimmed,
    ...trimmed
      .split(/[^A-Za-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  ];

  for (const query of queries) {
    for (const entry of searchIcons(query, max)) {
      if (seen.has(entry.name)) {
        continue;
      }
      seen.add(entry.name);
      suggestions.push(entry);
      if (suggestions.length >= max) {
        return suggestions;
      }
    }
  }

  return suggestions;
}
