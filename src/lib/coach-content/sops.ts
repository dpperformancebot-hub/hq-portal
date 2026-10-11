// Dan's real coaching SOPs, ported verbatim from the DPperformance coach-portal
// (index.html SOPS array). Only the operational SOPs that ship with full bodies
// in that repo are here; the wider SOP library lives at sop-library-six.vercel.app
// (googleDocUrl links) and can be imported later. Server-rendered via the coach
// SOPs view; bodies use the same **Heading** / bullet markdown-lite as Academy.

import { IS_DP } from "@/lib/brand";

export type CoachSopLoom = { label?: string; url: string };
export type CoachSop = {
  id: string;
  category: string;
  title: string;
  summary: string;
  looms: CoachSopLoom[];
  googleDocUrl?: string;
  body: string;
};

// DP-authored ("Dan's real coaching SOPs"): served only on the DP brand.
const DP_COACH_SOPS: CoachSop[] = [
    // ─── Programming & Systems (3) ─────────────────────────────
    {id:'prog-welcome', category:'Programming & Systems', title:'Welcome Videos',
      summary:'Exact structure, tone, and expectations for the first Loom you send a new client. App orientation, plan walkthrough, three non-negotiables, and a strong close.',
      looms:[{url:'https://www.loom.com/share/756ff99b596441bf99437a6b8a42b492'}],
      googleDocUrl:'https://sop-library-six.vercel.app/#prog_welcome',
      body:`This SOP defines the exact structure, tone, and expectations for delivering DPPerformance welcome videos. Based on Daniel's onboarding Looms, establishing authority, clarity, and accountability from day one.

**PURPOSE**

To ensure every welcome video sets clear expectations, explains how coaching works, orients the client in the app, establishes accountability, creates momentum.

**1. TONE & FRAMING (FIRST 30–60 SECONDS)**

Energy: confident, calm, slightly casual, supportive but directive.

Structure: welcome to DPPerformance, express excitement to start, state video purpose (plans + expectations).

Example: "Hello and welcome to the DPPerformance team. My name is YOUR NAME, and I'll be your coach alongside Daniel on this journey and I'm really excited to get started with you. In this video I'll run through your plans and explain what I need from you each week so we get the absolute best results."

Principles: position coaching as results-driven, establish collaboration, signal structure and intent.

**2. APP ORIENTATION**

Early in the video, orient the client inside the app. Must cover:
- Daily Habits (days at the top of the dashboard)
- Weekly Check-In (big button in the middle of the dashboard saying weekly check-in + your designated day, tell them what day that is)
- Workout logging (start workout, log weights and reps and submit them)
- Nutrition logging (if used)

Key message: the more data I have, the better adjustments I can make. Explain why logging matters.

**3. PLAN WALKTHROUGH (HIGH-LEVEL)**

Order: nutrition, supplements, training split, cardio. Do not over-explain details. Explain logic and expectations. Reinforce key facts (e.g. raw weights).

Training points: train to failure (0 RIR), beat reps or load weekly, log sessions, send form videos.

Nutrition points: starting plan, weekly adjustments, flexibility if tracked, communicate meals out.

Cardio points: starting target (e.g. 10k steps), adjusted as needed.

**4. THREE NON-NEGOTIABLES**

State clearly: there are three things required.
1. **Log Workouts**: reps, sets, weight; beat last week; send form videos if needed.
2. **Daily Habits**: morning weight (fasted, post-bathroom), steps, water, sleep. ~30 seconds daily. Reinforce: the more data I have, the better I can adjust your plan.
3. **Weekly Check-In**: more in-depth, photos included, coach video review returned, adjustments made. Message: that's how we keep pushing in the right direction.

**5. COMMUNICATION EXPECTATIONS**

Clarify early: message anytime, don't wait for check-in if issues, tell coach about events/dinners ahead. Goal: remove friction.

**6. SUPPLEMENT SECTION**

Minimum: creatine, protein, pre-workout (optional). Optional extras explained briefly. Discount code shared casually. If unsure of brands, ask the coach.

**7. STRONG CLOSE (LEADERSHIP)**

Finish directive and clear. Structure: reinforcement, excitement, next step.

Example: "That's pretty much it. I'm excited to get into it with you. Don't forget to log everything, I'll be checking (in a cheeky but serious way). If you've got any questions or issues, please message me. Speak soon."

**STANDARD VIDEO STRUCTURE TEMPLATE**

1. Welcome & excitement
2. App overview
3. Nutrition overview
4. Supplements
5. Training overview
6. Cardio overview
7. Three non-negotiables
8. Communication expectations
9. Strong close

**BASIC RULES**: confident leadership tone, explains why things matter, no fluff, no over-complication, occasional casual language, flexible tools / strict execution.`},

    {id:'prog-admin', category:'Programming & Systems', title:'Admin, Logs, Follow-Ups & Client Management',
      summary:'The operational baseline: check-in log codes, follow-up sequences, ghosted clients, pauses, cancellations, transformations. Three Looms cover the full loop.',
      looms:[
        {label:'Part 1', url:'https://www.loom.com/share/ff8c8b16fe4f4442bbd494c4b20a4df7'},
        {label:'Part 2', url:'https://www.loom.com/share/9e5953adec054e6280f00fdb2b9b0a92'},
        {label:'Part 3', url:'https://www.loom.com/share/d2127069cf7d4fbead811971612cb128'},
      ],
      googleDocUrl:'https://sop-library-six.vercel.app/#prog_admin',
      body:`This SOP covers check-in logs, follow-ups, ghosted clients, pauses, cancellations, transformations, and admin escalation.

**1. CHECK-IN LOG: HOW TO USE IT**

Columns explained:
- **Client Name**: auto-populated.
- **Start Date**: auto-populated. Indicates program start.
- **Check-In Day**: manually set. Day client submits weekly/fortnightly check-in.
- **Program (Y/N)**: manual. Confirms initial program has been built.
- **Weekly / Fortnightly**: auto-populated. Determines check-in frequency.
- **Transformation?**: tick if a visible transformation exists or is imminent.
- **Post?**: Pending / Approved / Denied. Ask client during check-in, then update.
- **Last Program**: date of last training program. Highlights after 8 weeks as a prompt (not mandatory).

**2. CHECK-IN LOG CODES**

At the start of the week, pre-fill: **N** = Needs check-in, **F** = Fortnightly client (no check-in needed). By week's end, there should be no N remaining.

Codes: **Y** = Check-in completed, **M** = Missed (client communicated), **G** = Ghosted, **P** = Paused, **C** = Cancelled, **SM** = First-week support message only.

**3. FIRST WEEK SUPPORT (SM)**

Used ONLY if client starts close to check-in day. Send a mid-week message: ask how they are going, answer questions, remind them of upcoming check-in.

**4. CHECK-IN FOLLOW-UP SEQUENCE**

- **Before Check-In** (to help with workflow, not essential): friendly reminder to submit.
- **Missed Check-In (Check-In Day)**: reminder message.
- **1 Week No Response**: 10-second voice note.
- **2 Weeks No Response**: simple check-in message.

Then escalate to Admin Team.

If a client is fortnightly and they miss a check-in, the check-in should be automatically scheduled for the next week, not the next fortnight.

**5. ADMIN TEAM: GHOSTED CLIENTS**

Admin will: message all ghosted clients, attempt re-engagement, schedule cancellation if needed.

**6. PAUSE REQUEST SOP**

When a client requests a pause, send to Admin on Slack: client name, pause start date, pause end date, reason. Indefinite pauses → also escalate to Head Coach. In group chat with client: acknowledge and advise admin will handle.

**7. CANCELLATION SOP**

Send to Admin on Slack: client name, cancellation date, client week, reason. If within initial 16-week term → also escalate to Head Coach. In group chat: acknowledge and advise admin will handle.

**8. TRANSFORMATIONS SOP**

When a postable transformation exists: tick Transformation in Check-In Log, ask permission during check-in, update Post status (Approved / Denied / Pending), ask for extra gym selfies, forward extra selfies to Admin Team.

**9. CHECK-IN COMPLETION**

Once a check-in is finished: click Complete Check-In (top right), ensure log code is updated correctly.

**10. WELCOME SCRIPT**

"Hey CLIENT NAME, COACH NAME here! I'll be your 1:1 coach alongside Daniel for your journey – can't wait to work with you and smash your goals. Please watch your personalised welcome video below which walks you through your programs. If you need anything at all, just reach out."

Then: "Your welcome video below."`},

    {id:'prog-kahunas', category:'Programming & Systems', title:'Kahunas System & Plan Setup',
      summary:'The mechanical side of plan delivery: Kahunas onboarding flow, naming conventions, profile navigation, plan assignment. The fields that keep delivery consistent.',
      looms:[{url:'https://www.loom.com/share/da1b55be395b4507abc7faf6b40d27b4'}],
      googleDocUrl:'https://sop-library-six.vercel.app/#prog_kahunas',
      body:`This SOP explains how coaches use Kahunas to onboard new clients, build and assign plans, and navigate key client data areas.

**PURPOSE**

To ensure all plans are built, named, assigned, and managed consistently inside Kahunas.

**1. NEW CLIENT ASSIGNMENT FLOW**

When a new client is assigned: you receive Slack notification, client appears in Check-In Log, client appears in Kahunas client list, WhatsApp group created (Coach + Client + Daniel), Daniel sends Skool onboarding modules.

**2. WAIT FOR Q&A BEFORE BUILDING**

Plans must be customised from the Q&A. If Q&A not completed: remind in WhatsApp group, do this ~1 day before start date. Plans should not be built without Q&A unless instructed.

**3. BUILDING NUTRITION PLANS**

Create plans in Nutrition Plans section (not client profile). Then assign later to the client.

Plan creation methods: from scratch, or duplicate similar calorie/macro plan. If duplicating: rename plan, remove "(copy)", adjust for current client.

**4. NUTRITION PLAN NAMING CONVENTION**

Format: FirstName LastName – Phase (version).
Examples: Daniel Piplios – Cut (1.0), Daniel Piplios – Shred (2.0).

Phase names: Cut / Shred = deficit; Reverse = reverse; Lean Bulk / Build = bulk. Version increases after full phase cycles.

**5. BUILDING TRAINING PLANS**

Create in Training Plans section. Methods: from scratch, or duplicate template. If duplicating: rename, remove "(copy)", adjust to client needs.

**6. TRAINING PLAN NAMING**

Format: FirstName LastName – X day – Split.
Example: Daniel Piplios – 5 day – PPL Chest Back & Arms.

**7. ASSIGNING PLANS TO CLIENT**

Assign from client profile. Do NOT assign from plan library pages.

**8. CLIENT PROFILE NAVIGATION**

- **Dashboard**: client notes, activity snapshot.
- **Check-Ins**: submitted check-in forms.
- **Gallery**: all progress photos.
- **Q&A**: initial questionnaire.
- **Nutrition**: meal plan, adjustments.
- **Supplements**: supplement plan, adjustments.
- **Workouts**: training plan, adjustments.
- **Calendar**: logged sessions & cardio.
- **Daily Habits**: steps, weight, trends (averages important).
- **Logs**: training logs, nutrition logs.

**9. TOP ICON FUNCTIONS**

- **Water droplet**: water goal.
- **Chart icon**: weight/trend charts.
- **Target icon**: cardio plan adjustments.
- **Note icon**: client notes (e.g. vegetarian).
- **Pencil icon**: edit client details, change check-in day.`},
  ];

// A rebranded deploy (e.g. TJD) gets an empty coach-SOP set to fill with its
// own; DP keeps the full library. Nothing is deleted, only brand-gated.
export const COACH_SOPS: CoachSop[] = IS_DP ? DP_COACH_SOPS : [];
