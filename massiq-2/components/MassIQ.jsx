"use client";
import { useState, useEffect, useRef } from "react";

/* ─── Design Tokens ─────────────────────────────────────────────────────── */
const C = {
  bg: '#0A0F0A',
  card: '#141A14',
  cardElevated: '#1C251C',
  border: 'rgba(255,255,255,0.08)',
  green: '#00C853',
  greenDim: '#2D5A3D',
  greenBg: 'rgba(0,200,83,0.15)',
  white: '#FFFFFF',
  muted: '#8A9A8A',
  dimmed: '#556655',
  orange: '#FF6B35',
  blue: '#4A9EFF',
  purple: '#9B7FD4',
  red: '#FF4444',
  gold: '#FFD60A',
};

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:${C.bg}}
  ::-webkit-scrollbar{display:none}
  body{font-family:'Inter',sans-serif;color:${C.white};-webkit-font-smoothing:antialiased}
  @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes prog{from{width:0}}
  .su{animation:slideUp .3s ease both}
  .fi{animation:fadeIn .25s ease both}
  .bp{cursor:pointer;transition:transform .12s ease,opacity .12s ease}
  .bp:active{transform:scale(.96);opacity:.85}
  input,textarea,select{outline:none;font-family:inherit;color:${C.white}}
  input::placeholder,textarea::placeholder{color:${C.muted}}
  .prog-bar{animation:prog .6s ease both}
`;

/* ─── LocalStorage helpers ───────────────────────────────────────────────── */
const LS = {
  get: (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const LS_KEYS = {
  profile:     'massiq:profile',
  activePlan:  'massiq:activePlan',
  stats:       'massiq:stats',
  mealplan:    'massiq:mealplan',
  scanHistory: 'massiq:scanHistory',
  completed:   'massiq:completed',
  xp:          'massiq:xp',
  streak:      'massiq:streak',
  meals:       (d) => `massiq:meals:${d}`,
};

/* ─── Macro Calculator ───────────────────────────────────────────────────── */
function calcMacros(profile) {
  if (!profile) return null;
  const { weightLbs, heightIn, age, gender, activity, goal } = profile;
  const kg = weightLbs * 0.453592;
  const cm = heightIn * 2.54;
  const bmr = gender === 'Female'
    ? 447.593 + (9.247 * kg) - (3.098 * cm) + (4.330 * age)
    : 88.362 + (13.397 * kg) + (4.799 * cm) - (5.677 * age);
  const mult = { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725 }[activity] || 1.375;
  const tdee = bmr * mult;
  const calories = goal === 'Cut' ? tdee - 400 : goal === 'Bulk' ? tdee + 300 : tdee;
  const protein  = Math.round(weightLbs * (goal === 'Cut' ? 1.1 : goal === 'Bulk' ? 1.0 : 0.9));
  const fat      = Math.round((calories * 0.25) / 9);
  const carbs    = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories: Math.round(calories), protein, fat, carbs };
}

/* ─── Tiny UI Primitives ─────────────────────────────────────────────────── */
const Btn = ({ children, onClick, style = {}, variant = 'primary', disabled, ...rest }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '14px 24px', borderRadius: 14, fontWeight: 600,
    fontSize: 15, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease', opacity: disabled ? 0.45 : 1,
    ...(variant === 'primary' && { background: C.green, color: '#000' }),
    ...(variant === 'outline' && { background: 'transparent', color: C.green, border: `1.5px solid ${C.green}` }),
    ...(variant === 'ghost'   && { background: 'transparent', color: C.muted, border: `1.5px solid ${C.border}` }),
    ...style,
  };
  return <button className="bp" style={base} onClick={disabled ? undefined : onClick} {...rest}>{children}</button>;
};

const Card = ({ children, style = {}, className = '', ...rest }) => (
  <div className={className} style={{ background: C.card, borderRadius: 20, padding: 20, border: `1px solid ${C.border}`, ...style }} {...rest}>
    {children}
  </div>
);

const Chip = ({ label, active, onClick }) => (
  <button className="bp" onClick={onClick} style={{
    padding: '8px 16px', borderRadius: 50, border: `1.5px solid ${active ? C.green : C.border}`,
    background: active ? C.greenBg : 'transparent', color: active ? C.green : C.muted,
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  }}>{label}</button>
);

const ProgressBar = ({ value, max, color = C.green, height = 6 }) => {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height, overflow: 'hidden' }}>
      <div className="prog-bar" style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
  );
};

/* ─── Onboarding ─────────────────────────────────────────────────────────── */
const DIET_PREFS = ['None', 'Vegan', 'Vegetarian', 'Keto', 'Paleo', 'Gluten-Free', 'Dairy-Free', 'Halal', 'Kosher'];
const CUISINES   = ['American', 'Mediterranean', 'Asian', 'Mexican', 'Italian', 'Middle Eastern', 'Indian', 'Japanese'];
const AVOID_FOODS = ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Soy', 'Eggs', 'Red Meat', 'Processed Sugar'];
const GOALS = [
  { key: 'Cut',      label: '📉 Cut',      desc: 'Lose fat, preserve muscle' },
  { key: 'Bulk',     label: '📈 Bulk',     desc: 'Gain muscle mass' },
  { key: 'Recomp',   label: '🔄 Recomp',  desc: 'Lose fat & gain muscle' },
  { key: 'Maintain', label: '⚖️ Maintain', desc: 'Stay at current weight' },
];
const ACTIVITIES = [
  { key: 'Sedentary', label: 'Sedentary', desc: 'Desk job, minimal movement' },
  { key: 'Light',     label: 'Light',     desc: 'Light exercise 1–3x/week' },
  { key: 'Moderate',  label: 'Moderate',  desc: 'Exercise 3–5x/week' },
  { key: 'Active',    label: 'Active',    desc: 'Hard training 6–7x/week' },
];

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: '', age: '', gender: 'Male', weightLbs: '', heightIn: '',
    goal: '', activity: '', dietPrefs: [], cuisines: [], avoid: [],
  });

  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const toggleArr = (k, v) => setData(p => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v],
  }));

  const canNext = [
    !!data.name.trim(),
    !!(data.age && data.gender),
    !!(data.weightLbs && data.heightIn),
    !!data.goal,
    !!data.activity,
    true, true, true, true,
  ][step];

  const finish = () => {
    const profile = {
      ...data,
      age: Number(data.age),
      weightLbs: Number(data.weightLbs),
      heightIn: Number(data.heightIn),
    };
    LS.set(LS_KEYS.profile, profile);
    onComplete(profile);
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    background: C.cardElevated, border: `1.5px solid ${C.border}`,
    fontSize: 16, color: C.white, marginTop: 8,
  };
  const labelStyle = {
    fontSize: 13, color: C.muted, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '.06em',
  };

  const SelectRow = ({ keys, active, field, items }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => {
        const isActive = active === item.key;
        return (
          <div key={item.key} className="bp" onClick={() => set(field, item.key)} style={{
            padding: '16px 18px', borderRadius: 16,
            background: isActive ? C.greenBg : C.cardElevated,
            border: `1.5px solid ${isActive ? C.green : C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 600, color: isActive ? C.green : C.white }}>{item.label}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{item.desc}</div>
            </div>
            {isActive && <div style={{ color: C.green, fontSize: 18 }}>✓</div>}
          </div>
        );
      })}
    </div>
  );

  const TOTAL = 9;
  const steps = [
    /* 0 – Name */
    <div key={0} className="su">
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🧬</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Welcome to MassIQ</h1>
        <p style={{ color: C.muted, fontSize: 15 }}>The operating system for your physique</p>
      </div>
      <label style={labelStyle}>Your name</label>
      <input style={inputStyle} placeholder="Enter your name" value={data.name}
        onChange={e => set('name', e.target.value)} autoFocus />
    </div>,

    /* 1 – Age + Gender */
    <div key={1} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Age & Gender</h2>
      <p style={{ color: C.muted, marginBottom: 28 }}>Used to calculate your metabolic rate</p>
      <label style={labelStyle}>Age</label>
      <input type="number" style={inputStyle} placeholder="e.g. 28" value={data.age}
        onChange={e => set('age', e.target.value)} />
      <div style={{ marginTop: 24 }}>
        <label style={labelStyle}>Gender</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          {['Male', 'Female'].map(g => (
            <Chip key={g} label={g} active={data.gender === g} onClick={() => set('gender', g)} />
          ))}
        </div>
      </div>
    </div>,

    /* 2 – Weight + Height */
    <div key={2} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Body Stats</h2>
      <p style={{ color: C.muted, marginBottom: 28 }}>We'll update these after your first scan</p>
      <label style={labelStyle}>Weight (lbs)</label>
      <input type="number" style={inputStyle} placeholder="e.g. 185" value={data.weightLbs}
        onChange={e => set('weightLbs', e.target.value)} />
      <div style={{ marginTop: 20 }}>
        <label style={labelStyle}>Height (inches)</label>
        <input type="number" style={inputStyle} placeholder="e.g. 70" value={data.heightIn}
          onChange={e => set('heightIn', e.target.value)} />
      </div>
    </div>,

    /* 3 – Goal */
    <div key={3} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Your Goal</h2>
      <p style={{ color: C.muted, marginBottom: 24 }}>This shapes every recommendation we make</p>
      <SelectRow field="goal" active={data.goal} items={GOALS} />
    </div>,

    /* 4 – Activity */
    <div key={4} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Activity Level</h2>
      <p style={{ color: C.muted, marginBottom: 24 }}>Be honest — this affects your calorie targets</p>
      <SelectRow field="activity" active={data.activity} items={ACTIVITIES} />
    </div>,

    /* 5 – Diet prefs */
    <div key={5} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Dietary Preferences</h2>
      <p style={{ color: C.muted, marginBottom: 24 }}>Select all that apply</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {DIET_PREFS.map(d => (
          <Chip key={d} label={d} active={data.dietPrefs.includes(d)} onClick={() => toggleArr('dietPrefs', d)} />
        ))}
      </div>
    </div>,

    /* 6 – Cuisines */
    <div key={6} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Cuisine Preferences</h2>
      <p style={{ color: C.muted, marginBottom: 24 }}>We'll use these to personalize your meal plan</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {CUISINES.map(c => (
          <Chip key={c} label={c} active={data.cuisines.includes(c)} onClick={() => toggleArr('cuisines', c)} />
        ))}
      </div>
    </div>,

    /* 7 – Foods to avoid */
    <div key={7} className="su">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Foods to Avoid</h2>
      <p style={{ color: C.muted, marginBottom: 24 }}>Allergies, intolerances, preferences</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {AVOID_FOODS.map(a => (
          <Chip key={a} label={a} active={data.avoid.includes(a)} onClick={() => toggleArr('avoid', a)} />
        ))}
      </div>
    </div>,

    /* 8 – Summary */
    <div key={8} className="su">
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>You're all set, {data.name}.</h2>
        <p style={{ color: C.muted, fontSize: 15 }}>Here's what we'll build your plan around</p>
      </div>
      {(() => {
        const macros = calcMacros({
          ...data,
          age: Number(data.age),
          weightLbs: Number(data.weightLbs),
          heightIn: Number(data.heightIn),
        });
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Goal',           data.goal],
              ['Activity',       data.activity],
              ['Daily Calories', macros ? `${macros.calories} kcal` : '—'],
              ['Daily Protein',  macros ? `${macros.protein}g` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '12px 16px', background: C.cardElevated, borderRadius: 12,
              }}>
                <span style={{ color: C.muted, fontSize: 14 }}>{k}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: C.green }}>{v}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>,
  ];

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Progress bar */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 99,
              background: i <= step ? C.green : C.border,
              transition: 'background .3s ease',
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Step {step + 1} of {TOTAL}</div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '28px 20px 20px', overflowY: 'auto' }}>
        {steps[step]}
      </div>

      {/* Actions */}
      <div style={{ padding: '16px 20px 32px', display: 'flex', gap: 10 }}>
        {step > 0 && (
          <Btn variant="ghost" onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>Back</Btn>
        )}
        {step < steps.length - 1 ? (
          <Btn onClick={() => setStep(s => s + 1)} style={{ flex: 1 }} disabled={!canNext}>
            Continue →
          </Btn>
        ) : (
          <Btn onClick={finish} style={{ flex: 1 }}>Let's Go 🚀</Btn>
        )}
      </div>
    </div>
  );
}

/* ─── Home Tab ───────────────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function getTip(macros, todayStats) {
  if (!macros) return 'Start logging meals to unlock AI tips.';
  const proteinPct = todayStats.protein / macros.protein;
  if (proteinPct < 0.5) return "You're behind on protein — add a shake or some eggs.";
  if (proteinPct >= 1)  return 'Protein target crushed. Recovery is locked in.';
  const calPct = todayStats.calories / macros.calories;
  if (calPct > 0.95) return 'Almost at your calorie limit. Choose nutrient-dense foods for the rest of the day.';
  return 'Stay consistent. Small daily surpluses compound into big results.';
}

function TargetTile({ icon, label, current, target, unit, color, showProgress = true }) {
  return (
    <div style={{
      background: C.cardElevated, borderRadius: 16, padding: '14px 14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, background: `${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{current}</span>
        <span style={{ fontSize: 12, color: C.muted }}>/ {target} {unit}</span>
      </div>
      {showProgress && <ProgressBar value={current} max={target} color={color} />}
    </div>
  );
}

function HomeTab({ profile, activePlan, setTab }) {
  const macros = calcMacros(profile);
  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = LS.get(LS_KEYS.meals(today), []);
  const todayStats = todayMeals.reduce(
    (a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0) }),
    { calories: 0, protein: 0 }
  );

  const phase = activePlan?.phase || 'Foundation';
  const week  = activePlan?.week  || 1;

  return (
    <div style={{ padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white }}>Today</h1>

      {!activePlan ? (
        /* ── No active plan: CTA ── */
        <div className="su" style={{
          background: C.greenBg, border: `1.5px solid ${C.green}`,
          borderRadius: 20, padding: 28, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📸</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Run your first scan</h2>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Your personalized 12-week plan is one scan away
          </p>
          <Btn onClick={() => setTab('scan')} style={{ width: '100%' }}>
            Start Body Scan →
          </Btn>
        </div>
      ) : (
        <>
          {/* ── Greeting card ── */}
          <Card className="su" style={{ background: '#1A2E1A', border: `1.5px solid ${C.green}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>
                Good {getGreeting()}, {profile?.name || 'Athlete'}.
              </span>
              <span style={{
                background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.green}`,
              }}>{phase}</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>Your body data is live.</p>

            {/* 3 inline stats */}
            <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              {[
                { label: 'Lean Mass', value: activePlan?.leanMass ?? '—', unit: 'kg' },
                { label: 'Calories',  value: todayStats.calories,          unit: 'kcal' },
                { label: 'Protein',   value: todayStats.protein,           unit: 'g' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  flex: 1, textAlign: 'center',
                  borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.unit}</div>
                  <div style={{ fontSize: 11, color: C.dimmed, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13, color: C.green, marginTop: 16, lineHeight: 1.5 }}>
              💡 {getTip(macros, todayStats)}
            </p>
          </Card>

          {/* ── Phase card ── */}
          <Card className="su" style={{ animationDelay: '.05s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginBottom: 4 }}>Current Phase</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {phase === 'Cut' ? '📉' : phase === 'Bulk' ? '📈' : '🔄'} {phase}
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Week {week} of 12</div>
              </div>
              <button className="bp" onClick={() => setTab('plan')} style={{
                background: C.greenBg, color: C.green, border: `1px solid ${C.greenDim}`,
                padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                See roadmap →
              </button>
            </div>
          </Card>

          {/* ── Today's Targets ── */}
          <Card className="su" style={{ animationDelay: '.1s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Today's Targets</span>
              <span style={{ color: C.muted, fontSize: 18, letterSpacing: 2 }}>···</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <TargetTile icon="🔥" label="Calories" current={todayStats.calories} target={macros?.calories || 2000} unit="kcal" color={C.orange} />
              <TargetTile icon="⚡" label="Protein"  current={todayStats.protein}  target={macros?.protein  || 150}  unit="g"    color={C.blue}   />
              <TargetTile icon="🏋️" label="Training" current={activePlan?.trainDays || 3} target={activePlan?.trainDays || 3} unit="x/wk" color={C.red}    showProgress={false} />
              <TargetTile icon="🌙" label="Sleep"    current={activePlan?.sleepHrs  || 8} target={activePlan?.sleepHrs  || 8} unit="hrs"  color={C.purple} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── Nutrition Tab ──────────────────────────────────────────────────────── */

/* Circular macro ring using conic-gradient */
function MacroRing({ label, current, target, color, size = 90 }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const deg = Math.round(pct * 3.6);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', position: 'relative',
        background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.07) ${deg}deg)`,
      }}>
        {/* inner circle */}
        <div style={{
          position: 'absolute', top: 9, left: 9, right: 9, bottom: 9,
          borderRadius: '50%', background: C.card,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.white, lineHeight: 1 }}>{current}</span>
          <span style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>
            {label === 'Protein' ? 'g' : label === 'Carbs' ? 'g' : 'g'}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
    </div>
  );
}

/* Generic high-protein suggestions by goal */
function getDefaultSuggestions(goal, dietPrefs = []) {
  const isVegan = dietPrefs.includes('Vegan') || dietPrefs.includes('Vegetarian');
  const base = [
    {
      id: 's1', time: 'Breakfast', icon: '🍳',
      name: isVegan ? 'Tofu Scramble + Oats' : 'Eggs & Oatmeal',
      calories: 480, protein: 32, carbs: 44, fat: 14,
    },
    {
      id: 's2', time: 'Lunch', icon: '🥗',
      name: isVegan ? 'Lentil & Quinoa Bowl' : 'Chicken & Rice Bowl',
      calories: 560, protein: 42, carbs: 55, fat: 12,
    },
    {
      id: 's3', time: 'Dinner', icon: '🥩',
      name: isVegan ? 'Tempeh Stir-Fry' : goal === 'Cut' ? 'Salmon & Veggies' : 'Beef & Sweet Potato',
      calories: goal === 'Cut' ? 480 : 680, protein: 38, carbs: goal === 'Cut' ? 28 : 58, fat: 18,
    },
  ];
  return base;
}

/* Log Meal Modal */
function LogMealModal({ onClose, onAdd, macros }) {
  const [aiTab,     setAiTab]     = useState('describe');
  const [descText,  setDescText]  = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [category, setCategory] = useState('Lunch');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const analyzeText = async () => {
    if (!descText.trim()) return;
    setAnalyzing(true); setError('');
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Analyze nutrition for: ${descText}. Return ONLY valid JSON with these exact keys: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0}`,
          }],
          max_tokens: 200,
        }),
      });
      const { text } = await res.json();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const d = JSON.parse(match[0]);
        setForm({ name: d.name || descText, calories: String(d.calories || ''), protein: String(d.protein || ''), carbs: String(d.carbs || ''), fat: String(d.fat || '') });
      }
    } catch { setError('Analysis failed — fill in manually.'); }
    setAnalyzing(false);
  };

  const analyzePhoto = async (file) => {
    if (!file) return;
    setAnalyzing(true); setError('');
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target.result).split(',')[1];
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
                { type: 'text', text: 'Identify this food and return ONLY valid JSON: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0}' },
              ],
            }],
            max_tokens: 200,
          }),
        });
        const { text } = await res.json();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const d = JSON.parse(match[0]);
          setForm({ name: d.name || 'Food', calories: String(d.calories || ''), protein: String(d.protein || ''), carbs: String(d.carbs || ''), fat: String(d.fat || '') });
        }
        setAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch { setError('Photo analysis failed — fill in manually.'); setAnalyzing(false); }
  };

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const meals = LS.get(LS_KEYS.meals(today), []);
    const meal = {
      id: Date.now(), name: form.name.trim(), category,
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
    };
    LS.set(LS_KEYS.meals(today), [...meals, meal]);
    onAdd(meal);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    background: C.cardElevated, border: `1.5px solid ${C.border}`,
    fontSize: 15, color: C.white,
  };
  const CATS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-Workout', 'Post-Workout'];

  return (
    /* Backdrop */
    <div className="fi" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      {/* Sheet */}
      <div className="su" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: C.card, borderRadius: '24px 24px 0 0',
        padding: '0 0 max(24px, env(safe-area-inset-bottom))',
        maxHeight: '92dvh', overflowY: 'auto',
        border: `1px solid ${C.border}`,
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>
        <div style={{ padding: '8px 20px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Log a Meal</h2>
            <button className="bp" onClick={onClose} style={{ background: C.cardElevated, border: 'none', color: C.muted, width: 32, height: 32, borderRadius: '50%', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>

          {/* AI Analyze */}
          <div style={{ background: C.cardElevated, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.green, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>AI Analyze</div>
            {/* Tab toggle */}
            <div style={{ display: 'flex', background: C.card, borderRadius: 10, padding: 3, marginBottom: 14 }}>
              {[['describe','📝 Describe'],['photo','📷 Photo']].map(([k, lbl]) => (
                <button key={k} className="bp" onClick={() => setAiTab(k)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: aiTab === k ? C.green : 'transparent',
                  color: aiTab === k ? '#000' : C.muted,
                }}>{lbl}</button>
              ))}
            </div>

            {aiTab === 'describe' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. grilled chicken breast 200g with rice"
                  value={descText} onChange={e => setDescText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && analyzeText()} />
                <Btn onClick={analyzeText} disabled={analyzing || !descText.trim()}
                  style={{ padding: '12px 16px', borderRadius: 12, flexShrink: 0 }}>
                  {analyzing ? '…' : '✦'}
                </Btn>
              </div>
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => analyzePhoto(e.target.files?.[0])} />
                <button className="bp" onClick={() => fileRef.current?.click()} style={{
                  width: '100%', padding: '28px 0', borderRadius: 12, border: `1.5px dashed ${C.green}`,
                  background: C.greenBg, color: C.green, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  {analyzing ? '⏳ Analyzing…' : '📷 Take or upload a photo'}
                </button>
              </div>
            )}
            {error && <p style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{error}</p>}
          </div>

          {/* Manual fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <input style={inputStyle} placeholder="Meal name" value={form.name} onChange={e => setField('name', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={inputStyle} type="number" placeholder="Calories" value={form.calories} onChange={e => setField('calories', e.target.value)} />
              <input style={inputStyle} type="number" placeholder="Protein (g)" value={form.protein} onChange={e => setField('protein', e.target.value)} />
              <input style={inputStyle} type="number" placeholder="Carbs (g)" value={form.carbs} onChange={e => setField('carbs', e.target.value)} />
              <input style={inputStyle} type="number" placeholder="Fat (g)" value={form.fat} onChange={e => setField('fat', e.target.value)} />
            </div>
          </div>

          {/* Category chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {CATS.map(c => (
              <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>

          <Btn onClick={handleAdd} disabled={!form.name.trim()} style={{ width: '100%' }}>
            Add Meal
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* Main Nutrition Tab */
function NutritionTab({ profile, activePlan }) {
  const today = new Date().toISOString().slice(0, 10);
  const [meals,      setMeals]      = useState(() => LS.get(LS_KEYS.meals(today), []));
  const [showModal,  setShowModal]  = useState(false);
  const [suggestions] = useState(() => {
    const mealplan = LS.get(LS_KEYS.mealplan);
    if (mealplan?.suggestions) return mealplan.suggestions;
    return getDefaultSuggestions(profile?.goal, profile?.dietPrefs);
  });

  const macros = activePlan?.macros || calcMacros(profile) || { calories: 2000, protein: 150, carbs: 200, fat: 55 };

  const totals = meals.reduce(
    (a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0), carbs: a.carbs + (m.carbs || 0), fat: a.fat + (m.fat || 0) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const deleteMeal = (id) => {
    const updated = meals.filter(m => m.id !== id);
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
  };

  const logSuggestion = (s) => {
    const meal = { id: Date.now(), name: s.name, category: s.time, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat };
    const updated = [...meals, meal];
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
  };

  const remaining = Math.max(0, macros.calories - totals.calories);

  return (
    <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white }}>Nutrition</h1>

      {/* ── Macro rings ── */}
      <Card className="su">
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
          <MacroRing label="Protein" current={totals.protein} target={macros.protein} color={C.blue} />
          <MacroRing label="Carbs"   current={totals.carbs}   target={macros.carbs}   color={C.gold} />
          <MacroRing label="Fat"     current={totals.fat}     target={macros.fat}     color={C.orange} />
        </div>
        {/* Calorie summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 4px 0', borderTop: `1px solid ${C.border}` }}>
          {[
            { label: 'Eaten',     value: totals.calories, color: C.white },
            { label: 'Target',    value: macros.calories, color: C.muted },
            { label: 'Remaining', value: remaining,       color: remaining === 0 ? C.red : C.green },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label} kcal</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Daily Suggestions ── */}
      <div className="su" style={{ animationDelay: '.05s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Today's Suggestions</div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {suggestions.map(s => (
            <div key={s.id} style={{
              background: C.card, borderRadius: 18, padding: 16,
              border: `1px solid ${C.border}`, flexShrink: 0, width: 180,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 10, color: C.green, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.time}</div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{s.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {[
                    { label: `${s.calories} kcal`, color: C.orange },
                    { label: `P ${s.protein}g`,    color: C.blue },
                    { label: `C ${s.carbs}g`,      color: C.gold },
                    { label: `F ${s.fat}g`,        color: C.muted },
                  ].map(chip => (
                    <span key={chip.label} style={{ fontSize: 10, fontWeight: 600, color: chip.color, background: `${chip.color}18`, padding: '3px 7px', borderRadius: 99 }}>
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
              <button className="bp" onClick={() => logSuggestion(s)} style={{
                width: '100%', padding: '8px 0', borderRadius: 10,
                background: C.greenBg, color: C.green, border: `1px solid ${C.greenDim}`,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>+ Log</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Today's meals ── */}
      <div className="su" style={{ animationDelay: '.1s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Today's Meals</div>
        {meals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🍽️</div>
            <div style={{ fontSize: 14 }}>No meals logged yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {meals.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: C.card, borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${C.border}`,
              }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: C.greenBg, border: `1px solid ${C.greenDim}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>🍽️</div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    P {m.protein}g · C {m.carbs}g · F {m.fat}g
                  </div>
                </div>
                {/* Right: calories + delete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.orange }}>{m.calories}</span>
                  <button className="bp" onClick={() => deleteMeal(m.id)} style={{
                    background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2,
                  }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Floating + button ── */}
      <button className="bp" onClick={() => setShowModal(true)} style={{
        position: 'fixed', bottom: 96, right: 20, zIndex: 50,
        width: 54, height: 54, borderRadius: '50%',
        background: C.green, border: 'none', color: '#000',
        fontSize: 26, fontWeight: 700, cursor: 'pointer',
        boxShadow: `0 4px 20px rgba(0,200,83,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>+</button>

      {showModal && (
        <LogMealModal
          onClose={() => setShowModal(false)}
          onAdd={(meal) => setMeals(prev => [...prev, meal])}
          macros={macros}
        />
      )}
    </div>
  );
}

/* ─── Plan Tab ───────────────────────────────────────────────────────────── */

/* Get ISO week number */
function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

const PHASE_COLORS = {
  Maintain: C.green,
  Cut:      C.orange,
  Build:    C.blue,
  Bulk:     C.blue,
  Recomp:   C.purple,
};

const DEFAULT_MISSIONS = [
  'Hit your daily protein target every day this week',
  'Complete all scheduled training sessions',
  'Get 7+ hours of sleep at least 5 nights',
];

function PlanTab({ profile, activePlan, setTab }) {
  const weekKey = getWeekKey();
  const [missions, setMissions] = useState(() => {
    const saved = LS.get(`massiq:missions:${weekKey}`, null);
    const texts = activePlan?.weeklyMissions || DEFAULT_MISSIONS;
    if (saved && saved.length === texts.length) return saved;
    return texts.map((text, i) => ({ id: i, text, done: false }));
  });

  const toggleMission = (id) => {
    const updated = missions.map(m => m.id === id ? { ...m, done: !m.done } : m);
    setMissions(updated);
    LS.set(`massiq:missions:${weekKey}`, updated);
  };

  /* ── No active plan ── */
  if (!activePlan) {
    return (
      <div style={{ padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white }}>Your Plan</h1>
        <div className="su" style={{
          background: C.card, border: `1.5px solid ${C.green}`,
          borderRadius: 20, padding: 36, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Your plan comes from your scan</h2>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 28, maxWidth: 280, margin: '0 auto 28px' }}>
            MassIQ analyzes your actual physique to generate a 12-week program. No guessing. No generic plans.
          </p>
          <Btn onClick={() => setTab('scan')} style={{ width: '100%' }}>Run Your First Scan →</Btn>
        </div>
      </div>
    );
  }

  /* ── Derive plan values ── */
  const macros      = activePlan.macros || calcMacros(profile) || {};
  const phase       = activePlan.phase  || profile?.goal || 'Maintain';
  const phaseColor  = PHASE_COLORS[phase] || C.green;
  const week        = activePlan.week   || 1;
  const phasePct    = Math.round((week / 12) * 100);
  const startBF     = activePlan.startBF  || activePlan.bodyFat  || 18;
  const targetBF    = activePlan.targetBF || (phase === 'Cut' ? startBF - 4 : phase === 'Bulk' ? startBF + 1 : startBF);
  const trainDays   = activePlan.trainDays || 4;
  const cardioDays  = activePlan.cardioDays || 2;
  const sleepHrs    = activePlan.sleepHrs  || 8;
  const waterL      = activePlan.waterL    || 3;
  const steps       = activePlan.steps     || 8000;
  const objective   = activePlan.objective || `Optimize body composition through targeted ${phase.toLowerCase()} protocols.`;
  const whyItWorks  = activePlan.whyThisWorks || `This plan is calibrated to your current body composition and metabolic rate. By combining your calorie target with structured training, your body will prioritize the right adaptations each week.`;

  const startDate    = activePlan.startDate   || new Date().toISOString().slice(0, 10);
  const nextScanDate = activePlan.nextScanDate || (() => {
    const d = new Date(startDate); d.setDate(d.getDate() + 84); return d.toISOString().slice(0, 10);
  })();
  const today        = new Date().toISOString().slice(0, 10);
  const totalDays    = daysBetween(startDate, nextScanDate) || 84;
  const elapsed      = Math.max(0, daysBetween(startDate, today));
  const daysLeft     = Math.max(0, daysBetween(today, nextScanDate));
  const scanPct      = Math.min(100, Math.round((elapsed / totalDays) * 100));

  const MILESTONES = [
    { w: 3,  label: 'Baseline set',         desc: 'Locked in your targets and training routine' },
    { w: 6,  label: 'Habits established',   desc: 'Consistency building toward long-term change' },
    { w: 9,  label: 'Your check-in',        desc: 'Mid-plan progress assessment' },
    { w: 12, label: 'Final scan + new plan', desc: 'Full rescan and updated 12-week program' },
  ];

  const tileStyle = (color) => ({
    background: C.cardElevated, borderRadius: 16, padding: '14px 14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
  });

  const DAILY_TILES = [
    { icon: '🔥', label: 'Calories', value: macros.calories || 2000, unit: 'kcal', color: C.orange },
    { icon: '⚡', label: 'Protein',  value: macros.protein  || 150,  unit: 'g',    color: C.blue },
    { icon: '🚶', label: 'Steps',    value: steps,                   unit: '/day', color: C.green },
    { icon: '🌙', label: 'Sleep',    value: sleepHrs,                unit: 'hrs',  color: C.purple },
    { icon: '💧', label: 'Water',    value: waterL,                  unit: 'L',    color: '#4AD4FF' },
    { icon: '🏋️', label: 'Training', value: trainDays,              unit: 'x/wk', color: C.red },
  ];

  return (
    <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white }}>Your Plan</h1>

      {/* 1 ── Phase Hero ── */}
      <Card className="su" style={{ background: '#1A2E1A', border: `1.5px solid ${phaseColor}`, position: 'relative' }}>
        {/* Week badge */}
        <div style={{ position: 'absolute', top: 16, right: 16, background: C.cardElevated, borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: C.muted }}>
          Week {week} of 12
        </div>
        {/* Phase pill */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${phaseColor}22`, color: phaseColor, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${phaseColor}55`, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          <span>✓</span> {phase}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          {phase === 'Cut' ? 'Fat Loss Phase' : phase === 'Bulk' || phase === 'Build' ? 'Muscle Building Phase' : phase === 'Recomp' ? 'Recomposition Phase' : 'Maintenance Phase'}
        </div>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 18, lineHeight: 1.5 }}>{objective}</p>
        {/* Progress bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 6 }}>
            <span style={{ color: C.green, fontWeight: 600 }}>{phasePct}% complete</span>
          </div>
          <ProgressBar value={week} max={12} color={phaseColor} height={8} />
        </div>
        {/* Target row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            Target: <span style={{ color: C.white }}>{nextScanDate}</span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: C.greenBg, padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
            On Track ✓
          </span>
        </div>
      </Card>

      {/* 2 ── Transformation Timeline ── */}
      <Card className="su" style={{ animationDelay: '.04s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Transformation Timeline</span>
          <span style={{ fontSize: 12, color: C.muted }}>8–12 weeks</span>
        </div>
        {/* Progress bar with dots */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${phasePct}%`, borderRadius: 99, background: `linear-gradient(90deg, ${C.orange}, ${C.green})` }} />
          </div>
          {/* Now dot */}
          <div style={{ position: 'absolute', top: -4, left: `${Math.max(2, Math.min(96, phasePct))}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: C.orange, border: `3px solid ${C.card}` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 20 }}>
          <span>Now ~{startBF}%</span>
          <span style={{ color: C.green, fontWeight: 600 }}>Goal ~{targetBF}% 🏁</span>
        </div>
        {/* 4 stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Start BF',  value: `${startBF}%`,   color: C.muted },
            { label: 'Target BF', value: `${targetBF}%`,  color: C.green },
            { label: 'Training',  value: `${trainDays}x/wk`, color: C.blue },
            { label: 'Cardio',    value: `${cardioDays}x/wk`, color: C.orange },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', background: C.cardElevated, borderRadius: 12, padding: '10px 4px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.dimmed, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3 ── Why This Works ── */}
      <Card className="su" style={{ animationDelay: '.08s', background: C.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Why this plan works</span>
        </div>
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{whyItWorks}</p>
      </Card>

      {/* 4 ── Daily Targets Grid ── */}
      <div className="su" style={{ animationDelay: '.12s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Daily Targets</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {DAILY_TILES.map(t => (
            <div key={t.label} style={tileStyle(t.color)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${t.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{t.icon}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.white, lineHeight: 1 }}>{t.value}</div>
                <div style={{ fontSize: 11, color: C.dimmed }}>{t.unit}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5 ── Weekly Missions ── */}
      <div className="su" style={{ animationDelay: '.16s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Weekly Missions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {missions.map(m => (
            <div key={m.id} className="bp" onClick={() => toggleMission(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: C.card, borderRadius: 14, padding: '14px 16px',
              border: `1px solid ${m.done ? C.greenDim : C.border}`,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${m.done ? C.green : C.dimmed}`,
                background: m.done ? C.greenBg : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.done && <span style={{ fontSize: 13, color: C.green }}>✓</span>}
              </div>
              <span style={{
                fontSize: 14, color: m.done ? C.muted : C.white, lineHeight: 1.4,
                textDecoration: m.done ? 'line-through' : 'none',
              }}>{m.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 6 ── Milestones Timeline ── */}
      <div className="su" style={{ animationDelay: '.20s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Milestones</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {MILESTONES.map((m, i) => {
            const isPast    = week > m.w;
            const isCurrent = week <= m.w && week > (MILESTONES[i - 1]?.w || 0);
            const dotColor  = isPast ? C.green : isCurrent ? C.green : C.dimmed;
            const dotFill   = isPast || isCurrent;
            return (
              <div key={m.w} style={{ display: 'flex', gap: 16, paddingBottom: i < MILESTONES.length - 1 ? 0 : 0 }}>
                {/* Dot + line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                    background: dotFill ? dotColor : 'transparent',
                    border: `2px solid ${dotColor}`,
                    boxShadow: isCurrent ? `0 0 10px ${C.green}88` : 'none',
                  }} />
                  {i < MILESTONES.length - 1 && (
                    <div style={{ width: 2, flex: 1, minHeight: 36, background: isPast ? C.green : C.border, margin: '4px 0' }} />
                  )}
                </div>
                {/* Content */}
                <div style={{ paddingBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: isCurrent ? C.green : C.dimmed, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>W{m.w}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? C.white : isPast ? C.muted : C.dimmed }}>{m.label}</span>
                    {isCurrent && <span style={{ fontSize: 10, color: C.green, background: C.greenBg, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>Current</span>}
                  </div>
                  <p style={{ fontSize: 13, color: C.dimmed, lineHeight: 1.5 }}>{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 7 ── Next Scan Card ── */}
      <Card className="su" style={{ animationDelay: '.24s', border: `1px solid ${C.greenDim}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Next scan in</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.white }}>{daysLeft} <span style={{ fontSize: 16, fontWeight: 400, color: C.muted }}>days</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.muted }}>Scheduled</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{nextScanDate}</div>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <ProgressBar value={elapsed} max={totalDays} color={C.green} height={8} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.dimmed, marginTop: 5 }}>
            <span>Day {elapsed}</span>
            <span>Day {totalDays}</span>
          </div>
        </div>
        <Btn onClick={() => setTab('scan')} variant="outline" style={{ width: '100%' }}>
          Schedule Scan 📸
        </Btn>
      </Card>
    </div>
  );
}

/* ─── Profile Tab ────────────────────────────────────────────────────────── */

/* Toast notification */
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="su" style={{
      position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
      background: C.green, color: '#000', fontWeight: 700, fontSize: 14,
      padding: '10px 22px', borderRadius: 99, zIndex: 500, whiteSpace: 'nowrap',
      boxShadow: '0 4px 20px rgba(0,200,83,0.4)',
    }}>{msg}</div>
  );
}

/* Mission definitions */
const MISSIONS = [
  { id: 'm_log_meal',    tier: 'Bronze', emoji: '🍽️', title: 'Log First Meal',       desc: 'Log your first meal today',              xp: 100, requires: [] },
  { id: 'm_water',       tier: 'Bronze', emoji: '💧', title: 'Hydration Init',         desc: 'Drink 2L of water',                       xp: 100, requires: [] },
  { id: 'm_sleep',       tier: 'Bronze', emoji: '🌙', title: 'Sleep Starter',          desc: 'Get 7 hours of sleep',                    xp: 100, requires: [] },
  { id: 'm_steps',       tier: 'Bronze', emoji: '👟', title: 'First Steps',            desc: 'Hit 7,000 steps in a day',                xp: 100, requires: [] },
  { id: 'm_protein3',    tier: 'Silver', emoji: '⚡', title: 'Protein King',           desc: 'Hit protein target 3 days in a row',      xp: 250, requires: ['m_log_meal','m_water','m_sleep','m_steps'] },
  { id: 'm_log5',        tier: 'Silver', emoji: '📝', title: 'Meal Streak',            desc: 'Log meals 5 days straight',               xp: 250, requires: ['m_log_meal','m_water','m_sleep','m_steps'] },
  { id: 'm_fullweek',    tier: 'Gold',   emoji: '🏆', title: 'Full Week on Plan',      desc: 'Complete a full week on plan',            xp: 500, requires: ['m_protein3','m_log5'] },
  { id: 'm_alltargets',  tier: 'Gold',   emoji: '🎯', title: 'Perfect Day',            desc: 'Hit all targets in one day',              xp: 500, requires: ['m_protein3','m_log5'] },
];
const TIER_ORDER  = ['Bronze','Silver','Gold','Platinum','Legendary'];
const TIER_COLORS = { Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: C.gold, Platinum: C.purple, Legendary: C.green };

/* Simple SVG line chart — physique score over scans */
function PhysiqueChart({ scans }) {
  if (!scans || scans.length < 2) return null;
  const scores = scans.map(s => s.physiqueScore || 50);
  const minS = Math.min(...scores) - 5;
  const maxS = Math.max(...scores) + 5;
  const W = 300, H = 72;
  const pts = scores.map((s, i) => ({
    x: scans.length < 2 ? W / 2 : (i / (scans.length - 1)) * (W - 20) + 10,
    y: H - 10 - ((s - minS) / (maxS - minS || 1)) * (H - 20),
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.green} stopOpacity="0.6" />
          <stop offset="100%" stopColor={C.green} />
        </linearGradient>
      </defs>
      <path d={d} stroke="url(#chartLine)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={C.green} stroke={C.card} strokeWidth={2} />
      ))}
    </svg>
  );
}

function ProfileTab({ profile, activePlan, setTab, onEditProfile, onReset, showToast }) {
  const scanHistory = LS.get(LS_KEYS.scanHistory, []);
  const [completed, setCompleted] = useState(() => LS.get(LS_KEYS.completed, []));
  const [xp,        setXp]        = useState(() => LS.get(LS_KEYS.xp, 0));
  const [confirmReset, setConfirmReset] = useState(false);

  /* Health score from last scan or profile defaults */
  const lastScan = scanHistory[scanHistory.length - 1];
  const bf        = lastScan?.bodyFat  || 20;
  const leanKg    = lastScan?.leanMass || (profile ? Number((profile.weightLbs * 0.453592 * 0.82).toFixed(1)) : 65);
  const bfScore   = Math.max(0, Math.min(100, Math.round(100 - (bf - 8) * 2.8)));
  const leanScore = Math.min(100, Math.round((leanKg / 75) * 100));
  const healthScore = Math.round(bfScore * 0.6 + leanScore * 0.4);
  const healthLabel = healthScore >= 80 ? 'Elite' : healthScore >= 60 ? 'Great' : 'Good';

  /* Delta summary for scan history */
  const firstScan = scanHistory[0];
  const bfDelta   = firstScan && lastScan ? (lastScan.bodyFat  - firstScan.bodyFat).toFixed(1)  : null;
  const lmDelta   = firstScan && lastScan ? (lastScan.leanMass - firstScan.leanMass).toFixed(1) : null;

  /* Unlock logic */
  const isUnlocked = (m) => m.requires.every(r => completed.includes(r));
  const isDone     = (id) => completed.includes(id);
  const totalXP    = MISSIONS.reduce((s, m) => s + (isDone(m.id) ? m.xp : 0), 0);

  const completeMission = (m) => {
    if (isDone(m.id) || !isUnlocked(m)) return;
    const next = [...completed, m.id];
    const nextXP = xp + m.xp;
    setCompleted(next); setXp(nextXP);
    LS.set(LS_KEYS.completed, next);
    LS.set(LS_KEYS.xp, nextXP);
    showToast(`+${m.xp} XP — ${m.title} complete!`);
  };

  /* Tier progress */
  const bronzeDone = MISSIONS.filter(m => m.tier === 'Bronze' && isDone(m.id)).length;
  const silverDone = MISSIONS.filter(m => m.tier === 'Silver' && isDone(m.id)).length;
  const goldDone   = MISSIONS.filter(m => m.tier === 'Gold'   && isDone(m.id)).length;
  const tierFilled = bronzeDone === 4 ? (silverDone === 2 ? (goldDone === 2 ? 3 : 2) : 1) : 0;

  const GOAL_COLORS = { Cut: C.orange, Bulk: C.blue, Recomp: C.purple, Maintain: C.green };
  const goalColor = GOAL_COLORS[profile?.goal] || C.green;

  return (
    <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white }}>Profile</h1>

      {/* 1 ── Physique Journey ── */}
      <div className="su">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Your Physique Journey</div>
        {scanHistory.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📸</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Your transformation starts with your first scan</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Every measurement you take gets tracked here over time.</div>
            <Btn onClick={() => setTab('scan')} style={{ width: '100%' }}>Run First Scan →</Btn>
          </Card>
        ) : (
          <Card style={{ padding: 16 }}>
            {bfDelta !== null && (
              <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 14 }}>
                Since you started: {Number(bfDelta) <= 0 ? `${Math.abs(bfDelta)}% body fat lost` : `${bfDelta}% body fat gained`}
                {lmDelta !== null && `, ${Number(lmDelta) >= 0 ? '+' : ''}${lmDelta} lbs lean mass`}
              </div>
            )}
            {/* Horizontal scroll of scan cards */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
              {scanHistory.map((s, i) => {
                const prev = scanHistory[i - 1];
                const improving = prev ? s.physiqueScore >= prev.physiqueScore : true;
                return (
                  <div key={i} style={{ flexShrink: 0, background: C.cardElevated, borderRadius: 14, padding: '12px 14px', minWidth: 120, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{s.date || `Scan ${i + 1}`}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>{s.physiqueScore || '—'}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>score</div>
                    <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>{s.bodyFat}% BF</div>
                    {i > 0 && (
                      <div style={{ fontSize: 11, color: improving ? C.green : C.red, marginTop: 2 }}>
                        {improving ? '↑' : '↓'} {Math.abs((s.physiqueScore || 0) - (prev.physiqueScore || 0))} pts
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Line chart */}
            <div style={{ padding: '4px 0' }}>
              <PhysiqueChart scans={scanHistory} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.dimmed, marginTop: 4 }}>
              <span>{scanHistory[0]?.date}</span>
              <span style={{ color: C.muted }}>Physique Score</span>
              <span>{scanHistory[scanHistory.length - 1]?.date}</span>
            </div>
          </Card>
        )}
      </div>

      {/* 2 ── Health Score ── */}
      <Card className="su" style={{ animationDelay: '.04s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, background: `linear-gradient(135deg, ${C.gold}, ${C.green})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {healthScore}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>{healthLabel}</div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              Composite score from body fat, muscle mass & physique consistency
            </p>
          </div>
        </div>
        {[
          { icon: '💧', label: 'Body Fat',     sub: bf < 18 ? 'In healthy range' : 'Room to improve', value: `${bf}%`,       color: bf < 18 ? C.green : C.orange },
          { icon: '🏋️', label: 'Muscle Mass',  sub: leanKg < 70 ? 'Room to grow' : 'Well developed',  value: `${leanKg} kg`, color: C.blue },
          { icon: '❤️', label: 'Visceral Fat', sub: 'Healthy level',                                   value: '3/20',         color: C.green },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${row.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{row.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{row.sub}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{row.value}</div>
          </div>
        ))}
      </Card>

      {/* 3 ── XP + Missions ── */}
      <div className="su" style={{ animationDelay: '.08s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Physique Missions</div>

        {/* Hero stats */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { label: 'Total XP',   value: totalXP },
              { label: 'Day Streak', value: LS.get(LS_KEYS.streak, 0) },
              { label: 'Done',       value: `${completed.length}/${MISSIONS.length}` },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tier bar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, padding: '0 4px' }}>
          {TIER_ORDER.map((tier, i) => {
            const filled = i <= tierFilled;
            return (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', flex: i < TIER_ORDER.length - 1 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: filled ? TIER_COLORS[tier] : C.border, border: `2px solid ${filled ? TIER_COLORS[tier] : C.dimmed}` }} />
                  <span style={{ fontSize: 9, color: filled ? TIER_COLORS[tier] : C.dimmed, fontWeight: 600 }}>{tier}</span>
                </div>
                {i < TIER_ORDER.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < tierFilled ? TIER_COLORS[tier] : C.border, margin: '0 4px', marginBottom: 14 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Mission cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MISSIONS.map(m => {
            const done     = isDone(m.id);
            const unlocked = isUnlocked(m);
            const tc       = TIER_COLORS[m.tier];
            return (
              <div key={m.id} className="bp" onClick={() => completeMission(m)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: C.card, borderRadius: 16, padding: '14px 16px',
                border: `1px solid ${done ? tc + '55' : C.border}`,
                opacity: !unlocked && !done ? 0.4 : 1,
              }}>
                {/* Ring */}
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  border: `3px solid ${done ? tc : C.border}`,
                  background: done ? `${tc}22` : C.cardElevated,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  {done ? '✓' : !unlocked ? '🔒' : m.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: done ? C.muted : C.white, textDecoration: done ? 'line-through' : 'none' }}>{m.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}22`, padding: '2px 8px', borderRadius: 99 }}>{m.tier}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{m.desc}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: done ? C.dimmed : C.gold, flexShrink: 0 }}>+{m.xp} XP</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4 ── Profile Info ── */}
      <Card className="su" style={{ animationDelay: '.12s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Profile Info</span>
          <Btn variant="outline" onClick={onEditProfile} style={{ padding: '8px 16px', fontSize: 13 }}>Edit Profile</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Name',     profile?.name],
            ['Age',      profile?.age ? `${profile.age} years` : '—'],
            ['Weight',   profile?.weightLbs ? `${profile.weightLbs} lbs` : '—'],
            ['Height',   profile?.heightIn  ? `${profile.heightIn} in`  : '—'],
            ['Activity', profile?.activity],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.muted }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{v || '—'}</span>
            </div>
          ))}
          {/* Goal pill */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.muted }}>Goal</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: goalColor, background: `${goalColor}22`, padding: '4px 12px', borderRadius: 99, border: `1px solid ${goalColor}55` }}>
              {profile?.goal || '—'}
            </span>
          </div>
          {/* Dietary prefs */}
          {profile?.dietPrefs?.length > 0 && (
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Dietary Prefs</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.dietPrefs.map(d => (
                  <span key={d} style={{ fontSize: 12, color: C.muted, background: C.cardElevated, padding: '4px 10px', borderRadius: 99, border: `1px solid ${C.border}` }}>{d}</span>
                ))}
              </div>
            </div>
          )}
          {/* Cuisine prefs */}
          {profile?.cuisines?.length > 0 && (
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Cuisines</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.cuisines.map(c => (
                  <span key={c} style={{ fontSize: 12, color: C.muted, background: C.cardElevated, padding: '4px 10px', borderRadius: 99, border: `1px solid ${C.border}` }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 5 ── Reset ── */}
      <div style={{ paddingTop: 8, textAlign: 'center' }}>
        {!confirmReset ? (
          <button className="bp" onClick={() => setConfirmReset(true)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '10px 0' }}>
            Reset All Data
          </button>
        ) : (
          <Card style={{ border: `1px solid ${C.red}`, textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Are you sure?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>This will clear all your data and restart onboarding.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setConfirmReset(false)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={onReset} style={{ flex: 1, background: C.red, color: C.white }}>Yes, Reset</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─── Scan Tab ───────────────────────────────────────────────────────────── */

const PHASE_LABEL_COLORS = { Cut: C.orange, Build: C.blue, Bulk: C.blue, Recomp: C.purple, Maintain: C.green };
const MG_COLOR = { underdeveloped: C.red, average: C.gold, 'well-developed': C.green };

function ScanTab({ profile, setTab, showToast, onPlanApplied }) {
  const photoRef  = useRef(null);
  const uploadRef = useRef(null);

  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');
  const [scanHistory, setScanHistory] = useState(() => LS.get(LS_KEYS.scanHistory, []));
  const [viewOld,   setViewOld]   = useState(null); // index of old scan being viewed

  const handleFile = (file) => {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const mediaType = file.type || 'image/jpeg';
      await runScan(base64, mediaType);
    };
    reader.readAsDataURL(file);
  };

  const runScan = async (base64, mediaType) => {
    setScanning(true); setResult(null);
    try {
      const age    = profile?.age    || 25;
      const gender = profile?.gender || 'Male';
      const height = profile?.heightIn || 70;
      const weight = profile?.weightLbs || 170;

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: `Analyze this physique photo. Person is ${age} years old, ${gender}, ${height} inches, ${weight} lbs. Return ONLY a raw JSON object with NO markdown, NO code blocks, just the JSON: {"bodyFatPct":0,"leanMass":0,"fatMass":0,"physiqueScore":0,"symmetryScore":0,"muscleGroups":{"chest":"average","shoulders":"average","back":"average","arms":"average","core":"average","legs":"average"},"weakestGroups":["core","legs"],"asymmetries":[],"strengths":["back","shoulders"],"diagnosis":"...","phase":{"name":"...","label":"Maintain","durationWeeks":12,"objective":"..."},"dailyTargets":{"calories":0,"protein":0,"carbs":0,"fat":0,"steps":0,"sleepHours":0,"waterLiters":0,"trainingDaysPerWeek":0},"weeklyMissions":["...","...","..."],"trainingFocus":{"primary":"...","secondary":"...","frequency":"..."},"nutritionKeyChange":"...","whyThisWorks":"...","nextScanDate":"...","recommendation":"...","disclaimer":"..."}` },
            ],
          }],
          max_tokens: 2000,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const { text, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse scan result');
      const data = JSON.parse(match[0]);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Scan failed. Please try again.');
    }
    setScanning(false);
  };

  const applyPlan = () => {
    if (!result) return;
    const today = new Date().toISOString().slice(0, 10);
    const plan = {
      phase:         result.phase?.label || 'Maintain',
      phaseName:     result.phase?.name  || 'Maintenance Phase',
      objective:     result.phase?.objective || '',
      week:          1,
      startDate:     today,
      nextScanDate:  result.nextScanDate || (() => { const d = new Date(); d.setDate(d.getDate() + 84); return d.toISOString().slice(0, 10); })(),
      macros:        result.dailyTargets,
      trainDays:     result.dailyTargets?.trainingDaysPerWeek || 4,
      sleepHrs:      result.dailyTargets?.sleepHours || 8,
      waterL:        result.dailyTargets?.waterLiters || 3,
      steps:         result.dailyTargets?.steps || 8000,
      bodyFat:       result.bodyFatPct,
      leanMass:      result.leanMass,
      startBF:       result.bodyFatPct,
      targetBF:      result.phase?.label === 'Cut' ? result.bodyFatPct - 4 : result.bodyFatPct,
      weeklyMissions: result.weeklyMissions || [],
      whyThisWorks:  result.whyThisWorks || '',
      cardioDays:    2,
    };
    const entry = {
      date: today, bodyFat: result.bodyFatPct, leanMass: result.leanMass,
      physiqueScore: result.physiqueScore, symmetryScore: result.symmetryScore,
    };
    const history = [...LS.get(LS_KEYS.scanHistory, []), entry];
    LS.set(LS_KEYS.activePlan, plan);
    LS.set(LS_KEYS.stats, { calories: 0, protein: 0 });
    LS.set(LS_KEYS.scanHistory, history);
    setScanHistory(history);
    onPlanApplied(plan);
    showToast('✓ Plan applied. Targets updated.');
    setTab('plan');
  };

  /* ── Scanning spinner ── */
  if (scanning) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80dvh', gap: 24, padding: 24 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.greenBg}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📸</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Analyzing your physique…</div>
        <div style={{ fontSize: 14, color: C.muted }}>Estimating body composition, muscle development, and symmetry</div>
      </div>
    </div>
  );

  /* ── Results view ── */
  if (result) {
    const ph      = result.phase || {};
    const phColor = PHASE_LABEL_COLORS[ph.label] || C.green;
    const dt      = result.dailyTargets || {};
    const mg      = result.muscleGroups || {};

    return (
      <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Scan Results</h1>
          <button className="bp" onClick={() => setResult(null)} style={{ background: C.cardElevated, border: 'none', color: C.muted, padding: '6px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Retake</button>
        </div>

        {/* 1 – Phase Hero */}
        <Card className="su" style={{ background: '#1A2E1A', border: `1.5px solid ${phColor}` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${phColor}22`, color: phColor, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${phColor}55`, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            ✓ {ph.label || 'Maintain'}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{ph.name || 'Maintenance Phase'}</div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>{ph.objective}</p>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 6 }}>0% complete · Week 1 of 12</div>
            <ProgressBar value={0} max={12} color={phColor} height={8} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.muted }}>Target: <span style={{ color: C.white }}>{result.nextScanDate}</span></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: C.greenBg, padding: '3px 10px', borderRadius: 99 }}>On Track ✓</span>
          </div>
        </Card>

        {/* 2 – Why this works */}
        <Card className="su" style={{ animationDelay: '.03s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <span style={{ fontWeight: 700 }}>Why this plan works</span>
          </div>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{result.whyThisWorks}</p>
        </Card>

        {/* 3 – Daily Targets */}
        <div className="su" style={{ animationDelay: '.06s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Daily Targets</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { icon: '🔥', label: 'Calories', value: dt.calories,            unit: 'kcal', color: C.orange },
              { icon: '⚡', label: 'Protein',  value: dt.protein,             unit: 'g',    color: C.blue },
              { icon: '🚶', label: 'Steps',    value: dt.steps,               unit: '/day', color: C.green },
              { icon: '🌙', label: 'Sleep',    value: dt.sleepHours,          unit: 'hrs',  color: C.purple },
              { icon: '💧', label: 'Water',    value: dt.waterLiters,         unit: 'L',    color: '#4AD4FF' },
              { icon: '🏋️', label: 'Training', value: dt.trainingDaysPerWeek, unit: 'x/wk', color: C.red },
            ].map(t => (
              <div key={t.label} style={{ background: C.cardElevated, borderRadius: 14, padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `${t.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{t.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{t.value ?? '—'}</div>
                <div style={{ fontSize: 10, color: C.dimmed }}>{t.unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 – Physique Metrics */}
        <div className="su" style={{ animationDelay: '.09s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Physique Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Body Fat',  value: `${result.bodyFatPct}%`,       color: C.orange },
              { label: 'Lean Mass', value: `${result.leanMass} lbs`,      color: C.blue },
              { label: 'Score',     value: `${result.physiqueScore}/100`,  color: C.green },
              { label: 'Symmetry',  value: `${result.symmetryScore}/100`,  color: C.purple },
            ].map(m => (
              <div key={m.label} style={{ background: C.cardElevated, borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 5 – Muscle Groups */}
        <Card className="su" style={{ animationDelay: '.12s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Muscle Groups</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(mg).map(([name, level]) => {
              const color    = MG_COLOR[level] || C.muted;
              const pct      = level === 'well-developed' ? 85 : level === 'average' ? 55 : 28;
              const isPriority = result.weakestGroups?.includes(name);
              return (
                <div key={name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{name}</span>
                      {isPriority && <span style={{ fontSize: 9, fontWeight: 700, color: C.red, background: `${C.red}22`, padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase' }}>Priority</span>}
                    </div>
                    <span style={{ fontSize: 12, color, fontWeight: 600 }}>{level}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 6 – Asymmetries */}
        {result.asymmetries?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.14s', background: `${C.gold}18`, border: `1px solid ${C.gold}44` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: C.gold }}>⚠️ Asymmetries Detected</div>
            <ul style={{ paddingLeft: 18 }}>
              {result.asymmetries.map((a, i) => <li key={i} style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{a}</li>)}
            </ul>
          </Card>
        )}

        {/* 7 – Strengths */}
        {result.strengths?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.15s', background: C.greenBg, border: `1px solid ${C.greenDim}` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: C.green }}>💪 Strengths</div>
            <ul style={{ paddingLeft: 18 }}>
              {result.strengths.map((s, i) => <li key={i} style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, textTransform: 'capitalize' }}>{s}</li>)}
            </ul>
          </Card>
        )}

        {/* 8 – Diagnosis */}
        <Card className="su" style={{ animationDelay: '.16s', background: C.card }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🧬 Diagnosis</div>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, fontStyle: 'italic' }}>{result.diagnosis}</p>
        </Card>

        {/* 9 – Milestones strip */}
        <div className="su" style={{ animationDelay: '.17s', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { w: 'W3',  label: 'Baseline set' },
            { w: 'W6',  label: 'Habits established' },
            { w: 'W9',  label: 'Check-in' },
            { w: 'W12', label: 'Final scan' },
          ].map((m, i) => (
            <div key={m.w} style={{ flexShrink: 0, background: i === 0 ? C.greenBg : C.cardElevated, border: `1px solid ${i === 0 ? C.green : C.border}`, borderRadius: 12, padding: '10px 14px', textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? C.green : C.dimmed }}>{m.w}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* 10 – Apply button */}
        <Btn onClick={applyPlan} style={{ width: '100%', marginTop: 4 }}>Apply This Plan →</Btn>
        <div style={{ textAlign: 'center', marginTop: -4 }}>
          <button className="bp" onClick={() => setResult(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer' }}>Retake Scan</button>
        </div>

        {/* Disclaimer */}
        {result.disclaimer && (
          <p style={{ fontSize: 11, color: C.dimmed, textAlign: 'center', lineHeight: 1.6, padding: '0 8px' }}>{result.disclaimer}</p>
        )}
      </div>
    );
  }

  /* ── Pre-scan state ── */
  return (
    <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white, marginBottom: 6 }}>Scan</h1>
        <p style={{ fontSize: 14, color: C.muted }}>AI physique analysis from a single photo</p>
      </div>

      {/* What you'll get */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>What you&apos;ll get</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { icon: '📊', label: 'Body Fat Range' },
            { icon: '💪', label: 'Muscle Assessment' },
            { icon: '⚖️', label: 'Lean Mass Estimate' },
            { icon: '🔄', label: 'Symmetry Score' },
            { icon: '🎯', label: 'Training Focus' },
            { icon: '🍽', label: 'Nutrition Adjustment' },
          ].map(t => (
            <div key={t.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 24 }}>{t.icon}</span>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <Card style={{ background: C.cardElevated }}>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          💡 <strong style={{ color: C.white }}>Best results:</strong> good lighting, fitted clothing or shirtless, facing camera, full body visible.
        </div>
      </Card>

      {error && (
        <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 14, padding: '12px 16px', fontSize: 13, color: C.red }}>{error}</div>
      )}

      {/* Buttons */}
      <input ref={photoRef}  type="file" accept="image/*" capture="user"  style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      <input ref={uploadRef} type="file" accept="image/*"                 style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Btn onClick={() => photoRef.current?.click()}  style={{ width: '100%' }}>📸 Take Photo</Btn>
        <Btn onClick={() => uploadRef.current?.click()} variant="outline" style={{ width: '100%' }}>🖼 Upload Photo</Btn>
      </div>

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Previous Scans</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...scanHistory].reverse().map((s, i) => (
              <div key={i} className="bp" onClick={() => setViewOld(i)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.date}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>BF {s.bodyFat}% · Lean {s.leanMass} lbs</div>
                </div>
                <div style={{ background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
                  {s.physiqueScore}/100
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Placeholder tabs ───────────────────────────────────────────────────── */
const PlaceholderTab = ({ label, icon }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '60vh', gap: 14,
  }}>
    <div style={{ fontSize: 48 }}>{icon}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>{label}</div>
    <div style={{ fontSize: 14, color: C.muted }}>Coming in the next commit</div>
  </div>
);

/* ─── Tab Bar ────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'home',      label: 'Home',      icon: '🏠' },
  { key: 'nutrition', label: 'Nutrition', icon: '🥗' },
  { key: 'scan',      label: 'Scan',      icon: '📸' },
  { key: 'plan',      label: 'Plan',      icon: '📋' },
  { key: 'profile',   label: 'Profile',   icon: '👤' },
];

function TabBar({ active, setTab }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: '#0D130D', borderTop: `1px solid ${C.border}`,
      display: 'flex', padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
    }}>
      {TABS.map(t => {
        const isActive = active === t.key;
        return (
          <button key={t.key} className="bp" onClick={() => setTab(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}>
            <div style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 20, lineHeight: 1,
              background: isActive ? C.greenBg : 'transparent',
            }}>{t.icon}</div>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.03em', color: isActive ? C.green : C.dimmed }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function MassIQ() {
  const [profile,    setProfile]    = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [tab,        setTab]        = useState('home');
  const [ready,      setReady]      = useState(false);
  const [toast,      setToast]      = useState(null);
  const [editing,    setEditing]    = useState(false);

  useEffect(() => {
    setProfile(LS.get(LS_KEYS.profile));
    setActivePlan(LS.get(LS_KEYS.activePlan));
    setReady(true);
  }, []);

  const handleReset = () => {
    Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
    setProfile(null); setActivePlan(null); setTab('home'); setEditing(false);
  };

  const handleEditProfile = () => {
    setEditing(true);
  };

  const handleOnboardingComplete = (p) => {
    setProfile(p);
    setEditing(false);
  };

  const showToast = (msg) => setToast(msg);

  if (!ready) return <div style={{ background: C.bg, minHeight: '100dvh' }} />;

  if (!profile || editing) return (
    <>
      <style>{CSS}</style>
      <Onboarding onComplete={handleOnboardingComplete} />
    </>
  );

  const renderTab = () => {
    switch (tab) {
      case 'home':      return <HomeTab profile={profile} activePlan={activePlan} setTab={setTab} />;
      case 'nutrition': return <NutritionTab profile={profile} activePlan={activePlan} />;
      case 'scan':      return <ScanTab profile={profile} setTab={setTab} showToast={showToast} onPlanApplied={p => setActivePlan(p)} />;
      case 'plan':      return <PlanTab profile={profile} activePlan={activePlan} setTab={setTab} />;
      case 'profile':   return (
        <ProfileTab
          profile={profile}
          activePlan={activePlan}
          setTab={setTab}
          onEditProfile={handleEditProfile}
          onReset={handleReset}
          showToast={showToast}
        />
      );
      default: return null;
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {renderTab()}
        </div>
      </div>
      <TabBar active={tab} setTab={setTab} />
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </>
  );
}
