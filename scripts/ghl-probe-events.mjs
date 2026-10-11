import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v];}));
const TOKEN=env.GHL_API_TOKEN, LOC=env.GHL_LOCATION_ID||"R99JktDA6ajZeTWo4YPu", BASE="https://services.leadconnectorhq.com";
const H={Authorization:`Bearer ${TOKEN}`,Version:"2021-07-28",Accept:"application/json"};
const PII=new Set(["email","phone","title","address","notes","contactName","name","firstName","lastName"]);
const redact=(v)=>{if(v==null)return v;if(Array.isArray(v))return v.slice(0,3).map(redact);if(typeof v==="object"){const o={};for(const[k,val]of Object.entries(v))o[k]=PII.has(k)&&typeof val==="string"?`<${k}:${val.length}c>`:redact(val);return o;}return v;};
async function get(path,params){const u=new URL(BASE+path);for(const[k,v]of Object.entries(params??{}))u.searchParams.set(k,String(v));const r=await fetch(u.toString(),{headers:H});return {status:r.status,json:await r.json().catch(()=>null)};}
const now=Date.now(), start=now-120*86400000, end=now+120*86400000;
const cals=(await get("/calendars/",{locationId:LOC})).json?.calendars??[];
console.log("CALENDAR COUNT:",cals.length);
let firstEvent=null, totals=0;
for(const c of cals){
  const r=await get("/calendars/events",{locationId:LOC,calendarId:c.id,startTime:start,endTime:end});
  const ev=r.json?.events??[];
  totals+=ev.length;
  console.log(`cal ${c.id} type=${c.calendarType} status=${r.status} events=${ev.length}`);
  if(!firstEvent && ev.length){firstEvent=ev[0];}
}
console.log("\nTOTAL EVENTS (all calendars, -120d..+120d):",totals);
if(firstEvent) console.log("FIRST REAL EVENT:\n", JSON.stringify(redact(firstEvent),null,2));
else console.log("No events found in any calendar in window (honest empty state).");
