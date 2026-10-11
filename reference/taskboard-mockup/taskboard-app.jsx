// Taskboard — kanban board, role-aware task templates, inline task detail,
// flag-back / escalation, and a searchable archive for older completions.
(function(){
const {useState, useEffect, useMemo} = React;
const P = window.TB, PEOPLE = window.TB_PEOPLE, PERSON = window.TB_PERSON;
const STATUSES = window.TB_STATUSES, STATUS = window.TB_STATUS;
const TEMPLATES = window.TB_TEMPLATES, TEMPLATE = window.TB_TEMPLATE;
const STORE = 'dp.taskboard.v3';
const TODAY = '2026-08-07';
const ARCHIVE_AFTER_DAYS = 7;

const ico = {
  plus:'M12 5v14 M5 12h14',
  x:'M18 6 6 18 M6 6l12 12',
  flag:'M4 22V4h13l-2 4 2 4H4',
  up:'M12 19V5 M5 12l7-7 7 7',
  check:'M20 6 9 17l-5-5',
  bell:'M6 9a6 6 0 0 1 12 0c0 6 3 8 3 8H3s3-2 3-8 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  chev:'m6 9 6 6 6-6',
  arrow:'M5 12h14 M12 5l7 7-7 7',
  back:'M19 12H5 M12 19l-7-7 7-7',
  box:'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  userPlus:'M15 20v-1a5 5 0 0 0-5-5H6a5 5 0 0 0-5 5v1 M8 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7 M18 8v6 M21 11h-6',
};
const Ic = ({d,s=15}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;

const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = d => { if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${+dd} ${MON[+m-1]}`; };
const fmtFull = d => { if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${+dd} ${MON[+m-1]} ${y}`; };
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
const overdue = d => d && d < TODAY;
const isArchived = t => t.status==='complete' && t.completedAt && daysBetween(t.completedAt, TODAY) > ARCHIVE_AFTER_DAYS;

function Avatar({id, size=26}){
  const p = PERSON(id);
  return <div title={p.name} style={{width:size,height:size,borderRadius:'50%',flexShrink:0,background:p.colour,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size<24?9:10,fontWeight:700,fontFamily:P.ui}}>{initials(p.name)}</div>;
}

function Chip({bg,fg,children,strong}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,background:bg,color:fg,fontSize:10.5,fontWeight:strong?700:600,padding:'2px 8px',borderRadius:100,letterSpacing:'.02em',whiteSpace:'nowrap'}}>{children}</span>;
}

const btn = (kind) => ({
  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,
  fontFamily:P.ui,fontSize:12.5,fontWeight:600,padding:'8px 14px',borderRadius:8,cursor:'pointer',
  ...(kind==='primary' ? {background:P.accent,color:'#fff',border:`1px solid ${P.accent}`}
    : kind==='danger'  ? {background:P.card,color:P.red,border:`1px solid ${P.red}`}
    : {background:P.card,color:P.text,border:`1px solid ${P.border}`}),
});
const btnSm = (kind) => ({...btn(kind), fontSize:11.5, padding:'6px 11px', gap:5});

const field = {
  width:'100%',fontFamily:P.ui,fontSize:13,color:P.text,background:P.card,
  border:`1px solid ${P.border}`,borderRadius:8,padding:'9px 11px',outline:'none',
};

// ── Client picker ── type-ahead against the client database ──────
function ClientPicker({value, onChange, placeholder}){
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = React.useRef(null);
  const CLIENTS = window.TB_CLIENTS || [];

  useEffect(()=>{ setQ(value || ''); },[value]);
  useEffect(()=>{
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return ()=>document.removeEventListener('mousedown', away);
  },[]);

  const matches = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if (!s) return CLIENTS.slice(0,8);
    return CLIENTS.filter(c=>c.name.toLowerCase().includes(s)).slice(0,8);
  },[q]);

  const exact = !!value && CLIENTS.some(c=>c.name === value);
  const pick = (c) => { onChange(c.name); setQ(c.name); setOpen(false); };

  const key = (e) => {
    if (!open) { if (e.key==='ArrowDown') setOpen(true); return; }
    if (e.key==='ArrowDown') { e.preventDefault(); setHi(h=>Math.min(h+1, matches.length-1)); }
    else if (e.key==='ArrowUp') { e.preventDefault(); setHi(h=>Math.max(h-1,0)); }
    else if (e.key==='Enter') { e.preventDefault(); if (matches[hi]) pick(matches[hi]); }
    else if (e.key==='Escape') setOpen(false);
  };

  const stColour = s => s==='Active'?P.accent : s==='Paused'?P.amber : s==='Onboarding'?P.blue : P.textMuted;

  return (
    <div ref={wrap} style={{position:'relative'}}>
      <div style={{...field, display:'flex', alignItems:'center', gap:8, padding:'0 11px', borderColor: exact?P.accent+'88':P.border}}>
        <span style={{color:exact?P.accent:P.textMuted,display:'flex',flexShrink:0}}>
          <Ic d={exact?ico.check:ico.search} s={14}/>
        </span>
        <input value={q} placeholder={placeholder}
          onChange={e=>{ setQ(e.target.value); setHi(0); setOpen(true); if (value) onChange(''); }}
          onFocus={()=>setOpen(true)} onKeyDown={key}
          style={{flex:1,border:'none',outline:'none',background:'transparent',fontFamily:P.ui,fontSize:13,color:P.text,padding:'9px 0',minWidth:0}}/>
        {value && <button onClick={()=>{onChange(''); setQ(''); setOpen(true);}} style={{background:'transparent',border:'none',color:P.textMuted,cursor:'pointer',display:'flex',padding:0,flexShrink:0}}><Ic d={ico.x} s={13}/></button>}
      </div>

      {open && (
        <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:20,background:P.card,border:`1px solid ${P.border}`,borderRadius:9,boxShadow:'0 8px 24px rgba(60,50,30,.14)',maxHeight:238,overflowY:'auto',padding:4}}>
          {matches.length===0 ? (
            <div style={{padding:'14px 12px',fontSize:12,color:P.textMuted,lineHeight:1.5}}>
              No client called “{q}”. Check the spelling, or add them in the Client Database first.
            </div>
          ) : matches.map((c,i)=>(
            <div key={c.name} onMouseEnter={()=>setHi(i)} onClick={()=>pick(c)}
              style={{display:'flex',alignItems:'center',gap:9,padding:'8px 9px',borderRadius:7,cursor:'pointer',background:i===hi?P.card2:'transparent'}}>
              <Avatar id={c.coach} size={22}/>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12.5,fontWeight:600,color:P.text}}>{c.name}</div>
                <div style={{fontSize:11,color:P.textMuted}}>{c.plan} · {PERSON(c.coach).name.split(' ')[0]}</div>
              </div>
              <Chip bg={P.card2} fg={stColour(c.status)}>{c.status}</Chip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({f, value, onChange}){
  const common = {value: value ?? '', onChange:e=>onChange(f.k, e.target.value)};
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:'flex',alignItems:'baseline',gap:7,fontSize:11.5,fontWeight:600,color:P.text,marginBottom:6}}>
        {f.label}
        {f.required && <span style={{color:P.red,fontSize:11}}>*</span>}
        {f.hint && <span style={{fontWeight:400,color:P.textMuted,fontSize:11}}>{f.hint}</span>}
      </label>
      {f.type==='client'
        ? <ClientPicker value={value} onChange={v=>onChange(f.k,v)} placeholder={f.placeholder}/>
        : f.type==='textarea'
        ? <textarea {...common} rows={3} placeholder={f.placeholder} style={{...field,resize:'vertical',lineHeight:1.5}}/>
        : f.type==='select'
        ? <select {...common} style={{...field,appearance:'none',cursor:'pointer'}}>
            <option value="">Choose…</option>
            {f.options.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        : <input {...common} type={f.type} placeholder={f.placeholder} style={field}/>}
    </div>
  );
}

// ── Inline task detail — drops down inside the card ──────
function TaskDetail({task, viewer, onStatus, onEscalate, wide}){
  const tpl = TEMPLATE(task.template);
  const st = STATUS(task.status);
  const isAssignee = task.assignedTo === viewer.id;
  const isAssigner = task.assignedBy === viewer.id;
  const [blockNote, setBlockNote] = useState('');
  const [blocking, setBlocking] = useState(false);
  const archived = isArchived(task);

  return (
    <div style={{borderTop:`1px solid ${P.borderSoft}`,marginTop:11,paddingTop:12}}>

      {tpl.summary && (
        <div style={{background:tpl.soft,border:`1px solid ${tpl.colour}33`,borderRadius:9,padding:'10px 12px',marginBottom:11}}>
          <div style={{fontSize:9.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:tpl.colour,marginBottom:5}}>Summary</div>
          <div style={{fontSize:12.5,color:P.text,lineHeight:1.5}}>{tpl.summary(task.values)}</div>
        </div>
      )}

      {task.status==='blocked' && task.blockedReason && (
        <div style={{background:P.redSoft,border:`1px solid ${P.red}44`,borderRadius:9,padding:'10px 12px',marginBottom:11}}>
          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
            <span style={{color:P.red,display:'flex'}}><Ic d={ico.flag} s={12}/></span>
            <span style={{fontSize:9.5,fontWeight:700,letterSpacing:'.09em',textTransform:'uppercase',color:P.red}}>Flagged to {PERSON(task.assignedBy).name.split(' ')[0]}</span>
          </div>
          <div style={{fontSize:12.5,color:'#8c1d1d',lineHeight:1.5}}>{task.blockedReason}</div>
        </div>
      )}

      {task.status==='complete' && (
        <div style={{background:P.accentSoft,border:`1px solid ${P.accent}33`,borderRadius:9,padding:'9px 12px',marginBottom:11,display:'flex',alignItems:'center',gap:7}}>
          <span style={{color:P.accent,display:'flex'}}><Ic d={ico.check} s={13}/></span>
          <span style={{fontSize:12,color:P.accentDeep}}>Completed {fmtFull(task.completedAt)} · {PERSON(task.assignedBy).name.split(' ')[0]} notified</span>
        </div>
      )}

      {/* Filled-in template */}
      <div style={{background:P.card2,border:`1px solid ${P.borderSoft}`,borderRadius:9,padding:'4px 12px',marginBottom:11}}>
        {tpl.fields.map((f,i)=>(
          <div key={f.k} style={{
            display: wide?'grid':'block', gridTemplateColumns: wide?'150px 1fr':undefined, gap: wide?16:0,
            padding:'9px 0', borderBottom:i<tpl.fields.length-1?`1px solid ${P.borderSoft}`:'none',
          }}>
            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:P.textMuted,marginBottom:wide?0:4}}>{f.label}</div>
            <div style={{fontSize:12.5,color:P.text,lineHeight:1.5,whiteSpace:'pre-wrap'}}>
              {f.type==='date' ? fmtDate(task.values[f.k]) : (task.values[f.k] || <span style={{color:P.textMuted}}>—</span>)}
            </div>
          </div>
        ))}
      </div>

      {/* Activity */}
      <div style={{fontSize:9.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:P.textMuted,marginBottom:7}}>Activity</div>
      <div style={{marginBottom:12}}>
        {task.activity.map((a,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0'}}>
            <Avatar id={a.who} size={19}/>
            <span style={{fontSize:12,color:P.textDim,minWidth:0}}><b style={{fontWeight:600,color:P.text}}>{PERSON(a.who).name.split(' ')[0]}</b> {a.what}</span>
            <span style={{marginLeft:'auto',fontSize:10.5,color:P.textMuted,flexShrink:0}}>{a.when}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {archived ? (
        <div style={{fontSize:11.5,color:P.textMuted,paddingTop:10,borderTop:`1px solid ${P.borderSoft}`}}>Archived — read only</div>
      ) : blocking ? (
        <div style={{paddingTop:11,borderTop:`1px solid ${P.borderSoft}`}}>
          <div style={{fontSize:11.5,fontWeight:600,color:P.text,marginBottom:7}}>Why are you blocked? This flags back to {PERSON(task.assignedBy).name.split(' ')[0]}.</div>
          <textarea value={blockNote} onChange={e=>setBlockNote(e.target.value)} rows={2} autoFocus placeholder="What do you need to unblock this?" style={{...field,resize:'vertical',marginBottom:9,fontSize:12.5}}/>
          <div style={{display:'flex',gap:7}}>
            <button onClick={()=>setBlocking(false)} style={btnSm()}>Cancel</button>
            <button onClick={()=>{onStatus(task.id,'blocked',blockNote); setBlocking(false);}} style={{...btnSm(),background:P.red,color:'#fff',border:`1px solid ${P.red}`}}>Flag as blocked</button>
          </div>
        </div>
      ) : (
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',paddingTop:11,borderTop:`1px solid ${P.borderSoft}`}}>
          <select value={task.status} onChange={e=>{
              const v = e.target.value;
              if (v==='blocked') setBlocking(true); else onStatus(task.id, v);
            }} disabled={!isAssignee && !isAssigner}
            style={{...field,width:'auto',padding:'6px 9px',fontSize:12,fontWeight:600,cursor:'pointer',appearance:'none',color:st.colour,borderColor:st.colour+'66',background:st.soft}}>
            {STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          {isAssignee && tpl.resolvable && viewer.id==='jameela' && task.status!=='complete' && (
            <button onClick={()=>onEscalate(task.id)} style={btnSm()}><Ic d={ico.up} s={12}/> Escalate to Dan</button>
          )}
          {isAssignee && task.status!=='complete' && (
            <button onClick={()=>onStatus(task.id,'complete')} style={{...btnSm('primary'),marginLeft:'auto'}}>
              <Ic d={ico.check} s={12}/> {tpl.resolvable ? 'Process as done' : 'Mark complete'}
            </button>
          )}
          {!isAssignee && !isAssigner && (
            <span style={{fontSize:11,color:P.textMuted,marginLeft:'auto'}}>View only</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────
function Card({task, expanded, onToggle, viewer, onStatus, onEscalate, wide}){
  const tpl = TEMPLATE(task.template);
  const due = task.values.timeline || task.values.start || task.values.effective || task.values.startDate;
  const isMine = task.assignedTo === viewer.id;
  const late = overdue(due) && task.status !== 'complete';
  return (
    <div style={{
      background:P.card,border:`1px solid ${expanded?P.textDim:(task.isNew&&isMine?P.accent:P.border)}`,borderRadius:10,
      padding:'12px 13px',marginBottom:8,boxShadow:expanded?'0 4px 14px rgba(60,50,30,.09)':'0 1px 2px rgba(60,50,30,.04)',
    }}>
      <div onClick={()=>onToggle(task.id)} style={{cursor:'pointer'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:9}}>
          <Chip bg={tpl.soft} fg={tpl.colour}>{tpl.short}</Chip>
          {task.isNew && isMine && <Chip bg={P.accentSoft} fg={P.accentDeep} strong>New</Chip>}
          {task.status==='blocked' && <span style={{color:P.red,display:'flex'}}><Ic d={ico.flag} s={13}/></span>}
          <span style={{marginLeft:'auto',color:P.textMuted,display:'flex',transform:expanded?'rotate(180deg)':'none',transition:'transform .15s'}}><Ic d={ico.chev} s={14}/></span>
        </div>

        <div style={{fontSize:13,fontWeight:600,color:P.text,lineHeight:1.4,marginBottom:10}}>{tpl.title(task.values)}</div>

        {!expanded && task.status==='blocked' && task.blockedReason && (
          <div style={{background:P.redSoft,borderRadius:7,padding:'7px 9px',fontSize:11.5,color:'#8c1d1d',lineHeight:1.45,marginBottom:10}}>
            Flagged back to {PERSON(task.assignedBy).name.split(' ')[0]}
          </div>
        )}

        <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:9,borderTop:`1px solid ${P.borderSoft}`}}>
          <Avatar id={task.assignedTo} size={22}/>
          <span style={{fontSize:11.5,color:P.textDim}}>{PERSON(task.assignedTo).name.split(' ')[0]}</span>
          <span style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:late?700:500,color:late?P.red:P.textMuted}}>
            <Ic d={ico.clock} s={11}/>{fmtDate(due)}
          </span>
        </div>
      </div>

      {expanded && <TaskDetail task={task} viewer={viewer} onStatus={onStatus} onEscalate={onEscalate} wide={wide}/>}
    </div>
  );
}

// ── Column ───────────────────────────────────────────────
function Column({status, tasks, archivedCount, onShowArchive, expandedId, ...rest}){
  return (
    <div style={{display:'flex',flexDirection:'column',minWidth:0,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 2px 10px'}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:status.colour}}/>
        <span style={{fontSize:12,fontWeight:700,color:P.text}}>{status.label}</span>
        <span style={{fontSize:11,fontWeight:600,color:P.textMuted,background:P.card2,padding:'1px 7px',borderRadius:100}}>{tasks.length}</span>
      </div>
      <div style={{flex:1,overflowY:'auto',background:P.card2,border:`1px solid ${P.borderSoft}`,borderRadius:12,padding:8,minHeight:0}}>
        {tasks.length===0
          ? <div style={{padding:'22px 10px',textAlign:'center',fontSize:11.5,color:P.textMuted,lineHeight:1.5}}>Nothing here</div>
          : tasks.map(t=><Card key={t.id} task={t} expanded={expandedId===t.id} {...rest}/>)}

        {status.id==='complete' && archivedCount>0 && (
          <button onClick={onShowArchive} style={{width:'100%',background:'transparent',border:`1px dashed ${P.border}`,borderRadius:9,padding:'10px',fontSize:11.5,fontWeight:600,color:P.textDim,cursor:'pointer',fontFamily:P.ui,display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
            <Ic d={ico.box} s={13}/> {archivedCount} archived
          </button>
        )}
      </div>
    </div>
  );
}

// ── Action strip ─────────────────────────────────────────
function ActionStrip({blocked, done, onOpen, onUnblock, onAck}){
  if (!blocked.length && !done.length) return null;
  return (
    <div style={{padding:'0 24px 14px',flexShrink:0}}>
      {blocked.map(t=>{
        const tpl = TEMPLATE(t.template);
        return (
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:13,background:P.redSoft,border:`1px solid ${P.red}55`,borderRadius:10,padding:'11px 14px',marginBottom:8}}>
            <span style={{color:P.red,display:'flex',flexShrink:0}}><Ic d={ico.flag} s={16}/></span>
            <Avatar id={t.assignedTo} size={26}/>
            <div style={{minWidth:0,flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                <span style={{fontSize:12.5,fontWeight:700,color:'#8c1d1d'}}>{PERSON(t.assignedTo).name.split(' ')[0]} is blocked</span>
                <Chip bg={tpl.soft} fg={tpl.colour}>{tpl.short}</Chip>
                <span style={{fontSize:12,color:'#8c1d1d',opacity:.8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tpl.title(t.values)}</span>
              </div>
              <div style={{fontSize:12.5,color:'#8c1d1d',opacity:.9,lineHeight:1.45,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>“{t.blockedReason}”</div>
            </div>
            <div style={{display:'flex',gap:7,flexShrink:0}}>
              <button onClick={()=>onOpen(t.id)} style={{...btn(),borderColor:`${P.red}55`}}>Open</button>
              <button onClick={()=>onUnblock(t.id)} style={{...btn(),background:P.red,color:'#fff',border:`1px solid ${P.red}`}}>Unblock</button>
            </div>
          </div>
        );
      })}

      {done.length>0 && (
        <div style={{display:'flex',alignItems:'center',gap:13,background:P.accentSoft,border:`1px solid ${P.accent}44`,borderRadius:10,padding:'10px 14px'}}>
          <span style={{color:P.accent,display:'flex',flexShrink:0}}><Ic d={ico.check} s={16}/></span>
          <div style={{display:'flex',flexShrink:0}}>
            {done.slice(0,3).map((t,i)=><span key={t.id} style={{marginLeft:i?-8:0,border:`2px solid ${P.accentSoft}`,borderRadius:'50%',display:'flex'}}><Avatar id={t.assignedTo} size={24}/></span>)}
          </div>
          <div style={{minWidth:0,flex:1,fontSize:12.5,color:P.accentDeep,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            <b style={{fontWeight:700}}>{done.length} task{done.length===1?'':'s'} you assigned {done.length===1?'was':'were'} completed</b>
            <span style={{opacity:.85}}> · {done.slice(0,2).map(t=>TEMPLATE(t.template).title(t.values)).join(' · ')}{done.length>2?` · +${done.length-2} more`:''}</span>
          </div>
          <div style={{display:'flex',gap:7,flexShrink:0}}>
            <button onClick={()=>onOpen(done[0].id)} style={{...btn(),borderColor:`${P.accent}55`}}>Review</button>
            <button onClick={onAck} style={{...btn(),color:P.accentDeep,borderColor:`${P.accent}55`}}>Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Unassigned clients ── assigning one fires an onboarding task ─────
function UnassignedStrip({queue, onAssign}){
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState({});
  const coaches = Object.values(PEOPLE).filter(p=>p.role==='coach'||p.role==='head_coach');
  if (!queue.length) return null;

  return (
    <div style={{padding:'0 24px 14px',flexShrink:0}}>
      <div style={{background:P.amberSoft,border:`1px solid ${P.amber}55`,borderRadius:10,overflow:'hidden'}}>
        <div onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',cursor:'pointer'}}>
          <span style={{color:P.amber,display:'flex',flexShrink:0}}><Ic d={ico.userPlus} s={16}/></span>
          <span style={{fontSize:12.5,fontWeight:700,color:'#7a5308'}}>{queue.length} unassigned client{queue.length===1?'':'s'}</span>
          <span style={{fontSize:12,color:'#7a5308',opacity:.8,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {queue.map(c=>`${c.name} (starts ${fmtDate(c.startDate)})`).join(' · ')}
          </span>
          <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:7,flexShrink:0,fontSize:12,fontWeight:600,color:'#7a5308'}}>
            {open?'Hide':'Assign to a coach'}
            <span style={{display:'flex',transform:open?'rotate(180deg)':'none',transition:'transform .15s'}}><Ic d={ico.chev} s={14}/></span>
          </span>
        </div>

        {open && (
          <div style={{borderTop:`1px solid ${P.amber}44`,background:P.card,padding:'4px 14px'}}>
            {queue.map((c,i)=>(
              <div key={c.name} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 0',borderBottom:i<queue.length-1?`1px solid ${P.borderSoft}`:'none'}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:13,fontWeight:600,color:P.text}}>{c.name}</span>
                    <Chip bg={P.card2} fg={P.textDim}>{c.plan}</Chip>
                    <span style={{fontSize:11.5,color:P.textMuted}}>starts {fmtFull(c.startDate)}</span>
                  </div>
                  <div style={{fontSize:12,color:P.textDim,lineHeight:1.45,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.notes}</div>
                </div>
                <select value={picks[c.name]||''} onChange={e=>setPicks(p=>({...p,[c.name]:e.target.value}))}
                  style={{...field,width:'auto',padding:'6px 9px',fontSize:12,cursor:'pointer',appearance:'none',flexShrink:0}}>
                  <option value="">Choose coach…</option>
                  {coaches.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button disabled={!picks[c.name]} onClick={()=>onAssign(c, picks[c.name])}
                  style={{...btnSm('primary'),flexShrink:0,opacity:picks[c.name]?1:.4,cursor:picks[c.name]?'pointer':'not-allowed'}}>
                  Assign
                </button>
              </div>
            ))}
            <div style={{padding:'9px 0 11px',fontSize:11.5,color:P.textMuted}}>
              Assigning creates a <b style={{color:P.text,fontWeight:600}}>Client onboarding</b> task on that coach's board as <b style={{color:P.text,fontWeight:600}}>Not started</b>, pre-filled with the start date, plan and intake notes.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New task modal ───────────────────────────────────────
function NewTask({viewer, onClose, onCreate}){
  const available = Object.values(TEMPLATES).filter(t=>t.creatableBy.includes(viewer.role));
  const [tplId, setTplId] = useState(available[0]?.id || 'general');
  const tpl = TEMPLATE(tplId);
  const [values, setValues] = useState({});
  const [assignee, setAssignee] = useState(tpl.defaultAssignee || '');
  const [err, setErr] = useState(false);

  useEffect(()=>{ setValues({}); setAssignee(TEMPLATE(tplId).defaultAssignee || ''); setErr(false); },[tplId]);

  const set = (k,v)=>setValues(s=>({...s,[k]:v}));
  const submit = ()=>{
    if (tpl.fields.some(f=>f.required && !values[f.k]) || !assignee) { setErr(true); return; }
    onCreate({template:tplId, assignedBy:viewer.id, assignedTo:assignee, values});
  };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,26,23,.4)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'min(760px,96vw)',maxHeight:'92vh',background:P.bg,borderRadius:16,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px rgba(0,0,0,.22)'}}>
        <div style={{padding:'18px 22px',background:P.card,borderBottom:`1px solid ${P.border}`,display:'flex',alignItems:'center',gap:12}}>
          <div>
            <div style={{fontFamily:P.disp,fontSize:22,fontWeight:500,letterSpacing:'-.02em',color:P.text,lineHeight:1.1}}>New task</div>
            <div style={{fontSize:12,color:P.textDim,marginTop:3}}>Creating as {viewer.name} · {viewer.title}</div>
          </div>
          <button onClick={onClose} style={{marginLeft:'auto',background:'transparent',border:`1px solid ${P.border}`,width:30,height:30,borderRadius:8,color:P.textDim,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Ic d={ico.x} s={14}/></button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'18px 22px'}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:P.textMuted,marginBottom:10}}>Request type</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:22}}>
            {available.map(t=>{
              const on = t.id===tplId;
              return (
                <button key={t.id} onClick={()=>setTplId(t.id)} style={{textAlign:'left',cursor:'pointer',fontFamily:P.ui,padding:'11px 12px',borderRadius:10,background:on?t.soft:P.card,border:`1.5px solid ${on?t.colour:P.border}`}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:on?t.colour:P.text,marginBottom:3}}>{t.label}</div>
                  <div style={{fontSize:11,color:on?t.colour:P.textMuted,opacity:on?.85:1,lineHeight:1.4}}>{t.blurb}</div>
                </button>
              );
            })}
          </div>

          <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,padding:'16px 18px'}}>
            <div style={{marginBottom:14}}>
              <label style={{display:'flex',alignItems:'baseline',gap:7,fontSize:11.5,fontWeight:600,color:P.text,marginBottom:6}}>
                Assign to <span style={{color:P.red,fontSize:11}}>*</span>
                {tpl.defaultAssignee && <span style={{fontWeight:400,color:P.textMuted,fontSize:11}}>routes to {PERSON(tpl.defaultAssignee).title} by default</span>}
              </label>
              <select value={assignee} onChange={e=>setAssignee(e.target.value)} style={{...field,appearance:'none',cursor:'pointer'}}>
                <option value="">Choose a person…</option>
                {Object.values(PEOPLE).filter(p=>p.id!==viewer.id).map(p=><option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
              </select>
            </div>
            {tpl.fields.map(f=><Field key={f.k} f={f} value={values[f.k]} onChange={set}/>)}
          </div>

          {err && <div style={{marginTop:12,background:P.redSoft,border:`1px solid ${P.red}`,borderRadius:8,padding:'9px 12px',fontSize:12,color:'#8c1d1d'}}>Fill in the required fields marked with *</div>}
        </div>

        <div style={{padding:'14px 22px',background:P.card,borderTop:`1px solid ${P.border}`,display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontSize:11.5,color:P.textMuted}}>
            {assignee ? <>Lands on <b style={{color:P.text,fontWeight:600}}>{PERSON(assignee).name}</b>'s board as <b style={{color:P.text,fontWeight:600}}>Not started</b></> : 'Pick someone to assign this to'}
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <button onClick={onClose} style={btn()}>Cancel</button>
            <button onClick={submit} style={btn('primary')}>Create task</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Archive view ─────────────────────────────────────────
function Archive({tasks, viewer, onBack, expandedId, onToggle, onStatus, onEscalate}){
  const [q, setQ] = useState('');
  const hits = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if (!s) return tasks;
    return tasks.filter(t=>{
      const tpl = TEMPLATE(t.template);
      const hay = [
        tpl.title(t.values), tpl.label, t.id,
        PERSON(t.assignedTo).name, PERSON(t.assignedBy).name,
        ...Object.values(t.values || {}),
      ].join(' ').toLowerCase();
      return hay.includes(s);
    });
  },[q,tasks]);

  return (
    <div style={{flex:1,minHeight:0,padding:'0 24px 24px',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,background:P.card,border:`1px solid ${P.border}`,borderRadius:9,padding:'8px 12px',flex:1,maxWidth:420}}>
          <span style={{color:P.textMuted,display:'flex'}}><Ic d={ico.search} s={15}/></span>
          <input value={q} onChange={e=>setQ(e.target.value)} autoFocus placeholder="Search archive by client, task, person…"
            style={{border:'none',outline:'none',background:'transparent',flex:1,fontSize:13,fontFamily:P.ui,color:P.text}}/>
          {q && <button onClick={()=>setQ('')} style={{background:'transparent',border:'none',color:P.textMuted,cursor:'pointer',display:'flex',padding:0}}><Ic d={ico.x} s={13}/></button>}
        </div>
        <span style={{fontSize:12,color:P.textMuted}}>{hits.length} of {tasks.length}</span>
      </div>

      <div style={{flex:1,overflowY:'auto',minHeight:0}}>
        {hits.length===0 ? (
          <div style={{background:P.card2,border:`1px dashed ${P.border}`,borderRadius:12,padding:'46px 20px',textAlign:'center',color:P.textMuted,fontSize:13}}>
            Nothing in the archive matches “{q}”
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxWidth:900}}>
            {hits.map(t=>{
              const tpl = TEMPLATE(t.template);
              const open = expandedId===t.id;
              return (
                <div key={t.id} style={{background:P.card,border:`1px solid ${open?P.textDim:P.border}`,borderRadius:10,padding:'12px 15px'}}>
                  <div onClick={()=>onToggle(t.id)} style={{display:'flex',alignItems:'center',gap:11,cursor:'pointer'}}>
                    <Chip bg={tpl.soft} fg={tpl.colour}>{tpl.short}</Chip>
                    <span style={{fontSize:13,fontWeight:600,color:P.text,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tpl.title(t.values)}</span>
                    <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:9,flexShrink:0}}>
                      <Avatar id={t.assignedTo} size={21}/>
                      <span style={{fontSize:11.5,color:P.textMuted}}>Completed {fmtFull(t.completedAt)}</span>
                      <span style={{color:P.textMuted,display:'flex',transform:open?'rotate(180deg)':'none',transition:'transform .15s'}}><Ic d={ico.chev} s={14}/></span>
                    </span>
                  </div>
                  {open && <TaskDetail task={t} viewer={viewer} onStatus={onStatus} onEscalate={onEscalate} wide/>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────
function App(){
  const [tasks, setTasks] = useState(()=>{
    try { const raw = localStorage.getItem(STORE); if (raw) return JSON.parse(raw); } catch(e){}
    return window.TB_SEED;
  });
  const [viewerId, setViewerId] = useState('angus');
  const [scope, setScope] = useState('mine');
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState('board');
  const [queue, setQueue] = useState(()=>{
    try { const raw = localStorage.getItem(STORE+'.queue'); if (raw) return JSON.parse(raw); } catch(e){}
    return window.TB_UNASSIGNED || [];
  });

  useEffect(()=>{ try{ localStorage.setItem(STORE, JSON.stringify(tasks)); }catch(e){} },[tasks]);
  useEffect(()=>{ try{ localStorage.setItem(STORE+'.queue', JSON.stringify(queue)); }catch(e){} },[queue]);

  const viewer = PEOPLE[viewerId];

  const inScope = useMemo(()=>tasks.filter(t=>
    scope==='mine' ? t.assignedTo===viewerId
    : scope==='sent' ? t.assignedBy===viewerId
    : true
  ),[tasks,scope,viewerId]);

  const live = inScope.filter(t=>!isArchived(t));
  const archived = inScope.filter(isArchived);

  const flaggedBack = tasks.filter(t=>t.assignedBy===viewerId && t.assignedTo!==viewerId && t.status==='blocked');
  const doneForMe   = tasks.filter(t=>t.assignedBy===viewerId && t.assignedTo!==viewerId && t.status==='complete' && !t.acked && !isArchived(t));
  const attention   = flaggedBack.length + doneForMe.length;

  const setStatus = (id, status, note) => setTasks(ts=>ts.map(t=>{
    if (t.id!==id) return t;
    return {...t, status, isNew:false,
      completedAt: status==='complete' ? TODAY : undefined,
      acked: status==='complete' ? false : t.acked,
      blockedReason: status==='blocked' ? (note || t.blockedReason || 'No reason given') : undefined,
      activity:[...t.activity, {who:viewerId, what: status==='blocked'?'flagged this as Blocked':status==='complete'?'marked Complete':`moved to ${STATUS(status).label}`, when:'today'}]};
  }));

  const escalate = (id) => setTasks(ts=>ts.map(t=> t.id!==id ? t : {
    ...t, assignedTo:'dan', status:'not_started', isNew:true,
    activity:[...t.activity,{who:viewerId,what:'escalated this to Dan',when:'today'}],
  }));

  const unblock = (id) => setTasks(ts=>ts.map(t=> t.id!==id ? t : {
    ...t, status:'in_progress', blockedReason:undefined,
    activity:[...t.activity,{who:viewerId,what:'unblocked this and sent it back',when:'today'}],
  }));

  const ackDone = () => setTasks(ts=>ts.map(t=> t.assignedBy===viewerId && t.status==='complete' ? {...t, acked:true} : t));

  const assignClient = (client, coachId) => {
    const id = 'T-'+String(tasks.length+1).padStart(3,'0');
    setTasks(ts=>[...ts, {
      id, template:'onboard', assignedBy:viewerId, assignedTo:coachId,
      status:'not_started', isNew:true, createdAt:TODAY,
      values:{client:client.name, startDate:client.startDate, plan:client.plan, notes:client.notes},
      activity:[{who:viewerId, what:`assigned ${client.name} and raised onboarding`, when:'today'}],
    }]);
    setQueue(q=>q.filter(c=>c.name!==client.name));
  };

  const create = (draft) => {
    const id = 'T-'+String(tasks.length+1).padStart(3,'0');
    setTasks(ts=>[...ts, {...draft, id, status:'not_started', isNew:true, createdAt:TODAY,
      activity:[{who:draft.assignedBy, what: TEMPLATE(draft.template).resolvable?'raised this request':'created this task', when:'today'}]}]);
    setCreating(false);
    setView('board');
    setExpandedId(id);
  };

  const toggle = (id) => {
    setExpandedId(cur => cur===id ? null : id);
    setTasks(ts=>ts.map(t=>t.id===id?{...t,isNew:false}:t));
  };
  const openFromStrip = (id) => { setView('board'); toggle(id); };

  const cardProps = {viewer, onToggle:toggle, onStatus:setStatus, onEscalate:escalate};
  // The unassigned-client queue lives with the Head Coach — they allocate.
  const canAssign = viewer.role === 'head_coach';

  return (
    <div style={{height:'100vh',width:'100vw',display:'flex',flexDirection:'column',background:P.bg,fontFamily:P.ui,color:P.text,overflow:'hidden'}}>

      <div style={{height:50,flexShrink:0,background:P.card,borderBottom:`1px solid ${P.border}`,display:'flex',alignItems:'center',padding:'0 24px',gap:12}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:P.textMuted}}>Viewing as</span>
        <select value={viewerId} onChange={e=>{setViewerId(e.target.value); setScope('mine'); setExpandedId(null); setView('board');}}
          style={{...field,width:'auto',padding:'6px 10px',fontSize:12.5,fontWeight:600,cursor:'pointer',appearance:'none'}}>
          {Object.values(PEOPLE).map(p=><option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
        </select>
        <span style={{fontSize:11.5,color:P.textMuted}}>Switch person to see the same board from their dashboard</span>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:7,color:P.textDim}}>
          <span style={{display:'flex',position:'relative'}}>
            <Ic d={ico.bell} s={17}/>
            {attention>0 && <span style={{position:'absolute',top:-4,right:-6,minWidth:15,height:15,padding:'0 4px',borderRadius:100,background:P.red,color:'#fff',fontSize:9.5,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{attention}</span>}
          </span>
          <span style={{fontSize:11.5}}>{attention} update{attention===1?'':'s'} on tasks you assigned</span>
        </div>
      </div>

      <div style={{padding:'20px 24px 14px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'flex-end',gap:16}}>
          <div>
            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:P.accent,marginBottom:5}}>Operations</div>
            <div style={{fontFamily:P.disp,fontSize:32,fontWeight:500,letterSpacing:'-.025em',lineHeight:1,color:P.text}}>{view==='archive'?'Archive':'Taskboard'}</div>
            <div style={{fontSize:13,color:P.textDim,marginTop:7}}>
              {view==='archive'
                ? `Completed more than ${ARCHIVE_AFTER_DAYS} days ago · ${archived.length} task${archived.length===1?'':'s'}`
                : scope==='mine' ? `Assigned to ${viewer.name.split(' ')[0]} — ${live.filter(t=>t.status!=='complete').length} open`
                : scope==='sent' ? `Raised by ${viewer.name.split(' ')[0]} — ${live.filter(t=>t.status!=='complete').length} still open`
                : `Everything across the team — ${live.filter(t=>t.status!=='complete').length} open`}
            </div>
          </div>

          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            {view==='archive' ? (
              <button onClick={()=>{setView('board'); setExpandedId(null);}} style={btn()}><Ic d={ico.back} s={13}/> Back to board</button>
            ) : (
              <>
                <div style={{display:'flex',gap:2,background:P.card2,border:`1px solid ${P.border}`,borderRadius:9,padding:3}}>
                  {[['mine','My tasks'],['sent','Assigned by me'],['all','All']].map(([k,l])=>(
                    <button key={k} onClick={()=>{setScope(k); setExpandedId(null);}} style={{
                      padding:'6px 13px',borderRadius:6,fontSize:12,fontWeight:scope===k?600:500,border:'none',cursor:'pointer',fontFamily:P.ui,
                      background:scope===k?P.card:'transparent', color:scope===k?P.text:P.textDim,
                      boxShadow:scope===k?'0 1px 2px rgba(0,0,0,.05)':'none',
                    }}>{l}</button>
                  ))}
                </div>
                <button onClick={()=>{setView('archive'); setExpandedId(null);}} style={btn()}><Ic d={ico.box} s={13}/> Archive {archived.length>0 && <span style={{color:P.textMuted,fontWeight:600}}>{archived.length}</span>}</button>
                <button onClick={()=>setCreating(true)} style={btn('primary')}><Ic d={ico.plus} s={14}/> New task</button>
              </>
            )}
          </div>
        </div>
      </div>

      {view==='board' && canAssign && <UnassignedStrip queue={queue} onAssign={assignClient}/>}
      {view==='board' && <ActionStrip blocked={flaggedBack} done={doneForMe} onOpen={openFromStrip} onUnblock={unblock} onAck={ackDone}/>}

      {view==='board' ? (
        <div style={{flex:1,minHeight:0,padding:'0 24px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {STATUSES.map(s=>(
            <Column key={s.id} status={s} tasks={live.filter(t=>t.status===s.id)}
              archivedCount={archived.length} onShowArchive={()=>{setView('archive'); setExpandedId(null);}}
              expandedId={expandedId} {...cardProps}/>
          ))}
        </div>
      ) : (
        <Archive tasks={archived} viewer={viewer} onBack={()=>setView('board')}
          expandedId={expandedId} onToggle={toggle} onStatus={setStatus} onEscalate={escalate}/>
      )}

      {creating && <NewTask viewer={viewer} onClose={()=>setCreating(false)} onCreate={create}/>}
    </div>
  );

}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
