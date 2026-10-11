// Coach Handbook (DP, 2026-10): the Coach Welcome Pack split into two coach-
// facing sections, "Start here" (onboarding) and "SOPs" (the day-to-day
// playbooks). Server-rendered by HandbookView, so none of this ships in the
// client bundle. DP-authored, so it is gated on IS_DP like the other built-in
// coach content: a rebranded deploy starts empty.
//
// Inline syntax inside any text field: **bold** and [label](href). An href of
// the form "page:<id>" links to that handbook page in whichever section it
// lives in.

import { IS_DP } from "@/lib/brand";
import { COACH_SOPS } from "@/lib/coach-content/sops";

export type HandbookStep = {
  /** Small label above the title, e.g. "Monday" or "Day after it's missed". */
  when?: string;
  title: string;
  body?: string;
  /** A message the coach can copy and send to the client. */
  script?: string;
  /** Marks the step as a hard deadline. */
  deadline?: boolean;
};

export type HandbookBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string; tag?: string }
  | { kind: "list"; items: string[] }
  | { kind: "checklist"; items: string[] }
  | { kind: "steps"; items: HandbookStep[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "script"; text: string; label?: string }
  | { kind: "template"; title: string; lines: string[]; note?: string }
  | { kind: "note"; text: string; tone?: "info" | "warn"; title?: string }
  | { kind: "stats"; items: { value: string; label: string }[] }
  | { kind: "cards"; items: { title: string; sub?: string; body?: string }[] }
  | { kind: "links"; items: { label: string; href: string | null; note?: string }[] }
  /** A body in the Academy/SOP markdown-lite (**Heading**, "- " bullets). */
  | { kind: "md"; body: string };

export type HandbookPage = {
  id: string;
  /** Group label inside the section's page list (e.g. "Admin"). */
  group: string;
  title: string;
  /** One line under the title. */
  intro?: string;
  blocks: HandbookBlock[];
};

export type HandbookSectionId = "start" | "sops";

export type HandbookSection = {
  id: HandbookSectionId;
  /** Route the section renders on. */
  path: string;
  title: string;
  subtitle: string;
  pages: HandbookPage[];
};

// ─── External links (edit here) ────────────────────────────────────────────
export const COACH_LINKS = {
  complianceForm: "https://forms.gle/upAJo89kvJ3cUNVR7",
  coachProfileForm: "https://forms.gle/KcJ22X3EuL1ZSCtp7",
  workEmail: "https://mail.google.com",
  /** 1fit coach web login. Null until the owner confirms the URL. */
  oneFit: null as string | null,
  /** Slack invite link. Null until the owner supplies a never-expiring one. */
  slackInvite: null as string | null,
  loom: "https://www.loom.com",
};

// ─── Start here ────────────────────────────────────────────────────────────
const START_PAGES: HandbookPage[] = [
  {
    id: "welcome",
    group: "Before day one",
    title: "Welcome & setup",
    intro: "Glad you're here. Get this list done before you're assigned your first client.",
    blocks: [
      {
        kind: "p",
        text: "You've joined a team of qualified coaches who take results seriously. Our clients pay for transformation, not just a nice chat, so everything in here is built to get you coaching to our standard as fast as possible without dropping the ball for anyone. You won't be thrown in at the deep end: your caseload builds gradually, and Angus is with you the whole way.",
      },
      { kind: "p", text: "**Daniel Piplios**, Founder" },
      { kind: "h", text: "Admin", tag: "A" },
      {
        kind: "links",
        items: [
          {
            label: "Compliance form",
            href: COACH_LINKS.complianceForm,
            note: "ABN (or equivalent), invoicing and bank details including SWIFT code, date of birth, qualification certificates (Cert III & IV minimum, plus any degrees) and current insurance.",
          },
          {
            label: "Coach profile form",
            href: COACH_LINKS.coachProfileForm,
            note: "A short questionnaire so we match the right clients to you.",
          },
        ],
      },
      { kind: "h", text: "Accounts & access", tag: "B" },
      {
        kind: "list",
        items: [
          "Work email, 1fit and Slack: step by step in [Your accounts](page:accounts)",
          "Your own Loom or Tella account for welcome videos and check-ins",
        ],
      },
      { kind: "h", text: "Your WhatsApp", tag: "C" },
      {
        kind: "checklist",
        items: [
          "WhatsApp ready for client group chats",
          "Profile photo set: if you don't have one, use something professional or gym related",
        ],
      },
      { kind: "h", text: "Read before you start", tag: "D" },
      {
        kind: "list",
        items: [
          "[Your first week](page:first-week) and [your first 4 weeks](page:first-4-weeks)",
          "[Contacts](page:contacts) and [the team](page:team)",
          "The SOPs, KPIs and [pay](page:pay)",
          "The [Coach Academy](/academy)",
        ],
      },
    ],
  },
  {
    id: "accounts",
    group: "Before day one",
    title: "Your accounts",
    intro: "Everything runs through your DPperformance email. Set that up first, then 1fit and Slack.",
    blocks: [
      {
        kind: "steps",
        items: [
          {
            when: "1",
            title: "Your DPperformance email",
            body: "**yourname@dpperformance.com.au**. It runs on Google Workspace, so it works just like Gmail. We'll send your login details to your personal email. Sign in at gmail.com with your new address. It's also how you sign in to this portal: choose **Continue with Google** and pick your work email.",
          },
          {
            when: "2",
            title: "1fit",
            body: "Your coach login is set up under your work email, so the invite lands in your work inbox, not your personal one. Accept it and log in.",
          },
          {
            when: "3",
            title: "Slack",
            body: "Download Slack on your computer and phone, then join our workspace with your work email. Turn on notifications so you never miss a new client.",
          },
        ],
      },
      { kind: "h", text: "What happens in Slack" },
      {
        kind: "table",
        head: ["What", "Where", "SOP"],
        rows: [
          ["New clients come through", "Your DMs", "[New client setup](page:new-client)"],
          ["Pauses", "#admin-pauses", "[Pauses & cancellations](page:pauses-cancellations)"],
          ["Cancellations", "#admin-cancellations", "[Pauses & cancellations](page:pauses-cancellations)"],
          ["Service changes", "#admin-service-change", "[Changes & refunds](page:changes-refunds)"],
          ["Transformations", "#transformations", "[Transformations](page:transformations)"],
        ],
      },
    ],
  },
  {
    id: "first-week",
    group: "Your first month",
    title: "Your first week",
    intro: "Day by day, for every new coach cohort. Angus reviews and ticks off each step. All times are Melbourne time.",
    blocks: [
      {
        kind: "steps",
        items: [
          {
            when: "Monday · Read & learn",
            title: "Read the handbook and go through the Academy",
            body: "Read through Start here and the SOPs, then go through every [Coach Academy](/academy) module. Start your practicum (mock client) task. Your first client is usually assigned Monday or Tuesday.",
          },
          {
            when: "Wednesday · 10am",
            title: "Practicum submitted to Angus",
            body: "Complete the practicum task and submit it to Angus for review.",
            deadline: true,
          },
          {
            when: "Before Thursday · Your feedback",
            title: "Practicum feedback and grade",
            body: "Angus sends you a Loom going through your practicum feedback. You're graded on it.",
          },
          {
            when: "Thursday · Cohort call",
            title: "Live call with Angus",
            body: "Your onboarding cohort jumps on a call with Angus. One of you sets up a client live, and you all work through it together.",
          },
          {
            when: "Thursday · After the call",
            title: "Build your first client's plans",
            body: "Build your first client's training and meal plans, then submit them to Angus.",
            deadline: true,
          },
          {
            when: "Friday · Welcome video",
            title: "Record your welcome video",
            body: "Record the welcome video walking your client through their plans and submit it to Angus.",
            deadline: true,
          },
          {
            when: "Saturday · Final check",
            title: "Re-record if needed",
            body: "If Angus asks for changes, re-record. Otherwise it's all good to send to your client.",
          },
        ],
      },
      {
        kind: "note",
        title: "Then it's client time",
        text: "Your first client's plans and welcome video go out by 10am Sunday at the latest ([client first week](page:client-first-week)). Weeks 2 to 4, and how Angus graduates you from review, are in [your first 4 weeks](page:first-4-weeks).",
      },
    ],
  },
  {
    id: "first-4-weeks",
    group: "Your first month",
    title: "Your first 4 weeks",
    intro: "Every step is earned by hitting the standard, not by the calendar.",
    blocks: [
      {
        kind: "steps",
        items: [
          { when: "Week 1 · Foundations", title: "First client", body: "Explained day by day in [your first week](page:first-week): the Academy, your practicum, the cohort call and your first client." },
          { when: "Week 2 · Supervised", title: "Your first client starts", body: "Keep everything going to Angus for review. Submit plans and welcome videos for any new clients for review." },
          { when: "Week 3 · Growing", title: "Small batches", body: "New clients are added in small batches, and your first couple of check-ins go out. Everything is still reviewed by Angus." },
          { when: "Week 4 · Graduation", title: "Sending without review", body: "We graduate you to sending welcome videos and/or check-ins without review. Depending on how you're going, we may keep reviewing for an extended probation period." },
        ],
      },
      { kind: "note", text: "Team calls are weekly. Join them, find out your designated team call time, and use them to bounce ideas off fellow coaches and bring your questions and client issues." },
      { kind: "h", text: "What we want to see" },
      {
        kind: "cards",
        items: [
          { title: "Turnaround", body: "Check-ins answered on time, every time" },
          { title: "Compliance", body: "Clients hitting training, step and protein targets" },
          { title: "Early results", body: "Measurable progress showing within 4 to 8 weeks" },
        ],
      },
      { kind: "h", text: "What to submit to Angus, and in what order" },
      { kind: "p", text: "Angus graduates you through each level. He ticks you off, not the calendar." },
      {
        kind: "steps",
        items: [
          { when: "1", title: "Plans", body: "Build the training and meal plans first. Angus reviews them before they go to the client, and before you make the welcome video." },
          { when: "2", title: "Welcome video", body: "Once plans are approved and ticked off, you make the welcome video. After you graduate from plan building, you submit only the welcome video walking through the plans." },
          { when: "3", title: "Check-ins", body: "Every check-in is submitted for review and sent out once Angus ticks it off. After you graduate from welcome video review, you submit check-ins only." },
          { when: "4", title: "On your own", body: "Once Angus graduates you from check-in review, you run your clients without sign-off." },
        ],
      },
    ],
  },
  {
    id: "contacts",
    group: "People",
    title: "Your contacts",
    intro: "Who to go to, and for what.",
    blocks: [
      {
        kind: "table",
        head: ["Who", "Ask about", "WhatsApp"],
        rows: [
          ["**Angus**, Head Coach", "Coaching, programming, client questions", "+61 449 104 597"],
          ["**Jameela**, Admin Ops", "Pauses, cancellations, billing, pricing & packages, new leads, scheduling & admin", "+63 965 049 8176"],
          ["**Mykael**, Tech & Systems", "Tech, 1fit & portal access, builds, sheets, scheduling & admin", "+61 417 606 941"],
          ["**Brooke**, Marketing", "Marketing, transformation content", "+61 427 388 740"],
          ["**Ruby**, Influencers", "Influencers, UGC", "+61 473 846 062"],
          ["**Daniel**, Founder", "Anything else", "+971 58 805 4491"],
        ],
      },
      { kind: "note", text: "Pause, cancellation, service-switch and refund requests go to Jameela through the Slack admin channels (see the [Admin SOPs](page:pauses-cancellations))." },
    ],
  },
  {
    id: "team",
    group: "People",
    title: "The team",
    intro: "Who we are and who to ask.",
    blocks: [
      { kind: "h", text: "Founder" },
      { kind: "cards", items: [{ title: "Daniel Piplios", sub: "Founder" }] },
      { kind: "h", text: "Department leads" },
      {
        kind: "cards",
        items: [
          { title: "Angus", sub: "Head Coach" },
          { title: "Jay", sub: "Closer / Dialer" },
          { title: "Jameela", sub: "Admin Ops" },
          { title: "Brooke", sub: "Marketing" },
          { title: "Ruby", sub: "Influencers / UGC" },
          { title: "Mykael", sub: "Tech & Systems" },
        ],
      },
      { kind: "h", text: "Coaching team, led by Angus" },
      { kind: "p", text: "Darcy, Paul, Stephen, Perry, Damon, Keri, Ella, Amy, Kate, Jake, Riley, Maddy and Paige." },
      { kind: "h", text: "Who do I contact?" },
      {
        kind: "table",
        head: ["For", "Contact"],
        rows: [
          ["Coaching and programming questions", "Angus"],
          ["Pricing, packages, new leads", "Jameela"],
          ["Pause or cancel requests, billing", "Jameela"],
          ["Marketing and transformation content", "Brooke"],
          ["Influencers and UGC", "Ruby"],
          ["Tech, 1fit and portal access, builds", "Mykael"],
          ["Scheduling and admin", "Mykael & Jameela"],
          ["Anything else", "Daniel"],
        ],
      },
    ],
  },
  {
    id: "pay",
    group: "People",
    title: "Pay & handovers",
    intro: "How you get paid, taking on a reassigned client, and what's handled for you.",
    blocks: [
      {
        kind: "stats",
        items: [
          { value: "5th", label: "Payday, every month" },
          { value: "4–5 wks", label: "Weeks paid per cycle: usually 4, sometimes 5" },
          { value: "Approve", label: "Jameela sends your invoice to approve and send back" },
        ],
      },
      {
        kind: "list",
        items: [
          "You're paid on the 5th of every month for the completed weeks before that date.",
          "Most months that's 4 weeks. A few times a year the cycle lands on a 5-week period.",
          "Jameela sends you an invoice each month. Check it, approve it and send it back.",
          "Your rates and pay details are in your contract.",
        ],
      },
      { kind: "h", text: "Taking on a reassigned client" },
      {
        kind: "steps",
        items: [
          { when: "1 · Old coach", title: "Records a handover video", body: "A quick video for each client being transferred: a short summary of where they're at." },
          { when: "2 · New coach", title: "Watches the handover", body: "Goes through the client's history." },
          { when: "3 · From there", title: "Takes them on", body: "Take them on from their next check-in." },
        ],
      },
      { kind: "h", text: "Handled for you" },
      {
        kind: "cards",
        items: [
          { title: "Offboarding a cancelled client", body: "Nothing for you to do. The admin team takes care of it." },
          { title: "End of the 16-week term", body: "Jameela handles clients approaching the end of their initial 16-week term." },
        ],
      },
    ],
  },
];

// ─── SOPs ──────────────────────────────────────────────────────────────────
const SOP_PAGES: HandbookPage[] = [
  {
    id: "pauses-cancellations",
    group: "Admin",
    title: "Pauses & cancellations",
    intro: "Set expectations early, communicate when something changes, and go to the right person when you need help.",
    blocks: [
      { kind: "h", text: "Pauses", tag: "#admin-pauses" },
      { kind: "p", text: "Post pause requests in **#admin-pauses** on Slack using the format. Jameela (Admin) approves pauses, and questions go to her." },
      {
        kind: "list",
        items: [
          "Minimum pause is 1 week. If a fortnightly client only wants a week off, offer to swap the fortnight instead.",
          "Maximum pause is 12 weeks unless approved for longer. There must be a reason for the pause.",
          "Billing is skipped during the pause. Clients lose app access and check-ins aren't required.",
        ],
      },
      {
        kind: "template",
        title: "Pause request",
        lines: ["Name: [Client name]", "Pause starts: [Date]", "Pause end: [Date]", "Reason: [Reason for the pause]"],
        note: "Tag Jameela with her actual Slack mention when posting.",
      },
      { kind: "h", text: "Cancellations", tag: "#admin-cancellations" },
      { kind: "p", text: "Cancellation requests go to Jameela (Admin). Post in **#admin-cancellations** using the format." },
      {
        kind: "list",
        items: [
          "Client still inside their initial 16-week term? Message Jameela directly. Don't put it through the channel.",
          "There's a 2-week notice period from when the client puts in their cancellation. Let them know this, and tell them you can put it through.",
        ],
      },
      {
        kind: "template",
        title: "Cancel Request",
        lines: ["Name - [Client name]", "Cancellation requested on - [Date]", "Reason - [Reason for cancelling]"],
        note: "Tag Jameela with her actual Slack mention when posting.",
      },
      { kind: "note", tone: "warn", title: "Save attempts first", text: "Before anything goes to Jameela, run the save conversation. Follow [the De-Cancel List](page:de-cancel)." },
    ],
  },
  {
    id: "de-cancel",
    group: "Admin",
    title: "The De-Cancel List",
    intro: "What to do the moment a client says they want to cancel.",
    blocks: [
      { kind: "note", title: "Your lane", text: "Your job is the save conversation. No need to discuss the money side of it: Jameela handles that. Just dig, offer the save, and route the rest to her." },
      { kind: "h", text: "1. Don't process. Dig deeper." },
      { kind: "p", text: "Never accept the first “I want to cancel” at face value. Warm, no pressure. If they haven't given you a reason yet:" },
      { kind: "script", text: "Totally understand. Just wondering if there's a main reason? Is there something we could do to help?" },
      { kind: "p", text: "Find the real reason. It's almost always one of four:" },
      {
        kind: "table",
        head: ["The real reason", "What it sounds like"],
        rows: [
          ["Money", "“It's getting expensive” / “money's tight right now”"],
          ["Time", "“Work's crazy” / “I can't keep up with check-ins”"],
          ["Life event", "“I'm travelling” / “moving house” / “family stuff”"],
          ["Results / motivation", "“I'm not really seeing changes” / “lost my mojo”"],
        ],
      },
      { kind: "h", text: "2. Match the reason to an offer" },
      { kind: "h", text: "Money or time: offer less, in this order" },
      { kind: "list", items: ["Fortnightly check-ins (lower weekly rate)", "Monthly check-ins", "App-only access"] },
      { kind: "script", text: "We could drop you to fortnightly or even monthly check-ins to bring the cost down. That way you keep the plan and the progress and save a bit of money." },
      { kind: "h", text: "Life event or travel: offer a pause" },
      { kind: "script", text: "What if we just paused you for a month instead? That way we can kick back off when you get back. You enjoy your travel (or busy period, or whatever it is), and we just come back to it from there." },
      { kind: "list", items: ["If they pause and never resume, the 2-week notice still applies. You don't explain that: Jameela covers it when she sets the pause up.", "Twelve weeks is the longest pause, unless it's approved for longer."] },
      { kind: "h", text: "Results or motivation: own it" },
      { kind: "p", text: "This one's on us, not them. Own it in the conversation, reset the plan or approach, and flag Angus so he's across it." },
      { kind: "note", tone: "warn", text: "A results-cancel that reaches Jameela without you and Angus having tried first is a miss." },
      { kind: "h", text: "3. Whatever the outcome, it goes to Jameela" },
      {
        kind: "cards",
        items: [
          { title: "They accept a save", body: "Switch, downgrade or pause: message Jameela on Slack with the client name and what was agreed. She adjusts billing and updates the systems." },
          { title: "They still want to cancel", body: "Escalate to Jameela on Slack. She applies the rules. Just tell the client: “No worries at all. I'll get our admin team to sort the details with you.”" },
        ],
      },
      { kind: "h", text: "4. Leave the door open" },
      { kind: "p", text: "However it ends, end warm. Cancelled clients come back, but only to coaches who made leaving easy." },
      { kind: "script", text: "Honestly it's been awesome working with you. Door's always open whenever you're ready to go again." },
      { kind: "note", title: "The one-line version", text: "Dig for the real reason → offer the matching save (pause / fortnightly / monthly / app-only) → everything goes through Jameela on Slack → never talk money rules → end warm." },
      { kind: "h", text: "Admin at a glance" },
      {
        kind: "table",
        head: ["Request", "Where", "Who"],
        rows: [
          ["Pause", "#admin-pauses", "Jameela"],
          ["Cancellation", "#admin-cancellations", "Jameela"],
          ["Cancellation inside 16-week term", "Direct message", "Jameela"],
          ["Service switch", "#admin-service-change", "Jameela"],
          ["Refund", "Escalate", "Jameela"],
          ["Complaint or reassignment", "Head coach", "Head coach / Daniel"],
        ],
      },
    ],
  },
  {
    id: "changes-refunds",
    group: "Admin",
    title: "Changes, refunds & channels",
    intro: "Service switches, refunds, complaints, and where client communication lives.",
    blocks: [
      { kind: "h", text: "Service switches", tag: "#admin-service-change" },
      { kind: "p", text: "Post service-change requests in **#admin-service-change** on Slack. These go to Jameela (Admin)." },
      { kind: "p", text: "The requested date is what the client asked for. It is not a confirmed billing date." },
      {
        kind: "template",
        title: "Service change request",
        lines: [
          "Name: [Client name]",
          "Current service: [Current service]",
          "Requested service: [New service]",
          "Requested change date: [Date requested by client]",
          "Reason: [Reason for the switch]",
        ],
        note: "Tag Jameela with her actual Slack mention when posting.",
      },
      { kind: "h", text: "Refund requests" },
      { kind: "p", text: "Escalate all refund requests to Jameela (Admin)." },
      { kind: "h", text: "Complaints & coach reassignment" },
      { kind: "p", text: "Complaints will often come to Daniel. A client can be reassigned to another coach. Head coaches manage this." },
      { kind: "h", text: "App vs WhatsApp" },
      {
        kind: "cards",
        items: [
          { title: "In the app (1fit)", sub: "Programs, training, meals", body: "All client programs, training, meals and related coaching material." },
          { title: "On WhatsApp", sub: "Check-ins & communication", body: "Check-ins and client communication, in the client's group chat. Check-ins should also be saved in the app." },
        ],
      },
      { kind: "h", text: "The client WhatsApp group" },
      {
        kind: "list",
        items: [
          "Each client has a WhatsApp group with Daniel, you and the client.",
          "Daniel is there to oversee everything, and so the admin team can flag anything if needed.",
          "All communication with the client stays in this group.",
          "If a client messages you privately, redirect them to the group and forward their messages back into the group.",
        ],
      },
    ],
  },
  {
    id: "new-client",
    group: "Client setup",
    title: "Setting up a new client",
    intro: "What happens automatically, then how to build the plan.",
    blocks: [
      { kind: "h", text: "When you get a new client (automatic)", tag: "Draft" },
      {
        kind: "list",
        items: [
          "You get a Slack notification",
          "Client appears in the Check-In Log",
          "Client appears in your 1fit client list",
          "WhatsApp group created: you, the client and Daniel",
          "Daniel sends the Skool onboarding modules",
        ],
      },
      { kind: "h", text: "Wait for the Q&A" },
      { kind: "p", text: "Every plan is customised from the Q&A. Don't build without it unless told to. Not in yet? Remind them in the WhatsApp group about a day before their start date. Deadlines are in [Response times & check-ins](page:response-checkins)." },
      { kind: "h", text: "In 1fit" },
      {
        kind: "list",
        items: [
          "Build in the nutrition and training plan sections, then assign from the client's profile.",
          "Duplicated a plan? Rename it, remove “(copy)” and adjust it.",
          "Add key client notes (e.g. vegetarian).",
        ],
      },
      { kind: "h", text: "Naming conventions" },
      {
        kind: "table",
        head: ["Plan", "Format", "Example"],
        rows: [
          ["Nutrition", "First Last - Phase", "Daniel Piplios - Deficit"],
          ["Training", "First Last - X day - Split", "Daniel Piplios - 5 day - PPL Chest Back & Arms"],
        ],
      },
      { kind: "p", text: "Phase is the client's current phase: Deficit, Reverse or Build." },
      { kind: "h", text: "Foods & ingredients" },
      {
        kind: "list",
        items: [
          "Include the brand where it matters (e.g. yoghurt, bread, wraps, protein powder)",
          "State cooked or raw for anything weighed: meat, rice, pasta, potatoes",
          "Be specific about the type: fat %, light vs full fat, cut of meat",
        ],
      },
      { kind: "p", text: "For example: **Chicken breast (raw)**, **Jasmine rice (cooked)**, **Chobani Fit Greek yoghurt**, **5% fat beef mince (raw)**." },
    ],
  },
  {
    id: "client-first-week",
    group: "Client setup",
    title: "Your new client's first week",
    intro: "For a client starting on Monday. All times are Melbourne time.",
    blocks: [
      {
        kind: "steps",
        items: [
          { when: "Assigned · Earlier in the week", title: "New client comes through", body: "Slack notification, Check-In Log, 1fit and the WhatsApp group ([new client setup](page:new-client)). Watch for their Q&A." },
          { when: "Q&A in · As soon as it lands", title: "Build the plans", body: "Training and meal plans, built from the Q&A and named to convention ([meal plans](page:meal-plans), [training & cardio](page:training-cardio))." },
          { when: "Thursday", title: "Plans submitted to Angus", body: "Angus reviews the plans before they go to the client.", deadline: true },
          { when: "Friday", title: "Welcome video made and submitted", body: "Once the plans are approved, record the welcome video walking the client through them and send it to Angus.", deadline: true },
          { when: "Saturday · Tweak or send", title: "Welcome video tweaked if needed", body: "Make any changes Angus asks for. Otherwise, it's good to go: send the plans and welcome video to the client." },
          { when: "Sunday · 10am at the latest", title: "Welcome video sent to client", body: "The latest it can go out, so they have time to ask questions before they start.", deadline: true },
          { when: "Monday · Day one", title: "Client starts", body: "Their first week is underway." },
        ],
      },
      {
        kind: "cards",
        items: [
          { title: "Graduated from review?", body: "Skip the Angus steps. Plans and welcome video still go to the client by 10am Sunday at the latest." },
          { title: "Q&A comes in late?", body: "Still aim to have everything sent by Sunday night, otherwise Monday first thing." },
        ],
      },
    ],
  },
  {
    id: "meal-plans",
    group: "Client setup",
    title: "Building meal plans",
    intro: "Every plan is personalised. Compliance beats complexity.",
    blocks: [
      { kind: "p", text: "Built from the client's Q&A: preferences, allergies and dislikes, training availability and gym access, experience level and goals. If anything is unclear, ask Angus or the coach group." },
      { kind: "h", text: "Daily meal structure" },
      { kind: "p", text: "Breakfast, lunch, dinner, a pre-workout snack and a post-workout snack." },
      {
        kind: "list",
        items: [
          "Use foods the client already enjoys. Keep meals easy to prep and repeatable week to week.",
          "Place the pre- and post-workout snacks around their gym timing.",
        ],
      },
      {
        kind: "cards",
        items: [
          { title: "Pre-workout snack", sub: "Fast-digesting carbs, low fat", body: "Rice cakes + honey, banana, LCM bar, fruit" },
          { title: "Post-workout snack", sub: "High protein, easy to digest", body: "Whey isolate + water, yoghurt bowl" },
        ],
      },
      { kind: "h", text: "The Recipe Index" },
      {
        kind: "list",
        items: [
          "Templated meals saved in 1fit. Use them when you're stuck.",
          "They're templates only: adjust quantities and ingredients for each client.",
          "Created a new meal? Save it as a template. New meals are added to the index at the end of each week.",
        ],
      },
      {
        kind: "cards",
        items: [
          { title: "Breakfast", sub: "1 sweet, 1 savoury", body: "Overnight oats / bircher, eggs, avo & sourdough" },
          { title: "Lunch & dinner", sub: "Keep it simple", body: "Beef mince burrito bowl, steak, potatoes & broccolini, chicken, sweet potato & greens, chicken pesto pasta" },
        ],
      },
    ],
  },
  {
    id: "training-cardio",
    group: "Client setup",
    title: "Training & cardio",
    intro: "Base splits, session counts and the cardio starting point.",
    blocks: [
      {
        kind: "list",
        items: [
          "3 to 5 gym sessions a week, unless they need fewer or want more. Any extra days beyond 5 are cardio or core.",
          "Hypertrophy-based for every client unless stated otherwise, built around their goals, focus areas and experience.",
          "Pick a base split, then adjust volume, exercise selection and intensity. Got another split idea that suits them? Use it.",
        ],
      },
      { kind: "h", text: "Base splits" },
      {
        kind: "table",
        head: ["Days", "Split", "For"],
        rows: [
          ["3 day", "Full Body x3", "M/F"],
          ["3 day", "Upper / Lower / Upper", "M"],
          ["3 day", "Lower / Upper / Lower", "F"],
          ["3 day", "Upper / Lower / Full Body", "M/F"],
          ["4 day", "PPL + Upper", "M"],
          ["4 day", "PPL + Full Body", "M"],
          ["4 day", "Upper / Lower x2", "M/F"],
          ["4 day", "Glutes, Upper, Full Lower, Full Body", "F"],
          ["4 day", "Lower, Upper, Lower, Glutes & Back", "F"],
          ["5 day", "PPL + Upper / Lower", "M"],
          ["5 day", "PPL + Anterior / Posterior", "M"],
          ["5 day", "PPL, Chest & Back, Arms", "M"],
          ["5 day", "PPL (2 focus areas) + remainder", "M"],
          ["5 day", "Glutes, Upper, Quads & Glutes, Upper, Hams & Glutes", "F"],
          ["5 day", "Lower / Upper / Lower / Upper / Lower", "F"],
          ["5 day", "Upper / Lower / Upper / Lower / Full Body", "F"],
        ],
      },
      { kind: "h", text: "Cardio" },
      {
        kind: "cards",
        items: [
          { title: "Starting point", body: "10,000 steps a day." },
          { title: "Adding cardio", body: "StairMaster is the default, added at the first check-in. Only substitute it if the client can't do it." },
        ],
      },
    ],
  },
  {
    id: "response-checkins",
    group: "KPIs",
    title: "Response times & check-ins",
    intro: "All times are Melbourne time.",
    blocks: [
      {
        kind: "stats",
        items: [
          { value: "4 hrs", label: "Average reply time to client messages" },
          { value: "24 hrs", label: "Maximum check-in turnaround, aim well under" },
          { value: "10am Sun", label: "Latest plan and welcome video for a Monday start" },
        ],
      },
      { kind: "h", text: "Client response time" },
      { kind: "p", text: "Reply to messages within an average of 4 hours. Set the expectation early, depending on how you want to work." },
      { kind: "p", text: "Sunday is the only day you can elect not to reply. If you don't want to message on Sundays, say so in your welcome video: you're away from your phone and replies come back Monday. Happy to reply on Sundays? That's fine too. Every other day, reply in a timely manner." },
      { kind: "h", text: "Check-in days & turnaround" },
      {
        kind: "list",
        items: [
          "You set your check-in days. Speak with your head coach to find a structure that works for you.",
          "Not messaging on Sundays? Then don't have Saturday or Sunday check-in days.",
          "Check-in in before 2pm Melbourne time on the day: respond the same day.",
          "Check-in in during the afternoon: respond that day or the next morning, depending on how you work.",
          "Tell clients your cutoff (e.g. a 5pm check-in gets done next day). If the expectation is set, you're not missing the bar.",
        ],
      },
      { kind: "h", text: "New client plans & welcome videos" },
      {
        kind: "list",
        items: [
          "Clients start on Mondays. Signup cutoff for a Monday start is Friday afternoon (Melbourne time), so you'll usually have at least the weekend's notice of a new client.",
          "Q&A in by Saturday midday: plan and welcome video sent by 10am Sunday at the latest.",
          "Q&A comes in later, e.g. Sunday morning or afternoon? Still try to get it done by Sunday night. If that's not possible, Monday first thing is fine.",
          "Plans can be done earlier, but send them Saturday morning: enough time for questions, without a week of pestering before they start.",
        ],
      },
    ],
  },
  {
    id: "weekly-fortnightly",
    group: "KPIs",
    title: "Weekly vs fortnightly",
    intro: "What each service level expects from you. Either way, check-ins are completed on time.",
    blocks: [
      {
        kind: "cards",
        items: [
          { title: "Weekly client", sub: "Every week", body: "A formal check-in gets completed every week, within the turnaround in [Response times & check-ins](page:response-checkins)." },
          { title: "Fortnightly client", sub: "Every 2nd week", body: "A formal check-in gets completed every second week. On the off week, you send a brief touch-point message." },
        ],
      },
      { kind: "h", text: "Fortnightly: the off-week touch point" },
      { kind: "p", text: "On the off week, send a quick message to see how they're going. It's a touch point and a reminder that their check-in is due the following week. Keep it brief:" },
      { kind: "script", text: "Hey [Name], just wanted to check in. How's your week been? Let me know if you've got any questions. Looking forward to our formal check-in next week!" },
      { kind: "h", text: "Fortnightly client checking in every week?" },
      { kind: "p", text: "You don't have to send a full check-in back on their off week. But encourage it: clients who submit every week, even on a fortnightly plan, are usually more consistent and get better results." },
      { kind: "script", text: "Hey [Name], saw your check-in come through this week. Love it! Just so you know I haven't missed it, your formal check-in is next week as we're on fortnightly check-ins. Feel free to keep submitting weekly though. It's great to see the progress coming through." },
      { kind: "note", text: "Also asking for meal or training changes every week? [Offer a move up to weekly](page:upgrade-weekly)." },
    ],
  },
  {
    id: "upgrade-weekly",
    group: "KPIs",
    title: "Moving up to weekly",
    intro: "Fortnightly clients who want more support, or are heading into a big phase, may be better off on weekly check-ins.",
    blocks: [
      { kind: "note", title: "Changes belong in the check-in", text: "Minor adjustments can happen off the check-in, but most of the time meal and training adjustments are made in the check-in. New meals, different options and plan changes all go there." },
      { kind: "h", text: "When to offer a move up to weekly" },
      {
        kind: "steps",
        items: [
          {
            when: "1",
            title: "They want changes every week",
            body: "A fortnightly client is submitting weekly and asking for meal or training changes every week.",
            script: "Since you're keen to make changes more often, would you like to move up to weekly check-ins? That way I can make those adjustments for you more frequently.",
          },
          {
            when: "2",
            title: "End of a phase",
            body: "They're towards the end of a reverse or a cut, and you feel they'd benefit more from weekly check-ins.",
            script: "Over the next four weeks we'll be going through your reverse, and there are a few more changes to make. Would you be happy to move up to weekly check-ins? Just let me know and we'll sort out the admin side.",
          },
        ],
      },
      { kind: "p", text: "If they say yes, put it through as a service switch in **#admin-service-change** ([Changes & refunds](page:changes-refunds))." },
      { kind: "note", tone: "warn", title: "One way only", text: "We never offer to move a client from weekly down to fortnightly, unless it's to save them from cancelling. That's covered in [the De-Cancel List](page:de-cancel)." },
    ],
  },
  {
    id: "missed-checkins",
    group: "KPIs",
    title: "Chasing missed check-ins",
    intro: "When a client misses a check-in, follow this sequence.",
    blocks: [
      { kind: "note", title: "Outreach rule", text: "Outside of the off-week touch point, you're just expected to reply to clients. Only send other outreach when a client misses a check-in and needs following up." },
      {
        kind: "steps",
        items: [
          { when: "1", title: "Day before it's due", body: "Send a reminder. Good practice for every client.", script: "Hey [Name], just a reminder your check-in is due tomorrow. Looking forward to seeing how you're going!" },
          { when: "2", title: "Day after it's missed", body: "If it didn't come in, follow up the next day.", script: "Hey [Name], noticed your check-in hasn't come through yet. Please get that one done when you can!" },
          { when: "3", title: "Missed multiple weeks", body: "If they've missed several weeks in a row and are ghosting us, escalate to Jameela." },
        ],
      },
    ],
  },
  {
    id: "retention-time-away",
    group: "KPIs",
    title: "Retention & time away",
    intro: "Retention benchmarks, sick days, travel and availability.",
    blocks: [
      {
        kind: "stats",
        items: [
          { value: "< 21 wks", label: "Below average retention" },
          { value: "21–25 wks", label: "Average retention" },
          { value: "26+ wks", label: "Above average retention" },
        ],
      },
      { kind: "h", text: "Sick time" },
      {
        kind: "list",
        items: [
          "If you're sick and can't do check-ins that day, message your clients and let them know. Or message Daniel and he'll let them know check-ins will be delayed.",
          "Set the expectation. If clients know why their check-in isn't on time, they won't really mind.",
          "Exceptionally sick and can't do check-ins at all that week? Tell Daniel and your head coach. They'll handle them.",
          "Under the subcontractor model, you aren't compensated for check-ins you don't complete.",
        ],
      },
      { kind: "h", text: "Travel & time off" },
      {
        kind: "list",
        items: [
          "Due to the nature of the job, you're expected to manage clients while travelling. Communicate early and tell clients what's happening, especially if there may be delays.",
          "Want to fully take time off? Give a minimum of 4 weeks' notice so the team can manage your clients. You won't be paid for that time for those clients.",
        ],
      },
      { kind: "h", text: "Availability" },
      { kind: "p", text: "You're expected to be reasonably reachable throughout the week." },
    ],
  },
  {
    id: "transformations",
    group: "Client wins",
    title: "Transformations",
    intro: "Spotting a result, asking the client, and flagging it in Slack.",
    blocks: [
      { kind: "p", text: "Client results are what our clients come to us for. You'll learn our techniques, and how we get results, in the [Coach Academy](/academy). When a client gets a result, we need to know, so we can tell whether it's something we can use as marketing material." },
      { kind: "h", text: "What counts as a transformation" },
      { kind: "p", text: "A meaningful visual result. The visual change is what we prioritise most: they're visibly leaner, they've dropped body fat, or they've built more muscle." },
      { kind: "note", title: "Weight isn't the measure", text: "A change that isn't drastic on the scale (say 54 → 50 kg) can still be a dramatic visual transformation." },
      { kind: "h", text: "Ask the client in their check-in" },
      { kind: "p", text: "Bring up their comparison photos, show them how much of a result they've made and really hype them up. Then ask the question:" },
      { kind: "script", text: "Look at these side by side, [Name]. That's a huge change and you should be really proud of it. Would you be comfortable with us posting this one? Our team can get it posted for you, and it'd be great to share." },
      {
        kind: "cards",
        items: [
          { title: "They say yes", body: "Perfect. Flag it in Slack with Post: Yes." },
          { title: "They say no", body: "Offer to post it anonymously. Yes: flag it with Post: Anonymous. Still no: flag it anyway with Post: No." },
        ],
      },
      { kind: "script", label: "If they say no", text: "Totally fine. Would you be okay with it being posted anonymously? We can crop your head out and even change your name if you'd like." },
      { kind: "h", text: "Flag every transformation", tag: "#transformations" },
      { kind: "p", text: "Post every transformation in **#transformations** on Slack, whether the client wants it posted or not. That way every transformation gets noted, and we can track how many transformations each coach is getting, and when." },
      { kind: "p", text: "No photos needed. If it's being posted, Daniel and the admin team take it from there, including working with the client on the post." },
      {
        kind: "template",
        title: "Transformation",
        lines: ["Client name: [Client name]", "Date: [Date]", "Post: Yes / No / Anonymous"],
        note: "Post one message per client.",
      },
      { kind: "h", text: "The client wins chat" },
      { kind: "p", text: "A chat with all the coaches. Use it to share client wins, big or small, show off comparison photos and progress worth celebrating, and see what's working across the team." },
    ],
  },
];

// Dan's earlier written SOPs (welcome videos, admin, plan setup) follow the
// welcome-pack SOPs, with their Loom walkthroughs.
const LEGACY_SOP_PAGES: HandbookPage[] = COACH_SOPS.map((sop) => ({
  id: sop.id,
  group: sop.category,
  title: sop.title,
  intro: sop.summary,
  blocks: [
    ...(sop.looms.length > 0
      ? [{ kind: "links" as const, items: sop.looms.map((l) => ({ label: l.label ?? "Loom walkthrough", href: l.url })) }]
      : []),
    { kind: "md" as const, body: sop.body },
  ],
}));

const DP_SECTIONS: HandbookSection[] = [
  {
    id: "start",
    path: "/start-here",
    title: "Start here",
    subtitle: "Your setup, your first month, and who's who. Read it end to end in your first week.",
    pages: START_PAGES,
  },
  {
    id: "sops",
    path: "/sops",
    title: "SOPs",
    subtitle: "How we run admin, client setup and check-ins, with copy-ready formats and scripts.",
    pages: [...SOP_PAGES, ...LEGACY_SOP_PAGES],
  },
];

export const HANDBOOK_SECTIONS: HandbookSection[] = IS_DP ? DP_SECTIONS : [];

export function getHandbookSection(id: HandbookSectionId): HandbookSection | null {
  return HANDBOOK_SECTIONS.find((s) => s.id === id) ?? null;
}

/** Resolves "page:<id>" to the URL of that page in whichever section holds it. */
export function handbookHref(href: string): string {
  if (!href.startsWith("page:")) return href;
  const id = href.slice(5);
  for (const s of HANDBOOK_SECTIONS) {
    if (s.pages.some((p) => p.id === id)) return `${s.path}?p=${id}`;
  }
  return "/start-here";
}
