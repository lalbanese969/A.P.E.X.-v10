/* ============================================================================
   [MODULE: seedData.js]
   Default/demo data written into localStorage the FIRST time APEX runs in a
   browser (see storage.ensureSeeded calls in memory.js / connections.js).
   This is a straight port of the example JSON files that used to live in the
   Python backend's core_memory/ and config/ folders, so the demo experience
   (Taylor, the APEX project, the DocuSign email, calendar events) is identical.
   ============================================================================ */

export const SEED_CATALOG = {
  cards: [
    {
      id: "person_taylor_001",
      type: "person",
      display_name: "Taylor",
      aliases: ["Tay", "girlfriend", "my girlfriend"],
      relationship_to_user: "girlfriend",
      summary_card: "Girlfriend. Likes sushi and hiking. Birthday in spring (April 12).",
      available_sections: ["identity", "birthday", "preferences", "likes", "dislikes",
                           "favorite_foods", "hobbies", "gift_ideas", "important_notes"],
      tags: ["girlfriend", "relationship", "gifts", "birthday", "people"],
      importance: 5,
    },
    {
      id: "project_apex_001",
      type: "project",
      display_name: "A.P.E.X.",
      aliases: ["apex", "a.p.e.x.", "apex v10", "the assistant project"],
      relationship_to_user: null,
      summary_card: "A.P.E.X. (Adaptive Personal Executive Xpert): the user's custom modular AI assistant.",
      available_sections: ["identity", "status", "goals", "components", "decisions", "open_questions"],
      tags: ["apex", "project", "assistant", "ai", "build"],
      importance: 5,
    },
  ],
};

export const SEED_PEOPLE = {
  person_taylor_001: {
    id: "person_taylor_001",
    type: "person",
    display_name: "Taylor",
    first_name: "Taylor",
    last_name: "Reed",
    aliases: ["Tay", "girlfriend", "my girlfriend"],
    relationship_to_user: "girlfriend",
    birthday: "1999-04-12",
    important_dates: [{ label: "anniversary", date: "2023-09-02" }],
    preferences: { coffee_order: "oat milk latte", communication: "prefers texts over calls" },
    likes: ["sushi", "hiking", "indie music", "houseplants"],
    dislikes: ["horror movies", "cilantro"],
    favorite_foods: ["sushi", "ramen", "dark chocolate"],
    favorite_places: ["the coast", "local botanical garden"],
    hobbies: ["hiking", "watercolor painting", "gardening"],
    gift_ideas: ["new watercolor set", "weekend hiking trip", "rare houseplant"],
    important_notes: [
      "Allergic to shellfish - sushi means salmon/veggie rolls only.",
      "Saving up for a trip to Japan.",
    ],
    conversation_notes: [],
  },
};

export const SEED_PROJECTS = {
  project_apex_001: {
    id: "project_apex_001",
    type: "project",
    display_name: "A.P.E.X.",
    status: "active",
    summary: "A.P.E.X. (Adaptive Personal Executive Xpert) is the user's custom modular AI assistant, now running entirely client-side in the browser.",
    goals: [
      "Feel like a single natural assistant to the user.",
      "Use efficient memory (catalog + resolver + small packet) instead of dumping all memory into the prompt.",
      "Stay free and always-reachable without depending on a personal computer staying on.",
    ],
    components: ["UI (index.html)", "Memory (js/memory.js)", "AI Center (js/aiCenter.js)",
                "Pipeline (js/pipeline.js)", "Connections (js/connections.js)"],
    decisions: [
      { text: "Migrated from a Python backend to a pure client-side JS app for free GitHub Pages hosting." },
      { text: "Groq is the primary brain (confirmed CORS-friendly for direct browser calls); Gemini is the fallback." },
    ],
    open_questions: ["Real Gmail/Outlook OAuth (browser-side, like the old mailcal project).",
                     "Cross-device memory sync (would need something like Supabase)."],
  },
};

export const SEED_PROFILE = {
  identity: { name: "A.P.E.X.", full_name: "Adaptive Personal Executive Xpert", role: "personal executive assistant" },
  tone: { value: "witty, warm, best-friend energy — always addresses the user as 'sir'", confidence: 0.2, evidence: [] },
};

/* The USER's own self-record — facts about the user himself (not another person).
   This is where "remember that I…" facts land. Starts mostly empty; the memory
   writer fills it over time. Always injected into context so APEX knows it. */
export const SEED_USER = {
  id: "user_self",
  type: "user",
  display_name: "the user",
  preferences: {},
  likes: [],
  dislikes: [],
  favorite_foods: [],
  hobbies: [],
  important_notes: [],
  important_dates: [],
  birthday: null,
};

/* ----------------------------------------------------------------------------
   PERSONALITY — random greetings shown in chat (on load + "New Chat"), so it's
   never the same line twice in a row. Always addresses the user as "sir".
   This is a lightweight personality pass; a bigger voice/tone overhaul may
   replace or extend this later — see STATUS.md.
   ---------------------------------------------------------------------------- */
export const APEX_GREETINGS = [
  "Online and over-caffeinated, sir. What's the move?",
  "A.P.E.X. reporting for duty, sir. Try not to need me too much.",
  "Back online, sir. I've missed the chaos.",
  "At your service, sir — try to make it interesting.",
  "Systems nominal, sir. Let's go ruin some inefficiency.",
  "Sir. I was wondering when you'd show up.",
  "Booted up and judgmental as ever, sir. What do you need?",
  "Good to see you, sir. The honeycomb missed you too.",
  "Ready when you are, sir — no pressure, but I am very good at this.",
  "Online, sir. Let's pretend we both know what we're doing.",
  "Standing by, sir. Try me.",
  "Hey sir. I kept the lights on, figuratively.",
  "A.P.E.X. here, sir — resident genius, occasional smartass.",
  "Reporting in, sir. What fresh chaos shall we tackle?",
  "Right on schedule, sir. Or are you early? I never know.",
];

export const SEED_WRITING_STYLE = {
  tone: "friendly and professional",
  defaults: { sign_off: "Thanks,", length: "concise", formality: "medium" },
  learned_preferences: [],
};

export const SEED_ACCOUNTS = {
  accounts: [
    { id: "gmail_personal", label: "Personal Gmail", type: "gmail", address: "you.personal@gmail.com", purpose: "personal", status: "mock" },
    { id: "outlook_work", label: "Work Outlook", type: "outlook", address: "you@company.com", purpose: "work", status: "mock" },
  ],
  calendars: [
    { id: "gcal_primary", label: "Primary (Google)", type: "google", purpose: "main", status: "mock" },
  ],
};

export const SEED_EMAIL_MESSAGES = {
  gmail_personal: [
    {
      id: "msg_docusign_001",
      account_id: "gmail_personal",
      sender: "DocuSign <dse@docusign.net>",
      subject: "Please DocuSign: Lease Renewal Agreement 2026",
      snippet: "You have received a document to review and sign...",
      body: "Hello,\n\nYou have received a document to review and sign: 'Lease Renewal Agreement 2026' from Maple Street Properties (leasing@maplestreet.com). This envelope expired before it was completed.\n\nRegards,\nDocuSign on behalf of Maple Street Properties",
      date: "2026-05-02",
      unread: false,
    },
    {
      id: "msg_invoice_002",
      account_id: "gmail_personal",
      sender: "billing@webhost.com",
      subject: "Your invoice for May is ready",
      snippet: "Invoice #4821 totaling $24.00 is now available...",
      body: "Invoice #4821 totaling $24.00 is now available. No action needed if autopay is on.",
      date: "2026-06-18",
      unread: true,
    },
    {
      id: "msg_friend_003",
      account_id: "gmail_personal",
      sender: "Taylor <taylor@example.com>",
      subject: "hiking this weekend?",
      snippet: "Want to do the coast trail Saturday morning?",
      body: "Hey! Want to do the coast trail Saturday morning? Let me know :)",
      date: "2026-06-20",
      unread: true,
    },
  ],
};

/* ----------------------------------------------------------------------------
   GOOGLE CALENDAR COLORS
   The exact 11 Google Calendar EVENT colors (Material palette), by colorId 1–11,
   with Google's own names and hex values. These match what you see in Google
   Calendar's event color picker.
   ---------------------------------------------------------------------------- */
export const GOOGLE_CALENDAR_COLORS = [
  { id: "1",  name: "Lavender",  hex: "#7986CB" },
  { id: "2",  name: "Sage",      hex: "#33B679" },
  { id: "3",  name: "Grape",     hex: "#8E24AA" },
  { id: "4",  name: "Flamingo",  hex: "#E67C73" },
  { id: "5",  name: "Banana",    hex: "#F6BF26" },
  { id: "6",  name: "Tangerine", hex: "#F4511E" },
  { id: "7",  name: "Peacock",   hex: "#039BE5" },
  { id: "8",  name: "Graphite",  hex: "#616161" },
  { id: "9",  name: "Blueberry", hex: "#3F51B5" },
  { id: "10", name: "Basil",     hex: "#0B8043" },
  { id: "11", name: "Tomato",    hex: "#D50000" },
];

// The "Other"/default color used when an event doesn't match any category.
// Peacock (#039BE5) is Google Calendar's signature default blue.
export const DEFAULT_CALENDAR_COLOR_ID = "7";

/* Color -> category keywords. When you ask APEX to add an event, it matches the
   event title against these keywords to pick the color. Seeded with one example
   (Basil/green = food/lunch, per your example); fill in the rest from Settings. */
export const SEED_CALENDAR_CATEGORIES = {
  "10": "lunch, food, dinner, brunch, breakfast, coffee",
  "11": "deadline, urgent, due",
  "4":  "doctor, dentist, appointment, medical",
  "2":  "hike, hiking, gym, workout, run",
};

/** Calendar events spread across the CURRENT month (so the month grid looks alive),
    each tagged with a Google colorId. A couple land on "today" for the chat demo. */
export function buildSeedCalendarEvents() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const p = (n) => String(n).padStart(2, "0");
  const iso = (day, h, min = 0) => `${y}-${p(m + 1)}-${p(day)}T${p(h)}:${p(min)}`;
  const cid = "gcal_primary";
  const clamp = (d) => Math.min(Math.max(d, 1), 28);

  return [
    { id: "evt_t1", calendar_id: cid, title: "Lunch with Taylor",        start: iso(today, 12, 0),         end: iso(today, 13, 0),         location: "Sushi place",     colorId: "10" },
    { id: "evt_t2", calendar_id: cid, title: "Dentist appointment",      start: iso(today, 15, 0),         end: iso(today, 16, 0),         location: "Downtown Dental", colorId: "4"  },
    { id: "evt_a",  calendar_id: cid, title: "Team standup",             start: iso(clamp(today + 1), 9, 30), end: iso(clamp(today + 1), 10, 0), notes: "Weekly sync",    colorId: "7"  },
    { id: "evt_b",  calendar_id: cid, title: "Project deadline: demo",   start: iso(clamp(today + 2), 17, 0), end: iso(clamp(today + 2), 17, 30),                          colorId: "11" },
    { id: "evt_c",  calendar_id: cid, title: "Hiking - coast trail",     start: iso(clamp(today + 4), 8, 0),  end: iso(clamp(today + 4), 12, 0), location: "Coast trail", colorId: "2"  },
    { id: "evt_d",  calendar_id: cid, title: "Pay rent",                 start: iso(3, 9, 0),               end: iso(3, 9, 15),                                          colorId: "5"  },
    { id: "evt_e",  calendar_id: cid, title: "Coffee with Sam",          start: iso(6, 10, 0),              end: iso(6, 11, 0),             location: "Blue Bottle",     colorId: "10" },
    { id: "evt_f",  calendar_id: cid, title: "Movie night",              start: iso(9, 20, 0),              end: iso(9, 22, 30),                                         colorId: "1"  },
    { id: "evt_g",  calendar_id: cid, title: "Gym",                      start: iso(11, 7, 0),              end: iso(11, 8, 0),                                          colorId: "2"  },
    { id: "evt_h",  calendar_id: cid, title: "Dinner with parents",      start: iso(16, 18, 30),           end: iso(16, 20, 0),                                         colorId: "10" },
    { id: "evt_i",  calendar_id: cid, title: "Quarterly review",         start: iso(20, 14, 0),            end: iso(20, 15, 0),            notes: "Bring slides",       colorId: "9"  },
    { id: "evt_j",  calendar_id: cid, title: "Flight to NYC",            start: iso(24, 6, 0),             end: iso(24, 9, 0),             location: "SFO",             colorId: "6"  },
    { id: "evt_k",  calendar_id: cid, title: "Call plumber",             start: iso(27, 11, 0),            end: iso(27, 11, 30),                                        colorId: "7"  },
  ];
}

/* ----------------------------------------------------------------------------
   LOGS + TIMERS (mock, for the future automation/backend-calls feature)
   The Logs page is for when APEX runs WITHOUT the UI — scheduled triggers,
   automations, external API calls — recording what it did and when. Timers are
   the scheduled calls that will drive those automations later.
   ---------------------------------------------------------------------------- */
export function buildSeedLogs() {
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600 * 1000).toISOString();
  return [
    { time: ago(1),  source: "scheduled-trigger", action: "morning_briefing",     detail: "Generated daily summary (3 events, 2 unread emails)", status: "ok" },
    { time: ago(4),  source: "automation",        action: "stale_email_followup", detail: "Scanned inbox for threads with no reply > 5 days (0 found)", status: "ok" },
    { time: ago(7),  source: "api",               action: "calendar_sync",        detail: "Pulled 13 events from Google Calendar", status: "ok" },
    { time: ago(12), source: "scheduled-trigger", action: "draft_replies",        detail: "Prepared 1 draft reply for review", status: "ok" },
    { time: ago(26), source: "automation",        action: "lights_evening",       detail: "Attempted to dim strip lights — not yet connected", status: "skipped" },
    { time: ago(30), source: "api",               action: "weather_check",        detail: "Fetched forecast for morning briefing", status: "error" },
  ];
}

/* Structured timer definitions — config only, nothing executes these yet.
   type: "daily" (time) | "weekly" (day 0=Sun..6=Sat + time) | "interval" (intervalHours) */
export const SEED_TIMERS = [
  { id: "timer_morning",  name: "Morning briefing",      type: "daily",    time: "08:00",            enabled: true  },
  { id: "timer_stale",    name: "Stale email follow-up", type: "interval", intervalHours: 6,          enabled: true  },
  { id: "timer_weekly",   name: "Weekly review",         type: "weekly",   day: 0, time: "18:00",     enabled: true  },
  { id: "timer_lights",   name: "Evening lights",        type: "daily",    time: "20:00",             enabled: false },
];
