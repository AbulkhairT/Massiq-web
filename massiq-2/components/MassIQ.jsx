"use client";
import { useState, useEffect, useRef } from "react";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Instrument+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  ::-webkit-scrollbar{display:none}
  @keyframes breathe{0%,100%{transform:scale(1) rotate(0deg);border-radius:62% 38% 54% 46%/44% 56% 44% 56%}33%{transform:scale(1.04) rotate(2deg);border-radius:40% 60% 38% 62%/58% 42% 58% 42%}66%{transform:scale(.97) rotate(-1deg);border-radius:54% 46% 62% 38%/36% 64% 36% 64%}}
  @keyframes breathe2{0%,100%{border-radius:44% 56% 38% 62%/62% 38% 62% 38%;transform:scale(1)}50%{border-radius:62% 38% 56% 44%/38% 62% 38% 62%;transform:scale(1.06) rotate(-3deg)}}
  @keyframes breathe3{0%,100%{border-radius:56% 44% 44% 56%/38% 62% 38% 62%}50%{border-radius:38% 62% 62% 38%/56% 44% 56% 44%;transform:scale(1.03) rotate(2deg)}}
  @keyframes pulse-ring{0%{transform:scale(.95);opacity:.7}100%{transform:scale(1.4);opacity:0}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes dp{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
  @keyframes unlockPop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
  @keyframes shimmerSlide{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .blob1{animation:breathe 7s ease-in-out infinite}
  .blob2{animation:breathe2 9s ease-in-out infinite}
  .blob3{animation:breathe3 11s ease-in-out infinite}
  .su{animation:slideUp .35s ease both}
  .stat-card{transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease;cursor:pointer}
  .stat-card:hover{transform:translateY(-3px) rotate(-.4deg);box-shadow:0 16px 40px rgba(0,0,0,.1)}
  .pill{transition:all .22s cubic-bezier(.34,1.56,.64,1)}
  .meal-row{transition:background .18s,transform .18s}
  .meal-row:hover{background:rgba(210,190,160,.2)!important;transform:translateX(3px)}
  .bp{transition:transform .1s ease;cursor:pointer}
  .bp:active{transform:scale(.96)}
  .ticker-inner{display:inline-block;animation:ticker 22s linear infinite}
  .spinner{animation:spin .8s linear infinite}
  .ov{animation:fadeIn .2s ease}
  input,textarea,select{outline:none;font-family:inherit}
  input::placeholder,textarea::placeholder{color:#8A9A8A}
  .dp1{animation:dp 1.2s ease-in-out infinite}
  .dp2{animation:dp 1.2s ease-in-out .2s infinite}
  .dp3{animation:dp 1.2s ease-in-out .4s infinite}
  .unlock-pop{animation:unlockPop .5s cubic-bezier(.34,1.56,.64,1) both}
  .ch-card{transition:transform .2s ease,box-shadow .2s ease;cursor:pointer}
  .ch-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .shimmer-bg{background:linear-gradient(90deg,#141A14 0%,#E8DCC8 50%,#141A14 100%);background-size:200% 100%;animation:shimmerSlide 2s linear infinite}
  @keyframes ringPop{0%{transform:scale(0.7);opacity:0}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
  .ch-tier-card{transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease;cursor:pointer}
  .ch-tier-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.1)}
  .ch-hero{transition:transform .2s ease}.ch-hero:active{transform:scale(.98)}
  .recipe-card{transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease;cursor:pointer}
  .recipe-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.1)}
  .recipe-card:active{transform:scale(.97)}
`;

const C={cream:"#0A0F0A",warm:"#1C251C",paper:"#0A0F0A",ink:"#FFFFFF",inkLight:"#E0E0E0",terra:"#00C853",sage:"#5C7A5A",dust:"#8A9A8A",blush:"#E8A598",gold:"#C4952D",purple:"#7B68C8",cardBg:"#141A14",border:"rgba(255,255,255,0.08)",red:"#D94040"};

const ALL_CHALLENGES=[
  {id:"steps_start",tier:"bronze",emoji:"👟",title:"First Steps",desc:"Hit 8,000 steps in a day",reward:"Unlocks Silver challenges",requiresIds:[],progressKey:"steps_pct",target:0.8,targetDesc:"8,000 steps"},
  {id:"water_start",tier:"bronze",emoji:"💧",title:"Hydration Init",desc:"Drink 2L of water",reward:"",requiresIds:[],progressKey:"water_pct",target:0.57,targetDesc:"2L water"},
  {id:"log_meal",tier:"bronze",emoji:"🍽️",title:"Food Logger",desc:"Log your first meal today",reward:"",requiresIds:[],progressKey:"meals_pct",target:0.1,targetDesc:"1 meal logged"},
  {id:"sleep_start",tier:"bronze",emoji:"🌙",title:"Sleep Starter",desc:"Get 7 hours of sleep",reward:"",requiresIds:[],progressKey:"sleep_pct",target:0.875,targetDesc:"7hrs sleep"},
  {id:"steps_10k",tier:"silver",emoji:"🏃",title:"10K Club",desc:"Hit 10,000 steps",reward:"Unlocks Gold challenges",requiresIds:["steps_start"],progressKey:"steps_pct",target:1.0,targetDesc:"10,000 steps"},
  {id:"protein_hit",tier:"silver",emoji:"🥩",title:"Protein King",desc:"Hit your daily protein target",reward:"",requiresIds:["log_meal"],progressKey:"protein_pct",target:1.0,targetDesc:"Protein target"},
  {id:"water_full",tier:"silver",emoji:"🌊",title:"Fully Hydrated",desc:"Drink 3.5L of water",reward:"",requiresIds:["water_start"],progressKey:"water_pct",target:1.0,targetDesc:"3.5L water"},
  {id:"score_70",tier:"silver",emoji:"📈",title:"Rising Star",desc:"Reach a score of 70",reward:"",requiresIds:["log_meal","sleep_start"],progressKey:"score_pct70",target:1.0,targetDesc:"Score 70+"},
  {id:"streak_3",tier:"gold",emoji:"🔥",title:"3-Day Streak",desc:"Hit 10K steps 3 days in a row",reward:"Unlocks Platinum challenges",requiresIds:["steps_10k"],progressKey:"step_streak_pct3",target:1.0,targetDesc:"3-day streak"},
  {id:"score_80",tier:"gold",emoji:"⭐",title:"Elite Score",desc:"Reach a score of 80",reward:"",requiresIds:["score_70"],progressKey:"score_pct80",target:1.0,targetDesc:"Score 80+"},
  {id:"calories",tier:"gold",emoji:"⚖️",title:"Calorie Ninja",desc:"Hit calorie target within 5%",reward:"",requiresIds:["protein_hit"],progressKey:"cal_pct",target:0.5,targetDesc:"Within target"},
  {id:"all_habits",tier:"gold",emoji:"💪",title:"Full Day",desc:"Hit all 4 daily vitals in one day",reward:"",requiresIds:["water_full","steps_10k"],progressKey:"habits_all",target:1.0,targetDesc:"All vitals green"},
  {id:"streak_7",tier:"platinum",emoji:"👑",title:"7-Day Legend",desc:"Hit 10K steps 7 days straight",reward:"Unlocks Legendary challenge",requiresIds:["streak_3"],progressKey:"step_streak_pct7",target:1.0,targetDesc:"7-day streak"},
  {id:"score_90",tier:"platinum",emoji:"💎",title:"Diamond Score",desc:"Reach a score of 90",reward:"",requiresIds:["score_80"],progressKey:"score_pct90",target:1.0,targetDesc:"Score 90+"},
  {id:"recomp",tier:"platinum",emoji:"🔬",title:"Body Recomp",desc:"Gain lean mass and lose fat same week",reward:"",requiresIds:["all_habits"],progressKey:"recomp_pct",target:1.0,targetDesc:"Recomp in progress"},
  {id:"macro_week",tier:"platinum",emoji:"📊",title:"Macro Maestro",desc:"Hit all macros for 5 days",reward:"",requiresIds:["calories","protein_hit"],progressKey:"macro_week_pct",target:0.71,targetDesc:"5 of 7 days"},
  {id:"legend",tier:"legendary",emoji:"🏆",title:"MassIQ Legend",desc:"Complete 12 other challenges",reward:"Permanent Gold Badge",requiresIds:["streak_7","score_90","recomp","macro_week"],progressKey:"legend_pct",target:1.0,targetDesc:"12 challenges"},
];

const TIER_META={
  bronze:{label:"Bronze",color:"#A0694A",bg:"rgba(160,105,74,.12)",border:"rgba(160,105,74,.3)"},
  silver:{label:"Silver",color:"#7A8A96",bg:"rgba(122,138,150,.12)",border:"rgba(122,138,150,.3)"},
  gold:{label:"Gold",color:C.gold,bg:"rgba(196,149,45,.12)",border:"rgba(196,149,45,.3)"},
  platinum:{label:"Platinum",color:"#8A9BB5",bg:"rgba(138,155,181,.12)",border:"rgba(138,155,181,.3)"},
  legendary:{label:"Legendary",color:"#B8860B",bg:"rgba(184,134,11,.15)",border:"rgba(184,134,11,.4)"},
};

const DEFAULT_PROFILE={name:"Adam",age:27,weight:185.3,height:71,goal:"cut",activityLevel:"moderate"};
const DEFAULT_STATS={weight:185.3,lbm:164.8,fatPct:11.2};
const DEFAULT_MEALS=[
  {id:1,name:"Morning Bowl",time:"07:30",cal:620,p:52,c:68,f:18,tag:"Breakfast"},
  {id:2,name:"Salmon Grain Bowl",time:"12:15",cal:780,p:74,c:82,f:24,tag:"Lunch"},
  {id:3,name:"Whey + Banana",time:"16:00",cal:310,p:38,c:42,f:8,tag:"Pre-Workout"},
];
const DEFAULT_HABITS=[
  {id:1,label:"Steps",val:8740,target:10000,unit:"steps",emoji:"👟",color:C.sage,streak:6},
  {id:2,label:"Water",val:2.8,target:3.5,unit:"L",emoji:"💧",color:C.terra,streak:5},
  {id:3,label:"Sleep",val:7.2,target:8,unit:"hrs",emoji:"🌙",color:C.purple,streak:3},
  {id:4,label:"HRV",val:62,target:70,unit:"ms",emoji:"❤️",color:C.blush,streak:4},
];
const HISTORY_SEED=[
  {date:"Feb 26",weight:187.1,lbm:163.8,fatPct:12.5},
  {date:"Feb 27",weight:186.8,lbm:164.0,fatPct:12.2},
  {date:"Feb 28",weight:186.4,lbm:164.1,fatPct:12.0},
  {date:"Mar 01",weight:186.0,lbm:164.3,fatPct:11.8},
  {date:"Mar 02",weight:185.7,lbm:164.5,fatPct:11.6},
  {date:"Mar 03",weight:185.5,lbm:164.7,fatPct:11.4},
  {date:"Mar 04",weight:185.3,lbm:164.8,fatPct:11.2},
];
const MEAL_TAGS=["Breakfast","Lunch","Dinner","Snack","Pre-Workout","Post-Workout"];
const DAILY_RECIPES=[
  {id:"r1",name:"Greek Power Bowl",meal:"Breakfast",emoji:"🥣",desc:"Greek yogurt, granola, mixed berries, honey drizzle",cal:485,p:28,c:62,f:12,prepTime:"5 min",color:C.terra,tag:"High Protein"},
  {id:"r2",name:"Salmon & Quinoa",meal:"Lunch",emoji:"🐟",desc:"Pan-seared salmon fillet, quinoa, asparagus, lemon",cal:640,p:48,c:52,f:20,prepTime:"20 min",color:C.sage,tag:"Lean Gains"},
  {id:"r3",name:"Steak & Sweet Potato",meal:"Dinner",emoji:"🥩",desc:"Grass-fed sirloin, roasted sweet potato, broccoli",cal:720,p:56,c:58,f:22,prepTime:"25 min",color:C.gold,tag:"Muscle Fuel"},
];
const TICKER="LEAN MASS ↑ 0.3 LBS  ·  BODY FAT ↓ 0.2%  ·  SCORE +3  ·  5-DAY STREAK  ·  ";

function calcTargets(p){
  const w=parseFloat(p.weight)||185;
  const protein=Math.round(w*(p.goal==="cut"?1.1:.9));
  const cal=Math.round(w*(p.goal==="cut"?12:p.goal==="bulk"?16:14));
  const fat=Math.round(cal*.25/9);
  const carbs=Math.round((cal-protein*4-fat*9)/4);
  return{protein,carbs,fat,calories:cal};
}
function calcScore(meals,habits,stats){
  const t=calcTargets(DEFAULT_PROFILE);
  const totP=meals.reduce((s,m)=>s+m.p,0);
  return Math.round(Math.min(totP/t.protein,1)*35+habits.reduce((s,h)=>s+Math.min(h.val/h.target,1),0)/habits.length*35+Math.max(0,(20-stats.fatPct)/20)*30);
}
function getChallengeProgress(c,{meals,habits,stats,score,completedIds,history}){
  const steps=habits.find(h=>h.label==="Steps");
  const water=habits.find(h=>h.label==="Water");
  const sleep=habits.find(h=>h.label==="Sleep");
  const targets=calcTargets(DEFAULT_PROFILE);
  const totP=meals.reduce((s,m)=>s+m.p,0);
  const totCal=meals.reduce((s,m)=>s+m.cal,0);
  const map={
    steps_pct:Math.min((steps?.val||0)/(steps?.target||1),1),
    water_pct:Math.min((water?.val||0)/(water?.target||1),1),
    sleep_pct:Math.min((sleep?.val||0)/(sleep?.target||1),1),
    meals_pct:Math.min(meals.length/1,1),
    protein_pct:Math.min(totP/targets.protein,1),
    score_pct70:Math.min(score/70,1),
    score_pct80:Math.min(score/80,1),
    score_pct90:Math.min(score/90,1),
    step_streak_pct3:Math.min((steps?.streak||0)/3,1),
    step_streak_pct7:Math.min((steps?.streak||0)/7,1),
    cal_pct:totCal>0&&totCal<=targets.calories?1:totCal>0?0.5:0,
    habits_all:habits.every(h=>h.val>=h.target)?1:habits.filter(h=>h.val>=h.target).length/habits.length,
    recomp_pct:history.length>=2&&history[history.length-1].lbm>history[0].lbm&&history[history.length-1].fatPct<history[0].fatPct?1:0.4,
    macro_week_pct:Math.min(totP/targets.protein*.7+.3,1),
    legend_pct:Math.min(completedIds.length/12,1),
  };
  return map[c.progressKey]||0;
}
function isUnlocked(c,completedIds){return c.requiresIds.length===0||c.requiresIds.every(id=>completedIds.includes(id));}
function isCompleted(c,progress){return progress>=c.target;}

function fileToBase64(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
}

async function callClaude(messages,system,maxTokens=600){
  const res=await fetch("/api/anthropic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages,system,max_tokens:maxTokens})});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||`Error ${res.status}`);
  if(!data.text)throw new Error("Empty response");
  return data.text;
}

function extractJSON(raw){
  if(!raw)throw new Error("No response");
  try{const j=JSON.parse(raw.trim());if(j&&typeof j==="object")return j;}catch{}
  const fenced=raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(fenced){try{const j=JSON.parse(fenced[1].trim());if(j&&typeof j==="object")return j;}catch{}}
  let depth=0,start=-1;
  for(let i=0;i<raw.length;i++){
    if(raw[i]==="{"){if(depth===0)start=i;depth++;}
    else if(raw[i]==="}"){depth--;if(depth===0&&start>=0){try{const j=JSON.parse(raw.slice(start,i+1));if(j&&typeof j==="object")return j;}catch{}start=-1;}}
  }
  throw new Error("Could not parse JSON from response");
}

// ── SHARED UI ─────────────────────────────────────────────────────────────────
function AnimNum({value,decimals=0,duration=1100}){
  const[d,setD]=useState(value);const prev=useRef(value);
  useEffect(()=>{
    const from=prev.current;prev.current=value;const t0=performance.now();
    const tick=ts=>{const p=Math.min((ts-t0)/duration,1),e=1-Math.pow(1-p,3),v=from+(value-from)*e;
      setD(decimals?parseFloat(v.toFixed(decimals)):Math.round(v));if(p<1)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  },[value]);
  return<>{d}</>;
}
function Spin({size=18,color=C.terra}){return<div className="spinner" style={{width:size,height:size,border:`2px solid ${color}30`,borderTopColor:color,borderRadius:"50%",flexShrink:0}}/>;}
function Dots(){return<div style={{display:"flex",gap:5,padding:"12px 16px",background:C.cardBg,borderRadius:"18px 18px 18px 4px",width:"fit-content"}}>{["dp1","dp2","dp3"].map(c=><div key={c} className={c} style={{width:7,height:7,borderRadius:"50%",background:C.dust}}/>)}</div>;}
function Card({children,style={}}){return<div style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:24,padding:20,...style}}>{children}</div>;}
function ST({children}){return<div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontStyle:"italic",color:C.inkLight,marginBottom:14}}>{children}</div>;}
function FL({children}){return<div style={{fontSize:10,color:C.dust,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{children}</div>;}
function Inp({value,onChange,type="text",placeholder,style={},...rest}){return<input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{width:"100%",background:C.warm,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px",fontSize:13,color:C.ink,...style}} {...rest}/>;}
function PBtn({children,onClick,disabled,full,style={}}){return<button className="bp" onClick={onClick} disabled={disabled} style={{background:disabled?"#ccc":C.ink,color:C.cream,border:"none",borderRadius:99,padding:"13px 20px",fontSize:11,fontWeight:600,letterSpacing:2,textTransform:"uppercase",cursor:disabled?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:full?"100%":"auto",...style}}>{children}</button>;}
function Modal({children,onClose,tall=false}){
  return<div className="ov" onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,20,16,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}}>
    <div className="su" onClick={e=>e.stopPropagation()} style={{background:C.paper,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,maxHeight:tall?"94vh":"88vh",overflowY:"auto",paddingBottom:36}}>
      <div style={{width:40,height:4,background:C.border,borderRadius:99,margin:"14px auto 22px"}}/>
      {children}
    </div>
  </div>;
}
function MacroOrb({label,current,target,color,emoji}){
  const pct=Math.min(current/target,1);const[p,setP]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setP(pct),350);return()=>clearTimeout(t);},[pct]);
  const r=28,circ=2*Math.PI*r;
  return<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
    <div style={{position:"relative",width:72,height:72}}>
      <svg width={72} height={72} style={{transform:"rotate(-90deg)"}}>
        <circle cx={36} cy={36} r={r} fill={color+"18"} stroke={color+"28"} strokeWidth={6}/>
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={`${circ*p} ${circ*(1-p)}`} strokeLinecap="round" style={{transition:"stroke-dasharray 1.2s cubic-bezier(.34,1.56,.64,1)",filter:`drop-shadow(0 0 4px ${color})`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{emoji}</div>
    </div>
    <div style={{textAlign:"center"}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:C.ink}}>{current}<span style={{fontSize:10,color:C.dust}}>g</span></div>
      <div style={{fontSize:9,color:C.dust,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:9,color:pct>=1?C.sage:C.dust,marginTop:1}}>{Math.round(pct*100)}%</div>
    </div>
  </div>;
}
function WaveBar({val,max,color,delay=0}){
  const[w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(Math.min(val/max,1)),delay+200);return()=>clearTimeout(t);},[val,max]);
  return<div style={{height:7,background:C.border,borderRadius:99,overflow:"hidden",flex:1}}>
    <div style={{height:"100%",width:`${w*100}%`,background:color,borderRadius:99,transition:`width 1.1s cubic-bezier(.34,1.56,.64,1) ${delay}ms`,boxShadow:`0 0 10px ${color}50`}}/>
  </div>;
}
function LineChart({data,mk,color}){
  const vals=data.map(d=>d[mk]);if(vals.length<2)return null;
  const min=Math.min(...vals)-.5,max=Math.max(...vals)+.5,W=280,H=70,pad=12;
  const xs=vals.map((_,i)=>pad+(i/(vals.length-1))*(W-pad*2));
  const ys=vals.map(v=>H-pad-((v-min)/(max-min))*(H-pad*2));
  const path=xs.map((x,i)=>i===0?`M${x},${ys[i]}`:`C${xs[i-1]+(x-xs[i-1])/3},${ys[i-1]} ${x-(x-xs[i-1])/3},${ys[i]} ${x},${ys[i]}`).join(" ");
  const area=path+` L${xs[xs.length-1]},${H} L${xs[0]},${H} Z`;
  const gid=`g${mk}`;
  return<svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient>
      <filter id="glo"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d={area} fill={`url(#${gid})`}/>
    <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" filter="url(#glo)"/>
    {xs.map((x,i)=><circle key={i} cx={x} cy={ys[i]} r={i===vals.length-1?5:3} fill={i===vals.length-1?color:C.paper} stroke={color} strokeWidth={2}/>)}
  </svg>;
}
function OrganicScore({score}){
  return<div style={{position:"relative",width:190,height:190,margin:"0 auto"}}>
    {[0,1].map(i=><div key={i} style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${C.terra}`,animation:`pulse-ring ${2+i*.7}s ease-out infinite`,animationDelay:`${i*.7}s`}}/>)}
    <div className="blob1" style={{width:190,height:190,background:`radial-gradient(circle at 38% 33%, ${C.terra}, #7A2E10)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:`0 20px 60px rgba(196,98,45,.4),inset 0 1px 0 rgba(255,255,255,.12)`}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:58,fontWeight:900,color:C.cream,lineHeight:1,letterSpacing:-3}}><AnimNum value={score}/></div>
      <div style={{fontSize:10,color:"rgba(245,239,228,.55)",letterSpacing:3,textTransform:"uppercase",marginTop:3}}>your score</div>
    </div>
  </div>;
}

// ── LOG MEAL MODAL ────────────────────────────────────────────────────────────
function LogMealModal({onAdd,onClose}){
  const[form,setForm]=useState({name:"",cal:"",p:"",c:"",f:"",tag:"Lunch",time:new Date().toTimeString().slice(0,5)});
  const[aiTab,setAiTab]=useState("text");
  const[query,setQuery]=useState("");
  const[imgData,setImgData]=useState(null);
  const[loading,setLoading]=useState(false);
  const[status,setStatus]=useState({ok:null,msg:""});
  const fileRef=useRef(),camRef=useRef();
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const valid=form.name&&form.cal&&form.p&&form.c&&form.f;

  const applyNutrition=(json)=>{
    if(!json||typeof json!=="object")throw new Error("Invalid data");
    const cal=Math.round(json.calories||json.cal||json.kcal||0);
    const p=Math.round(json.protein||json.p||0);
    const c=Math.round(json.carbs||json.carbohydrates||json.c||0);
    const f=Math.round(json.fat||json.fats||json.f||0);
    const name=json.name||json.food||json.meal||"";
    if(!cal&&!p&&!c&&!f)throw new Error("No nutrition values found");
    setForm(prev=>({...prev,name:name||prev.name,cal:String(cal||prev.cal),p:String(p),c:String(c),f:String(f)}));
    setStatus({ok:true,msg:"✓ Macros filled in — adjust if needed"});
  };

  const analyzeText=async()=>{
    if(!query.trim())return;
    setLoading(true);setStatus({ok:null,msg:"Analyzing…"});
    try{
      const raw=await callClaude(
        [{role:"user",content:`Nutrition facts for: "${query}"\nReturn ONLY this JSON:\n{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number}`}],
        "You are a nutrition database. Return ONLY a raw JSON object with keys: name, calories, protein, carbs, fat. No markdown, no explanation — just the JSON.",
        150
      );
      applyNutrition(extractJSON(raw));
    }catch(e){setStatus({ok:false,msg:e.message});}
    finally{setLoading(false);}
  };

  const handleFile=async(file)=>{
    if(!file)return;
    const previewUrl=URL.createObjectURL(file);
    const mime=file.type&&file.type.startsWith("image/")?file.type:"image/jpeg";
    setImgData({url:previewUrl,mime});
    setLoading(true);setStatus({ok:null,msg:"Analyzing photo…"});
    try{
      const b64=await fileToBase64(file);
      const raw=await callClaude(
        [{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:mime,data:b64}},
          {type:"text",text:'Identify this food and estimate macros. Return ONLY:\n{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number}'}
        ]}],
        "You are a nutrition expert. Analyze the food image and return ONLY a raw JSON object with keys: name, calories, protein, carbs, fat. No markdown, no explanation.",
        150
      );
      applyNutrition(extractJSON(raw));
    }catch(e){setStatus({ok:false,msg:`Photo analysis failed: ${e.message}`});}
    finally{setLoading(false);}
  };

  return<Modal onClose={onClose}>
    <div style={{padding:"0 20px"}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,marginBottom:16}}>Log a Meal</div>
      <div style={{background:C.warm,borderRadius:18,padding:16,marginBottom:20}}>
        <div style={{fontSize:10,color:C.terra,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>◆ AI Analyze</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[{id:"text",label:"📝 Describe"},{id:"photo",label:"📷 Photo"}].map(t=>(
            <button key={t.id} onClick={()=>{setAiTab(t.id);setStatus({ok:null,msg:""});if(t.id==="text")setImgData(null);}}
              style={{flex:1,padding:"8px",borderRadius:99,border:`1px solid ${aiTab===t.id?C.terra:C.border}`,background:aiTab===t.id?`${C.terra}15`:C.paper,color:aiTab===t.id?C.terra:C.dust,fontSize:11,cursor:"pointer"}}>{t.label}</button>
          ))}
        </div>
        {aiTab==="text"&&(
          <div style={{display:"flex",gap:8}}>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyzeText()}
              placeholder='e.g. "2 eggs with toast"'
              style={{flex:1,background:C.paper,border:`1px solid ${C.border}`,borderRadius:99,padding:"10px 14px",fontSize:12,color:C.ink}}/>
            <button className="bp" onClick={analyzeText} disabled={loading||!query.trim()}
              style={{background:C.ink,color:C.cream,border:"none",borderRadius:99,padding:"10px 16px",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:6,cursor:"pointer",opacity:loading||!query.trim()?0.6:1}}>
              {loading?<Spin size={14} color={C.cream}/>:"Analyze"}
            </button>
          </div>
        )}
        {aiTab==="photo"&&(
          <>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
            {imgData?(
              <div>
                <img src={imgData.url} alt="food" style={{width:"100%",height:160,objectFit:"cover",borderRadius:12,marginBottom:10,display:"block"}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <button onClick={()=>{setImgData(null);setStatus({ok:null,msg:""}); }}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:99,padding:"6px 14px",fontSize:11,color:C.dust,cursor:"pointer"}}>Remove</button>
                  {loading&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.dust}}><Spin size={14}/>Analyzing…</div>}
                </div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>camRef.current.click()} style={{background:C.paper,border:`2px dashed ${C.terra}60`,borderRadius:14,padding:"20px 8px",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:26,marginBottom:6}}>📸</div>
                  <div style={{fontSize:11,color:C.terra}}>Take Photo</div>
                  <div style={{fontSize:9,color:C.dust,marginTop:3}}>Opens camera</div>
                </button>
                <button onClick={()=>fileRef.current.click()} style={{background:C.paper,border:`2px dashed ${C.border}`,borderRadius:14,padding:"20px 8px",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:26,marginBottom:6}}>🖼️</div>
                  <div style={{fontSize:11,color:C.dust}}>Upload Photo</div>
                  <div style={{fontSize:9,color:C.dust,marginTop:3}}>From library</div>
                </button>
              </div>
            )}
          </>
        )}
        {status.msg&&!loading&&<div style={{marginTop:10,fontSize:12,color:status.ok===false?C.red:status.ok===true?C.sage:C.dust,lineHeight:1.5}}>{status.msg}</div>}
      </div>
      <FL>Meal Name</FL>
      <Inp value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Chicken & Rice" style={{marginBottom:14}}/>
      <FL>Calories</FL>
      <Inp type="number" value={form.cal} onChange={e=>set("cal",e.target.value)} placeholder="e.g. 650" style={{marginBottom:14}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        {[{l:"Protein (g)",k:"p"},{l:"Carbs (g)",k:"c"},{l:"Fat (g)",k:"f"}].map(({l,k})=>(
          <div key={k}><FL>{l}</FL><Inp type="number" value={form[k]} onChange={e=>set(k,e.target.value)} placeholder="0" style={{textAlign:"center",padding:"10px 6px"}}/></div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
        <div><FL>Time</FL><Inp type="time" value={form.time} onChange={e=>set("time",e.target.value)}/></div>
        <div><FL>Category</FL>
          <select value={form.tag} onChange={e=>set("tag",e.target.value)} style={{width:"100%",background:C.warm,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 12px",fontSize:12,color:C.ink,appearance:"none"}}>
            {MEAL_TAGS.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <PBtn full onClick={()=>{if(!valid)return;onAdd({id:Date.now(),name:form.name,time:form.time,cal:+form.cal,p:+form.p,c:+form.c,f:+form.f,tag:form.tag});onClose();}} disabled={!valid}>Add Meal</PBtn>
    </div>
  </Modal>;
}

function BodyModal({stats,onSave,onClose}){
  const[form,setForm]=useState({weight:String(stats.weight),lbm:String(stats.lbm),fatPct:String(stats.fatPct)});
  return<Modal onClose={onClose}><div style={{padding:"0 20px"}}>
    <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,marginBottom:20}}>Update Body Stats</div>
    {[{l:"Bodyweight (lbs)",k:"weight"},{l:"Lean Body Mass (lbs)",k:"lbm"},{l:"Body Fat %",k:"fatPct"}].map(({l,k})=>(
      <div key={k} style={{marginBottom:16}}><FL>{l}</FL>
        <Inp type="number" step="0.1" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{textAlign:"center",fontSize:22,fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.terra}}/>
      </div>
    ))}
    <PBtn full onClick={()=>{onSave({weight:+form.weight,lbm:+form.lbm,fatPct:+form.fatPct});onClose();}} style={{marginTop:8}}>Save Stats</PBtn>
  </div></Modal>;
}

function CoachModal({meals,stats,habits,profile,score,onClose}){
  const[messages,setMessages]=useState([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const bottomRef=useRef();
  const targets=calcTargets(profile);
  const totals={p:meals.reduce((s,m)=>s+m.p,0),c:meals.reduce((s,m)=>s+m.c,0),cal:meals.reduce((s,m)=>s+m.cal,0)};
  const SYSTEM=`You are MassIQ, an elite body composition AI coach. Be direct, precise, and motivating.
Client: ${profile.name}, ${profile.age}y, goal: ${profile.goal}
Stats: ${stats.weight}lbs | ${stats.lbm}lbs LBM | ${stats.fatPct}% fat | Score ${score}/100
Today: ${totals.cal}kcal P:${totals.p}g C:${totals.c}g (targets: ${targets.calories}kcal P:${targets.protein}g C:${targets.carbs}g F:${targets.fat}g)
Habits: ${habits.map(h=>`${h.label} ${h.val}/${h.target}${h.unit}`).join(", ")}
Keep replies 2-4 sentences unless a detailed plan is asked for. Use specific numbers.`;
  const STARTERS=["What should I eat for dinner?","Am I on track today?","How do I raise my score?","Give me a full day meal plan"];
  const send=async(text)=>{
    const msg=(text||input).trim();if(!msg||loading)return;
    setInput("");setError("");
    const newMsgs=[...messages,{role:"user",content:msg}];
    setMessages(newMsgs);setLoading(true);
    try{const reply=await callClaude(newMsgs,SYSTEM,500);setMessages(m=>[...m,{role:"assistant",content:reply}]);}
    catch(e){setError(e.message||"Connection error");setMessages(m=>m.slice(0,-1));}
    finally{setLoading(false);}
  };
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  return<Modal onClose={onClose} tall><div style={{padding:"0 20px",display:"flex",flexDirection:"column",height:"78vh"}}>
    <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,marginBottom:2}}>AI Coach</div>
    <div style={{fontSize:11,color:C.dust,marginBottom:14}}>Knows your stats, meals & habits today</div>
    {messages.length===0&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>{STARTERS.map(s=><button key={s} onClick={()=>send(s)} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:99,padding:"8px 14px",fontSize:11,color:C.inkLight,cursor:"pointer"}}>{s}</button>)}</div>}
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,marginTop:8,marginBottom:14}}>
      {messages.map((m,i)=>(
        <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
          <div style={{maxWidth:"84%",padding:"11px 15px",borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.role==="user"?C.ink:C.cardBg,color:m.role==="user"?C.cream:C.ink,fontSize:13,lineHeight:1.65}}>{m.content}</div>
        </div>
      ))}
      {loading&&<Dots/>}
      {error&&<div style={{fontSize:12,color:C.red,padding:"8px 4px"}}>⚠️ {error}</div>}
      <div ref={bottomRef}/>
    </div>
    <div style={{display:"flex",gap:8}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask your coach…"
        style={{flex:1,background:C.warm,border:`1px solid ${C.border}`,borderRadius:99,padding:"12px 16px",fontSize:13,color:C.ink}}/>
      <button className="bp" onClick={()=>send()} disabled={loading||!input.trim()} style={{background:!input.trim()||loading?"#ccc":C.ink,color:C.cream,border:"none",borderRadius:99,padding:"12px 20px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
        {loading?<Spin size={16} color={C.cream}/>:"Send"}
      </button>
    </div>
  </div></Modal>;
}

function ProfileModal({profile,onSave,onClose}){
  const[form,setForm]=useState({...profile});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return<Modal onClose={onClose}><div style={{padding:"0 20px"}}>
    <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,marginBottom:20}}>Edit Profile</div>
    {[{l:"Name",k:"name",t:"text"},{l:"Age",k:"age",t:"number"},{l:"Weight (lbs)",k:"weight",t:"number"},{l:"Height (inches)",k:"height",t:"number"}].map(({l,k,t})=>(
      <div key={k} style={{marginBottom:14}}><FL>{l}</FL><Inp type={t} value={form[k]} onChange={e=>set(k,e.target.value)}/></div>
    ))}
    <div style={{marginBottom:14}}><FL>Goal</FL>
      <div style={{display:"flex",gap:8}}>{["cut","maintain","bulk"].map(g=>(
        <button key={g} onClick={()=>set("goal",g)} style={{flex:1,padding:"10px",borderRadius:12,border:`1px solid ${form.goal===g?C.terra:C.border}`,background:form.goal===g?`${C.terra}18`:C.warm,color:form.goal===g?C.terra:C.dust,fontSize:11,textTransform:"capitalize",cursor:"pointer"}}>{g}</button>
      ))}</div>
    </div>
    <div style={{marginBottom:22}}><FL>Activity Level</FL>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["sedentary","light","moderate","active","very active"].map(a=>(
        <button key={a} onClick={()=>set("activityLevel",a)} style={{padding:"7px 12px",borderRadius:99,border:`1px solid ${form.activityLevel===a?C.terra:C.border}`,background:form.activityLevel===a?`${C.terra}18`:C.warm,color:form.activityLevel===a?C.terra:C.dust,fontSize:10,textTransform:"capitalize",cursor:"pointer"}}>{a}</button>
      ))}</div>
    </div>
    <PBtn full onClick={()=>{onSave(form);onClose();}}>Save Profile</PBtn>
  </div></Modal>;
}

function ChallengeDetailModal({challenge,progress,completed,onClose}){
  const tm=TIER_META[challenge.tier];
  const pct=Math.min(progress/challenge.target,1);
  const[arc,setArc]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setArc(pct),200);return()=>clearTimeout(t);},[pct]);
  const r=50,circ=2*Math.PI*r;
  return<Modal onClose={onClose}><div style={{padding:"0 20px",textAlign:"center"}}>
    <div style={{fontSize:60,marginBottom:8}}>{challenge.emoji}</div>
    <div style={{display:"inline-block",padding:"3px 12px",borderRadius:99,background:tm.bg,border:`1px solid ${tm.border}`,fontSize:9,color:tm.color,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{tm.label}</div>
    <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,marginBottom:6}}>{challenge.title}</div>
    <div style={{fontSize:13,color:C.dust,lineHeight:1.6,marginBottom:24}}>{challenge.desc}</div>
    <div style={{position:"relative",width:120,height:120,margin:"0 auto 20px"}}>
      <svg width={120} height={120} style={{transform:"rotate(-90deg)"}}>
        <circle cx={60} cy={60} r={r} fill="none" stroke={C.border} strokeWidth={10}/>
        <circle cx={60} cy={60} r={r} fill="none" stroke={completed?C.sage:tm.color} strokeWidth={10}
          strokeDasharray={`${circ*arc} ${circ*(1-arc)}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1.2s cubic-bezier(.34,1.56,.64,1)",filter:`drop-shadow(0 0 6px ${tm.color})`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:completed?C.sage:tm.color}}>{Math.round(pct*100)}%</div>
        <div style={{fontSize:9,color:C.dust}}>progress</div>
      </div>
    </div>
    <div style={{background:C.warm,borderRadius:16,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
      <div style={{fontSize:10,color:C.dust,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Target</div>
      <div style={{fontSize:14,color:C.inkLight}}>{challenge.targetDesc}</div>
    </div>
    {challenge.reward&&<div style={{background:tm.bg,border:`1px solid ${tm.border}`,borderRadius:16,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
      <div style={{fontSize:10,color:tm.color,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>🎁 Reward</div>
      <div style={{fontSize:13,color:C.inkLight}}>{challenge.reward}</div>
    </div>}
    {completed&&<div style={{background:`${C.sage}18`,border:`1px solid ${C.sage}40`,borderRadius:16,padding:14,marginBottom:16}}>
      <div style={{fontSize:16,marginBottom:4}}>🎉</div>
      <div style={{fontSize:14,color:C.sage,fontWeight:600}}>Challenge Complete!</div>
    </div>}
  </div></Modal>;
}

function HeroChallenge({challenge,progress,onClick}){
  const tm=TIER_META[challenge.tier];
  const pct=Math.min(progress/challenge.target,1);
  const r=44,circ=2*Math.PI*r;
  const[arc,setArc]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setArc(pct),400);return()=>clearTimeout(t);},[pct]);
  return(
    <div onClick={onClick} className="ch-hero" style={{background:"linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.02))",border:`1px solid ${tm.color}35`,borderRadius:24,padding:"20px",cursor:"pointer",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,background:`${tm.color}12`,borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{fontSize:9,color:tm.color,letterSpacing:2.5,textTransform:"uppercase",marginBottom:14}}>Active Challenge</div>
      <div style={{display:"flex",alignItems:"center",gap:16}}>
        <div style={{position:"relative",flexShrink:0}}>
          <svg width={100} height={100} style={{transform:"rotate(-90deg)"}}>
            <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={9}/>
            <circle cx={50} cy={50} r={r} fill="none" stroke={tm.color} strokeWidth={9}
              strokeDasharray={`${circ*arc} ${circ*(1-arc)}`} strokeLinecap="round"
              style={{transition:"stroke-dasharray 1.4s cubic-bezier(.34,1.56,.64,1)",filter:`drop-shadow(0 0 8px ${tm.color})`}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:28,lineHeight:1}}>{challenge.emoji}</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:900,color:tm.color,marginTop:3}}>{Math.round(arc*100)}%</div>
          </div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{padding:"3px 9px",borderRadius:99,background:`${tm.color}22`,border:`1px solid ${tm.color}40`,fontSize:8,color:tm.color,letterSpacing:1.5,textTransform:"uppercase",display:"inline-block",marginBottom:8}}>{tm.label}</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.cream,lineHeight:1.1,marginBottom:5}}>{challenge.title}</div>
          <div style={{fontSize:11,color:"rgba(245,239,228,.5)",lineHeight:1.55,marginBottom:10}}>{challenge.desc}</div>
          <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:99}}>
            <div style={{height:"100%",width:`${arc*100}%`,background:tm.color,borderRadius:99,transition:"width 1.4s cubic-bezier(.34,1.56,.64,1)",boxShadow:`0 0 8px ${tm.color}60`}}/>
          </div>
          <div style={{fontSize:9,color:tm.color,marginTop:5}}>Target: {challenge.targetDesc}</div>
        </div>
      </div>
    </div>
  );
}

function ChallengeCard({challenge,progress,unlocked,completed,onClick}){
  const tm=TIER_META[challenge.tier];
  const pct=Math.min(progress/challenge.target,1);
  const r=26,circ=2*Math.PI*r;
  const[arc,setArc]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setArc(pct),350);return()=>clearTimeout(t);},[pct]);
  return(
    <div className="ch-tier-card" onClick={onClick}
      style={{background:completed?`linear-gradient(135deg,${C.sage}15,${C.sage}05)`:unlocked?C.cardBg:"rgba(200,190,180,.35)",border:`1px solid ${completed?C.sage+"50":unlocked?tm.border:C.border}`,borderRadius:22,padding:16,opacity:unlocked?1:.6,position:"relative",overflow:"hidden"}}>
      {!unlocked&&<div className="shimmer-bg" style={{position:"absolute",inset:0,borderRadius:22,opacity:.3}}/>}
      <div style={{position:"relative"}}>
        <div style={{position:"relative",width:64,height:64,margin:"0 auto 10px"}}>
          <svg width={64} height={64} style={{transform:"rotate(-90deg)"}}>
            <circle cx={32} cy={32} r={r} fill="none" stroke={unlocked?`${tm.color}22`:"rgba(0,0,0,.05)"} strokeWidth={7}/>
            {unlocked&&<circle cx={32} cy={32} r={r} fill="none" stroke={completed?C.sage:tm.color} strokeWidth={7}
              strokeDasharray={`${circ*arc} ${circ*(1-arc)}`} strokeLinecap="round"
              style={{transition:"stroke-dasharray 1.1s cubic-bezier(.34,1.56,.64,1)",filter:`drop-shadow(0 0 4px ${completed?C.sage:tm.color})`}}/>}
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,filter:unlocked?"none":"grayscale(1) opacity(.35)"}}>
            {completed?"✅":challenge.emoji}
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{padding:"2px 7px",borderRadius:99,background:tm.bg,border:`1px solid ${tm.border}`,fontSize:7,color:tm.color,letterSpacing:1.5,textTransform:"uppercase",display:"inline-block",marginBottom:5}}>{tm.label}</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:unlocked?C.ink:C.dust,lineHeight:1.15,marginBottom:3}}>{challenge.title}</div>
          {unlocked&&<div style={{fontSize:9,color:completed?C.sage:tm.color,fontWeight:600}}>{Math.round(arc*100)}%</div>}
          {!unlocked&&<div style={{fontSize:8,color:C.dust,letterSpacing:.3}}>Locked</div>}
        </div>
      </div>
    </div>
  );
}

function ChallengesTab({meals,habits,stats,score,history}){
  const[filter,setFilter]=useState("all");
  const[selected,setSelected]=useState(null);
  const[newUnlock,setNewUnlock]=useState(null);
  const prevCompleted=useRef(new Set());

  const ctx={meals,habits,stats,score,completedIds:[],history};
  const progressMap={};
  ALL_CHALLENGES.forEach(c=>{progressMap[c.id]=getChallengeProgress(c,ctx);});
  const completedIds=ALL_CHALLENGES.filter(c=>isCompleted(c,progressMap[c.id])).map(c=>c.id);
  ctx.completedIds=completedIds;
  ALL_CHALLENGES.forEach(c=>{progressMap[c.id]=getChallengeProgress(c,ctx);});

  useEffect(()=>{
    ALL_CHALLENGES.forEach(c=>{if(!prevCompleted.current.has(c.id)&&isCompleted(c,progressMap[c.id])){setNewUnlock(c);setTimeout(()=>setNewUnlock(null),4000);}});
    prevCompleted.current=new Set(completedIds);
  },[completedIds.join(",")]);

  const tiers=["bronze","silver","gold","platinum","legendary"];
  const TIER_XP={bronze:100,silver:250,gold:500,platinum:1000,legendary:5000};
  const filtered=filter==="all"?ALL_CHALLENGES:filter==="done"?ALL_CHALLENGES.filter(c=>completedIds.includes(c.id)):ALL_CHALLENGES.filter(c=>c.tier===filter);
  const completedCount=completedIds.length;
  const xp=completedIds.reduce((s,id)=>{const c=ALL_CHALLENGES.find(x=>x.id===id);return s+(c?TIER_XP[c.tier]||0:0);},0);
  const steps=habits.find(h=>h.label==="Steps");
  const streak=steps?.streak||0;
  const activeChallenge=ALL_CHALLENGES.find(c=>isUnlocked(c,completedIds)&&!completedIds.includes(c.id)&&progressMap[c.id]>0)||ALL_CHALLENGES.find(c=>isUnlocked(c,completedIds)&&!completedIds.includes(c.id));

  return(
    <div style={{padding:"0 0 120px"}} className="su">
      {newUnlock&&<div className="unlock-pop" style={{position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",background:C.ink,color:C.cream,borderRadius:20,padding:"14px 22px",zIndex:500,display:"flex",alignItems:"center",gap:12,boxShadow:"0 12px 40px rgba(0,0,0,.4)",whiteSpace:"nowrap"}}>
        <span style={{fontSize:26}}>{newUnlock.emoji}</span>
        <div>
          <div style={{fontSize:12,fontWeight:600,letterSpacing:.5}}>Challenge Complete!</div>
          <div style={{fontSize:10,color:C.terra,marginTop:2}}>{newUnlock.title} · +{TIER_XP[newUnlock.tier]||100} XP</div>
        </div>
      </div>}

      {/* Dark hero section */}
      <div style={{background:C.ink,padding:"4px 20px 24px"}}>
        {/* Stats row */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[{icon:"⚡",val:xp.toLocaleString(),label:"XP",color:C.gold},{icon:"🔥",val:streak,label:"Streak",color:C.terra},{icon:"🏆",val:completedCount,label:"Done",color:C.cream}].map(({icon,val,label,color})=>(
            <div key={label} style={{flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.07)",borderRadius:16,padding:"12px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{fontSize:18,lineHeight:1}}>{icon}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color,lineHeight:1}}>{val}</div>
              <div style={{fontSize:7,color:"rgba(245,239,228,.35)",letterSpacing:1.5,textTransform:"uppercase"}}>{label}</div>
            </div>
          ))}
        </div>
        {activeChallenge&&<HeroChallenge challenge={activeChallenge} progress={progressMap[activeChallenge.id]} onClick={()=>setSelected(activeChallenge)}/>}
      </div>

      {/* Tier path */}
      <div style={{padding:"20px 20px 0",marginBottom:16}}>
        <div style={{fontSize:9,color:C.dust,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Tier Path</div>
        <div style={{position:"relative",display:"flex",alignItems:"flex-start"}}>
          <div style={{position:"absolute",left:"calc(10%)",right:"calc(10%)",height:2,background:C.border,top:15,zIndex:0}}/>
          {tiers.map(t=>{
            const tm=TIER_META[t];
            const tierChallenges=ALL_CHALLENGES.filter(c=>c.tier===t);
            const tierCompleted=tierChallenges.filter(c=>completedIds.includes(c.id)).length;
            const allDone=tierCompleted===tierChallenges.length;
            const anyDone=tierCompleted>0;
            return(
              <div key={t} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",zIndex:1,gap:5}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:allDone?tm.color:anyDone?`${tm.color}35`:C.warm,border:`2px solid ${allDone||anyDone?tm.color:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:allDone?C.cream:anyDone?tm.color:C.dust,boxShadow:allDone?`0 0 14px ${tm.color}50`:undefined,transition:"all .3s ease"}}>
                  {allDone?"✓":anyDone?tierCompleted:""}
                </div>
                <div style={{fontSize:7,color:allDone||anyDone?tm.color:C.dust,letterSpacing:.8,textTransform:"uppercase",textAlign:"center"}}>{tm.label}</div>
                <div style={{fontSize:7,color:C.dust,opacity:.6}}>{tierCompleted}/{tierChallenges.length}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter pills */}
      <div style={{display:"flex",gap:5,overflowX:"auto",padding:"0 20px 14px"}}>
        {[{id:"all",label:"All"},{id:"done",label:"✓ Done"},...tiers.map(t=>({id:t,label:TIER_META[t].label}))].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} className="pill"
            style={{flexShrink:0,padding:"7px 14px",borderRadius:99,border:`1px solid ${filter===f.id?C.terra:C.border}`,background:filter===f.id?C.ink:"transparent",color:filter===f.id?C.cream:C.dust,fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 2-col challenge grid */}
      <div style={{padding:"0 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {filtered.map(c=>{
          const unlocked=isUnlocked(c,completedIds);
          const done=completedIds.includes(c.id);
          return<ChallengeCard key={c.id} challenge={c} progress={progressMap[c.id]} unlocked={unlocked} completed={done} onClick={()=>setSelected(c)}/>;
        })}
      </div>

      {selected&&<ChallengeDetailModal challenge={selected} progress={progressMap[selected.id]} completed={completedIds.includes(selected.id)} onClose={()=>setSelected(null)}/>}
    </div>
  );
}

function HistoryTab({history}){
  const[metric,setMetric]=useState("lbm");
  const META={lbm:{label:"Lean Mass",unit:"lbs",color:C.terra},weight:{label:"Bodyweight",unit:"lbs",color:C.gold},fatPct:{label:"Body Fat",unit:"%",color:C.sage}};
  const m=META[metric];const vals=history.map(d=>d[metric]);
  const delta=vals.length>1?(vals[vals.length-1]-vals[0]).toFixed(1):0;
  const good=metric==="fatPct"?delta<0:delta>0;
  return<div style={{padding:"0 20px 120px"}} className="su">
    <Card style={{marginBottom:16}}>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {Object.entries(META).map(([k,v])=>(
          <button key={k} onClick={()=>setMetric(k)} style={{flex:1,padding:"8px 4px",borderRadius:99,border:`1px solid ${metric===k?v.color:C.border}`,background:metric===k?`${v.color}15`:C.warm,color:metric===k?v.color:C.dust,fontSize:9,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>{v.label}</button>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:16}}>
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:m.color,lineHeight:1}}>{vals[vals.length-1]}<span style={{fontSize:14,color:C.dust,marginLeft:2}}>{m.unit}</span></div>
          <div style={{fontSize:10,color:C.dust,letterSpacing:2,textTransform:"uppercase",marginTop:4}}>Current {m.label}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:700,color:good?C.sage:C.red}}>{delta>0?"+":""}{delta}</div>
          <div style={{fontSize:9,color:C.dust}}>7-day change</div>
        </div>
      </div>
      <LineChart data={history} mk={metric} color={m.color}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>{history.map(d=><div key={d.date} style={{fontSize:8,color:C.dust}}>{d.date.split(" ")[1]}</div>)}</div>
    </Card>
    <Card>
      <ST>Daily Log</ST>
      {[...history].reverse().map((d,i)=>(
        <div key={d.date} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<history.length-1?`1px solid ${C.border}`:"none"}}>
          <div style={{fontSize:12,color:C.dust}}>{d.date}</div>
          <div style={{display:"flex",gap:18}}>
            {[{v:d.weight,l:"LBS",c:C.gold},{v:d.lbm,l:"LBM",c:C.terra},{v:`${d.fatPct}%`,l:"FAT",c:C.sage}].map(({v,l,c})=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700,color:c}}>{v}</div>
                <div style={{fontSize:8,color:C.dust,letterSpacing:1}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  </div>;
}

function AIScanTab({stats,profile,onAddMeal}){
  const[phase,setPhase]=useState("idle");
  const[imgData,setImgData]=useState(null);
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[recipes,setRecipes]=useState(null);
  const[recipesLoading,setRecipesLoading]=useState(false);
  const fileRef=useRef();
  const camRef=useRef();

  const gradeColor=g=>{if(!g)return C.dust;if(g.startsWith("A"))return C.sage;if(g.startsWith("B"))return C.terra;return C.gold;};

  const handleFile=async(file)=>{
    if(!file)return;
    const url=URL.createObjectURL(file);
    const mime=file.type&&file.type.startsWith("image/")?file.type:"image/jpeg";
    setImgData({url,mime});
    setPhase("scanning");
    setLoading(true);
    setError("");
    try{
      const b64=await fileToBase64(file);
      const raw=await callClaude(
        [{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:mime,data:b64}},
          {type:"text",text:`Analyze this body photo for a fitness app. Return ONLY this JSON (no markdown, no extra text):\n{"bodyFatRange":"e.g. 10-13%","symmetryScore":84,"postureRating":"Excellent","postureNotes":"brief note","asymmetries":["example asymmetry"],"muscleDevelopment":{"chest":"assessment","back":"assessment","shoulders":"assessment","arms":"assessment","core":"assessment","legs":"assessment"},"strengths":["strength1","strength2"],"recommendations":["rec1","rec2","rec3"],"overallGrade":"A-","compositionSummary":"2-sentence summary"}`}
        ]}],
        "You are an elite body composition analyst and certified personal trainer. Analyze the body photo carefully and return ONLY a raw JSON object with the exact keys requested. Be professional, specific, and constructive. If the image is not a person or is unclear, still return valid JSON with honest assessments.",
        800
      );
      const json=extractJSON(raw);
      setResult(json);
      setPhase("results");
      setRecipesLoading(true);
      try{
        const recRaw=await callClaude(
          [{role:"user",content:`Body scan: grade ${json.overallGrade||"B"}, body fat ${json.bodyFatRange||"unknown"}, goal: ${profile.goal}, age: ${profile.age}. Suggest 3 personalized meal recipes optimized for this physique. Return ONLY: {"recipes":[{"name":"string","meal":"Breakfast|Lunch|Dinner","emoji":"single emoji","desc":"brief ingredients","cal":number,"p":number,"c":number,"f":number,"prepTime":"X min","tag":"string"}]}`}],
          "You are a sports nutritionist. Return ONLY a raw JSON object with a 'recipes' array of exactly 3 recipe objects. No markdown, no explanation.",
          500
        );
        const recJson=extractJSON(recRaw);
        if(recJson?.recipes&&Array.isArray(recJson.recipes))setRecipes(recJson.recipes.slice(0,3));
      }catch(e){/* silent fail */}
      finally{setRecipesLoading(false);}
    }catch(e){
      setError(e.message||"Analysis failed. Please try again.");
      setPhase("error");
    }finally{
      setLoading(false);
    }
  };

  const reset=()=>{setPhase("idle");setImgData(null);setResult(null);setError("");setRecipes(null);setRecipesLoading(false);};

  if(phase==="results"&&result){
    const gc=gradeColor(result.overallGrade);
    return(
      <div style={{padding:"0 20px 120px"}} className="su">
        <div style={{background:C.ink,borderRadius:24,padding:"28px 24px",marginBottom:16,textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-50,right:-50,width:180,height:180,background:`${gc}12`,borderRadius:"50%",pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            <div style={{fontSize:9,color:gc,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>AI Body Analysis</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:72,fontWeight:900,color:gc,lineHeight:1,letterSpacing:-2}}>{result.overallGrade||"—"}</div>
            <div style={{fontSize:12,color:"rgba(245,239,228,.55)",marginTop:10,lineHeight:1.7,maxWidth:280,margin:"10px auto 0"}}>{result.compositionSummary}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:12,marginBottom:12}}>
          <img src={imgData.url} alt="scan" style={{width:"100%",height:120,objectFit:"cover",borderRadius:20,border:`2px solid ${C.border}`,display:"block"}}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:16,padding:"10px 14px",flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <div style={{fontSize:9,color:C.dust,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>Body Fat</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.terra}}>{result.bodyFatRange||"N/A"}</div>
            </div>
            <div style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:16,padding:"10px 14px",flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <div style={{fontSize:9,color:C.dust,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>Symmetry</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.gold}}>{result.symmetryScore!=null?`${result.symmetryScore}/100`:"—"}</div>
            </div>
          </div>
        </div>
        <Card style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700}}>Posture</div>
            <div style={{padding:"4px 10px",borderRadius:99,background:`${C.sage}15`,border:`1px solid ${C.sage}30`,fontSize:10,color:C.sage}}>{result.postureRating||"—"}</div>
          </div>
          <div style={{fontSize:12,color:C.inkLight,lineHeight:1.65}}>{result.postureNotes}</div>
        </Card>
        {result.muscleDevelopment&&Object.keys(result.muscleDevelopment).length>0&&<Card style={{marginBottom:12}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:14}}>Muscle Development</div>
          {Object.entries(result.muscleDevelopment).map(([k,v],i,arr)=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",paddingBottom:8,marginBottom:i<arr.length-1?8:0,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:11,color:C.dust,textTransform:"capitalize",letterSpacing:.5}}>{k}</div>
              <div style={{fontSize:12,color:C.inkLight,fontWeight:500,maxWidth:"62%",textAlign:"right"}}>{v}</div>
            </div>
          ))}
        </Card>}
        {result.asymmetries?.length>0&&<Card style={{marginBottom:12}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:12}}>Asymmetries Detected</div>
          {result.asymmetries.map((a,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:i<result.asymmetries.length-1?8:0}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.gold,marginTop:5,flexShrink:0}}/>
              <div style={{fontSize:12,color:C.inkLight,lineHeight:1.5}}>{a}</div>
            </div>
          ))}
        </Card>}
        {result.strengths?.length>0&&<Card style={{marginBottom:12,background:`${C.sage}08`,border:`1px solid ${C.sage}25`}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,marginBottom:12,color:C.sage}}>Strengths</div>
          {result.strengths.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:i<result.strengths.length-1?8:0}}>
              <div style={{fontSize:14,color:C.sage,lineHeight:1.2}}>✓</div>
              <div style={{fontSize:12,color:C.inkLight,lineHeight:1.5}}>{s}</div>
            </div>
          ))}
        </Card>}
        {result.recommendations?.length>0&&<div style={{background:C.ink,borderRadius:24,padding:"22px",marginBottom:16}}>
          <div style={{fontSize:9,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:14}}>◆ Recommendations</div>
          {result.recommendations.map((rec,i)=>(
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:i<result.recommendations.length-1?14:0}}>
              <div style={{width:24,height:24,borderRadius:99,background:`${C.terra}25`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.terra,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
              <div style={{fontSize:13,color:"rgba(245,239,228,.8)",lineHeight:1.65}}>{rec}</div>
            </div>
          ))}
        </div>}
        {(recipesLoading||recipes)&&<Card style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:recipesLoading&&!recipes?6:14}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700}}>Recipes for Your Physique</div>
            {recipesLoading&&<Spin size={14} color={C.terra}/>}
          </div>
          {recipesLoading&&!recipes&&<div style={{fontSize:11,color:C.dust,fontStyle:"italic",paddingBottom:4}}>Generating personalized recipes…</div>}
          {recipes&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {recipes.map((r,i)=>{
              const colors=[C.terra,C.sage,C.gold];const rc=colors[i%colors.length];
              return<div key={i} className="recipe-card"
                onClick={onAddMeal?()=>onAddMeal({id:Date.now()+i,name:r.name,time:r.meal==="Breakfast"?"08:00":r.meal==="Lunch"?"12:30":"19:00",cal:r.cal||0,p:r.p||0,c:r.c||0,f:r.f||0,tag:r.meal||"Meal"}):undefined}
                style={{background:`linear-gradient(135deg,${rc}14,${rc}06)`,border:`1px solid ${rc}30`,borderRadius:18,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:onAddMeal?"pointer":"default"}}>
                <div style={{fontSize:32,flexShrink:0}}>{r.emoji||"🍽️"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{r.name}</div>
                    {r.tag&&<div style={{padding:"2px 7px",borderRadius:99,background:`${rc}20`,fontSize:8,color:rc,letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>{r.tag}</div>}
                  </div>
                  <div style={{fontSize:10,color:C.dust,marginBottom:7,lineHeight:1.4}}>{r.desc}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[{v:`${r.cal||0} kcal`,c:rc},{v:`P ${r.p||0}g`,c:C.dust},{v:`C ${r.c||0}g`,c:C.dust},{v:`F ${r.f||0}g`,c:C.dust},{v:r.prepTime,c:C.dust}].filter(x=>x.v&&x.v!=="undefined").map(({v,c})=>(
                      <span key={v} style={{fontSize:9,padding:"2px 8px",background:C.warm,borderRadius:99,color:c}}>{v}</span>
                    ))}
                  </div>
                  {onAddMeal&&<div style={{fontSize:9,color:rc,marginTop:5}}>Tap to log meal →</div>}
                </div>
              </div>;
            })}
          </div>}
        </Card>}
        <PBtn full onClick={reset} style={{background:C.warm,color:C.ink}}>New Scan</PBtn>
      </div>
    );
  }

  return(
    <div style={{padding:"0 20px 120px"}} className="su">
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
      <div style={{background:C.ink,borderRadius:24,padding:"28px 24px",marginBottom:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:140,height:140,background:`${C.terra}15`,borderRadius:"50%",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-40,left:-20,width:120,height:120,background:`${C.sage}08`,borderRadius:"50%",pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:9,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>◆ AI Powered</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,color:C.cream,lineHeight:1.1,marginBottom:10}}>Body Composition<br/>Scan</div>
          <div style={{fontSize:12,color:"rgba(245,239,228,.55)",lineHeight:1.75}}>Upload or take a full-body photo. Our AI analyzes symmetry, posture, body fat estimate, muscle development, and delivers a complete physique assessment.</div>
        </div>
      </div>
      {phase==="scanning"&&loading&&(
        <Card style={{textAlign:"center",padding:"44px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
          {imgData&&<img src={imgData.url} alt="scan" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.18,borderRadius:24}}/>}
          <div style={{position:"relative"}}>
            <div style={{fontSize:11,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:18}}>Analyzing…</div>
            <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><Spin size={38} color={C.terra}/></div>
            <div style={{fontSize:12,color:C.dust,lineHeight:1.65}}>AI is scanning your photo for<br/>body composition metrics</div>
          </div>
        </Card>
      )}
      {phase==="error"&&(
        <Card style={{marginBottom:16,background:`${C.red}08`,border:`1px solid ${C.red}25`}}>
          <div style={{fontSize:13,color:C.red,marginBottom:8,fontWeight:500}}>Analysis Failed</div>
          <div style={{fontSize:12,color:C.dust,lineHeight:1.6,marginBottom:14}}>{error}</div>
          <button onClick={reset} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:99,padding:"8px 18px",fontSize:11,color:C.dust,cursor:"pointer"}}>Try Again</button>
        </Card>
      )}
      {phase==="idle"&&(
        <>
          <Card style={{marginBottom:16}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700,marginBottom:14}}>What you&#39;ll get</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[{icon:"📐",label:"Symmetry Score",desc:"Left/right balance analysis"},{icon:"📊",label:"Body Fat Range",desc:"Visual estimation"},{icon:"🏋️",label:"Muscle Assessment",desc:"Group-by-group breakdown"},{icon:"🧍",label:"Posture Analysis",desc:"Alignment & imbalances"},{icon:"⚡",label:"Strengths",desc:"What you're doing well"},{icon:"🎯",label:"Action Plan",desc:"Personalized recommendations"}].map(({icon,label,desc})=>(
                <div key={label} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{fontSize:18,flexShrink:0,marginTop:1}}>{icon}</div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:C.inkLight,marginBottom:2}}>{label}</div>
                    <div style={{fontSize:9,color:C.dust,lineHeight:1.4}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <button onClick={()=>camRef.current.click()} style={{background:C.ink,border:"none",borderRadius:22,padding:"28px 16px",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:10}}>📸</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:C.cream,marginBottom:4}}>Take Photo</div>
              <div style={{fontSize:10,color:"rgba(245,239,228,.4)"}}>Opens camera</div>
            </button>
            <button onClick={()=>fileRef.current.click()} style={{background:C.cardBg,border:`2px dashed ${C.border}`,borderRadius:22,padding:"28px 16px",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:10}}>🖼️</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:C.ink,marginBottom:4}}>Upload Photo</div>
              <div style={{fontSize:10,color:C.dust}}>From library</div>
            </button>
          </div>
          <div style={{background:`linear-gradient(135deg,${C.terra}10,${C.gold}06)`,border:`1px solid ${C.terra}20`,borderRadius:20,padding:"16px 18px"}}>
            <div style={{fontSize:9,color:C.terra,letterSpacing:2.5,textTransform:"uppercase",marginBottom:10}}>Photo Tips</div>
            {["Stand 6-8 feet from the camera","Even, natural lighting works best","Full body visible in frame","Form-fitting clothing preferred","Neutral standing pose"].map((tip,i,arr)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"center",marginBottom:i<arr.length-1?7:0}}>
                <div style={{width:4,height:4,borderRadius:"50%",background:C.terra,flexShrink:0}}/>
                <div style={{fontSize:11,color:C.inkLight}}>{tip}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MassIQ(){
  const[navTab,setNavTab]=useState("body");
  const[modal,setModal]=useState(null);
  const[meals,setMeals]=useState(DEFAULT_MEALS);
  const[habits,setHabits]=useState(DEFAULT_HABITS);
  const[stats,setStats]=useState(DEFAULT_STATS);
  const[profile,setProfile]=useState(DEFAULT_PROFILE);
  const[history,setHistory]=useState(HISTORY_SEED);
  const[habitEdit,setHabitEdit]=useState(null);
  const[deletingId,setDeleting]=useState(null);
  const[mounted,setMounted]=useState(false);
  useEffect(()=>{
    const s=document.createElement("style");s.textContent=CSS;document.head.appendChild(s);
    setTimeout(()=>setMounted(true),60);
    return()=>document.head.removeChild(s);
  },[]);
  const score=calcScore(meals,habits,stats);
  const targets=calcTargets(profile);
  const totals={p:meals.reduce((s,m)=>s+m.p,0),c:meals.reduce((s,m)=>s+m.c,0),f:meals.reduce((s,m)=>s+m.f,0),cal:meals.reduce((s,m)=>s+m.cal,0)};
  const addMeal=m=>setMeals(p=>[...p,m].sort((a,b)=>a.time.localeCompare(b.time)));
  const deleteMeal=id=>{setDeleting(id);setTimeout(()=>{setMeals(p=>p.filter(m=>m.id!==id));setDeleting(null);},280);};
  const updateHabit=(id,val)=>setHabits(p=>p.map(h=>h.id===id?{...h,val:Math.min(parseFloat(val)||0,h.target)}:h));
  const saveStats=s=>{setStats(s);setHistory(p=>[...p.slice(-6),{date:`Mar ${new Date().getDate()}`,...s}]);};
  const NAV=[{id:"body",icon:"◎",label:"Body"},{id:"fuel",icon:"⊕",label:"Fuel"},{id:"scan",icon:"◉",label:"Scan"},{id:"rhythm",icon:"◈",label:"Rhythm"},{id:"challenges",icon:"🏆",label:"Win"},{id:"history",icon:"◷",label:"History"}];
  if(!mounted)return<div style={{minHeight:"100vh",background:C.paper}}/>;
  return<div style={{minHeight:"100vh",background:C.paper,color:C.ink,fontFamily:"'Instrument Sans',sans-serif",fontWeight:300,maxWidth:430,margin:"0 auto",position:"relative",overflow:"hidden"}}>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:0}}>
      <div className="blob1" style={{position:"absolute",width:280,height:280,top:-60,right:-60,background:`${C.terra}10`}}/>
      <div className="blob2" style={{position:"absolute",width:240,height:240,bottom:80,left:-50,background:`${C.sage}09`}}/>
      <div className="blob3" style={{position:"absolute",width:180,height:180,top:"40%",right:-30,background:`${C.gold}07`}}/>
    </div>
    <div style={{position:"relative",zIndex:1}}>
      <div style={{padding:"24px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,letterSpacing:-1,lineHeight:1}}>Mass<span style={{color:C.terra,fontStyle:"italic"}}>IQ</span></div>
            <div style={{fontSize:9,color:C.dust,letterSpacing:3,marginTop:3,textTransform:"uppercase"}}>Body Intelligence</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setModal("coach")} className="bp" style={{background:C.ink,color:C.cream,border:"none",borderRadius:99,padding:"7px 14px",fontSize:9,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>◆ AI Coach</button>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.dust,letterSpacing:1,textTransform:"uppercase"}}>Week 8</div>
              <div style={{marginTop:3,padding:"3px 9px",background:C.terra,color:C.cream,borderRadius:99,fontSize:8,letterSpacing:2,textTransform:"uppercase",textAlign:"center"}}>{profile.goal.toUpperCase()}</div>
            </div>
          </div>
        </div>
        <div style={{background:C.ink,borderRadius:99,padding:"7px 16px",marginBottom:16,overflow:"hidden"}}>
          <div style={{overflow:"hidden",whiteSpace:"nowrap"}}><div className="ticker-inner" style={{fontSize:9,letterSpacing:2,color:"rgba(245,239,228,.7)"}}>{TICKER+TICKER}</div></div>
        </div>
        <div style={{display:"flex",gap:5,background:C.warm,borderRadius:99,padding:5,marginBottom:22}}>
          {["body","fuel","rhythm"].map(t=>(
            <button key={t} className="pill" onClick={()=>setNavTab(t)} style={{flex:1,border:"none",cursor:"pointer",borderRadius:99,padding:"9px 0",fontSize:10,fontWeight:500,letterSpacing:1.5,textTransform:"uppercase",background:navTab===t?C.ink:"transparent",color:navTab===t?C.cream:C.dust,boxShadow:navTab===t?"0 4px 14px rgba(0,0,0,.14)":"none"}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {navTab==="body"&&<div style={{padding:"0 20px 120px"}} className="su">
        <div style={{marginBottom:22,textAlign:"center"}}>
          <OrganicScore score={score}/>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12,flexWrap:"wrap"}}>
            {[score>=80?"Elite form":"Keep pushing",stats.lbm>164?"↑ Lean mass":"Building",stats.fatPct<12?"Low body fat":"On track"].map(tag=>(
              <span key={tag} style={{padding:"4px 10px",borderRadius:99,fontSize:9,background:C.cardBg,color:C.dust,border:`1px solid ${C.border}`,letterSpacing:1,textTransform:"uppercase"}}>{tag}</span>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[{label:"Weight",val:stats.weight,unit:"lbs",color:C.gold},{label:"Lean Mass",val:stats.lbm,unit:"lbs",color:C.terra},{label:"Body Fat",val:stats.fatPct,unit:"%",color:C.sage}].map(s=>(
            <div key={s.label} className="stat-card" onClick={()=>setModal("body")} style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:20,padding:"14px 10px",textAlign:"center"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:900,color:s.color,lineHeight:1}}><AnimNum value={s.val} decimals={1}/></div>
              <div style={{fontSize:9,color:C.dust,margin:"3px 0"}}>{s.unit}</div>
              <div style={{fontSize:8,color:C.dust,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</div>
              <div style={{fontSize:8,color:C.terra,marginTop:3}}>tap to update</div>
            </div>
          ))}
        </div>
        <Card style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
            <ST>Lean Mass Curve</ST><div style={{fontSize:10,color:C.dust}}>7 days</div>
          </div>
          <LineChart data={history} mk="lbm" color={C.terra}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>{history.map(d=><div key={d.date} style={{fontSize:8,color:C.dust}}>{d.date.split(" ")[1]}</div>)}</div>
        </Card>
        <div style={{background:C.ink,color:C.cream,borderRadius:24,padding:"22px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-20,right:-20,width:110,height:110,background:`${C.terra}25`,borderRadius:"50%"}}/>
          <div style={{fontSize:9,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>◆ Intelligence Report</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,lineHeight:1.85,fontStyle:"italic",color:"rgba(245,239,228,.9)",position:"relative"}}>
            {score>=80?`"Elite trajectory. ${Math.max(0,targets.protein-totals.p)}g protein remaining — close it and your score climbs."`:totals.p<targets.protein*.7?'"Protein is your gap today. Prioritize it at dinner to protect lean mass."':'"Solid tracking. Stay consistent through tonight to hold your score."'}
          </div>
          <button onClick={()=>setModal("coach")} className="bp" style={{marginTop:14,padding:"8px 18px",background:"rgba(255,255,255,.1)",color:C.cream,border:"1px solid rgba(255,255,255,.15)",borderRadius:99,fontSize:9,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>Talk to Coach →</button>
        </div>
      </div>}

      {navTab==="fuel"&&<div style={{padding:"0 20px 120px"}} className="su">
        <div style={{background:C.ink,borderRadius:24,padding:"24px 20px",marginBottom:16,textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",bottom:-30,left:"50%",transform:"translateX(-50%)",width:180,height:180,background:`${C.terra}12`,borderRadius:"50%"}}/>
          <div style={{fontSize:9,color:C.dust,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Calories consumed</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:62,fontWeight:900,color:C.cream,lineHeight:1,letterSpacing:-3}}><AnimNum value={totals.cal}/></div>
          <div style={{fontSize:12,color:C.dust,marginTop:6}}>of <span style={{color:C.terra}}>{targets.calories}</span> target · <span style={{color:totals.cal<=targets.calories?C.sage:C.red}}>{Math.abs(targets.calories-totals.cal)} {totals.cal<=targets.calories?"remaining":"over"}</span></div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            {[{k:"p",c:C.terra,tgt:targets.protein},{k:"c",c:C.gold,tgt:targets.carbs},{k:"f",c:C.sage,tgt:targets.fat}].map(({k,c,tgt})=>(
              <div key={k} style={{flex:1}}>
                <div style={{fontSize:9,color:"rgba(245,239,228,.5)",textAlign:"center",marginBottom:3}}>{k.toUpperCase()} {totals[k]}g</div>
                <div style={{height:4,background:"rgba(255,255,255,.1)",borderRadius:99}}><div style={{height:"100%",width:`${Math.min(totals[k]/tgt,1)*100}%`,background:c,borderRadius:99}}/></div>
              </div>
            ))}
          </div>
        </div>
        <Card style={{marginBottom:16}}>
          <ST>Macronutrients</ST>
          <div style={{display:"flex",justifyContent:"space-around"}}>
            <MacroOrb label="Protein" current={totals.p} target={targets.protein} color={C.terra} emoji="🥩"/>
            <MacroOrb label="Carbs" current={totals.c} target={targets.carbs} color={C.gold} emoji="🌾"/>
            <MacroOrb label="Fat" current={totals.f} target={targets.fat} color={C.sage} emoji="🥑"/>
          </div>
        </Card>
        <Card style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <ST>Today&#39;s Recipes</ST>
            <div style={{fontSize:9,color:C.dust,letterSpacing:1}}>Tap to add</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {DAILY_RECIPES.map(r=>(
              <div key={r.id} className="recipe-card" onClick={()=>addMeal({id:Date.now()+Math.random(),name:r.name,time:r.meal==="Breakfast"?"08:00":r.meal==="Lunch"?"12:30":"19:00",cal:r.cal,p:r.p,c:r.c,f:r.f,tag:r.meal})}
                style={{background:`linear-gradient(135deg,${r.color}14,${r.color}06)`,border:`1px solid ${r.color}30`,borderRadius:18,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:32,flexShrink:0}}>{r.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{r.name}</div>
                    <div style={{padding:"2px 7px",borderRadius:99,background:`${r.color}20`,fontSize:8,color:r.color,letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>{r.tag}</div>
                  </div>
                  <div style={{fontSize:10,color:C.dust,marginBottom:7,lineHeight:1.4}}>{r.desc}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[{v:`${r.cal} kcal`,c:r.color},{v:`P ${r.p}g`,c:C.dust},{v:`C ${r.c}g`,c:C.dust},{v:`F ${r.f}g`,c:C.dust},{v:r.prepTime,c:C.dust}].map(({v,c})=>(
                      <span key={v} style={{fontSize:9,padding:"2px 8px",background:C.warm,borderRadius:99,color:c}}>{v}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{marginBottom:16,padding:0,overflow:"hidden"}}>
          <div style={{padding:"18px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <ST>Today&#39;s Meals</ST>
            <button onClick={()=>setModal("log")} className="bp" style={{background:C.terra,color:C.cream,border:"none",borderRadius:99,padding:"7px 16px",fontSize:9,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>+ Add</button>
          </div>
          {meals.length===0&&<div style={{padding:20,textAlign:"center",color:C.dust,fontSize:12,fontStyle:"italic"}}>No meals yet. Tap + Add to start.</div>}
          {meals.map(m=>(
            <div key={m.id} className="meal-row" style={{padding:"13px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:deletingId===m.id?0:1,transition:"opacity .25s"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:3}}>{m.name}</div>
                <div style={{display:"flex",gap:6}}><span style={{fontSize:9,color:C.dust,padding:"2px 8px",background:C.warm,borderRadius:99}}>{m.tag}</span><span style={{fontSize:9,color:C.dust}}>{m.time}</span></div>
              </div>
              <div style={{textAlign:"right",marginRight:10}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:C.terra}}>{m.cal}</div>
                <div style={{fontSize:8,color:C.dust}}>P{m.p} C{m.c} F{m.f}</div>
              </div>
              <button onClick={()=>deleteMeal(m.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.dust,fontSize:20,lineHeight:1,padding:"2px 4px"}}>×</button>
            </div>
          ))}
        </Card>
        <div style={{background:`linear-gradient(135deg,${C.terra}14,${C.gold}08)`,border:`1px solid ${C.terra}25`,borderRadius:24,padding:20}}>
          <div style={{fontSize:9,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>◆ AI Suggestion</div>
          <div style={{fontSize:13,lineHeight:1.72,color:C.inkLight}}>
            {targets.protein-totals.p>0?`${targets.protein-totals.p}g protein remaining. A ${Math.round((targets.protein-totals.p)/.31)}g chicken breast or Greek yogurt will close your gap.`:`Protein target hit! 🎯 ${targets.calories-totals.cal>0?`${targets.calories-totals.cal} kcal remaining`:"Stay within your calorie limit"} for the rest of the day.`}
          </div>
          <button onClick={()=>setModal("coach")} className="bp" style={{marginTop:14,padding:"9px 20px",background:C.ink,color:C.cream,border:"none",borderRadius:99,fontSize:9,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>Ask Coach for a Plan →</button>
        </div>
      </div>}

      {navTab==="rhythm"&&<div style={{padding:"0 20px 120px"}} className="su">
        <Card style={{marginBottom:16}}>
          <ST>Daily Vitals</ST>
          {habits.map((h,i)=>(
            <div key={h.id} style={{marginBottom:i<habits.length-1?20:0}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{h.emoji}</span><span style={{fontSize:12,fontWeight:500,color:C.inkLight}}>{h.label}</span></div>
                {habitEdit===h.id?(
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <input type="number" step="0.1" defaultValue={h.val} autoFocus
                      onBlur={e=>{updateHabit(h.id,e.target.value);setHabitEdit(null);}} onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
                      style={{width:70,background:C.warm,border:`1px solid ${h.color}`,borderRadius:8,padding:"4px 8px",fontSize:12,textAlign:"right",color:C.ink}}/>
                    <span style={{fontSize:10,color:C.dust}}>{h.unit}</span>
                  </div>
                ):(
                  <button onClick={()=>setHabitEdit(h.id)} style={{background:"none",border:"none",cursor:"pointer"}}>
                    <span style={{fontSize:13,fontWeight:500,color:h.color}}>{h.val}</span>
                    <span style={{fontSize:10,color:C.dust}}> / {h.target}{h.unit}</span>
                    <span style={{fontSize:9,color:C.dust,marginLeft:4}}>✎</span>
                  </button>
                )}
              </div>
              <WaveBar val={h.val} max={h.target} color={h.color} delay={i*80}/>
            </div>
          ))}
        </Card>
        <div style={{background:C.ink,borderRadius:24,padding:22,color:C.cream}}>
          <div style={{fontSize:9,color:C.terra,letterSpacing:3,textTransform:"uppercase",marginBottom:16}}>◆ Score Anatomy</div>
          {[
            {label:"Nutrition",val:Math.round(Math.min(totals.p/targets.protein,1)*100),color:C.terra},
            {label:"Hydration",val:Math.round(Math.min((habits.find(h=>h.label==="Water")?.val||0)/3.5,1)*100),color:C.sage},
            {label:"Recovery",val:Math.round(Math.min((habits.find(h=>h.label==="Sleep")?.val||0)/8,1)*100),color:C.purple},
            {label:"Activity",val:Math.round(Math.min((habits.find(h=>h.label==="Steps")?.val||0)/10000,1)*100),color:C.blush},
          ].map((s,i)=>(
            <div key={s.label} style={{display:"flex",alignItems:"center",gap:12,marginBottom:i<3?14:0}}>
              <div style={{fontSize:10,color:"rgba(245,239,228,.45)",width:66}}>{s.label}</div>
              <div style={{flex:1,height:5,background:"rgba(255,255,255,.08)",borderRadius:99}}>
                <div style={{height:"100%",width:`${s.val}%`,background:s.color,borderRadius:99,boxShadow:`0 0 8px ${s.color}60`,transition:"width 1.1s ease"}}/>
              </div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700,color:s.color,width:28,textAlign:"right"}}>{s.val}</div>
            </div>
          ))}
          <div style={{marginTop:18,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:10,color:"rgba(245,239,228,.4)",letterSpacing:1}}>OVERALL SCORE</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:900,color:score>=80?C.terra:C.gold}}>{score}</div>
          </div>
        </div>
      </div>}

      {navTab==="scan"&&<AIScanTab stats={stats} profile={profile} onAddMeal={addMeal}/>}
      {navTab==="challenges"&&<ChallengesTab meals={meals} habits={habits} stats={stats} score={score} history={history}/>}
      {navTab==="history"&&<HistoryTab history={history}/>}

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(250,246,238,.95)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,padding:"10px 8px 18px",display:"flex",justifyContent:"space-around",zIndex:100}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setNavTab(n.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"2px 6px"}}>
            <div style={{fontSize:16,color:navTab===n.id?C.terra:C.dust,transition:"color .2s"}}>{n.icon}</div>
            <div style={{fontSize:8,color:navTab===n.id?C.terra:C.dust,letterSpacing:1,textTransform:"uppercase",transition:"color .2s"}}>{n.label}</div>
          </button>
        ))}
      </div>
    </div>
    {modal==="log"&&<LogMealModal onAdd={addMeal} onClose={()=>setModal(null)}/>}
    {modal==="body"&&<BodyModal stats={stats} onSave={saveStats} onClose={()=>setModal(null)}/>}
    {modal==="coach"&&<CoachModal meals={meals} stats={stats} habits={habits} profile={profile} score={score} onClose={()=>setModal(null)}/>}
    {modal==="profile"&&<ProfileModal profile={profile} onSave={setProfile} onClose={()=>setModal(null)}/>}
  </div>;
}
