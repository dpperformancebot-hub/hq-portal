// Taskboard — people, task templates, seed data, theme.
// Matches the live DP Performance HQ styling (warm paper, green accent).

window.TB = {
  bg:'#faf9f5', card:'#ffffff', card2:'#f7f5f0', input:'#f6f4ee',
  border:'#e6e2d8', borderSoft:'#efece4',
  text:'#1a1a17', textDim:'#6b6659', textMuted:'#a29b8c',
  accent:'#16a34a', accentSoft:'#eaf6ee', accentDeep:'#0f6b31', onAccent:'#ffffff',
  blue:'#2563eb', blueSoft:'#e8effd',
  amber:'#d97706', amberSoft:'#fdf3dd',
  red:'#dc2626', redSoft:'#fdeaea',
  violet:'#7c3aed', violetSoft:'#f1ebfe',
  ui:"'Inter',system-ui,sans-serif",
  disp:"'Fraunces',serif",
  mono:"'JetBrains Mono',ui-monospace,monospace",
};

// ── People ───────────────────────────────────────────────
window.TB_PEOPLE = {
  dan:     {id:'dan',     name:'Dan Adams',      role:'owner',       title:'Owner',            colour:'#16a34a'},
  mykael:  {id:'mykael',  name:'Mykael Reyes',   role:'ops_manager', title:'Ops Manager',      colour:'#2563eb'},
  jameela: {id:'jameela', name:'Jameela Haddad', role:'head_of_ops', title:'Head of Ops',      colour:'#7c3aed'},
  amy:     {id:'amy',     name:'Amy Clarke',     role:'coach',       title:'Coach',            colour:'#d97706'},
  sarah:   {id:'sarah',   name:'Sarah Mitchell', role:'coach',       title:'Coach',            colour:'#0891b2'},
  angus:   {id:'angus',   name:'Angus Bell',     role:'head_coach',  title:'Head Coach',       colour:'#be123c'},
  priya:   {id:'priya',   name:'Priya Nair',     role:'va',          title:'VA — Admin',       colour:'#65a30d'},
};
window.TB_PERSON = id => window.TB_PEOPLE[id] || {name:'Unassigned', title:'', colour:'#a29b8c', id:'none'};

// ── Statuses ─────────────────────────────────────────────
window.TB_STATUSES = [
  {id:'not_started', label:'Not started', colour:'#a29b8c', soft:'#f0ede5'},
  {id:'in_progress', label:'In progress', colour:'#2563eb', soft:'#e8effd'},
  {id:'blocked',     label:'Blocked',     colour:'#dc2626', soft:'#fdeaea'},
  {id:'complete',    label:'Complete',    colour:'#16a34a', soft:'#eaf6ee'},
];
window.TB_STATUS = id => window.TB_STATUSES.find(s=>s.id===id) || window.TB_STATUSES[0];

// Client database — stands in for the real client table so name fields can be
// picked rather than typed (no typos, no orphaned records).
window.TB_CLIENTS = [
  {name:'Alannah Parfett', coach:'sarah',  plan:'Weekly',      status:'Active'},
  {name:'Angela Mwangi',   coach:'angus',  plan:'Weekly',      status:'Active'},
  {name:'Aria Kirwan',     coach:'angus',  plan:'Fortnightly', status:'Paused'},
  {name:'Charlotte Jezard',coach:'sarah',  plan:'Fortnightly', status:'Active'},
  {name:'Emma Clarke',     coach:'amy',    plan:'Fortnightly', status:'Active'},
  {name:'Eva Risson',      coach:'sarah',  plan:'Fortnightly', status:'Active'},
  {name:'Fira Griffith',   coach:'sarah',  plan:'Fortnightly', status:'Active'},
  {name:'Grace Jenkins',   coach:'sarah',  plan:'Weekly',      status:'Onboarding'},
  {name:'Iman Ladhani',    coach:'amy',    plan:'Fortnightly', status:'Active'},
  {name:'Jake Reynolds',   coach:'angus',  plan:'Weekly',      status:'Active'},
  {name:'Leeona Tusia',    coach:'angus',  plan:'Weekly',      status:'Active'},
  {name:'Leilani Zapata',  coach:'sarah',  plan:'Weekly',      status:'Active'},
  {name:'Lili Streader',   coach:'amy',    plan:'Weekly',      status:'Onboarding'},
  {name:'Marcus Webb',     coach:'sarah',  plan:'Weekly',      status:'Cancelled'},
  {name:'Mia Lawson',      coach:'amy',    plan:'Weekly',      status:'Active'},
  {name:'Sarah Mitchell',  coach:'amy',    plan:'Weekly',      status:'Active'},
  {name:'Sophie Turner',   coach:'angus',  plan:'Fortnightly', status:'Onboarding'},
  {name:'Tom Watson',      coach:'sarah',  plan:'Weekly',      status:'Active'},
];

// New signups with no coach yet. Assigning one fires an onboarding task
// onto that coach's board as Not started.
window.TB_UNASSIGNED = [
  {name:'Grace Jenkins',  startDate:'2026-08-10', plan:'Weekly',      notes:'Fat loss, wedding in Feb. Old shoulder injury — avoid overhead pressing early.'},
  {name:'Leeona Tusia',   startDate:'2026-08-08', plan:'Weekly',      notes:'Postnatal, cleared by GP. Wants strength focus, not weight loss.'},
  {name:'Lili Streader',  startDate:'2026-07-20', plan:'Weekly',      notes:'Returning client. Previously with Amy, happy to go back to her.'},
  {name:'Sophie Turner',  startDate:'2026-07-20', plan:'Fortnightly', notes:'Shift worker — nights Tue/Wed. Needs a flexible check-in day.'},
  {name:'Noor Haddadi',   startDate:'2026-08-12', plan:'Weekly',      notes:'Complete beginner, nervous about the gym. Wants a slow start.'},
];

// ── Templates ────────────────────────────────────────────
// Each template = a different skeleton the assigner fills out.
// `creatableBy` gates which roles see it in the New task picker.
window.TB_TEMPLATES = {
  general: {
    id:'general', label:'General task', short:'Task', colour:'#2563eb', soft:'#e8effd',
    blurb:'Anything that doesn\'t fit a specific request type.',
    creatableBy:['owner','ops_manager','head_of_ops','head_coach'],
    fields:[
      {k:'brief',    label:'Task brief',   type:'textarea', required:true, placeholder:'What needs doing, and what does done look like?'},
      {k:'timeline', label:'Timeline',     type:'date',     required:true},
      {k:'priority', label:'Priority',     type:'select',   options:['Low','Normal','High','Urgent'], def:'Normal'},
    ],
    title: v => v.brief ? (v.brief.length>60 ? v.brief.slice(0,60)+'…' : v.brief) : 'Untitled task',
  },
  pause: {
    id:'pause', label:'Pause request', short:'Pause', colour:'#d97706', soft:'#fdf3dd',
    blurb:'Client wants to pause. Routes to Head of Ops to process.',
    creatableBy:['coach','head_coach'],
    defaultAssignee:'jameela',
    resolvable:true,
    fields:[
      {k:'client', label:'Client name',   type:'client',   required:true, placeholder:'Start typing a client name…'},
      {k:'start',  label:'Pause starts',  type:'date',     required:true},
      {k:'end',    label:'Pause ends',    type:'date',     hint:'Leave blank if open-ended'},
      {k:'reason', label:'Reason',        type:'select',   options:['Injury','Travel','Financial','Personal','Medical','Other'], required:true},
      {k:'notes',  label:'Context for ops', type:'textarea', placeholder:'Anything Jameela needs to know before processing'},
    ],
    title: v => `Pause — ${v.client || 'client'}`,
    summary: v => `${v.client} needs to pause from ${v.start || 'TBC'}${v.end?` until ${v.end}`:' (open-ended)'} — ${(v.reason||'reason TBC').toLowerCase()}.`,
  },
  cancel: {
    id:'cancel', label:'Cancel request', short:'Cancel', colour:'#dc2626', soft:'#fdeaea',
    blurb:'Client wants to cancel. Routes to Head of Ops to process.',
    creatableBy:['coach','head_coach'],
    defaultAssignee:'jameela',
    resolvable:true,
    fields:[
      {k:'client',    label:'Client name',       type:'client', required:true, placeholder:'Start typing a client name…'},
      {k:'effective', label:'Effective date',    type:'date',   required:true},
      {k:'reason',    label:'Reason',            type:'text',   required:true, placeholder:'In their words — why are they cancelling?'},
      {k:'saveAttempt', label:'Save attempt made?', type:'select', options:['Yes — offered pause','Yes — offered downgrade','No'], required:true},
      {k:'notes',     label:'Context for ops',   type:'textarea', placeholder:'What was said, and anything worth trying'},
    ],
    title: v => `Cancel — ${v.client || 'client'}`,
    summary: v => `${v.client} is cancelling effective ${v.effective || 'TBC'}${v.reason?` — ${v.reason}`:''}. Save attempt: ${v.saveAttempt || '—'}.`,
  },
  admin: {
    id:'admin', label:'Admin request', short:'Admin', colour:'#7c3aed', soft:'#f1ebfe',
    blurb:'Billing changes, account fixes, data entry, docs.',
    creatableBy:['owner','ops_manager','head_of_ops','head_coach','coach'],
    fields:[
      {k:'request',  label:'What do you need?', type:'textarea', required:true, placeholder:'e.g. Update Sophie Turner\'s billing date to the 15th'},
      {k:'system',   label:'System',            type:'select',   options:['Kahunas','Stripe','Google Drive','Notion','Email','Other'], required:true},
      {k:'timeline', label:'Needed by',         type:'date',     required:true},
      {k:'priority', label:'Priority',          type:'select',   options:['Low','Normal','High','Urgent'], def:'Normal'},
    ],
    title: v => v.request ? (v.request.length>60 ? v.request.slice(0,60)+'…' : v.request) : 'Admin request',
  },
  onboard: {
    id:'onboard', label:'Onboarding handover', short:'Onboard', colour:'#0891b2', soft:'#e4f4f9',
    blurb:'New client signed — hand to a coach and get them set up.',
    creatableBy:['owner','ops_manager','head_of_ops'],
    fields:[
      {k:'client',   label:'Client name',    type:'client', required:true, placeholder:'Start typing a client name…'},
      {k:'startDate',label:'Start date',     type:'date',   required:true},
      {k:'plan',     label:'Plan',           type:'select', options:['Weekly','Fortnightly'], required:true},
      {k:'notes',    label:'Intake notes',   type:'textarea', placeholder:'Goals, injuries, anything from the sales call'},
    ],
    title: v => `Onboard — ${v.client || 'new client'}`,
    summary: v => `${v.client} starts ${v.startDate || 'TBC'} on the ${(v.plan||'—').toLowerCase()} plan.`,
  },
};
window.TB_TEMPLATE = id => window.TB_TEMPLATES[id] || window.TB_TEMPLATES.general;

// ── Seed tasks ───────────────────────────────────────────
let _n = 0;
const T = (o) => ({
  id:'T-'+String(++_n).padStart(3,'0'),
  createdAt:'2026-08-05',
  activity:[],
  seen:false,
  ...o,
});

window.TB_SEED = [
  T({template:'general', assignedBy:'dan', assignedTo:'mykael', status:'in_progress',
     values:{brief:'Rebuild the weekly report so it pulls straight from the dashboard instead of the sheet', timeline:'2026-08-14', priority:'High'},
     activity:[{who:'dan',what:'created this task',when:'5 Aug'},{who:'mykael',what:'moved to In progress',when:'6 Aug'}]}),

  T({template:'pause', assignedBy:'sarah', assignedTo:'jameela', status:'not_started', isNew:true,
     values:{client:'Alannah Parfett', start:'2026-08-18', end:'2026-09-15', reason:'Travel', notes:'Overseas for 4 weeks, wants to come straight back on the same plan. Happy to be billed on return.'},
     activity:[{who:'sarah',what:'raised this request',when:'7 Aug'}]}),

  T({template:'cancel', assignedBy:'angus', assignedTo:'jameela', status:'blocked',
     values:{client:'Jake Reynolds', effective:'2026-08-31', reason:'Went quiet after the last block — says he’s not getting results fast enough', saveAttempt:'Yes — offered pause', notes:'Ghosted for 3 weeks. Tried pause, no reply. Last payment went through 1 Aug.'},
     blockedReason:'Stripe shows an active annual plan, not monthly — need Dan to confirm the refund position before I process this.',
     activity:[{who:'angus',what:'raised this request',when:'4 Aug'},{who:'jameela',what:'moved to Blocked',when:'6 Aug'}]}),

  T({template:'admin', assignedBy:'amy', assignedTo:'priya', status:'not_started', isNew:true,
     values:{request:'Update Sophie Turner\'s billing date to the 15th and resend her the welcome pack', system:'Stripe', timeline:'2026-08-12', priority:'Normal'},
     activity:[{who:'amy',what:'created this task',when:'7 Aug'}]}),

  T({template:'onboard', assignedBy:'mykael', assignedTo:'sarah', status:'in_progress',
     values:{client:'Grace Jenkins', startDate:'2026-08-10', plan:'Weekly', notes:'Fat loss, wedding in Feb. Old shoulder injury — avoid overhead pressing early.'},
     activity:[{who:'mykael',what:'created this task',when:'6 Aug'},{who:'sarah',what:'moved to In progress',when:'6 Aug'}]}),

  T({template:'general', assignedBy:'dan', assignedTo:'jameela', status:'complete', completedAt:'2026-08-07',
     values:{brief:'Chase the 9 unassigned clients and get them all allocated to a coach', timeline:'2026-08-08', priority:'Urgent'},
     activity:[{who:'dan',what:'created this task',when:'3 Aug'},{who:'jameela',what:'moved to In progress',when:'4 Aug'},{who:'jameela',what:'marked Complete',when:'7 Aug'}]}),

  T({template:'pause', assignedBy:'angus', assignedTo:'jameela', status:'complete', completedAt:'2026-07-19',
     values:{client:'Aria Kirwan', start:'2026-07-20', end:'', reason:'Medical', notes:'Surgery, open-ended. Will let us know.'},
     activity:[{who:'angus',what:'raised this request',when:'18 Jul'},{who:'jameela',what:'processed and marked Complete',when:'19 Jul'}]}),

  T({template:'cancel', assignedBy:'sarah', assignedTo:'jameela', status:'complete', completedAt:'2026-07-24',
     values:{client:'Marcus Webb', effective:'2026-07-31', reason:'Relocating overseas, joining a gym there', saveAttempt:'Yes — call booked', notes:'Amicable, said he\u2019d refer friends.'},
     activity:[{who:'sarah',what:'raised this request',when:'22 Jul'},{who:'jameela',what:'processed and marked Complete',when:'24 Jul'}]}),

  T({template:'admin', assignedBy:'dan', assignedTo:'priya', status:'complete', completedAt:'2026-07-14',
     values:{request:'Set up the new coach onboarding folder structure in Drive', system:'Google Drive', timeline:'2026-07-15', priority:'Normal'},
     activity:[{who:'dan',what:'created this task',when:'10 Jul'},{who:'priya',what:'marked Complete',when:'14 Jul'}]}),

  T({template:'onboard', assignedBy:'jameela', assignedTo:'angus', status:'complete', completedAt:'2026-07-28',
     values:{client:'Leeona Tusia', startDate:'2026-07-28', plan:'Weekly', notes:'Postnatal, cleared by GP. Wants strength focus, not weight loss.'},
     activity:[{who:'jameela',what:'created this task',when:'25 Jul'},{who:'angus',what:'marked Complete',when:'28 Jul'}]}),

  T({template:'admin', assignedBy:'dan', assignedTo:'mykael', status:'not_started',
     values:{request:'Pull Q3 expense breakdown and reconcile against the Xero export', system:'Other', timeline:'2026-08-20', priority:'Normal'},
     activity:[{who:'dan',what:'created this task',when:'7 Aug'}]}),

  T({template:'general', assignedBy:'jameela', assignedTo:'priya', status:'in_progress',
     values:{brief:'Archive all cancelled clients from July and move their files to the archive drive', timeline:'2026-08-15', priority:'Low'},
     activity:[{who:'jameela',what:'created this task',when:'5 Aug'},{who:'priya',what:'moved to In progress',when:'7 Aug'}]}),

  T({template:'cancel', assignedBy:'sarah', assignedTo:'jameela', status:'not_started', isNew:true,
     values:{client:'Fira Griffith', effective:'2026-09-01', reason:'Lost her job last week and can’t justify the cost right now', saveAttempt:'Yes — offered downgrade', notes:'Offered the fortnightly plan at a lower rate, she wants to think about it but asked me to log the cancel either way.'},
     activity:[{who:'sarah',what:'raised this request',when:'7 Aug'}]}),
];
