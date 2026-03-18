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

  useEffect(() => {
    setProfile(LS.get(LS_KEYS.profile));
    setActivePlan(LS.get(LS_KEYS.activePlan));
    setReady(true);
  }, []);

  if (!ready) return <div style={{ background: C.bg, minHeight: '100dvh' }} />;

  if (!profile) return (
    <>
      <style>{CSS}</style>
      <Onboarding onComplete={p => setProfile(p)} />
    </>
  );

  const renderTab = () => {
    switch (tab) {
      case 'home':      return <HomeTab profile={profile} activePlan={activePlan} setTab={setTab} />;
      case 'nutrition': return <NutritionTab profile={profile} activePlan={activePlan} />;
      case 'scan':      return <PlaceholderTab label="Body Scan" icon="📸" />;
      case 'plan':      return <PlanTab profile={profile} activePlan={activePlan} setTab={setTab} />;
      case 'profile':   return <PlaceholderTab label="Profile"   icon="👤" />;
      default:          return null;
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
    </>
  );
}
