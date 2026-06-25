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
  tone: { value: "warm-professional", confidence: 0.2, evidence: [] },
};

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

/** Calendar events generated relative to TODAY (so the demo always feels current). */
export function buildSeedCalendarEvents() {
  const at = (dayOffset, hour, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  };
  const cid = "gcal_primary";
  return [
    { id: "evt_today_1", calendar_id: cid, title: "Dentist appointment", start: at(0, 14, 0), end: at(0, 15, 0), location: "Downtown Dental" },
    { id: "evt_today_2", calendar_id: cid, title: "Dinner with Taylor", start: at(0, 18, 30), end: at(0, 20, 0), location: "Sushi place" },
    { id: "evt_tom_1", calendar_id: cid, title: "Team standup", start: at(1, 9, 30), end: at(1, 10, 0), notes: "Weekly sync" },
    { id: "evt_d2_1", calendar_id: cid, title: "Project deadline: APEX demo", start: at(2, 17, 0), end: at(2, 17, 30) },
    { id: "evt_d4_1", calendar_id: cid, title: "Hiking - coast trail", start: at(4, 8, 0), end: at(4, 12, 0), location: "Coast trailhead" },
  ];
}
