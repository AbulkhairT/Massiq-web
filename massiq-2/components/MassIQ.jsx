"use client";
import { useState, useEffect } from "react";

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
      case 'nutrition': return <PlaceholderTab label="Nutrition" icon="🥗" />;
      case 'scan':      return <PlaceholderTab label="Body Scan" icon="📸" />;
      case 'plan':      return <PlaceholderTab label="Plan"      icon="📋" />;
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
