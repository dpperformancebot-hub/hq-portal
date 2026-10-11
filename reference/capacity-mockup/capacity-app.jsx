// Weekly Capacity Check — coach submission form + head coach / owner results view.
(function(){
const {useState, useEffect, useMemo} = React;
const P = window.CAP, PEOPLE = window.CAP_PEOPLE, PERSON = window.CAP_PERSON;
const COACHES = window.CAP_COACHES, BANDS = window.CAP_BANDS, BAND = window.CAP_BAND;
const WEEKS = window.CAP_WEEKS;
const STORE = 'dp.capacity.v1';
const TODAY_IS_FRIDAY = true; // demo: drives the reminder banner

const ico = {
  check:'M20 6 9 17l-5-5',
  bell:'M6 9a6 6 0 0 1 12 0c0 6 3 8 3 8H3s3-2 3-8 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  x:'M18 6 6 18 M6 6l12 12',
  chev:'m6 9 6 6 6-6',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  send:'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  edit:'M11 4H4v16h16v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M23 21v-2a4 4 0 0 0-3-3.87',
  download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  nudge:'M12 19V5 M5 12l7-7 7 7',
};
const Ic = ({d,s=15}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;

const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

function Avatar({id, size=26}){
  const p = PERSON(id);
  return <div title={p.name} style={{width:size,height:size,borderRadius:'50%',flexShrink:0,background:p.colour,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size<24?9:size<30?10:12,fontWeight:700,fontFamily:P.ui}}>{initials(p.name)}</div>;
}
function Chip({bg,fg,children,strong}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,background:bg,color:fg,fontSize:10.5,fontWeight:strong?700:600,padding:'2px 8px',borderRadius:100,whiteSpace:'nowrap'}}>{children}</span>;
}
const btn = (kind) => ({
  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,
  fontFamily:P.ui,fontSize:12.5,fontWeight:600,padding:'8px 14px',borderRadius:8,cursor:'pointer',
  ...(kind==='primary' ? {background:P.accent,color:'#fff',border:`1px solid ${P.accent}`}
    : {background:P.card,color:P.text,border:`1px solid ${P.border}`}),
});
const btnSm = k => ({...btn(k), fontSize:11.5, padding:'6px 11px', gap:5});
const field = {width:'100%',fontFamily:P.ui,fontSize:13,color:P.text,background:P.card,border:`1px solid ${P.border}`,borderRadius:8,padding:'9px 11px',outline:'none'};

// ── Friday reminder banner ───────────────────────────────
function ReminderBanner({week, onJump, onDismiss}){
  return (
    <div style={{padding:'0 24px 14px',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:13,background:P.amberSoft,border:`1px solid ${P.amber}66`,borderRadius:10,padding:'12px 15px'}}>
        <span style={{color:P.amber,display:'flex',flexShrink:0}}><Ic d={ico.bell} s={17}/></span>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:12.5,fontWeight:700,color:'#7a5308',marginBottom:2}}>Capacity check due today</div>
          <div style={{fontSize:12.5,color:'#7a5308',opacity:.9}}>It's Friday — submit your capacity for <b>{week.label}</b> before end of day.</div>
        </div>
        <button onClick={onJump} style={{...btn(),background:P.amber,color:'#fff',border:`1px solid ${P.amber}`,flexShrink:0}}>Submit now</button>
        <button onClick={onDismiss} title="Dismiss" style={{background:'transparent',border:'none',color:'#7a5308',cursor:'pointer',display:'flex',padding:4,flexShrink:0}}><Ic d={ico.x} s={14}/></button>
      </div>
    </div>
  );
}

// ── Chase banner (head coach / owner) ────────────────────
function ChaseBanner({missing, week, onNudge, nudged}){
  if (!missing.length) return null;
  return (
    <div style={{padding:'0 24px 14px',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:13,background:P.amberSoft,border:`1px solid ${P.amber}66`,borderRadius:10,padding:'12px 15px'}}>
        <span style={{color:P.amber,display:'flex',flexShrink:0}}><Ic d={ico.clock} s={17}/></span>
        <div style={{display:'flex',flexShrink:0}}>
          {missing.map((c,i)=><span key={c.id} style={{marginLeft:i?-8:0,border:`2px solid ${P.amberSoft}`,borderRadius:'50%',display:'flex'}}><Avatar id={c.id} size={24}/></span>)}
        </div>
        <div style={{minWidth:0,flex:1,fontSize:12.5,color:'#7a5308'}}>
          <b style={{fontWeight:700}}>{missing.length} still to submit</b> for {week.label} — {missing.map(c=>c.name.split(' ')[0]).join(', ')}
        </div>
        <button onClick={onNudge} disabled={nudged} style={{...btn(),background:nudged?'transparent':P.amber,color:nudged?'#7a5308':'#fff',border:`1px solid ${P.amber}`,flexShrink:0,opacity:nudged?.7:1,cursor:nudged?'default':'pointer'}}>
          {nudged ? <><Ic d={ico.check} s={13}/> Reminder sent</> : <><Ic d={ico.nudge} s={13}/> Send reminder</>}
        </button>
      </div>
    </div>
  );
}

// ── Coach: the poll ──────────────────────────────────────
function CoachForm({viewer, week, existing, onSubmit}){
  const [band, setBand] = useState(existing?.band || null);
  const [note, setNote] = useState(existing?.note || '');
  const [editing, setEditing] = useState(!existing);

  useEffect(()=>{ setBand(existing?.band||null); setNote(existing?.note||''); setEditing(!existing); },[week.id, existing]);

  if (!editing && existing){
    const b = BAND(existing.band);
    return (
      <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:14,padding:'22px 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <span style={{width:30,height:30,borderRadius:'50%',background:P.accentSoft,color:P.accent,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ic d={ico.check} s={16}/></span>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:P.text}}>Submitted for {week.label}</div>
            <div style={{fontSize:12,color:P.textMuted,marginTop:2}}>{existing.submittedAt}</div>
          </div>
          <button onClick={()=>setEditing(true)} style={{...btnSm(),marginLeft:'auto'}}><Ic d={ico.edit} s={12}/> Change</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,background:b.soft,border:`1px solid ${b.colour}44`,borderRadius:11,padding:'16px 20px'}}>
          <div style={{fontFamily:P.disp,fontSize:38,fontWeight:500,color:b.colour,lineHeight:1}}>{b.label}</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:b.colour}}>{b.sub}</div>
            <div style={{fontSize:12,color:b.colour,opacity:.8,marginTop:2}}>new clients you can take on</div>
          </div>
        </div>
        {existing.note && (
          <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${P.borderSoft}`}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:P.textMuted,marginBottom:5}}>Your note</div>
            <div style={{fontSize:13,color:P.text,lineHeight:1.55}}>{existing.note}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:14,padding:'22px 24px'}}>
      <div style={{fontFamily:P.disp,fontSize:24,fontWeight:500,letterSpacing:'-.02em',color:P.text,lineHeight:1.25,marginBottom:6}}>
        How many new clients can you take on for {week.label.replace('Week starting ','the week starting ')}?
      </div>
      <div style={{fontSize:13,color:P.textDim,marginBottom:20}}>
        {PERSON(viewer.id).clients ? `You've got ${PERSON(viewer.id).clients} active right now. ` : ''}Pick the band that's realistic, not aspirational.
      </div>

      <div style={{display:'grid',gridTemplateColumns:`repeat(${BANDS.length},1fr)`,gap:9,marginBottom:20}}>
        {BANDS.map(b=>{
          const on = band===b.id;
          return (
            <button key={b.id} onClick={()=>setBand(b.id)} style={{
              cursor:'pointer',fontFamily:P.ui,padding:'18px 10px 14px',borderRadius:12,textAlign:'center',
              background:on?b.soft:P.card2, border:`2px solid ${on?b.colour:P.borderSoft}`,
              transition:'background .12s, border-color .12s',
            }}>
              <div style={{fontFamily:P.disp,fontSize:32,fontWeight:500,lineHeight:1,color:on?b.colour:P.text,marginBottom:7}}>{b.label}</div>
              <div style={{fontSize:11,fontWeight:600,color:on?b.colour:P.textMuted,lineHeight:1.3}}>{b.sub}</div>
            </button>
          );
        })}
      </div>

      <div style={{marginBottom:18}}>
        <label style={{display:'block',fontSize:11.5,fontWeight:600,color:P.text,marginBottom:6}}>
          Anything the head coach should know? <span style={{fontWeight:400,color:P.textMuted}}>optional</span>
        </label>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="e.g. two finishing their block mid-week, so room opens up"
          style={{...field,resize:'vertical',lineHeight:1.5}}/>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:11}}>
        <span style={{fontSize:11.5,color:P.textMuted}}>Due by end of day Friday</span>
        {existing && <button onClick={()=>setEditing(false)} style={{...btn(),marginLeft:'auto'}}>Cancel</button>}
        <button disabled={!band} onClick={()=>{onSubmit(band,note); setEditing(false);}}
          style={{...btn('primary'),marginLeft:existing?0:'auto',opacity:band?1:.4,cursor:band?'pointer':'not-allowed'}}>
          <Ic d={ico.send} s={13}/> {existing?'Update':'Submit'} capacity
        </button>
      </div>
    </div>
  );
}

// ── Coach: own history ───────────────────────────────────
function CoachHistory({viewer, subs}){
  const rows = WEEKS.filter(w=>!w.open);
  return (
    <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:14,overflow:'hidden'}}>
      <div style={{padding:'15px 20px',borderBottom:`1px solid ${P.borderSoft}`,display:'flex',alignItems:'baseline',gap:10}}>
        <div style={{fontSize:13.5,fontWeight:700,color:P.text}}>Your past weeks</div>
        <div style={{fontSize:11.5,color:P.textMuted}}>last {rows.length} weeks</div>
      </div>
      {rows.map((w,i)=>{
        const s = subs[`${w.id}|${viewer.id}`];
        const b = s && BAND(s.band);
        return (
          <div key={w.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 20px',borderBottom:i<rows.length-1?`1px solid ${P.borderSoft}`:'none'}}>
            <div style={{minWidth:130,fontSize:13,fontWeight:600,color:P.text}}>{w.label.replace('Week starting ','')}</div>
            {b ? (
              <>
                <div style={{width:44,fontFamily:P.disp,fontSize:20,fontWeight:500,color:b.colour,lineHeight:1}}>{b.label}</div>
                <Chip bg={b.soft} fg={b.colour}>{b.sub}</Chip>
                <div style={{minWidth:0,flex:1,fontSize:12,color:P.textDim,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.note}</div>
                <span style={{fontSize:11,color:P.textMuted,flexShrink:0}}>{s.submittedAt}</span>
              </>
            ) : (
              <><Chip bg={P.redSoft} fg={P.red}>Missed</Chip><div style={{flex:1}}/></>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Manager: results for a week ──────────────────────────
function WeekResults({week, subs}){
  const coaches = COACHES();
  const rows = coaches.map(c=>({c, s:subs[`${week.id}|${c.id}`]}));
  const inCount = rows.filter(r=>r.s).length;
  const total = window.capTotal(subs, week.id);

  const dist = BANDS.map(b=>({b, n:rows.filter(r=>r.s?.band===b.id).length}));
  const maxN = Math.max(1, ...dist.map(d=>d.n));

  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
        {[
          {k:'Responses', v:`${inCount}/${coaches.length}`, s:inCount===coaches.length?'All in':`${coaches.length-inCount} outstanding`, warn:inCount<coaches.length},
          {k:'Total capacity', v:`~${total}`, s:'new clients this week'},
          {k:'At capacity', v:String(rows.filter(r=>r.s?.band==='0').length), s:'coaches with no room', warn:rows.some(r=>r.s?.band==='0')},
        ].map(m=>(
          <div key={m.k} style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,padding:'15px 18px'}}>
            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:P.textMuted,marginBottom:8}}>{m.k}</div>
            <div style={{fontFamily:P.disp,fontSize:30,fontWeight:500,lineHeight:1,color:m.warn?P.amber:P.text}}>{m.v}</div>
            <div style={{fontSize:11.5,color:m.warn?P.amber:P.textDim,marginTop:6,fontWeight:500}}>{m.s}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:14}}>
        <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${P.borderSoft}`,fontSize:13,fontWeight:700,color:P.text}}>Coach responses</div>
          {rows.map((r,i)=>{
            const b = r.s && BAND(r.s.band);
            return (
              <div key={r.c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 18px',borderBottom:i<rows.length-1?`1px solid ${P.borderSoft}`:'none',background:r.s?'transparent':P.amberSoft+'55'}}>
                <Avatar id={r.c.id} size={30}/>
                <div style={{minWidth:150}}>
                  <div style={{fontSize:13,fontWeight:600,color:P.text}}>{r.c.name}</div>
                  <div style={{fontSize:11.5,color:P.textMuted}}>{r.c.clients ? `${r.c.clients} active` : r.c.title}</div>
                </div>
                {b ? (
                  <>
                    <div style={{width:46,fontFamily:P.disp,fontSize:23,fontWeight:500,color:b.colour,lineHeight:1,textAlign:'center'}}>{b.label}</div>
                    <Chip bg={b.soft} fg={b.colour}>{b.sub}</Chip>
                    <div style={{minWidth:0,flex:1,fontSize:12,color:P.textDim,lineHeight:1.45}}>{r.s.note}</div>
                    <span style={{fontSize:11,color:P.textMuted,flexShrink:0,whiteSpace:'nowrap'}}>{r.s.submittedAt}</span>
                  </>
                ) : (
                  <>
                    <Chip bg={P.amberSoft} fg={P.amber} strong>Waiting</Chip>
                    <div style={{flex:1}}/>
                    <button style={{...btnSm(),flexShrink:0}}><Ic d={ico.nudge} s={11}/> Nudge</button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,padding:'16px 18px'}}>
            <div style={{fontSize:13,fontWeight:700,color:P.text,marginBottom:14}}>Spread</div>
            {dist.map(d=>(
              <div key={d.b.id} style={{display:'flex',alignItems:'center',gap:9,marginBottom:9}}>
                <div style={{width:30,fontSize:12,fontWeight:600,color:d.n?d.b.colour:P.textMuted,textAlign:'right'}}>{d.b.label}</div>
                <div style={{flex:1,height:20,background:P.card2,borderRadius:5,overflow:'hidden'}}>
                  <div style={{width:`${(d.n/maxN)*100}%`,height:'100%',background:d.b.colour,opacity:d.n?.85:0,borderRadius:5,transition:'width .2s'}}/>
                </div>
                <div style={{width:14,fontSize:12,fontWeight:600,color:d.n?P.text:P.textMuted}}>{d.n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Manager: history grid ────────────────────────────────
function HistoryGrid({subs}){
  const coaches = COACHES();
  const weeks = [...WEEKS].reverse();
  return (
    <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',borderBottom:`1px solid ${P.borderSoft}`,display:'flex',alignItems:'baseline',gap:10}}>
        <div style={{fontSize:13,fontWeight:700,color:P.text}}>Capacity log</div>
        <div style={{fontSize:11.5,color:P.textMuted}}>every coach, every week</div>
        <button style={{...btnSm(),marginLeft:'auto'}}><Ic d={ico.download} s={12}/> Export CSV</button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead>
            <tr style={{background:P.card2}}>
              <th style={{textAlign:'left',padding:'10px 18px',fontSize:10.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:P.textMuted,position:'sticky',left:0,background:P.card2}}>Coach</th>
              {weeks.map(w=>(
                <th key={w.id} style={{padding:'10px 12px',fontSize:10.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:w.open?P.accent:P.textMuted,whiteSpace:'nowrap'}}>
                  {w.short}{w.open && ' •'}
                </th>
              ))}
              <th style={{padding:'10px 14px',fontSize:10.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:P.textMuted,textAlign:'right'}}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c,i)=>{
              const vals = weeks.map(w=>subs[`${w.id}|${c.id}`]);
              const got = vals.filter(Boolean);
              const avg = got.length ? (got.reduce((n,s)=>n+BAND(s.band).mid,0)/got.length).toFixed(1) : '—';
              return (
                <tr key={c.id} style={{borderTop:`1px solid ${P.borderSoft}`}}>
                  <td style={{padding:'10px 18px',position:'sticky',left:0,background:P.card}}>
                    <div style={{display:'flex',alignItems:'center',gap:9}}>
                      <Avatar id={c.id} size={24}/>
                      <span style={{fontWeight:600,color:P.text,whiteSpace:'nowrap'}}>{c.name}</span>
                    </div>
                  </td>
                  {vals.map((s,j)=>{
                    const b = s && BAND(s.band);
                    return (
                      <td key={j} style={{padding:'8px 12px',textAlign:'center'}}>
                        {b ? (
                          <span title={s.note||b.sub} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:38,padding:'4px 8px',borderRadius:7,background:b.soft,color:b.colour,fontSize:12,fontWeight:700}}>{b.label}</span>
                        ) : (
                          <span style={{color:P.textMuted,fontSize:12}}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{padding:'8px 14px',textAlign:'right',fontWeight:700,color:P.text}}>{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────
function App(){
  const [subs, setSubs] = useState(()=>{
    try { const raw = localStorage.getItem(STORE); if (raw) return JSON.parse(raw); } catch(e){}
    return window.CAP_SUBS;
  });
  const [viewerId, setViewerId] = useState('sarah');
  const [weekId, setWeekId] = useState(WEEKS[0].id);
  const [tab, setTab] = useState('current');
  const [dismissed, setDismissed] = useState(false);
  const [nudged, setNudged] = useState(false);

  useEffect(()=>{ try{ localStorage.setItem(STORE, JSON.stringify(subs)); }catch(e){} },[subs]);

  const viewer = PEOPLE[viewerId];
  const isManager = viewer.role==='owner' || viewer.role==='head_of_ops' || viewer.role==='head_coach';
  const isCoach = viewer.role==='coach' || viewer.role==='head_coach';
  const openWeek = WEEKS.find(w=>w.open);
  const week = WEEKS.find(w=>w.id===weekId) || openWeek;
  const mine = subs[`${openWeek.id}|${viewerId}`];
  const missing = window.capMissing(subs, openWeek.id);

  const submit = (band, note) => setSubs(s=>({...s, [`${openWeek.id}|${viewerId}`]:{band, note, submittedAt:'Fri 7 Aug, just now'}}));

  return (
    <div style={{height:'100vh',width:'100vw',display:'flex',flexDirection:'column',background:P.bg,fontFamily:P.ui,color:P.text,overflow:'hidden'}}>

      <div style={{height:50,flexShrink:0,background:P.card,borderBottom:`1px solid ${P.border}`,display:'flex',alignItems:'center',padding:'0 24px',gap:12}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:P.textMuted}}>Viewing as</span>
        <select value={viewerId} onChange={e=>{setViewerId(e.target.value); setTab('current'); setDismissed(false);}}
          style={{...field,width:'auto',padding:'6px 10px',fontSize:12.5,fontWeight:600,cursor:'pointer',appearance:'none'}}>
          {Object.values(PEOPLE).map(p=><option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
        </select>
        <span style={{fontSize:11.5,color:P.textMuted}}>Coaches submit · Head coach, ops and owner see every result</span>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:7,color:P.textDim}}>
          <span style={{display:'flex',position:'relative'}}>
            <Ic d={ico.bell} s={17}/>
            {((isCoach && !mine) || (isManager && missing.length>0)) && <span style={{position:'absolute',top:-3,right:-3,width:8,height:8,borderRadius:'50%',background:P.red,border:`1.5px solid ${P.card}`}}/>}
          </span>
          <span style={{fontSize:11.5}}>{isCoach && !mine ? 'Your capacity is due' : isManager && missing.length ? `${missing.length} coach${missing.length===1?'':'es'} outstanding` : 'All up to date'}</span>
        </div>
      </div>

      <div style={{padding:'20px 24px 14px',flexShrink:0,display:'flex',alignItems:'flex-end',gap:16}}>
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:P.accent,marginBottom:5}}>Coaching</div>
          <div style={{fontFamily:P.disp,fontSize:32,fontWeight:500,letterSpacing:'-.025em',lineHeight:1,color:P.text}}>Weekly Capacity Check</div>
          <div style={{fontSize:13,color:P.textDim,marginTop:7}}>
            {isManager && tab!=='mine'
              ? `${week.label} · ${COACHES().length - window.capMissing(subs, week.id).length}/${COACHES().length} in`
              : mine ? `You're in for ${openWeek.label}` : `Due end of day Friday · ${openWeek.label}`}
          </div>
        </div>

        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
          {isManager && (
            <>
              {tab==='current' && (
                <select value={weekId} onChange={e=>setWeekId(e.target.value)} style={{...field,width:'auto',padding:'7px 10px',fontSize:12.5,fontWeight:600,cursor:'pointer',appearance:'none'}}>
                  {WEEKS.map(w=><option key={w.id} value={w.id}>{w.label}{w.open?' — open':''}</option>)}
                </select>
              )}
              <div style={{display:'flex',gap:2,background:P.card2,border:`1px solid ${P.border}`,borderRadius:9,padding:3}}>
                {[['current','Results'],['log','Capacity log'],...(isCoach?[['mine','My submission']]:[])].map(([k,l])=>(
                  <button key={k} onClick={()=>setTab(k)} style={{
                    padding:'6px 13px',borderRadius:6,fontSize:12,fontWeight:tab===k?600:500,border:'none',cursor:'pointer',fontFamily:P.ui,
                    background:tab===k?P.card:'transparent', color:tab===k?P.text:P.textDim,
                    boxShadow:tab===k?'0 1px 2px rgba(0,0,0,.05)':'none',
                  }}>{l}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Banners */}
      {TODAY_IS_FRIDAY && isCoach && !mine && !dismissed && (
        <ReminderBanner week={openWeek} onJump={()=>setTab(isManager?'mine':'current')} onDismiss={()=>setDismissed(true)}/>
      )}
      {isManager && tab==='current' && week.open && (
        <ChaseBanner missing={missing} week={openWeek} nudged={nudged} onNudge={()=>setNudged(true)}/>
      )}

      <div style={{flex:1,minHeight:0,overflowY:'auto',padding:'0 24px 24px'}}>
        {(!isManager || tab==='mine') ? (
          <div style={{display:'flex',flexDirection:'column',gap:14,maxWidth:920}}>
            <CoachForm viewer={viewer} week={openWeek} existing={mine} onSubmit={submit}/>
            <CoachHistory viewer={viewer} subs={subs}/>
          </div>
        ) : tab==='log' ? (
          <HistoryGrid subs={subs}/>
        ) : (
          <WeekResults week={week} subs={subs}/>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
