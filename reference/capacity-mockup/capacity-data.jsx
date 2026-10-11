// Weekly Capacity Check — data, people, weeks, submissions, theme tokens.
window.CAP = {
  bg:'#faf9f5', card:'#ffffff', card2:'#f7f5f0',
  border:'#e6e2d8', borderSoft:'#efece4',
  text:'#1a1a17', textDim:'#6b6659', textMuted:'#a29b8c',
  accent:'#16a34a', accentSoft:'#eaf6ee', accentDeep:'#0f6b31',
  blue:'#2563eb', blueSoft:'#e8effd',
  amber:'#d97706', amberSoft:'#fdf3dd',
  red:'#dc2626', redSoft:'#fdeaea',
  ui:"'Inter',system-ui,sans-serif",
  disp:"'Fraunces',serif",
  mono:"'JetBrains Mono',ui-monospace,monospace",
};

window.CAP_PEOPLE = {
  dan:     {id:'dan',     name:'Dan Adams',      role:'owner',      title:'Owner',      colour:'#16a34a'},
  angus:   {id:'angus',   name:'Angus Bell',     role:'head_coach', title:'Head Coach', colour:'#be123c'},
  jameela: {id:'jameela', name:'Jameela Haddad', role:'head_of_ops',title:'Head of Ops',colour:'#7c3aed'},
  sarah:   {id:'sarah',   name:'Sarah Mitchell', role:'coach',      title:'Coach',      colour:'#0891b2', clients:24},
  amy:     {id:'amy',     name:'Amy Clarke',     role:'coach',      title:'Coach',      colour:'#d97706', clients:31},
  marco:   {id:'marco',   name:'Marco Silva',    role:'coach',      title:'Coach',      colour:'#0d9488', clients:19},
  tess:    {id:'tess',    name:'Tess Okafor',    role:'coach',      title:'Coach',      colour:'#9333ea', clients:27},
};
window.CAP_PERSON = id => window.CAP_PEOPLE[id] || {name:'Unknown', title:'', colour:'#a29b8c'};
window.CAP_COACHES = () => Object.values(window.CAP_PEOPLE).filter(p=>p.role==='coach'||p.role==='head_coach');

// Capacity bands — the poll options
window.CAP_BANDS = [
  {id:'0',   label:'0',    sub:'At capacity',    colour:'#dc2626', soft:'#fdeaea', mid:0},
  {id:'1-2', label:'1–2',  sub:'Nearly full',    colour:'#d97706', soft:'#fdf3dd', mid:1.5},
  {id:'3-4', label:'3–4',  sub:'Some room',      colour:'#ca8a04', soft:'#fdf6dd', mid:3.5},
  {id:'5-6', label:'5–6',  sub:'Good room',      colour:'#16a34a', soft:'#eaf6ee', mid:5.5},
  {id:'7+',  label:'7+',   sub:'Plenty of room', colour:'#0891b2', soft:'#e4f4f9', mid:8},
];
window.CAP_BAND = id => window.CAP_BANDS.find(b=>b.id===id);

// Weeks — newest first. `open` is the week currently being collected.
window.CAP_WEEKS = [
  {id:'w-2026-08-10', label:'Week starting 10 Aug', short:'10 Aug', due:'2026-08-08', open:true},
  {id:'w-2026-08-03', label:'Week starting 3 Aug',  short:'3 Aug',  due:'2026-08-01', open:false},
  {id:'w-2026-07-27', label:'Week starting 27 Jul', short:'27 Jul', due:'2026-07-25', open:false},
  {id:'w-2026-07-20', label:'Week starting 20 Jul', short:'20 Jul', due:'2026-07-18', open:false},
  {id:'w-2026-07-13', label:'Week starting 13 Jul', short:'13 Jul', due:'2026-07-11', open:false},
  {id:'w-2026-07-06', label:'Week starting 6 Jul',  short:'6 Jul',  due:'2026-07-04', open:false},
];

// Submissions keyed `${weekId}|${coachId}`
const S = {};
const put = (w,c,band,note,when) => { S[`${w}|${c}`] = {band, note:note||'', submittedAt:when}; };

// Open week — Amy and Angus already in, Sarah and Marco outstanding
put('w-2026-08-10','amy','3-4','Two finishing their block on the 14th, so room opens up mid-week.','Fri 7 Aug, 9:12am');
put('w-2026-08-10','angus','1-2','Mostly on onboarding handovers this week.','Fri 7 Aug, 8:40am');

put('w-2026-08-03','sarah','5-6','','Fri 1 Aug, 4:22pm');
put('w-2026-08-03','amy','1-2','Full on until the 10th.','Fri 1 Aug, 11:05am');
put('w-2026-08-03','marco','3-4','','Fri 1 Aug, 5:48pm');
put('w-2026-08-03','tess','0','At capacity — 27 active and two coming back off pause.','Fri 1 Aug, 2:15pm');
put('w-2026-08-03','angus','1-2','','Fri 1 Aug, 9:30am');

put('w-2026-07-27','sarah','3-4','','Fri 25 Jul, 3:10pm');
put('w-2026-07-27','amy','0','Two cancels pending, will know more next week.','Fri 25 Jul, 1:44pm');
put('w-2026-07-27','marco','5-6','Happy to take extras.','Fri 25 Jul, 10:02am');
put('w-2026-07-27','tess','1-2','','Fri 25 Jul, 6:01pm');
put('w-2026-07-27','angus','3-4','','Fri 25 Jul, 8:55am');

put('w-2026-07-20','sarah','1-2','','Fri 18 Jul, 4:40pm');
put('w-2026-07-20','amy','3-4','','Fri 18 Jul, 12:20pm');
put('w-2026-07-20','marco','7+','Just had three finish, lots of room.','Fri 18 Jul, 9:15am');
put('w-2026-07-20','tess','3-4','','Fri 18 Jul, 5:30pm');
put('w-2026-07-20','angus','5-6','','Fri 18 Jul, 8:20am');

put('w-2026-07-13','sarah','5-6','','Fri 11 Jul, 2:05pm');
put('w-2026-07-13','amy','5-6','','Fri 11 Jul, 10:48am');
put('w-2026-07-13','marco','3-4','','Fri 11 Jul, 4:12pm');
put('w-2026-07-13','tess','5-6','','Fri 11 Jul, 1:00pm');

put('w-2026-07-06','sarah','7+','','Fri 4 Jul, 3:33pm');
put('w-2026-07-06','amy','5-6','','Fri 4 Jul, 9:50am');
put('w-2026-07-06','marco','5-6','','Fri 4 Jul, 11:11am');
put('w-2026-07-06','tess','3-4','','Fri 4 Jul, 4:55pm');
put('w-2026-07-06','angus','7+','','Fri 4 Jul, 8:05am');

window.CAP_SUBS = S;

// Helpers
window.capTotal = (subs, weekId) => window.CAP_COACHES().reduce((n,c)=>{
  const s = subs[`${weekId}|${c.id}`];
  return n + (s ? window.CAP_BAND(s.band).mid : 0);
},0);
window.capMissing = (subs, weekId) => window.CAP_COACHES().filter(c=>!subs[`${weekId}|${c.id}`]);
