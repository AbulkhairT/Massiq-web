"use client";
import { useState, useEffect, useRef } from "react";
import { buildPlanContent, buildMissions, getDailyTip, buildInsights } from '../lib/content/templates';
import { buildWorkoutPlan } from '../lib/content/workouts';
import { buildMealPlan }    from '../lib/content/meals';
import { runCalculations, buildMacroTargets } from '../lib/engine/calculator';
import {
  initializeSession,
  signInWithPassword,
  signUpWithPassword,
  signOut as signOutSession,
  fetchUser,
  upsertProfile,
  ensureProfile,
  upsertPlan,
  getPlan,
  createScan,
  getScans,
} from '../lib/supabase/client';

/* ─── Design Tokens ─────────────────────────────────────────────────────── */
const C = {
  bg: '#0B0F0C',
  card: '#141A17',
  cardElevated: '#1A231E',
  border: 'rgba(255,255,255,0.09)',
  green: '#34D17B',
  greenDim: '#2F5B46',
  greenBg: 'rgba(52,209,123,0.16)',
  white: '#FFFFFF',
  muted: '#A3AEA6',
  dimmed: '#66746B',
  orange: '#FF6B35',
  blue: '#6FA7FF',
  purple: '#9B7FD4',
  red: '#FF5A5F',
  gold: '#FFD60A',
};

const ENABLE_NON_SCAN_AI = false;
const ENABLE_GAMIFICATION = false;
const DAILY_SCAN_SOFT_LIMIT = 8;

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:${C.bg}}
  ::-webkit-scrollbar{display:none}
  body{
    font-family:'Inter',sans-serif;color:${C.white};-webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;letter-spacing:-0.01em;
  }
  @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes prog{from{width:0}}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
  @keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes stepFadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes stepFadeOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-20px)}}
  .su{animation:slideUp .3s ease both}
  .fi{animation:fadeIn .25s ease both}
  .bp{
    cursor:pointer;transition:transform .16s ease,opacity .16s ease,background-color .2s ease,border-color .2s ease,color .2s ease;
    -webkit-tap-highlight-color:transparent;
  }
  .bp:active{transform:scale(.96);opacity:.85}
  .screen{padding:28px 18px 44px;display:flex;flex-direction:column;gap:22px}
  .screen-title{font-size:34px;font-weight:760;line-height:1.06;letter-spacing:-0.03em}
  .section-title{font-size:17px;font-weight:700;line-height:1.2;letter-spacing:-0.02em;margin-bottom:12px}
  .section-subtitle{font-size:13px;line-height:1.5;color:${C.muted}}
  .glass{
    background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
    border:1px solid ${C.border};box-shadow:0 8px 30px rgba(0,0,0,0.24);
  }
  .metric{font-size:24px;font-weight:720;line-height:1}
  .label{font-size:11px;color:${C.muted};letter-spacing:.05em;text-transform:uppercase}
  input,textarea,select{outline:none;font-family:inherit;color:${C.white}}
  input::placeholder,textarea::placeholder{color:${C.muted}}
  .prog-bar{animation:prog .6s ease both}
  .ob-step{animation:stepFadeIn .3s ease both}
  .ob-step-out{animation:stepFadeOut .25s ease both}
  .ob-input{
    background:transparent;border:none;border-bottom:2px solid rgba(255,255,255,0.15);
    font-size:28px;font-weight:700;color:#fff;width:100%;text-align:center;
    padding:12px 0;transition:border-color .2s ease;font-family:'Inter',monospace;
    caret-color:${C.green};
  }
  .ob-input:focus{border-bottom-color:${C.green}}
  .ob-num-input{
    background:#141A14;border:1px solid rgba(255,255,255,0.15);border-radius:16px;
    font-size:32px;font-weight:600;color:#fff;width:100%;text-align:center;
    padding:20px 24px;transition:border-color .2s ease;font-family:'Inter',monospace;
    caret-color:${C.green};
    -webkit-appearance:none;-moz-appearance:textfield;appearance:none;
  }
  .ob-num-input::-webkit-outer-spin-button,
  .ob-num-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .ob-num-input:focus{border-color:${C.green}}
  .ob-card{
    border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:20px 18px;
    background:${C.card};cursor:pointer;transition:all .18s ease;
  }
  .ob-card:hover{transform:translateY(-1px);border-color:rgba(52,209,123,0.42)}
  .ob-card.selected{border-color:${C.green};background:rgba(0,200,83,0.12)}
  .ob-chip{
    padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);
    background:transparent;color:${C.muted};font-size:13px;font-weight:500;cursor:pointer;
    transition:all .15s ease;font-family:inherit;
  }
  .ob-chip.selected{border-color:${C.green};background:rgba(0,200,83,0.15);color:${C.green}}
  .ob-chip:hover{border-color:rgba(0,200,83,0.4);color:#fff}
  .ob-activity-row{
    padding:17px 18px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);
    background:${C.card};cursor:pointer;transition:all .18s ease;display:flex;
    align-items:center;justify-content:space-between;
  }
  .ob-activity-row:hover{border-color:rgba(0,200,83,0.3)}
  .ob-activity-row.selected{border-color:${C.green};border-left:4px solid ${C.green};background:rgba(0,200,83,0.08)}
  @keyframes skeleton{0%,100%{opacity:.5}50%{opacity:.9}}
  .skeleton{animation:skeleton 1.4s ease-in-out infinite;background:rgba(255,255,255,0.08);border-radius:8px}
  .pulse-dot{
    width:10px;height:10px;border-radius:50%;background:${C.green};
    animation:pulse 2s ease-in-out infinite;
  }
  /* ── Desktop layout ── */
  @media(min-width:769px){
    .mobile-tabbar{display:none!important}
    .desktop-sidebar{display:flex!important}
    .app-layout{display:grid!important;grid-template-columns:220px 1fr}
    .app-content{max-width:860px;margin:0 auto;padding:34px 26px 52px}
    .ob-wrap{max-width:600px;margin:0 auto}
  }
  @media(max-width:430px){
    .screen-title{font-size:31px}
  }
  @media(max-width:768px){
    .desktop-sidebar{display:none!important}
  }
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
  workoutplan: 'massiq:workoutplan',
  logged:      (d) => `massiq:logged:${d}`,
  reminders:   'massiq:reminders',
};

/* ─── Macro Calculator ───────────────────────────────────────────────────── */
/* ─── Physiological macro calculator (Mifflin-St Jeor / ISSN guidelines) ── */
function calcMacros(profile) {
  if (!profile) return null;
  try {
    const physio = runCalculations(profile);
    const macroTargets = buildMacroTargets(physio, profile.goal);
    return {
      calories: macroTargets.calories,
      protein: macroTargets.protein,
      carbs: macroTargets.carbs,
      fat: macroTargets.fat,
      steps: macroTargets.steps,
      sleepHours: macroTargets.sleepHours,
      waterLiters: macroTargets.waterLiters,
      trainingDaysPerWeek: macroTargets.trainingDaysPerWeek,
      cardioDays: macroTargets.cardioDays,
      tdee: physio.tdee,
    };
  } catch {
    return { calories: 2000, protein: 150, carbs: 210, fat: 60, steps: 9000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4, cardioDays: 2 };
  }
}

/* ─── Macro sanity clamp ─────────────────────────────────────────────────
   Hard physiological ceilings — prevents absurd Claude-generated or stale
   localStorage values from showing in the UI.
   Protein: max 3.5g/kg LBM ≈ 350g for ~100 kg person (well above any guideline)
   Calories: 800–6000 kcal absolute range
─────────────────────────────────────────────────────────────────────────── */
function clampMacros(macros, profile) {
  if (!macros) return macros;
  const kg = Math.max(40, (profile?.weightLbs || 180) * 0.453592);
  const tdee = Number(macros?.tdee || calcMacros(profile)?.tdee || 2400);
  const goal = profile?.goal || 'Maintain';
  const minCalories = Math.round(tdee * (goal === 'Cut' ? 0.65 : 0.75));
  const maxCalories = Math.round(tdee * (goal === 'Bulk' ? 1.25 : 1.15));
  const calories = Math.max(minCalories, Math.min(Number(macros.calories || 2000), maxCalories));
  const minProtein = Math.round(kg * 1.4);
  const maxProtein = Math.round(kg * 2.8);
  const protein = Math.max(minProtein, Math.min(Number(macros.protein || 150), maxProtein));
  const fatFloor = Math.round(kg * 0.8);
  const fatFromCalories = Math.round((calories * 0.35) / 9);
  const fat = Math.max(fatFloor, Math.min(Number(macros.fat || 60), fatFromCalories));
  const recalculatedCarbs = Math.round(Math.max(0, (calories - (protein * 4 + fat * 9)) / 4));
  const carbs = Math.max(30, Number.isFinite(recalculatedCarbs) ? recalculatedCarbs : Number(macros.carbs || 180));
  return {
    ...macros,
    calories,
    protein,
    fat,
    carbs,
    steps: Math.min(15000, Math.max(5000, Number(macros.steps || 9000))),
    sleepHours: Math.min(10, Math.max(7, Number(macros.sleepHours || 8))),
    waterLiters: Math.min(6, Math.max(2, Number(macros.waterLiters || 3))),
    trainingDaysPerWeek: Math.min(6, Math.max(3, Number(macros.trainingDaysPerWeek || 4))),
    cardioDays: Math.min(4, Math.max(0, Number(macros.cardioDays || 2))),
  };
}

/* ─── Engine API caller ─────────────────────────────────────────────────── */
async function callEngine(profile, scanHistory = []) {
  try {
    const currentScan    = scanHistory.length > 0 ? scanHistory[scanHistory.length - 1] : undefined;
    const previousScans  = scanHistory.length > 1 ? scanHistory.slice(0, -1) : [];
    const res = await fetch('/api/engine', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        profile,
        currentScan,
        previousScans,
        include_claude_context: true,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[engine] call failed, falling back to calcMacros:', err);
    return null;
  }
}

/* ─── Session Storage ───────────────────────────────────────────────────── */
const SS = {
  get: (k, fb = null) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ─── AI Helpers ─────────────────────────────────────────────────────────── */
// model: 'haiku' (default, 12x cheaper) | 'sonnet' (vision only) | explicit model ID
async function callClaude(messages, maxTokens = 600, model = 'haiku') {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, max_tokens: maxTokens, model }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const { text, error } = await res.json();
      if (error) throw new Error(error);
      return text;
    } catch (err) {
      console.error(`Claude call attempt ${attempt + 1} failed:`, err);
      if (attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

function parseJSON(text) {
  const m = text.match(/[\[\{][\s\S]*[\]\}]/);
  if (!m) throw new Error('No JSON in response');
  return JSON.parse(m[0]);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function hourKey()  { const d = new Date(); return `${todayStr()}:${d.getHours()}`; }
function weekKey2() {
  const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-W${Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7)}`;
}

const fmt = {
  date: (iso) => {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  pct: (v, d = 1) => `${Number(v || 0).toFixed(d)}%`,
  lbs: (v, d = 0) => `${Number(v || 0).toFixed(d)} lb`,
  range: (a, b) => `${Math.round(a)}–${Math.round(b)}`,
  weight: (lbs, unit = 'imperial') => unit === 'metric'
    ? `${(Number(lbs || 0) * 0.453592).toFixed(1)} kg`
    : `${Number(lbs || 0).toFixed(1)} lb`,
  leanMass: (lbs, unit = 'imperial') => unit === 'metric'
    ? `${(Number(lbs || 0) * 0.453592).toFixed(1)} kg`
    : `${Number(lbs || 0).toFixed(1)} lb`,
  height: (cm, unit = 'imperial') => {
    const n = Number(cm || 0);
    if (unit === 'metric') return `${Math.round(n)} cm`;
    const totalIn = n / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inch = Math.round(totalIn % 12);
    return `${ft}'${inch}"`;
  },
};

const PHASE_META = {
  Cut:     { label: 'Cut',     emoji: '📉', target: 'Reduce body fat while preserving lean tissue' },
  Bulk:    { label: 'Bulk',    emoji: '📈', target: 'Increase lean mass with controlled fat gain' },
  Build:   { label: 'Build',   emoji: '📈', target: 'Increase lean mass with controlled fat gain' },
  Recomp:  { label: 'Recomp',  emoji: '🔄', target: 'Improve composition while maintaining bodyweight range' },
  Maintain:{ label: 'Maintain',emoji: '⚖️', target: 'Hold conditioning and improve weak points' },
};

function getTrajectoryStatus(scanHistory = [], phase = 'Maintain') {
  if (!Array.isArray(scanHistory) || scanHistory.length < 2) return { tone: 'neutral', label: 'Insufficient data', note: 'Complete your next scan to validate trajectory.' };
  const prev = scanHistory[scanHistory.length - 2];
  const curr = scanHistory[scanHistory.length - 1];
  const bfDelta = Number(curr.bodyFat || 0) - Number(prev.bodyFat || 0);
  const lmDelta = Number(curr.leanMass || 0) - Number(prev.leanMass || 0);
  if (phase === 'Cut') {
    if (bfDelta < -0.3 && lmDelta >= -1) return { tone: 'good', label: 'On track', note: 'Body fat is trending down while lean mass is stable.' };
    if (bfDelta < -1.2 && lmDelta < -1) return { tone: 'warn', label: 'Too aggressive', note: 'Rate of loss may compromise lean tissue; increase calories slightly.' };
    if (bfDelta >= -0.3) return { tone: 'warn', label: 'Behind', note: 'Fat loss pace is slower than expected; tighten adherence and activity.' };
  }
  if (phase === 'Bulk' || phase === 'Build') {
    if (lmDelta > 0.6 && bfDelta <= 0.7) return { tone: 'good', label: 'On track', note: 'Lean tissue is increasing without excessive fat gain.' };
    if (lmDelta <= 0.2) return { tone: 'warn', label: 'Behind', note: 'Growth signal is low; increase surplus or training stimulus.' };
    if (bfDelta > 1) return { tone: 'warn', label: 'Off balance', note: 'Fat gain is outpacing lean growth; reduce surplus slightly.' };
  }
  if (Math.abs(bfDelta) <= 0.6 && lmDelta >= 0) return { tone: 'good', label: 'On track', note: 'Current trend aligns with phase objective.' };
  return { tone: 'neutral', label: 'Re-evaluate', note: 'Collect another scan under similar conditions for a clearer signal.' };
}

function getPrimaryLimiters(scan, activePlan) {
  const fromScan = scan?.priorityAreas || scan?.weakestGroups || [];
  if (Array.isArray(fromScan) && fromScan.length) return fromScan.slice(0, 3);
  const actions = activePlan?.engineDiagnosis?.primary?.primary_issue ? [activePlan.engineDiagnosis.primary.primary_issue] : [];
  if (actions.length) return actions;
  return ['Execution consistency is the current bottleneck.'];
}

function getActiveTargets(activePlan, profile) {
  const targets = activePlan?.dailyTargets || activePlan?.macros || calcMacros(profile);
  return clampMacros(targets, profile) || { calories: 2000, protein: 150, carbs: 210, fat: 60, steps: 9000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4, cardioDays: 2 };
}

function buildBaselinePlanFromProfile(profile) {
  const targets = {
    calories: 2500,
    protein: 150,
    carbs: 250,
    fat: 70,
    steps: 9000,
    sleepHours: 8,
    waterLiters: 3,
    trainingDaysPerWeek: 4,
    cardioDays: 2,
  };
  const nextScan = new Date();
  nextScan.setDate(nextScan.getDate() + 28);
  return {
    phase: 'Maintain',
    phaseName: 'Maintain Phase',
    objective: 'Baseline phase generated from your profile inputs.',
    week: 1,
    startDate: todayStr(),
    nextScanDate: nextScan.toISOString().slice(0, 10),
    macros: {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fat: targets.fat,
    },
    dailyTargets: targets,
    trainDays: targets.trainingDaysPerWeek || 4,
    sleepHrs: targets.sleepHours || 8,
    waterL: targets.waterLiters || 3,
  };
}

function sanitizeMeal(meal, targets, profile, idx = 0) {
  if (!meal || typeof meal !== 'object') return null;
  const kcalCap = Math.round((targets?.calories || 2000) * 0.7);
  const calories = Math.min(kcalCap, Math.max(120, Math.round(Number(meal.calories || 0))));
  const protein = Math.min(80, Math.max(10, Math.round(Number(meal.protein || 0))));
  let fat = Math.min(45, Math.max(4, Math.round(Number(meal.fat || 0))));
  let carbs = Math.min(120, Math.max(8, Math.round(Number(meal.carbs || 0))));
  const macroCalories = protein * 4 + fat * 9 + carbs * 4;
  if (Math.abs(macroCalories - calories) > 140) {
    const adjustedCarbs = Math.round(Math.max(8, (calories - protein * 4 - fat * 9) / 4));
    carbs = Math.min(120, adjustedCarbs);
    const revisedMacroCalories = protein * 4 + fat * 9 + carbs * 4;
    if (Math.abs(revisedMacroCalories - calories) > 120) {
      fat = Math.max(4, Math.round((calories - protein * 4 - carbs * 4) / 9));
    }
  }
  const text = String(meal.name || '').trim();
  const isVegan = (profile?.dietPrefs || []).includes('Vegan');
  const safeName = text || `Suggested meal ${idx + 1}`;
  const invalidVegan = isVegan && /\b(chicken|beef|salmon|tuna|egg|turkey|prawn|yogurt)\b/i.test(safeName);
  return {
    id: meal.id || `sg-${idx + 1}`,
    time: meal.time || meal.mealType || (idx === 1 ? 'Snack' : idx === 0 ? 'Lunch' : 'Dinner'),
    icon: meal.icon || '🍽️',
    name: invalidVegan ? 'Plant protein bowl' : safeName,
    calories,
    protein,
    carbs,
    fat,
    description: meal.description || '',
    whyNow: meal.whyNow || 'Matched to your remaining calorie and protein budget.',
  };
}

function sanitizeScanData(scan, profile) {
  if (!scan) return scan;
  const bodyFatPct = Math.min(55, Math.max(4, Number(scan.bodyFatPct || scan.bodyFat || (profile?.gender === 'Female' ? 28 : 20))));
  const weight = Number(profile?.weightLbs || 180);
  const leanMass = Math.min(weight * 0.96, Math.max(weight * 0.35, Number(scan.leanMass || (weight * (1 - bodyFatPct / 100)))));
  return {
    ...scan,
    bodyFatPct: Number(bodyFatPct.toFixed(1)),
    leanMass: Number(leanMass.toFixed(1)),
    physiqueScore: Math.min(95, Math.max(30, Number(scan.physiqueScore || 60))),
    symmetryScore: Math.min(95, Math.max(60, Number(scan.symmetryScore || 75))),
    confidence: ['low', 'medium', 'high'].includes(scan.confidence) ? scan.confidence : 'medium',
  };
}

/* ─── Content Generators — Deterministic-first ─────────────────────────────
   Plan/mission/tip/insight generation is deterministic.
   Non-scan AI is disabled by default for production cost control.
─────────────────────────────────────────────────────────────────────────── */

async function generateInitialPlan(profile, macros, engineOutput = null) {
  // Synchronous — no LLM call. Returns same shape as previous Claude version.
  return buildPlanContent(profile, macros, engineOutput);
}

async function generateMealPlan(profile, activePlan) {
  // Synchronous — no LLM call. Template database with macro-matching.
  const m          = getActiveTargets(activePlan, profile);
  const trainDays  = m.trainingDaysPerWeek || activePlan?.trainDays || 4;
  return buildMealPlan(
    m.calories || 2000,
    m.protein  || 150,
    trainDays,
    profile.dietPrefs || [],
    profile.avoid     || [],
  );
}

async function generateSuggestions(profile, activePlan, todayMeals) {
  // Deterministic only for production cost control.
  if (!ENABLE_NON_SCAN_AI) {
    const m = getActiveTargets(activePlan, profile);
    const eaten = todayMeals.reduce((a, x) => ({ cal: a.cal + (x.calories || 0), prot: a.prot + (x.protein || 0) }), { cal: 0, prot: 0 });
    const remCal = Math.max(0, (m.calories || 2000) - eaten.cal);
    const remProt = Math.max(0, (m.protein || 150) - eaten.prot);
    const split = [0.38, 0.24, 0.38];
    return ['Lunch', 'Snack', 'Dinner'].map((slot, i) => ({
      id: `det-${slot.toLowerCase()}`,
      name: slot === 'Snack' ? 'Greek yogurt + berries' : slot === 'Lunch' ? 'Chicken rice bowl' : 'Salmon + potatoes',
      mealType: slot.toLowerCase(),
      time: slot,
      icon: slot === 'Snack' ? '🥣' : '🍽️',
      calories: Math.max(180, Math.round(remCal * split[i])),
      protein: Math.max(18, Math.round(remProt * split[i])),
      carbs: Math.max(20, Math.round((remCal * split[i] * 0.45) / 4)),
      fat: Math.max(8, Math.round((remCal * split[i] * 0.25) / 9)),
      description: 'Generated from your active macro targets.',
      whyNow: 'Built from remaining calories and protein for today.',
    }));
  }
  // Keep LLM but use Haiku — context-aware meal suggestions still benefit from AI.
  const m = getActiveTargets(activePlan, profile);
  const eaten = todayMeals.reduce((a, x) => ({ cal: a.cal+(x.calories||0), prot: a.prot+(x.protein||0) }), { cal:0, prot:0 });
  const h = new Date().getHours();
  const timeOfDay = h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : 'Dinner';
  const text = await callClaude([{ role: 'user', content:
    `Suggest 3 meals. Time: ${timeOfDay}. Goal: ${profile.goal}. Remaining: ${Math.max(0,(m.calories||2000)-eaten.cal)} kcal, ${Math.max(0,(m.protein||150)-eaten.prot)}g protein. Prefs: ${(profile.dietPrefs||[]).join(',')||'none'}. Avoid: ${(profile.avoid||[]).join(',')||'none'}.
Return ONLY JSON array of 3: [{"id":"s1","name":"","mealType":"${timeOfDay.toLowerCase()}","time":"${timeOfDay}","icon":"emoji","calories":0,"protein":0,"carbs":0,"fat":0,"description":"","whyNow":"one sentence"}]`
  }], 500, 'haiku');
  return parseJSON(text);
}

async function generateDailyTip(profile, activePlan, todayMeals) {
  // Fully template-based — no LLM call.
  const m = getActiveTargets(activePlan, profile);
  const eaten = todayMeals.reduce((a, x) => ({ cal: a.cal+(x.calories||0), prot: a.prot+(x.protein||0) }), { cal:0, prot:0 });
  return getDailyTip(profile.goal, { calories: m.calories||2000, protein: m.protein||150 }, eaten, new Date().getDay());
}

async function generatePatterns(profile, activePlan) {
  // Synchronous — no LLM call. Returns same shape as previous Claude version.
  const m         = getActiveTargets(activePlan, profile);
  const trainDays = m.trainingDaysPerWeek || activePlan?.trainDays || 4;
  const insights  = buildInsights(profile, { calories: m.calories||2000, protein: m.protein||150 }, trainDays, null);
  return { insights };
}

async function generateMissions(profile, activePlan) {
  // Synchronous — no LLM call. Template-based tier system.
  const m         = getActiveTargets(activePlan, profile);
  const trainDays = m.trainingDaysPerWeek || activePlan?.trainDays || 4;
  return buildMissions(profile.goal, { calories: m.calories||2000, protein: m.protein||150 }, trainDays);
}

async function generateWorkoutPlan(profile, activePlan) {
  // Synchronous — no LLM call. Evidence-based split selection by training days.
  const trainDays = getActiveTargets(activePlan, profile)?.trainingDaysPerWeek || activePlan?.trainDays || 4;
  return buildWorkoutPlan(profile.goal, trainDays);
}

async function generateRecipeDetails(meal, profile) {
  if (!ENABLE_NON_SCAN_AI) {
    return {
      ingredients: ['Lean protein source', 'Primary carb source', 'Vegetables', 'Olive oil'],
      steps: [{ text: `Cook and assemble ${meal.name} to match your logged macros.`, timerSeconds: null }],
    };
  }
  // Use Haiku — recipe generation is simple structured output, no complex reasoning needed.
  const text = await callClaude([{ role: 'user', content:
    `Recipe for: ${meal.name} (${meal.calories} kcal, ${meal.protein}g P, ${meal.carbs}g C, ${meal.fat}g F). Goal: ${profile?.goal||'fitness'}.
Return ONLY JSON: {"ingredients":["200g chicken breast"],"steps":[{"text":"Cook step","timerSeconds":null}]}`
  }], 500, 'haiku');
  return parseJSON(text);
}

async function swapMealAPI(currentMeal, profile) {
  if (!ENABLE_NON_SCAN_AI) {
    return {
      name: `${currentMeal.name} (alternate)`,
      description: 'Equivalent macro swap generated locally.',
      icon: currentMeal.icon || '🍽️',
      calories: currentMeal.calories,
      protein: currentMeal.protein,
      carbs: currentMeal.carbs || 0,
      fat: currentMeal.fat || 0,
      prepTime: '15 min',
      whyThisMeal: 'Maintains your current target split.',
    };
  }
  // Use Haiku — simple substitution task with structured output.
  const mealType = currentMeal.mealType || currentMeal.time || 'Meal';
  const text = await callClaude([{ role: 'user', content:
    `Suggest a different ${mealType} meal. Target: ${currentMeal.calories} kcal, ${currentMeal.protein}g protein. Goal: ${profile?.goal}. Avoid: ${(profile?.avoid||[]).join(',')||'none'}.
Return ONLY JSON: {"name":"","description":"","icon":"emoji","calories":${currentMeal.calories},"protein":${currentMeal.protein},"carbs":${currentMeal.carbs||0},"fat":${currentMeal.fat||0},"prepTime":"","whyThisMeal":""}`
  }], 300, 'haiku');
  return parseJSON(text);
}

/* ─── Tiny UI Primitives ─────────────────────────────────────────────────── */
const Btn = ({ children, onClick, style = {}, variant = 'primary', disabled, ...rest }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '13px 22px', borderRadius: 14, fontWeight: 620,
    fontSize: 14, letterSpacing: '-0.01em', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease', opacity: disabled ? 0.45 : 1,
    ...(variant === 'primary' && { background: C.green, color: '#071109', boxShadow: '0 8px 22px rgba(52,209,123,0.24)' }),
    ...(variant === 'outline' && { background: 'transparent', color: C.green, border: `1px solid ${C.green}` }),
    ...(variant === 'ghost'   && { background: 'transparent', color: C.muted, border: `1px solid ${C.border}` }),
    ...style,
  };
  return <button className="bp" style={base} onClick={disabled ? undefined : onClick} {...rest}>{children}</button>;
};

const Card = ({ children, style = {}, className = '', ...rest }) => (
  <div className={className} style={{ background: C.card, borderRadius: 18, padding: 18, border: `1px solid ${C.border}`, boxShadow: '0 8px 28px rgba(0,0,0,0.2)', ...style }} {...rest}>
    {children}
  </div>
);

const SummaryCard = ({ label, title, subtitle, progressPct, metrics = [], insight, nextStep, tone = C.green, children }) => (
  <Card className="glass" style={{ background: '#152019', border: `1px solid ${tone}55` }}>
    <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 780, lineHeight: 1.05, marginBottom: 4 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{subtitle}</div>}
    {typeof progressPct === 'number' && (
      <div style={{ marginBottom: 10 }}>
        <ProgressBar value={progressPct} max={100} color={tone} height={6} />
      </div>
    )}
    {metrics.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, 1fr)`, gap: 8, marginBottom: 10 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ textAlign: 'left', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 9px', background: 'rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{m.value}</div>
            <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.label}</div>
          </div>
        ))}
      </div>
    )}
    {insight && (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: 'rgba(255,255,255,0.02)', padding: '9px 10px', marginBottom: nextStep ? 8 : 0 }}>
        <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>System Insight</div>
        <div style={{ fontSize: 13, color: C.white, lineHeight: 1.45 }}>{insight}</div>
      </div>
    )}
    {nextStep && <div style={{ fontSize: 12, color: C.green }}>Next step: {nextStep}</div>}
    {children}
  </Card>
);

const Chip = ({ label, active, onClick }) => (
  <button className="bp" onClick={onClick} style={{
    padding: '7px 14px', borderRadius: 50, border: `1px solid ${active ? C.green : C.border}`,
    background: active ? C.greenBg : 'transparent', color: active ? C.green : C.muted,
    fontSize: 12, fontWeight: 550, cursor: 'pointer',
  }}>{label}</button>
);

const StatusPill = ({ tone = 'neutral', label }) => {
  const toneMap = {
    good:    { fg: C.green, bg: C.greenBg, bd: C.greenDim },
    warn:    { fg: C.gold,  bg: 'rgba(255,214,10,0.14)', bd: 'rgba(255,214,10,0.3)' },
    issue:   { fg: C.red,   bg: 'rgba(255,90,95,0.12)',  bd: 'rgba(255,90,95,0.32)' },
    neutral: { fg: C.muted, bg: 'rgba(255,255,255,0.05)', bd: C.border },
  }[tone] || { fg: C.muted, bg: 'rgba(255,255,255,0.05)', bd: C.border };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
      padding: '4px 10px', fontSize: 11, fontWeight: 650, color: toneMap.fg,
      background: toneMap.bg, border: `1px solid ${toneMap.bd}`, letterSpacing: '.02em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneMap.fg }} />
      {label}
    </span>
  );
};

function DetailSheet({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 330, background: 'rgba(6,10,7,0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: 14, overflowY: 'auto' }}>
      <div style={{ maxWidth: 620, margin: '8px auto 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card style={{ background: '#111813' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 740 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{subtitle}</div>}
            </div>
            <button className="bp" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.cardElevated, color: C.muted, fontSize: 16 }}>×</button>
          </div>
        </Card>
        {children}
      </div>
    </div>
  );
}

const ProgressBar = ({ value, max, color = C.green, height = 6 }) => {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height, overflow: 'hidden' }}>
      <div className="prog-bar" style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
  );
};

/* ─── Plan Generating Screen ─────────────────────────────────────────────── */
function PlanGeneratingScreen({ name }) {
  const msgs = [
    'Analyzing your goals...',
    'Calculating your TDEE...',
    'Building your 12-week program...',
    'Personalizing your nutrition targets...',
    'Setting up your missions...',
  ];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setShown(s => Math.min(s + 1, msgs.length)), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 40 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.greenBg}`, animation: 'pulse 2s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🧬</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8, textAlign: 'center' }}>Building your plan{name ? `, ${name}` : ''}.</div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 32 }}>This takes about 10 seconds</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {msgs.slice(0, shown).map((msg, i) => (
          <div key={i} className="fi" style={{ fontSize: 15, color: i === shown - 1 ? C.white : C.muted, fontWeight: i === shown - 1 ? 600 : 400 }}>{msg}</div>
        ))}
      </div>
    </div>
  );
}

/* ─── Onboarding ─────────────────────────────────────────────────────────── */
const DIET_PREFS  = ['None', 'Vegan', 'Vegetarian', 'Keto', 'Paleo', 'Gluten-Free', 'Dairy-Free', 'Halal', 'Kosher'];
const CUISINES    = ['American', 'Mediterranean', 'Asian', 'Mexican', 'Italian', 'Middle Eastern', 'Indian', 'Japanese'];
const AVOID_FOODS = ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Soy', 'Eggs', 'Red Meat', 'Processed Sugar'];
const GOALS = [
  { key: 'Cut',      emoji: '📉', label: 'Cut',      desc: 'Lose fat, preserve muscle' },
  { key: 'Bulk',     emoji: '📈', label: 'Bulk',     desc: 'Build maximum muscle mass' },
  { key: 'Recomp',   emoji: '🔄', label: 'Recomp',  desc: 'Lose fat & gain muscle simultaneously' },
  { key: 'Maintain', emoji: '⚖️', label: 'Maintain', desc: 'Stay lean at current weight' },
];
const ACTIVITIES = [
  { key: 'Sedentary', label: 'Sedentary',         desc: 'Mostly sitting, minimal movement',          insight: 'Lower baseline calorie needs.' },
  { key: 'Light',     label: 'Lightly Active',    desc: 'Daily movement with light exercise',        insight: 'Slightly higher daily energy demand.' },
  { key: 'Moderate',  label: 'Moderately Active', desc: 'Consistent training most weeks',            insight: 'Moderate calorie needs for performance and recovery.' },
  { key: 'Active',    label: 'Very Active',       desc: 'High training frequency or physical work',  insight: 'Higher energy demand to sustain output.' },
];

/* Animated counter used on ready screen */
function CountUp({ target, unit }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const dur   = 900;
    const tick  = () => {
      const pct = Math.min(1, (Date.now() - start) / dur);
      setVal(Math.round(target * pct));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <span>{val}<span style={{ fontSize: 14, color: C.muted, marginLeft: 4 }}>{unit}</span></span>;
}

function Onboarding({ onComplete }) {
  const [step,     setStep]     = useState(0);
  const [visible,  setVisible]  = useState(true);   // for fade animation
  const [calcDone, setCalcDone] = useState(false);   // step 7 auto-advance done
  const [data, setData] = useState({
    name: '', age: '', gender: 'Male', unitSystem: 'imperial',
    weightLbs: '', weightKg: '', heightCm: '', heightFt: '', heightInch: '',
    goal: '', activity: '', dietPrefs: [], cuisines: [], avoid: [],
  });

  const set       = (k, v) => setData(p => ({ ...p, [k]: v }));
  const setUnitSystem = (unit) => setData((p) => {
    if (p.unitSystem === unit) return p;
    const next = { ...p, unitSystem: unit };
    const lbs = Number(p.weightLbs || 0);
    const kg = Number(p.weightKg || 0);
    const cm = Number(p.heightCm || 0);
    const totalIn = (Number(p.heightFt || 0) * 12) + Number(p.heightInch || 0);
    if (unit === 'metric') {
      const convertedKg = lbs ? lbs * 0.453592 : (kg || 0);
      const convertedCm = totalIn ? totalIn * 2.54 : cm;
      next.weightKg = convertedKg ? convertedKg.toFixed(1) : '';
      next.heightCm = convertedCm ? String(Math.round(convertedCm)) : '';
    } else {
      const convertedLbs = kg ? kg * 2.20462 : lbs;
      const inches = cm ? cm / 2.54 : totalIn;
      next.weightLbs = convertedLbs ? convertedLbs.toFixed(1) : '';
      if (inches) {
        next.heightFt = String(Math.floor(inches / 12));
        next.heightInch = String(Math.round(inches % 12));
      }
    }
    return next;
  });
  const toggleArr = (k, v) => setData(p => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v],
  }));

  useEffect(() => {
    const saved = LS.get(LS_KEYS.profile, null);
    if (!saved) return;
    const inches = saved.heightCm ? saved.heightCm / 2.54 : (saved.heightIn || 0);
    setData((p) => ({
      ...p,
      ...saved,
      unitSystem: saved.unitSystem || 'imperial',
      weightLbs: saved.weightLbs ? String(saved.weightLbs) : '',
      weightKg: saved.weightLbs ? (saved.weightLbs * 0.453592).toFixed(1) : '',
      heightCm: saved.heightCm ? String(saved.heightCm) : '',
      heightFt: inches ? String(Math.floor(inches / 12)) : '',
      heightInch: inches ? String(Math.round(inches % 12)) : '',
    }));
  }, []);

  const TOTAL = 9; // steps 0-8

  const canNext = [
    !!data.name.trim(),                        // 0 name
    !!data.goal,                               // 1 goal
    !!(((data.unitSystem === 'metric' ? data.weightKg : data.weightLbs)
      && (data.unitSystem === 'metric' ? data.heightCm : (data.heightFt && data.heightInch))
      && data.age && data.gender)), // 2 stats
    !!data.activity,                           // 3 activity
    true,                                      // 4 dietary (skippable)
    true,                                      // 5 cuisine (skippable)
    true,                                      // 6 avoid (skippable)
    false,                                     // 7 calculating (auto)
    true,                                      // 8 ready
  ][step] ?? true;

  const goNext = () => {
    setVisible(false);
    setTimeout(() => { setStep(s => s + 1); setVisible(true); }, 280);
  };
  const goBack = () => {
    setVisible(false);
    setTimeout(() => { setStep(s => s - 1); setVisible(true); }, 280);
  };

  // Step 7: auto-advance after 3 s
  useEffect(() => {
    if (step !== 7) return;
    const t = setTimeout(() => {
      setCalcDone(false);
      setVisible(false);
      setTimeout(() => { setStep(8); setVisible(true); }, 280);
    }, 3200);
    return () => clearTimeout(t);
  }, [step]);

  const [generating, setGenerating] = useState(false);

  const finish = async () => {
    const normalizedWeightLbs = data.unitSystem === 'metric' ? Number(data.weightKg || 0) * 2.20462 : Number(data.weightLbs || 0);
    const normalizedHeightCm = data.unitSystem === 'imperial'
      ? ((Number(data.heightFt || 0) * 12) + Number(data.heightInch || 0)) * 2.54
      : Number(data.heightCm || 0);
    const profile = {
      ...data,
      age: Number(data.age),
      weightLbs: Number(normalizedWeightLbs.toFixed(1)),
      heightCm: Number(normalizedHeightCm.toFixed(1)),
      heightIn: Number((normalizedHeightCm / 2.54).toFixed(1)),
    };
    LS.set(LS_KEYS.profile, profile);

    // Editing existing profile — skip plan gen
    if (LS.get(LS_KEYS.activePlan)) { onComplete(profile, null); return; }

    setGenerating(true);
    try {
      // 1. Run the deterministic engine first — this is the source of truth for all numbers
      const engineOutput = await callEngine(profile, []);
      const macros = clampMacros(engineOutput?.macro_targets || calcMacros(profile), profile);

      // 2. Claude generates narrative/missions/tips constrained by engine output
      const planData = await generateInitialPlan(profile, macros, engineOutput);
      const td = todayStr();

      // 3. Assemble plan — engine targets take priority over Claude's returned numbers
      const plan = {
        phase:          profile.goal,
        phaseName:      planData.phase?.name        || `${profile.goal} Phase`,
        objective:      planData.phase?.objective   || '',
        week:           1,
        startDate:      td,
        nextScanDate:   planData.nextScanDate       || (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
        macros: {
          calories: macros.calories,
          protein:  macros.protein,
          carbs:    macros.carbs,
          fat:      macros.fat,
        },
        dailyTargets: {
          calories:            macros.calories,
          protein:             macros.protein,
          carbs:               macros.carbs,
          fat:                 macros.fat,
          steps:               macros.steps               || 9000,
          sleepHours:          macros.sleepHours          || 8,
          waterLiters:         macros.waterLiters         || 3,
          trainingDaysPerWeek: macros.trainingDaysPerWeek || 4,
        },
        trainDays:          macros.trainingDaysPerWeek || 4,
        sleepHrs:           macros.sleepHours          || 8,
        waterL:             macros.waterLiters         || 3,
        steps:              macros.steps               || 9000,
        weeklyMissions:     planData.weeklyMissions    || [],
        whyThisWorks:       planData.whyThisWorks      || '',
        dailyTips:          planData.dailyTips         || [],
        trainingFocus:      planData.trainingFocus     || {},
        nutritionKeyChange: planData.nutritionKeyChange || '',
        startBF:            engineOutput?.start_bf     ?? planData.transformationTimeline?.startBF ?? 20,
        targetBF:           engineOutput?.target_bf    ?? planData.transformationTimeline?.targetBF ?? (profile.goal === 'Cut' ? 16 : 20),
        cardioDays:         macros.cardioDays           || 2,
        // Attach engine output for downstream use (scan feedback, diagnosis display)
        engineDiagnosis:    engineOutput?.diagnosis     || null,
        engineTrajectory:   engineOutput?.trajectory    || null,
        tdee:               engineOutput?.physio?.tdee  || null,
      };
      onComplete(profile, plan);
    } catch (err) {
      console.error('Plan generation failed:', err);
      const macros = calcMacros(profile);
      const td = todayStr();
      const fallback = {
        phase: profile.goal, phaseName: `${profile.goal} Phase`,
        objective: `Optimize body composition through targeted ${profile.goal.toLowerCase()} protocols.`,
        week: 1, startDate: td,
        nextScanDate: (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
        macros, dailyTargets: { ...macros, steps: 8000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4 },
        trainDays: 4, sleepHrs: 8, waterL: 3, steps: 8000,
        weeklyMissions: [], whyThisWorks: '', dailyTips: [],
        startBF: 20, targetBF: profile.goal === 'Cut' ? 16 : 20, cardioDays: 2,
      };
      onComplete(profile, fallback);
    }
  };

  const macros = calcMacros({
    ...data, age: Number(data.age),
    weightLbs: data.unitSystem === 'metric' ? Number(data.weightKg || 0) * 2.20462 : Number(data.weightLbs || 0),
    heightIn: data.unitSystem === 'imperial'
      ? (Number(data.heightFt || 0) * 12) + Number(data.heightInch || 0)
      : Number(data.heightCm || 0) / 2.54,
  });

  /* ── Dot progress ── */
  const Dots = () => (
    <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 40 }}>
      {Array.from({ length: TOTAL }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 20 : 7, height: 7, borderRadius: 99,
          background: i <= step ? C.green : 'rgba(255,255,255,0.15)',
          transition: 'all .3s ease',
        }} />
      ))}
    </div>
  );

  /* ── AI label ── */
  const AILabel = () => (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 28, textAlign: 'center' }}>
      MASSIQ AI
    </div>
  );

  /* ── Shared question heading ── */
  const Q = ({ children }) => (
    <h1 style={{ fontSize: 28, fontWeight: 800, color: C.white, textAlign: 'center', lineHeight: 1.25, marginBottom: 40 }}>
      {children}
    </h1>
  );

  /* ── Shared AI "message" heading ── */
  const AiMsg = ({ children }) => (
    <h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, textAlign: 'center', lineHeight: 1.35, marginBottom: 36 }}>
      {children}
    </h1>
  );

  const stepContent = () => {
    switch (step) {

      /* ── 0: Name ── */
      case 0: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <Q>What should I call you?</Q>
          <input
            className="ob-input"
            autoFocus
            value={data.name}
            onChange={e => set('name', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && data.name.trim() && goNext()}
          />
        </div>
      );

      /* ── 1: Goal ── */
      case 1: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>Nice to meet you, {data.name}.<br />What are you trying to achieve?</AiMsg>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {GOALS.map(g => (
              <div key={g.key} className={`ob-card${data.goal === g.key ? ' selected' : ''}`}
                onClick={() => { set('goal', g.key); setTimeout(goNext, 200); }}
                style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>{g.emoji}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: data.goal === g.key ? C.green : C.white, marginBottom: 6 }}>{g.label}</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{g.desc}</div>
              </div>
            ))}
          </div>
        </div>
      );

      /* ── 2: Body Stats ── */
      case 2: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>To calculate your exact targets,<br />I need a few numbers.</AiMsg>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
            {[
              { key: 'imperial', label: 'Imperial (lb, ft/in)' },
              { key: 'metric', label: 'Metric (kg, cm)' },
            ].map(u => (
              <button
                key={u.key}
                className={`ob-chip${data.unitSystem === u.key ? ' selected' : ''}`}
                onClick={() => setUnitSystem(u.key)}
              >
                {u.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center', marginBottom: 8 }}>
                Weight ({data.unitSystem === 'metric' ? 'kg' : 'lb'})
              </div>
              <input
                type="number"
                className="ob-num-input"
                placeholder={data.unitSystem === 'metric' ? '84' : '185'}
                value={data.unitSystem === 'metric' ? data.weightKg : data.weightLbs}
                onChange={e => set(data.unitSystem === 'metric' ? 'weightKg' : 'weightLbs', e.target.value)}
              />
            </div>
            {data.unitSystem === 'metric' ? (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center', marginBottom: 8 }}>Height (cm)</div>
                <input type="number" className="ob-num-input" placeholder="178" value={data.heightCm} onChange={e => set('heightCm', e.target.value)} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center', marginBottom: 8 }}>Height (ft)</div>
                  <input type="number" className="ob-num-input" placeholder="5" value={data.heightFt} onChange={e => set('heightFt', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center', marginBottom: 8 }}>Height (in)</div>
                  <input type="number" className="ob-num-input" placeholder="10" value={data.heightInch} onChange={e => set('heightInch', e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center', marginBottom: 8 }}>Age</div>
            <input type="number" className="ob-num-input" placeholder="28" value={data.age} onChange={e => set('age', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {['Male', 'Female'].map(g => (
              <button key={g} className={`ob-chip${data.gender === g ? ' selected' : ''}`}
                style={{ fontSize: 15, padding: '12px 28px' }}
                onClick={() => set('gender', g)}>{g}</button>
            ))}
          </div>
        </div>
      );

      /* ── 3: Activity ── */
      case 3: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>How active are you<br />on a typical week?</AiMsg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ACTIVITIES.map(a => (
              <div key={a.key} className={`ob-activity-row${data.activity === a.key ? ' selected' : ''}`}
                onClick={() => { set('activity', a.key); setTimeout(goNext, 180); }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: data.activity === a.key ? C.green : C.white }}>{a.label}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{a.desc}</div>
                  <div style={{ fontSize: 12, color: C.dimmed, marginTop: 5 }}>{a.insight}</div>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${data.activity === a.key ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: data.activity === a.key ? C.green : C.dimmed, fontSize: 12, fontWeight: 700 }}>
                  {data.activity === a.key ? '✓' : '›'}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

      /* ── 4: Dietary ── */
      case 4: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>Any dietary restrictions<br />I should know about?</AiMsg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {DIET_PREFS.map(d => (
              <button key={d} className={`ob-chip${data.dietPrefs.includes(d) ? ' selected' : ''}`}
                onClick={() => toggleArr('dietPrefs', d)}>{d}</button>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <button className="ob-chip" onClick={goNext} style={{ color: C.muted, fontSize: 13 }}>Skip →</button>
          </div>
        </div>
      );

      /* ── 5: Cuisine ── */
      case 5: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>What cuisines do you enjoy?</AiMsg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {CUISINES.map(c => (
              <button key={c} className={`ob-chip${data.cuisines.includes(c) ? ' selected' : ''}`}
                onClick={() => toggleArr('cuisines', c)}>{c}</button>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <button className="ob-chip" onClick={goNext} style={{ color: C.muted, fontSize: 13 }}>Skip →</button>
          </div>
        </div>
      );

      /* ── 6: Foods to avoid ── */
      case 6: return (
        <div style={{ width: '100%' }}>
          <AILabel />
          <AiMsg>Anything you absolutely<br />don&apos;t eat?</AiMsg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
            {AVOID_FOODS.map(a => (
              <button key={a} className={`ob-chip${data.avoid.includes(a) ? ' selected' : ''}`}
                onClick={() => toggleArr('avoid', a)}>{a}</button>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <button className="ob-chip" onClick={goNext} style={{ color: C.muted, fontSize: 13 }}>Skip →</button>
          </div>
        </div>
      );

      /* ── 7: Calculating (auto) ── */
      case 7: return <CalcScreen />;

      /* ── 8: Ready ── */
      case 8: return (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <AILabel />
          <div style={{ fontSize: 52, marginBottom: 20 }}>🚀</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            Your profile is ready,<br />{data.name}.
          </h1>
          <p style={{ color: C.muted, marginBottom: 36, fontSize: 15 }}>Here&apos;s your baseline — we refine everything after your first scan.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36, textAlign: 'left' }}>
            {[
              { label: 'Goal',          value: data.goal,     unit: '' },
              { label: 'Daily Calories', value: macros?.calories, unit: 'kcal' },
              { label: 'Daily Protein',  value: macros?.protein,  unit: 'g' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.cardElevated, borderRadius: 14, padding: '14px 18px' }}>
                <span style={{ color: C.muted, fontSize: 14 }}>{row.label}</span>
                <span style={{ fontWeight: 700, fontSize: 18, color: C.green }}>
                  {typeof row.value === 'number'
                    ? <CountUp target={row.value} unit={row.unit} />
                    : row.value}
                </span>
              </div>
            ))}
          </div>
          <Btn onClick={() => { finish(); }} style={{ width: '100%', marginBottom: 14 }}>
            Start Your First Scan →
          </Btn>
          <Btn variant="ghost" onClick={finish} style={{ width: '100%' }}>
            Go to Home →
          </Btn>
        </div>
      );

      default: return null;
    }
  };

  if (generating) return <><style>{CSS}</style><PlanGeneratingScreen name={data.name} /></>;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulsing dot */}
      <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 10 }}>
        <div className="pulse-dot" />
      </div>

      <div className="ob-wrap" style={{ width: '100%', padding: '80px 24px 100px' }}>
        {step < 7 && <Dots />}

        <div className={visible ? 'ob-step' : 'ob-step-out'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {stepContent()}
        </div>

        {/* Bottom actions (not shown on auto-calc or goal/activity tap-to-advance) */}
        {step !== 7 && ![1, 3].includes(step) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 40, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            {step > 0 && (
              <Btn variant="ghost" onClick={goBack} style={{ flex: 1 }}>← Back</Btn>
            )}
            {step < 8 && step !== 4 && step !== 5 && step !== 6 && (
              <Btn onClick={goNext} disabled={!canNext} style={{ flex: 1 }}>
                Continue →
              </Btn>
            )}
            {step === 4 || step === 5 || step === 6 ? (
              <Btn onClick={goNext} style={{ flex: 1 }}>Continue →</Btn>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* Calculating screen (step 7) */
function CalcScreen() {
  const lines = [
    'Calculating your TDEE...',
    'Analyzing your goals...',
    'Building your baseline...',
    'Setting up your profile...',
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShown(s => Math.min(s + 1, lines.length)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: 'center', width: '100%' }}>
      <div style={{ position: 'relative', width: 90, height: 90, margin: '0 auto 32px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.greenBg}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🧬</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className="fi" style={{ fontSize: 15, color: i === shown - 1 ? C.white : C.muted, fontWeight: i === shown - 1 ? 600 : 400 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ─── Home Tab ───────────────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

// Unwrap tip strings that were stored as JSON from the old Claude-based system.
// e.g. '{"tip":"Adam, eat 800..."}' → 'Adam, eat 800...'
function safeTip(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const p = JSON.parse(trimmed);
    if (typeof p === 'object' && p !== null) {
      return String(p.tip || p.text || p.message || Object.values(p)[0] || raw);
    }
  } catch {}
  return trimmed;
}

function AIDailyTip({ profile, activePlan, todayMeals }) {
  const dayIdx  = new Date().getDay();
  // safeTip handles old cached JSON strings from the previous Claude-based system
  const planTip = safeTip(activePlan?.dailyTips?.[dayIdx] || activePlan?.dailyTips?.[0] || null);
  const cacheKey = `massiq:dailytip:${todayStr()}`;
  const [tip, setTip] = useState(() => planTip || safeTip(LS.get(cacheKey, null)));
  const [loading, setLoading] = useState(!planTip && !safeTip(LS.get(cacheKey, null)));
  useEffect(() => {
    if (!loading) return;
    let ok = true;
    generateDailyTip(profile, activePlan, todayMeals)
      .then(t => { if (ok) { setTip(t); LS.set(cacheKey, t); setLoading(false); } })
      .catch(() => { if (ok) { setTip('Stay consistent with your targets today.'); setLoading(false); } });
    return () => { ok = false; };
  }, []);
  if (loading) return <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 6 }} />;
  return <span>💡 {tip}</span>;
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
  const macros = getActiveTargets(activePlan, profile);
  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = LS.get(LS_KEYS.meals(today), []);
  const scanHistory = LS.get(LS_KEYS.scanHistory, []);
  const lastScan = scanHistory[scanHistory.length - 1];
  const trajectory = getTrajectoryStatus(scanHistory, activePlan?.phase || profile?.goal);
  const limiters = getPrimaryLimiters(lastScan, activePlan);
  const nextAction = activePlan?.weeklyMissions?.[0] || activePlan?.engineDiagnosis?.primary?.recommended_action || 'Complete your next scan to calibrate your weekly strategy.';
  const todayStats = todayMeals.reduce(
    (a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0) }),
    { calories: 0, protein: 0 }
  );

  const phase = activePlan?.phase || 'Foundation';
  const week  = activePlan?.week  || 1;

  return (
    <div className="screen">
      <h1 className="screen-title">Today</h1>

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
          {/* ── Command center hero ── */}
          <Card className="su glass" style={{ background: '#17271E', border: `1px solid ${C.greenDim}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 620 }}>Good {getGreeting()}, {profile?.name || 'there'}.</div>
              <StatusPill tone={trajectory.tone === 'good' ? 'good' : trajectory.tone === 'warn' ? 'warn' : 'neutral'} label={trajectory.label} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.green}` }}>
                {PHASE_META[phase]?.emoji || '🎯'} {phase}
              </span>
              <span style={{ fontSize: 12, color: C.muted }}>Week {week} of 12</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, marginBottom: 16 }}>{trajectory.note}</p>

            <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Primary limiter</div>
              <div style={{ fontSize: 13, color: C.white, lineHeight: 1.45 }}>{limiters[0]}</div>
            </div>
            <div style={{ marginBottom: 18, padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>This week’s priority</div>
              <div style={{ fontSize: 13, color: C.white, lineHeight: 1.45 }}>{nextAction}</div>
            </div>

            <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              {[
                { label: 'Body Fat', value: lastScan?.bodyFat ? fmt.pct(lastScan.bodyFat, 1) : '—', unit: '' },
                { label: 'Lean Mass', value: lastScan?.leanMass ? fmt.leanMass(lastScan.leanMass, profile?.unitSystem) : '—', unit: '' },
                { label: 'Next Scan', value: fmt.date(activePlan?.nextScanDate), unit: '' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  flex: 1, textAlign: 'center',
                  borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                }}>
                <div className="metric" style={{ fontSize: 18, color: C.white }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{s.unit}</div>
                  <div style={{ fontSize: 11, color: C.dimmed, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13, color: C.green, marginTop: 16, lineHeight: 1.5 }}>
              <AIDailyTip profile={profile} activePlan={activePlan} todayMeals={todayMeals} />
            </p>
          </Card>

          {/* ── Phase card ── */}
          <Card className="su glass" style={{ animationDelay: '.05s' }}>
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
          <Card className="su glass" style={{ animationDelay: '.1s' }}>
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

          {/* ── Today's Workout ── */}
          <TodayWorkoutCard />
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

/* ─── AI Suggestions Hook ───────────────────────────────────────────────── */
function useAISuggestions(profile, activePlan, meals) {
  const cacheKey = `massiq:suggestions:${hourKey()}`;
  const [reloadKey, setReloadKey] = useState(0);
  const cached = SS.get(cacheKey, null);
  const hasCached = Array.isArray(cached) && cached.length > 0;
  const [suggestions, setSuggestions] = useState(hasCached ? cached : null);
  const [loading,     setLoading]     = useState(!hasCached);
  const [error,       setError]       = useState('');
  const buildFallbackSuggestions = () => {
    const m = getActiveTargets(activePlan, profile);
    const eaten = (meals || []).reduce((a, meal) => ({ calories: a.calories + (meal.calories || 0), protein: a.protein + (meal.protein || 0) }), { calories: 0, protein: 0 });
    const cals = Math.max(600, Number(m.calories || 2000) - eaten.calories);
    const prot = Math.max(45, Number(m.protein || 150) - eaten.protein);
    const phase = profile?.goal || activePlan?.phase || 'Maintain';
    const mealsByPhase = {
      Cut: [
        { name: 'Chicken + greens bowl', icon: '🥗', ratio: 0.28 },
        { name: 'Greek yogurt protein snack', icon: '🥣', ratio: 0.16 },
        { name: 'Salmon + vegetables plate', icon: '🐟', ratio: 0.33 },
      ],
      Bulk: [
        { name: 'Rice + lean beef bowl', icon: '🍚', ratio: 0.34 },
        { name: 'Oats + whey + berries', icon: '🥣', ratio: 0.22 },
        { name: 'Pasta + chicken plate', icon: '🍝', ratio: 0.36 },
      ],
      Recomp: [
        { name: 'Egg + toast breakfast plate', icon: '🍳', ratio: 0.25 },
        { name: 'Turkey rice bowl', icon: '🍲', ratio: 0.3 },
        { name: 'Steak + potato dinner', icon: '🥩', ratio: 0.32 },
      ],
      Maintain: [
        { name: 'Balanced protein bowl', icon: '🍱', ratio: 0.3 },
        { name: 'High-protein wrap', icon: '🌯', ratio: 0.24 },
        { name: 'Fish + grains plate', icon: '🐟', ratio: 0.31 },
      ],
    }[phase] || [];
    return mealsByPhase.map((x, i) => {
      const mealCal = Math.round(cals * x.ratio);
      const mealProt = Math.max(18, Math.round(prot * 0.34));
      return {
        id: `fb${i + 1}`,
        time: i === 0 ? 'Lunch' : i === 1 ? 'Snack' : 'Dinner',
        icon: x.icon,
        name: x.name,
        calories: mealCal,
        protein: mealProt,
        carbs: Math.max(12, Math.round((mealCal * 0.4) / 4)),
        fat: Math.max(6, Math.round((mealCal * 0.3) / 9)),
        whyNow: 'Generated from your active phase targets while live suggestions refresh.',
      };
    });
  };
  useEffect(() => {
    if (hasCached && reloadKey === 0) { setLoading(false); return; }
    let ok = true;
    setLoading(true);
    setError('');
    const run = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const data = await generateSuggestions(profile, activePlan, meals);
          const targets = getActiveTargets(activePlan, profile);
          const normalized = Array.isArray(data)
            ? data.map((s, i) => sanitizeMeal(s, targets, profile, i)).filter(Boolean)
            : [];
          if (normalized.length) {
            if (!ok) return;
            setSuggestions(normalized);
            SS.set(cacheKey, normalized);
            setLoading(false);
            return;
          }
        } catch {}
      }
      if (!ok) return;
      const fallback = buildFallbackSuggestions();
      setSuggestions(fallback);
      setError('Using baseline nutrition structure for your current phase.');
      setLoading(false);
    };
    run();
    return () => { ok = false; };
  }, [reloadKey, hasCached]);
  return { suggestions: suggestions || [], loading, error, retry: () => setReloadKey(v => v + 1) };
}

/* Log Meal Modal */
function LogMealModal({ onClose, onAdd, macros, profile }) {
  const [aiTab,     setAiTab]     = useState('describe');
  const [descText,  setDescText]  = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [form,    setForm]    = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('Lunch');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const analyzeText = async () => {
    if (!descText.trim()) return;
    if (!ENABLE_NON_SCAN_AI) {
      setError('Auto meal analysis is unavailable in this release. Enter values manually.');
      return;
    }
    setAnalyzing(true); setError('');
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Analyze nutrition for: ${descText}. Goal: ${profile?.goal||'general fitness'}. Return ONLY valid JSON: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"comment":"one personalized sentence about this meal for their goal"}`,
          }],
          max_tokens: 200,
        }),
      });
      const { text } = await res.json();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const raw = JSON.parse(match[0]);
        const d = sanitizeMeal(raw, macros, profile);
        setForm({ name: d?.name || descText, calories: String(d?.calories || ''), protein: String(d?.protein || ''), carbs: String(d?.carbs || ''), fat: String(d?.fat || '') });
        setComment(raw?.comment || '');
      }
    } catch { setError('Analysis failed — fill in manually.'); }
    setAnalyzing(false);
  };

  const analyzePhoto = (file) => {
    if (!file) return;
    if (!ENABLE_NON_SCAN_AI) {
      setError('Photo meal analysis is unavailable in this release. Enter values manually.');
      return;
    }
    setAnalyzing(true); setError('');
    const reader = new FileReader();
    reader.onerror = () => { setError('Could not read image file.'); setAnalyzing(false); };
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
                { type: 'text', text: `Identify this food and return ONLY valid JSON: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"comment":"one personalized sentence about this meal for their ${profile?.goal||'fitness'} goal"}` },
              ],
            }],
            max_tokens: 200,
          }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const { text, error: apiErr } = await res.json();
        if (apiErr) throw new Error(apiErr);
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const raw = JSON.parse(match[0]);
          const d = sanitizeMeal(raw, macros, profile);
          setForm({ name: d?.name || 'Food', calories: String(d?.calories || ''), protein: String(d?.protein || ''), carbs: String(d?.carbs || ''), fat: String(d?.fat || '') });
          setComment(raw?.comment || '');
        }
      } catch (err) {
        console.error('Photo analysis error:', err);
        setError('Photo analysis failed — fill in manually.');
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
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
    const safeMeal = sanitizeMeal(meal, macros, profile);
    LS.set(LS_KEYS.meals(today), [...meals, safeMeal]);
    onAdd(safeMeal);
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

          {comment && (
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenDim}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.green, lineHeight: 1.5 }}>
              💬 {comment}
            </div>
          )}

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

/* ─── Countdown Timer ────────────────────────────────────────────────────── */
function CountdownTimer({ seconds, onComplete }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(ref.current);
          setRunning(false);
          try { navigator.vibrate(200); } catch {}
          onComplete?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [running]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = seconds > 0 ? remaining / seconds : 0;
  const deg = Math.round(pct * 360);

  const handleTap = () => {
    if (remaining === 0) { setRemaining(seconds); setRunning(false); }
    else setRunning(r => !r);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="bp" onClick={handleTap} style={{
        width: 58, height: 58, borderRadius: '50%', position: 'relative', cursor: 'pointer',
        background: `conic-gradient(${remaining === 0 ? C.green : running ? C.orange : C.blue} ${deg}deg, rgba(255,255,255,0.07) ${deg}deg)`,
      }}>
        <div style={{
          position: 'absolute', inset: 6, borderRadius: '50%', background: C.card,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: remaining === 0 ? C.green : C.white }}>
            {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 9, color: C.muted }}>
        {remaining === 0 ? '✓ done' : running ? 'pause' : 'start'}
      </span>
    </div>
  );
}

/* ─── Exercise Card ──────────────────────────────────────────────────────── */
function ExerciseCard({ ex, exIdx, completedSets, onToggleSet }) {
  const [showTips, setShowTips] = useState(false);
  const sets = ex.sets || 3;
  const doneSets = Array.from({ length: sets }).filter((_, si) => completedSets[`${exIdx}-${si}`]).length;
  const allDone = doneSets === sets;

  return (
    <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${allDone ? C.greenDim : C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3, color: allDone ? C.muted : C.white }}>{ex.name}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.green, lineHeight: 1 }}>
            {ex.sets}×{ex.reps}
          </div>
        </div>
        {ex.rest && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.04em' }}>Rest</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{ex.rest}</div>
          </div>
        )}
      </div>
      {ex.weight && (
        <div style={{ fontSize: 12, color: C.blue, marginBottom: 10 }}>⚖️ {ex.weight}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: ex.technique ? 10 : 0 }}>
        {Array.from({ length: sets }).map((_, si) => {
          const done = completedSets[`${exIdx}-${si}`];
          return (
            <div key={si} className="bp" onClick={() => onToggleSet(exIdx, si)} style={{
              width: 36, height: 36, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${done ? C.green : C.dimmed}`,
              background: done ? C.greenBg : 'transparent',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              color: done ? C.green : C.dimmed,
            }}>
              {done ? '✓' : si + 1}
            </div>
          );
        })}
      </div>
      {ex.technique && (
        <>
          <button className="bp" onClick={() => setShowTips(s => !s)} style={{
            background: 'none', border: 'none', color: C.dimmed, fontSize: 11, cursor: 'pointer', padding: '4px 0',
          }}>
            {showTips ? '▲ Hide form tips' : '▼ Show form tips'}
          </button>
          {showTips && (
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 6, padding: '8px 10px', background: C.cardElevated, borderRadius: 8 }}>
              {ex.technique}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Recipe Detail Modal ────────────────────────────────────────────────── */
function RecipeModal({ meal, profile, onClose, onLog, onSwap }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState({});
  const mealType = meal.mealType || meal.time || meal.category || 'Meal';

  useEffect(() => {
    const key = `massiq:recipe:${meal.name}`;
    const cached = SS.get(key, null);
    if (cached) { setDetails(cached); setLoading(false); return; }
    let ok = true;
    generateRecipeDetails(meal, profile)
      .then(d => { if (ok) { setDetails(d); SS.set(key, d); setLoading(false); } })
      .catch(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [meal.name]);

  return (
    <div className="fi" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div className="su" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: C.bg, borderRadius: '24px 24px 0 0',
        maxHeight: '92dvh', overflowY: 'auto',
        border: `1px solid ${C.border}`,
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>
        <div style={{ padding: '8px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${C.greenDim}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {mealType}
            </span>
            <button className="bp" onClick={onClose} style={{ background: C.cardElevated, border: 'none', color: C.muted, width: 32, height: 32, borderRadius: '50%', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{meal.name}</h2>
          {(meal.description || meal.whyNow || meal.whyThisMeal) && (
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
              {meal.description || meal.whyNow || meal.whyThisMeal}
            </p>
          )}
          {/* 2×2 macro grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Calories', value: meal.calories || 0, unit: 'kcal', color: C.orange },
              { label: 'Protein',  value: meal.protein  || 0, unit: 'g',    color: C.blue },
              { label: 'Carbs',    value: meal.carbs    || 0, unit: 'g',    color: C.gold },
              { label: 'Fat',      value: meal.fat      || 0, unit: 'g',    color: C.muted },
            ].map(t => (
              <div key={t.label} style={{ background: C.card, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: t.color, lineHeight: 1.2 }}>{t.value}</div>
                <div style={{ fontSize: 11, color: C.dimmed }}>{t.unit}</div>
              </div>
            ))}
          </div>
          {meal.prepTime && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>⏱ {meal.prepTime}</div>
          )}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Loading recipe details...</div>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10 }} />)}
            </div>
          ) : details ? (
            <>
              {details.ingredients?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Ingredients</div>
                  {details.ingredients.map((ing, i) => (
                    <div key={i} className="bp" onClick={() => setChecked(p => ({...p, [i]: !p[i]}))} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px',
                      borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${checked[i] ? C.green : C.dimmed}`,
                        background: checked[i] ? C.greenBg : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked[i] && <span style={{ fontSize: 12, color: C.green }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: checked[i] ? C.dimmed : C.white, textDecoration: checked[i] ? 'line-through' : 'none' }}>
                        {ing}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {details.steps?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Instructions</div>
                  {details.steps.map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 12, marginBottom: 12, padding: '12px 14px',
                      background: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        background: C.greenBg, border: `1px solid ${C.greenDim}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: C.green,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, lineHeight: 1.5, color: C.white, marginBottom: step.timerSeconds > 0 ? 12 : 0 }}>
                          {step.text}
                        </p>
                        {step.timerSeconds > 0 && (
                          <CountdownTimer seconds={step.timerSeconds} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0 24px', color: C.muted, fontSize: 13 }}>
              Could not load recipe details.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
            <Btn onClick={onLog} style={{ flex: 1 }}>✓ Log This Meal</Btn>
            <Btn onClick={onSwap} variant="outline" style={{ flex: 1 }}>↺ Swap</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Workout Detail Modal ───────────────────────────────────────────────── */
function WorkoutModal({ workout, onClose, onFinish }) {
  const [completedSets, setCompletedSets] = useState({});
  const [restTimer, setRestTimer] = useState(null);
  const [showWarmup, setShowWarmup] = useState(false);

  const parseRestSecs = (s) => {
    if (!s) return 0;
    const m = s.match(/(\d+)\s*s/i); if (m) return parseInt(m[1]);
    const m2 = s.match(/(\d+)\s*min/i); if (m2) return parseInt(m2[1]) * 60;
    return 90;
  };

  const handleToggleSet = (exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const isNowDone = !completedSets[key];
    setCompletedSets(p => ({ ...p, [key]: isNowDone }));
    if (isNowDone) {
      const ex = workout.exercises?.[exIdx];
      const secs = parseRestSecs(ex?.rest);
      if (secs > 0) setRestTimer({ exIdx, restSeconds: secs });
    }
  };

  const totalSets = (workout.exercises || []).reduce((a, ex) => a + (ex.sets || 3), 0);
  const doneSets = Object.values(completedSets).filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  return (
    <div className="fi" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div className="su" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: C.bg, borderRadius: '24px 24px 0 0',
        maxHeight: '92dvh', overflowY: 'auto',
        border: `1px solid ${C.border}`,
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>
        <div style={{ padding: '8px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              <span style={{ background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${C.greenDim}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {workout.workoutType || 'Workout'}
              </span>
              {(workout.focus || []).slice(0, 3).map(f => (
                <span key={f} style={{ background: 'rgba(74,158,255,0.1)', color: C.blue, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: `1px solid rgba(74,158,255,0.2)` }}>
                  {f}
                </span>
              ))}
            </div>
            <button className="bp" onClick={onClose} style={{ background: C.cardElevated, border: 'none', color: C.muted, width: 32, height: 32, borderRadius: '50%', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>×</button>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{workout.day}'s Workout</h2>
          {workout.duration && <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>⏱ {workout.duration}</p>}
          {totalSets > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 6 }}>
                <span>{doneSets}/{totalSets} sets</span>
                <span style={{ color: C.green, fontWeight: 600 }}>{pct}%</span>
              </div>
              <ProgressBar value={doneSets} max={totalSets} color={C.green} />
            </div>
          )}
          {workout.warmup && (
            <div style={{ marginBottom: 14 }}>
              <button className="bp" onClick={() => setShowWarmup(s => !s)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: C.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>🔥 Warmup</span>
                <span style={{ fontSize: 11, color: C.muted }}>{showWarmup ? '▲' : '▼'}</span>
              </button>
              {showWarmup && (
                <div style={{ background: C.card, borderRadius: '0 0 12px 12px', padding: '8px 14px 14px', border: `1px solid ${C.border}`, borderTop: 'none', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                  {workout.warmup}
                </div>
              )}
            </div>
          )}
          {restTimer && (
            <div style={{ background: '#1A2E1A', border: `1px solid ${C.greenDim}`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
              <CountdownTimer seconds={restTimer.restSeconds} onComplete={() => setRestTimer(null)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Rest Period</div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Next: {workout.exercises?.[restTimer.exIdx + 1]?.name || 'you\'re done!'}
                </div>
              </div>
              <button className="bp" onClick={() => setRestTimer(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 4 }}>×</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {(workout.exercises || []).map((ex, exIdx) => (
              <ExerciseCard key={exIdx} ex={ex} exIdx={exIdx} completedSets={completedSets} onToggleSet={handleToggleSet} />
            ))}
          </div>
          {workout.cooldown && (
            <div style={{ background: C.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${C.border}`, marginBottom: 18, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              ❄️ <span style={{ fontWeight: 600, color: C.white }}>Cooldown:</span> {workout.cooldown}
            </div>
          )}
          <Btn onClick={() => { onFinish?.(); onClose(); }} style={{ width: '100%' }}>
            {pct === 100 ? '🏆 Workout Complete!' : `Finish Workout (${pct}% done)`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Today's Workout Card (used in HomeTab) ─────────────────────────────── */
function TodayWorkoutCard() {
  const [showModal, setShowModal] = useState(false);
  const workoutPlan = LS.get(LS_KEYS.workoutplan, null);
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayWorkout = Array.isArray(workoutPlan) ? workoutPlan.find(w => w.day === dayName) : null;

  if (!todayWorkout) return null;

  if (!todayWorkout.isTrainingDay) {
    return (
      <Card className="su" style={{ animationDelay: '.15s', opacity: 0.75 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>😴</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Rest Day</div>
            <div style={{ fontSize: 13, color: C.muted }}>Recovery is part of the process.</div>
          </div>
        </div>
      </Card>
    );
  }

  const exCount = todayWorkout.exercises?.length || 0;
  return (
    <>
      <div className="su bp" onClick={() => setShowModal(true)} style={{ animationDelay: '.15s', cursor: 'pointer' }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Today's Workout
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{todayWorkout.workoutType}</div>
              </div>
              <span style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenDim}`, borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                Start →
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {(todayWorkout.focus || []).map(f => (
                <span key={f} style={{ background: 'rgba(74,158,255,0.1)', color: C.blue, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, border: `1px solid rgba(74,158,255,0.2)` }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {exCount > 0 && <span>🏋️ {exCount} exercises</span>}
            {todayWorkout.duration && <span>⏱ {todayWorkout.duration}</span>}
          </div>
        </Card>
      </div>
      {showModal && (
        <WorkoutModal
          workout={todayWorkout}
          onClose={() => setShowModal(false)}
          onFinish={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/* Main Nutrition Tab */
function NutritionTab({ profile, activePlan, showToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const [meals,        setMeals]        = useState(() => LS.get(LS_KEYS.meals(today), []));
  const [showModal,    setShowModal]    = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [swappingId,   setSwappingId]   = useState(null);
  const { suggestions: rawSuggestions, loading: suggestionsLoading, error: suggestionsError, retry: retrySuggestions } = useAISuggestions(profile, activePlan, meals);
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => { if (rawSuggestions.length > 0) setSuggestions(rawSuggestions); }, [rawSuggestions.length]);

  const macros = getActiveTargets(activePlan, profile);

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
    const meal = sanitizeMeal({ id: Date.now(), name: s.name, category: s.time, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat }, macros, profile);
    const updated = [...meals, meal];
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
  };

  const handleLogMeal = (m) => {
    const meal = sanitizeMeal({ id: Date.now(), name: m.name, category: m.mealType || m.time || m.category || 'Meal', calories: m.calories || 0, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0 }, macros, profile);
    const updated = [...meals, meal];
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
    setSelectedMeal(null);
    showToast?.('✓ Meal logged');
  };

  const handleSwapSuggestion = async (s) => {
    setSwappingId(s.id);
    try {
      const newMeal = await swapMealAPI(s, profile, activePlan);
      const safeMeal = sanitizeMeal(newMeal, macros, profile) || newMeal;
      setSuggestions(prev => prev.map(sg => sg.id === s.id ? { ...sg, ...safeMeal, id: s.id, icon: safeMeal.icon || sg.icon } : sg));
      showToast?.('✓ Meal swapped');
    } catch (err) {
      console.error('Swap failed:', err);
    }
    setSwappingId(null);
  };

  const remaining = Math.max(0, macros.calories - totals.calories);

  return (
    <div className="screen">
      <h1 className="screen-title">Nutrition</h1>

      {/* ── Macro rings ── */}
      <Card className="su glass">
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
        <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
          {profile?.goal === 'Bulk'
            ? 'Calories are set above maintenance to support lean mass gain while keeping fat gain controlled.'
            : profile?.goal === 'Cut'
              ? 'Calories are set below maintenance with high protein to support fat loss while preserving muscle.'
              : 'Targets are calibrated around maintenance with phase-aware protein and recovery floors.'}
        </div>
      </Card>

      {/* ── Daily Suggestions ── */}
      <div className="su" style={{ animationDelay: '.05s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Today's Suggestions</div>
        {suggestionsError && (
          <div style={{ marginBottom: 10, background: `${C.gold}14`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ color: C.gold, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{suggestionsError}</div>
            <button className="bp" onClick={retrySuggestions} style={{ fontSize: 12, color: C.white, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 10px' }}>
              Refresh recommendations
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {suggestionsLoading ? (
            [1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ flexShrink: 0, width: 180, height: 220, borderRadius: 18 }} />
            ))
          ) : suggestions.map(s => {
            const isSwapping = swappingId === s.id;
            return (
              <div key={s.id} style={{
                background: C.card, borderRadius: 16, padding: 15,
                border: `1px solid ${isSwapping ? C.greenDim : C.border}`, flexShrink: 0, width: 180,
                display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                opacity: isSwapping ? 0.6 : 1, transition: 'opacity .2s ease',
              }}>
                {/* swap button */}
                <button className="bp" onClick={() => !isSwapping && handleSwapSuggestion(s)} style={{
                  position: 'absolute', top: 10, right: 10, background: C.cardElevated,
                  border: `1px solid ${C.border}`, color: C.muted, width: 26, height: 26,
                  borderRadius: '50%', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1,
                }}>
                  {isSwapping ? <span style={{ fontSize: 10, animation: 'spin .8s linear infinite', display: 'inline-block' }}>⟳</span> : '↺'}
                </button>
                {/* card body — tap to open recipe */}
                <div className="bp" onClick={() => setSelectedMeal({ ...s, mealType: s.time })} style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', flex: 1 }}>
                  <div style={{ fontSize: 28 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, color: C.green, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.time}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 4, paddingRight: 24 }}>{s.name}</div>
                    {s.whyNow && <div style={{ fontSize: 11, color: C.green, lineHeight: 1.4, marginBottom: 6, fontStyle: 'italic' }}>{s.whyNow}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
                </div>
                <button className="bp" onClick={() => logSuggestion(s)} style={{
                  width: '100%', padding: '9px 0', borderRadius: 11, marginTop: 'auto',
                  background: C.greenBg, color: C.green, border: `1px solid ${C.greenDim}`,
                  fontSize: 12, fontWeight: 620, cursor: 'pointer',
                }}>+ Log</button>
              </div>
            );
          })}
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
              <div key={m.id} className="bp" onClick={() => setSelectedMeal({ ...m, mealType: m.category || 'Meal' })} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: C.card, borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${C.border}`, cursor: 'pointer',
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
                  <button className="bp" onClick={e => { e.stopPropagation(); deleteMeal(m.id); }} style={{
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
          profile={profile}
        />
      )}

      {selectedMeal && (
        <RecipeModal
          meal={selectedMeal}
          profile={profile}
          onClose={() => setSelectedMeal(null)}
          onLog={() => handleLogMeal(selectedMeal)}
          onSwap={() => {
            const sg = suggestions.find(s => s.name === selectedMeal.name);
            setSelectedMeal(null);
            if (sg) handleSwapSuggestion(sg);
          }}
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

function PlanTab({ profile, activePlan, setTab, showToast }) {
  const weekKey = getWeekKey();
  const [selectedMeal,  setSelectedMeal]  = useState(null);
  const [swappingKey,   setSwappingKey]   = useState(null);
  const [detailView,    setDetailView]    = useState(null);
  const [mealPlanDays,  setMealPlanDays]  = useState(() => {
    const stored = LS.get(LS_KEYS.mealplan, null);
    return stored?.days || null;
  });
  const [activeDayIdx,  setActiveDayIdx]  = useState(() => {
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const idx = (mealPlanDays || []).findIndex(d => d.day === todayName);
    return idx >= 0 ? idx : 0;
  });
  const [loggedMeals,   setLoggedMeals]   = useState(() => LS.get(LS_KEYS.logged(todayStr()), {}));
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
      <div className="screen">
        <h1 className="screen-title">Your Plan</h1>
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
  const macros      = getActiveTargets(activePlan, profile);
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
  const scanHistory = LS.get(LS_KEYS.scanHistory, []);
  const currentScan = scanHistory[scanHistory.length - 1];
  const previousScan = scanHistory[scanHistory.length - 2];
  const trajectory = getTrajectoryStatus(scanHistory, phase);
  const focusAreas = getPrimaryLimiters(currentScan, activePlan);
  const bfDelta = (currentScan && previousScan) ? Number(currentScan.bodyFat || 0) - Number(previousScan.bodyFat || 0) : null;
  const lmDelta = (currentScan && previousScan) ? Number(currentScan.leanMass || 0) - Number(previousScan.leanMass || 0) : null;
  const coachingNote = trajectory.tone === 'good'
    ? 'Progress is aligned with current phase. Keep training execution consistent.'
    : trajectory.tone === 'warn'
      ? 'Trajectory needs adjustment this week. Prioritize adherence and tighten recovery consistency.'
      : 'Signal is still early. Keep execution stable and confirm trend on next scan.';
  const thisWeekChecklist = [
    `Calories: ${macros.calories || 2000} kcal/day`,
    `Protein: ${macros.protein || 150} g/day`,
    `Steps/Cardio: ${steps.toLocaleString()} steps + ${cardioDays} cardio sessions`,
    `Training: ${trainDays} strength sessions`,
    `Recovery: ${sleepHrs} h sleep + ${waterL} L water daily`,
  ];
  const workoutDays = LS.get(LS_KEYS.workoutplan, []) || [];

  return (
    <div className="screen">
      <h1 className="screen-title">Your Plan</h1>

      {/* 1 ── Phase Hero ── */}
      <div className="su">
        <SummaryCard
          label={`Plan Summary · Week ${week} of 12`}
          title={`${PHASE_META[phase]?.label || phase} Phase`}
          subtitle={`${phasePct}% complete → next review ${fmt.date(nextScanDate)}`}
          progressPct={phasePct}
          tone={phaseColor}
          metrics={[
            { label: 'Body Fat', value: `${startBF}% → ${targetBF}%` },
            { label: 'Training', value: `${trainDays} sessions` },
            { label: 'Cardio', value: `${cardioDays} sessions` },
            { label: 'Sleep', value: `${sleepHrs} h` },
          ]}
          insight={objective || PHASE_META[phase]?.target}
          nextStep={trajectory.note}
        />
      </div>

      {/* 2 ── This Week (decision layer) ── */}
      <Card className="su" style={{ animationDelay: '.02s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>This Week</span>
          <StatusPill tone={trajectory.tone === 'good' ? 'good' : trajectory.tone === 'warn' ? 'warn' : 'neutral'} label={trajectory.label} />
        </div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {thisWeekChecklist.map((line) => (
            <div key={line} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.white }}>
              <span style={{ color: C.green, marginTop: 1 }}>•</span>
              <span style={{ lineHeight: 1.5 }}>{line}</span>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Coaching note</div>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{coachingNote}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { key: 'workout', label: 'Workout Plan' },
            { key: 'cardio', label: 'Cardio Structure' },
            { key: 'nutrition', label: 'Nutrition Guide' },
          ].map((item) => (
            <button key={item.key} className="bp" onClick={() => setDetailView(item.key)} style={{ fontSize: 12, fontWeight: 620, borderRadius: 10, border: `1px solid ${C.border}`, background: C.cardElevated, color: C.white, padding: '9px 8px' }}>
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {/* 3 ── Focus Areas ── */}
      <Card className="su" style={{ animationDelay: '.03s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Focus Areas</div>
        <div style={{ display: 'grid', gap: 9 }}>
          {focusAreas.slice(0, 3).map((f, idx) => (
            <div key={`${f}-${idx}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
              <span style={{ fontSize: 13, color: C.white, lineHeight: 1.45 }}>{f}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 2 ── Transformation Timeline ── */}
      <Card className="su" style={{ animationDelay: '.04s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Transformation Timeline</span>
          <span style={{ fontSize: 12, color: C.muted }}>{daysLeft} days to next review</span>
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

      {/* 2.5 ── Progress Update ── */}
      <Card className="su" style={{ animationDelay: '.05s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Progress Since Last Scan</span>
          <span style={{ fontSize: 11, color: C.muted }}>{scanHistory.length > 1 ? `${fmt.date(previousScan?.date)} → ${fmt.date(currentScan?.date)}` : 'Awaiting comparison'}</span>
        </div>
        {scanHistory.length > 1 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Body Fat Change</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (bfDelta || 0) <= 0 ? C.green : C.orange }}>
                {(bfDelta || 0) > 0 ? '+' : ''}{(bfDelta || 0).toFixed(1)}%
              </div>
            </div>
            <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Lean Mass Change</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (lmDelta || 0) >= 0 ? C.green : C.orange }}>
                {(lmDelta || 0) >= 0 ? '+' : ''}{(lmDelta || 0).toFixed(1)} lb
              </div>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>You need at least two scans to quantify trend and adaptation impact.</p>
        )}
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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Today&apos;s Execution Targets</div>
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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>This Week&apos;s Priorities</div>
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
            <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{fmt.date(nextScanDate)}</div>
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

      {/* 8 ── Weekly Meal Plan ── */}
      {mealPlanDays && (
        <div className="su" style={{ animationDelay: '.28s' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Weekly Meal Plan</div>

          {/* Day tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
            {mealPlanDays.map((d, i) => (
              <button key={i} className="bp" onClick={() => setActiveDayIdx(i)} style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 99, border: `1.5px solid ${activeDayIdx === i ? C.green : C.border}`,
                background: activeDayIdx === i ? C.greenBg : 'transparent',
                color: activeDayIdx === i ? C.green : C.muted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {d.day.slice(0, 3)}
                {d.isTrainingDay && <span style={{ marginLeft: 4, fontSize: 10 }}>💪</span>}
              </button>
            ))}
          </div>

          {/* Active day meals */}
          {(() => {
            const day = mealPlanDays[activeDayIdx];
            if (!day) return null;
            const today2 = todayStr();
            const MEAL_KEYS = [
              { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
              { key: 'lunch',     label: 'Lunch',     icon: '☀️' },
              { key: 'dinner',    label: 'Dinner',    icon: '🌙' },
              { key: 'snack',     label: 'Snack',     icon: '🍎' },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MEAL_KEYS.map(({ key, label, icon }) => {
                  const meal = day[key];
                  if (!meal || !meal.name) return null;
                  const logKey = `${day.day}-${key}`;
                  const isLogged = loggedMeals[logKey];
                  const isSwapping = swappingKey === logKey;
                  return (
                    <div key={key} style={{
                      background: C.card, borderRadius: 16, padding: 14,
                      border: `1px solid ${isLogged ? C.greenDim : C.border}`,
                      opacity: isSwapping ? 0.6 : 1, transition: 'opacity .2s ease',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, background: C.cardElevated,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                        }}>{icon}</div>
                        <div className="bp" onClick={() => setSelectedMeal({ ...meal, mealType: label })} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                          <div style={{ fontSize: 10, color: C.green, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{meal.name}</div>
                          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: C.muted }}>
                            <span style={{ color: C.orange }}>{meal.calories} kcal</span>
                            <span>P {meal.protein}g</span>
                            <span>C {meal.carbs}g</span>
                            <span>F {meal.fat}g</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {/* Swap button */}
                          <button className="bp" onClick={async () => {
                            if (isSwapping) return;
                            setSwappingKey(logKey);
                            try {
                              const newMeal = await swapMealAPI({ ...meal, mealType: label }, profile, activePlan);
                              const updated = mealPlanDays.map((d2, i2) => {
                                if (i2 !== activeDayIdx) return d2;
                                return { ...d2, [key]: { ...d2[key], ...newMeal } };
                              });
                              setMealPlanDays(updated);
                              const stored = LS.get(LS_KEYS.mealplan, {});
                              LS.set(LS_KEYS.mealplan, { ...stored, days: updated });
                              showToast?.('✓ Meal swapped');
                            } catch { showToast?.('Swap failed'); }
                            setSwappingKey(null);
                          }} style={{
                            background: C.cardElevated, border: `1px solid ${C.border}`, color: C.muted,
                            width: 28, height: 28, borderRadius: '50%', fontSize: 13, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isSwapping ? <span style={{ fontSize: 10, animation: 'spin .8s linear infinite', display: 'inline-block' }}>⟳</span> : '↺'}
                          </button>
                          {/* Log button */}
                          <button className="bp" onClick={() => {
                            if (isLogged) return;
                            const todayMeals = LS.get(LS_KEYS.meals(today2), []);
                            const entry = { id: Date.now(), name: meal.name, category: label, calories: meal.calories || 0, protein: meal.protein || 0, carbs: meal.carbs || 0, fat: meal.fat || 0 };
                            LS.set(LS_KEYS.meals(today2), [...todayMeals, entry]);
                            const updated = { ...loggedMeals, [logKey]: true };
                            setLoggedMeals(updated);
                            LS.set(LS_KEYS.logged(today2), updated);
                            showToast?.('✓ Logged');
                          }} style={{
                            background: isLogged ? C.greenBg : C.cardElevated,
                            border: `1px solid ${isLogged ? C.greenDim : C.border}`,
                            color: isLogged ? C.green : C.muted,
                            padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isLogged ? 'default' : 'pointer',
                          }}>
                            {isLogged ? '✓' : 'Log'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {detailView === 'workout' && (
        <DetailSheet
          title="Weekly Workout Structure"
          subtitle="Phase-aligned split based on your current plan and training frequency."
          onClose={() => setDetailView(null)}
        >
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(workoutDays.length ? workoutDays : []).map((day, idx) => (
                <div key={`${day.day}-${idx}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: day.isTrainingDay ? C.cardElevated : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{day.day} · {day.workoutType}</div>
                    <span style={{ fontSize: 11, color: day.isTrainingDay ? C.green : C.muted }}>{day.duration}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{day.focus?.join(' • ') || 'Recovery focus'}</div>
                  {day.isTrainingDay ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {(day.exercises || []).slice(0, 5).map((ex) => (
                        <div key={ex.name} style={{ fontSize: 12, color: C.white, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{ex.name}</span>
                          <span style={{ color: C.muted }}>{ex.sets}×{ex.reps}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Recovery day. Optional low-intensity walk and mobility work.</div>
                  )}
                </div>
              ))}
              {!workoutDays.length && <div style={{ fontSize: 13, color: C.muted }}>Workout split is being prepared. Re-open after plan generation completes.</div>}
            </div>
          </Card>
        </DetailSheet>
      )}

      {detailView === 'cardio' && (
        <DetailSheet
          title="Cardio Structure"
          subtitle="Cardio is calibrated to support the active phase without interfering with strength progression."
          onClose={() => setDetailView(null)}
        >
          <Card>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: C.cardElevated }}>
                <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Frequency</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{cardioDays} sessions / week</div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: C.cardElevated }}>
                <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Session Guidance</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                  20–30 min low-intensity steady cardio on non-leg days. Keep effort conversational. If recovery is reduced, lower duration before lowering strength volume.
                </div>
              </div>
            </div>
          </Card>
        </DetailSheet>
      )}

      {detailView === 'nutrition' && (
        <DetailSheet
          title="How to Hit Today's Targets"
          subtitle="Practical macro distribution based on your active phase targets."
          onClose={() => setDetailView(null)}
        >
          <Card>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Protein pacing target: ~{Math.round((macros.protein || 150) / 4)} g per main meal across 4 feedings.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Meal 1', protein: 0.25, carbs: 0.22, fats: 0.25 },
                { label: 'Meal 2', protein: 0.25, carbs: 0.33, fats: 0.25 },
                { label: 'Meal 3', protein: 0.25, carbs: 0.28, fats: 0.25 },
                { label: 'Meal 4', protein: 0.25, carbs: 0.17, fats: 0.25 },
              ].map((m) => (
                <div key={m.label} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, background: C.cardElevated }}>
                  <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Protein {Math.round((macros.protein || 150) * m.protein)} g</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Carbs {Math.round((macros.carbs || 200) * m.carbs)} g</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Fat {Math.round((macros.fat || 55) * m.fats)} g</div>
                </div>
              ))}
            </div>
          </Card>
        </DetailSheet>
      )}

      {selectedMeal && (
        <RecipeModal
          meal={selectedMeal}
          profile={profile}
          onClose={() => setSelectedMeal(null)}
          onLog={() => {
            const today2 = todayStr();
            const todayMeals = LS.get(LS_KEYS.meals(today2), []);
            const entry = { id: Date.now(), name: selectedMeal.name, category: selectedMeal.mealType || 'Meal', calories: selectedMeal.calories || 0, protein: selectedMeal.protein || 0, carbs: selectedMeal.carbs || 0, fat: selectedMeal.fat || 0 };
            LS.set(LS_KEYS.meals(today2), [...todayMeals, entry]);
            setSelectedMeal(null);
            showToast?.('✓ Meal logged');
          }}
          onSwap={() => setSelectedMeal(null)}
        />
      )}
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

/* ─── AI Patterns ─────────────────────────────────────────────────────────── */
function AIPatterns({ profile, activePlan }) {
  const cacheKey = 'massiq:patterns';
  const isStale  = (() => { const c = LS.get(cacheKey, null); return !c || (Date.now() - (c.ts||0) > 7*24*3600*1000); })();
  const [insights, setInsights] = useState(() => isStale ? null : LS.get(cacheKey, null)?.insights);
  const [loading,  setLoading]  = useState(isStale);
  useEffect(() => {
    if (!loading) return;
    let ok = true;
    generatePatterns(profile, activePlan)
      .then(data => {
        if (!ok) return;
        const arr = data.insights || [];
        setInsights(arr);
        LS.set(cacheKey, { insights: arr, ts: Date.now() });
        setLoading(false);
      })
      .catch(err => { console.error('Patterns failed:', err); if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);

  return (
    <div className="su" style={{ animationDelay: '.10s' }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Your Patterns</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)
        ) : insights?.length ? (
          insights.map((ins, i) => (
            <div key={i} style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{ins.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.white, lineHeight: 1.4, marginBottom: 4 }}>{ins.pattern}</div>
                  {ins.action && <div style={{ fontSize: 12, color: C.green, lineHeight: 1.4 }}>→ {ins.action}</div>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>
            Log meals for a week to see your patterns.
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ profile, activePlan, setTab, onEditProfile, onReset, onLogout, showToast }) {
  const scanHistory = LS.get(LS_KEYS.scanHistory, []);
  const [completed, setCompleted] = useState(() => LS.get(LS_KEYS.completed, []));
  const [xp,        setXp]        = useState(() => LS.get(LS_KEYS.xp, 0));
  const [confirmReset, setConfirmReset] = useState(false);
  const [reminders, setReminders] = useState(() => LS.get(LS_KEYS.reminders, {
    workout: { enabled: true, time: '17:30' },
    cardio: { enabled: false, time: '07:30' },
    protein: { enabled: true, time: '19:00' },
    hydration: { enabled: false, time: '14:00' },
    checkpoint: { enabled: true, time: '09:00' },
  }));

  const aiMissions = LS.get('massiq:missions', null);
  const activeMissions = (Array.isArray(aiMissions) && aiMissions.length > 0) ? aiMissions : MISSIONS;

  /* Health score from last scan or profile defaults */
  const lastScan    = scanHistory[scanHistory.length - 1];
  const bf          = lastScan?.bodyFat || 20;

  // leanMass is stored in lbs (from Claude scan). Convert to kg for display and scoring.
  const leanMassLbs = lastScan?.leanMass;
  const leanKg      = leanMassLbs
    ? Number((leanMassLbs / 2.2046).toFixed(1))
    : (profile ? Number((profile.weightLbs * 0.453592 * 0.82).toFixed(1)) : 65);

  // Fat mass in lbs — calculated from current weight × BF% (scan doesn't store fatMass)
  const fatMassLbs  = Math.round((profile?.weightLbs || 170) * (bf / 100));

  // bfScore: 100 at 8% BF, ~66 at 20%, ~38 at 30%
  const bfScore     = Math.max(0, Math.min(100, Math.round(100 - (bf - 8) * 2.8)));
  // leanScore: 75 kg lean mass = 100 (well-built male athlete benchmark)
  const leanScore   = Math.min(100, Math.round((leanKg / 75) * 100));
  const healthScore = Math.round(bfScore * 0.6 + leanScore * 0.4);
  const healthLabel = healthScore >= 80 ? 'Elite' : healthScore >= 65 ? 'Great' : healthScore >= 50 ? 'Good' : 'Building';

  /* Delta summary for scan history */
  const firstScan = scanHistory[0];
  const bfDelta   = firstScan && lastScan ? (lastScan.bodyFat  - firstScan.bodyFat).toFixed(1)  : null;
  const lmDelta   = firstScan && lastScan ? (lastScan.leanMass - firstScan.leanMass).toFixed(1) : null;

  /* Unlock logic */
  const isUnlocked = (m) => !m.requires || m.requires.every(r => completed.includes(r));
  const isDone     = (id) => completed.includes(id);
  const totalXP    = activeMissions.reduce((s, m) => s + (isDone(m.id) ? m.xp : 0), 0);

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
  const bronzeDone = activeMissions.filter(m => m.tier === 'Bronze' && isDone(m.id)).length;
  const silverDone = activeMissions.filter(m => m.tier === 'Silver' && isDone(m.id)).length;
  const goldDone   = activeMissions.filter(m => m.tier === 'Gold'   && isDone(m.id)).length;
  const tierFilled = bronzeDone === 4 ? (silverDone === 2 ? (goldDone === 2 ? 3 : 2) : 1) : 0;

  const GOAL_COLORS = { Cut: C.orange, Bulk: C.blue, Recomp: C.purple, Maintain: C.green };
  const goalColor = GOAL_COLORS[profile?.goal] || C.green;
  const updateReminder = (key, patch) => {
    const next = { ...reminders, [key]: { ...reminders[key], ...patch } };
    setReminders(next);
    LS.set(LS_KEYS.reminders, next);
  };

  return (
    <div className="screen">
      <h1 className="screen-title">Profile</h1>

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
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{s.date ? fmt.date(s.date) : `Scan ${i + 1}`}</div>
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
              <span>{fmt.date(scanHistory[0]?.date)}</span>
              <span style={{ color: C.muted }}>Physique Score</span>
              <span>{fmt.date(scanHistory[scanHistory.length - 1]?.date)}</span>
            </div>
          </Card>
        )}
      </div>

      {/* 2 ── Health Score ── */}
      <Card className="su glass" style={{ animationDelay: '.04s' }}>
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
          { icon: '💧', label: 'Body Fat',   sub: bf < 12 ? 'Very lean' : bf < 18 ? 'Healthy range' : bf < 25 ? 'Moderate' : 'High',
            value: `${bf}%`,         color: bf < 18 ? C.green : bf < 25 ? C.orange : '#ef4444' },
          { icon: '🏋️', label: 'Lean Mass',  sub: leanKg >= 68 ? 'Well built' : leanKg >= 55 ? 'Good foundation' : 'Building phase',
            value: `${leanKg} kg`,   color: C.blue },
          { icon: '⚖️', label: 'Fat Mass',   sub: fatMassLbs <= 20 ? 'Low' : fatMassLbs <= 35 ? 'Moderate' : 'Elevated',
            value: `${fatMassLbs} lbs`, color: fatMassLbs <= 25 ? C.green : fatMassLbs <= 40 ? C.orange : '#ef4444' },
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
      {ENABLE_GAMIFICATION && <div className="su" style={{ animationDelay: '.08s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Physique Missions</div>

        {/* Hero stats */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { label: 'Total XP',   value: totalXP },
              { label: 'Day Streak', value: LS.get(LS_KEYS.streak, 0) },
              { label: 'Done',       value: `${completed.length}/${activeMissions.length}` },
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
          {activeMissions.map(m => {
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
      </div>}

      {/* 3.5 ── AI Patterns ── */}
      <AIPatterns profile={profile} activePlan={activePlan} />

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
            ['Weight',   profile?.weightLbs ? fmt.weight(profile.weightLbs, profile?.unitSystem) : '—'],
            ['Height',   profile?.heightCm  ? fmt.height(profile.heightCm, profile?.unitSystem)  : '—'],
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

      {/* 5 ── Reminder Preferences ── */}
      <Card className="su" style={{ animationDelay: '.14s' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Reminder Preferences</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['workout', 'Workout Window', 'Workout window starts in 30 minutes.'],
            ['cardio', 'Cardio Session', 'Cardio session scheduled for today.'],
            ['protein', 'Protein Check', 'Protein target is behind pace.'],
            ['hydration', 'Hydration', 'Hydration target check-in.'],
            ['checkpoint', 'Scan Checkpoint', 'Review checkpoint is due tomorrow.'],
          ].map(([key, label, preview]) => (
            <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', background: C.cardElevated }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 620 }}>{label}</div>
                <button className="bp" onClick={() => updateReminder(key, { enabled: !reminders[key]?.enabled })} style={{ fontSize: 11, fontWeight: 650, borderRadius: 999, padding: '4px 10px', border: `1px solid ${reminders[key]?.enabled ? C.greenDim : C.border}`, background: reminders[key]?.enabled ? C.greenBg : 'transparent', color: reminders[key]?.enabled ? C.green : C.muted }}>
                  {reminders[key]?.enabled ? 'Enabled' : 'Off'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.muted }}>{preview}</span>
                <input
                  type="time"
                  value={reminders[key]?.time || '09:00'}
                  onChange={(e) => updateReminder(key, { time: e.target.value })}
                  style={{ background: C.card, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '4px 8px', fontSize: 12 }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 6 ── Reset ── */}
      <div style={{ paddingTop: 8, textAlign: 'center' }}>
        <button className="bp" onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 0 14px' }}>
          Log Out
        </button>
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
// Calibrated muscle group display — maps new 5-tier vocab + legacy values
const MG_META = {
  'not yet defined': { label: 'Early stage', pct: 20, color: C.red       },
  'early':           { label: 'Developing',  pct: 32, color: C.orange     },
  'moderate':        { label: 'Moderate',    pct: 52, color: C.gold       },
  'solid':           { label: 'Solid',       pct: 72, color: '#00C853AA'  },
  'well-developed':  { label: 'Strong',      pct: 88, color: C.green      },
  // legacy values from old prompt — mapped forward
  'underdeveloped':  { label: 'Early stage', pct: 20, color: C.red       },
  'average':         { label: 'Moderate',    pct: 52, color: C.gold       },
};
const getMG = (level) => MG_META[level?.toLowerCase?.() ?? ''] ?? MG_META['moderate'];

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

    // Compress image client-side before sending — Next.js Route Handler body limits
    // apply before our code runs, so we resize on the client to stay under 1 MB.
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      // Resize to max 1024px on the longest side — enough detail for physique analysis
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
        else                 { width  = Math.round(width  * MAX / height); height = MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      // JPEG 82% quality → typically 150–400 KB, well within any server limit
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const base64  = dataUrl.split(',')[1];
      await runScan(base64, 'image/jpeg');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError('Could not load image. Please try a different file.');
    };
    img.src = objectUrl;
  };

  const runScan = async (base64, mediaType) => {
    setScanning(true); setResult(null);
    try {
      const key = `massiq:scan-usage:${todayStr()}`;
      const count = Number(LS.get(key, 0) || 0);
      if (count >= DAILY_SCAN_SOFT_LIMIT) {
        throw new Error('You have reached today’s scan limit. Please continue tomorrow for best accuracy and consistency.');
      }

      const age    = profile?.age      || 25;
      const gender = profile?.gender   || 'Male';
      const height = profile?.heightIn || 70;
      const weight = profile?.weightLbs || 170;

      // Step 1: Claude analyzes the PHYSIQUE only (visual assessment, no target generation)
      // /api/anthropic supports large image payloads; /api/claude caps at 250 KB
      // Use Haiku for vision — explicitly pass model to override any ANTHROPIC_MODEL env var.
      // Haiku has full vision capability at ~10x lower cost than Sonnet for this task.
      const BF_RANGES = gender === 'Male'
        ? '<8% very lean|8-12% lean|12-15% mod.lean|15-20% moderate|20-25% elevated|>25% high'
        : '<16% very lean|16-20% lean|20-25% mod.lean|25-30% moderate|30-35% elevated|>35% high';

      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          system: `Physique analyst. Professional coach tone, non-judgmental. Return JSON only.

RULES: Describe visible traits only. All comparisons relative to this person's own frame. Start with strengths.
BANNED: underdeveloped, below average, above average, lacks, lacking, weak, beginner, poor, inadequate, unfortunately
MUSCLE (5 levels only): "not yet defined"|"early"|"moderate"|"solid"|"well-developed"
BF (${gender==='Male'?'M':'F'}): ${BF_RANGES}. Estimate conservatively — photos make people look leaner.
SCORES: physique 30-95 (avg 52-65), symmetry 60-95 (avg 70-85). Be calibrated, not generous.`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: `Physique photo. ${age}yo ${gender}, ${height}in, ${weight}lbs. Return ONLY valid JSON:
{"bodyFatPct":0,"bodyFatRange":"","leanMass":0,"fatMass":0,"physiqueScore":0,"symmetryScore":0,"confidence":"medium","muscleGroups":{"chest":"","shoulders":"","back":"","arms":"","core":"","legs":""},"weakestGroups":[],"strengths":[],"asymmetries":[],"bodyFatSummary":"","muscleSummary":"","priorityAreas":[],"balanceNote":"","diagnosis":"","recommendation":"","disclaimer":"Visual AI estimate — accuracy improves with consistent lighting and pose."}` },
            ],
          }],
          max_tokens: 800,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const { text, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse scan result');
      const visualData = sanitizeScanData(JSON.parse(match[0]), profile);

      // Step 2: Run the engine with this scan data to get precise targets
      const currentHistory = LS.get(LS_KEYS.scanHistory, []);
      const scanForEngine  = { date: new Date().toISOString().slice(0, 10), bodyFat: visualData.bodyFatPct, weight, leanMass: visualData.leanMass };
      const engineOutput   = await callEngine(profile, [...currentHistory, scanForEngine]);

      // Step 3: Merge — visual assessment from Claude, targets from engine
      const data = {
        ...visualData,
        // Engine-calculated targets (authoritative)
        dailyTargets:    clampMacros(engineOutput?.macro_targets || calcMacros({ ...profile, goal: profile.goal }), profile),
        phase:           { label: profile.goal, name: `${profile.goal} Phase`, durationWeeks: 12, objective: engineOutput?.diagnosis?.primary?.recommended_action || '' },
        whyThisWorks:    engineOutput?.diagnosis?.primary?.primary_issue || visualData.diagnosis,
        weeklyMissions:  engineOutput?.next_actions?.slice(0, 3).map(a => a.value) || [],
        nextScanDate:    (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
        engineOutput,    // attach full engine output for applyPlan to use
      };
      setResult(data);
      LS.set(key, count + 1);
    } catch (err) {
      setError(err.message || 'Scan failed. Please try again.');
    }
    setScanning(false);
  };

  const applyPlan = async () => {
    if (!result) return;
    const today  = new Date().toISOString().slice(0, 10);
    const eng    = result.engineOutput;          // engine output attached by runScan
    const previousPlanTargets = getActiveTargets(LS.get(LS_KEYS.activePlan, null), profile);
    const baseTargets = clampMacros(eng?.macro_targets || result.dailyTargets || calcMacros(profile), profile);
    const isLowConfidence = (result.confidence || '').toLowerCase() === 'low';
    const m = isLowConfidence
      ? clampMacros({
          ...baseTargets,
          calories: Math.round((previousPlanTargets.calories * 0.7) + (baseTargets.calories * 0.3)),
          protein: Math.round((previousPlanTargets.protein * 0.7) + (baseTargets.protein * 0.3)),
          carbs: Math.round((previousPlanTargets.carbs * 0.7) + (baseTargets.carbs * 0.3)),
          fat: Math.round((previousPlanTargets.fat * 0.7) + (baseTargets.fat * 0.3)),
        }, profile)
      : baseTargets;

    const plan = {
      phase:          profile.goal,
      phaseName:      `${profile.goal} Phase`,
      objective:      eng?.diagnosis?.primary?.recommended_action || '',
      week:           1,
      startDate:      today,
      nextScanDate:   result.nextScanDate || (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
      macros:         { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
      dailyTargets:   m,
      trainDays:      m.trainingDaysPerWeek || 4,
      sleepHrs:       m.sleepHours          || 8,
      waterL:         m.waterLiters         || 3,
      steps:          m.steps               || 9000,
      bodyFat:        result.bodyFatPct,
      leanMass:       result.leanMass,
      startBF:        eng?.start_bf         ?? result.bodyFatPct,
      targetBF:       eng?.target_bf        ?? (profile.goal === 'Cut' ? result.bodyFatPct - 4 : result.bodyFatPct),
      weeklyMissions: result.weeklyMissions  || [],
      whyThisWorks:   result.whyThisWorks    || '',
      cardioDays:     m.cardioDays           || 2,
      engineDiagnosis: eng?.diagnosis        || null,
      engineTrajectory: eng?.trajectory      || null,
      tdee:           eng?.physio?.tdee      || null,
    };
    const entry = {
      date: today, bodyFat: result.bodyFatPct, leanMass: result.leanMass,
      physiqueScore: result.physiqueScore, symmetryScore: result.symmetryScore,
      phase: profile.goal,
      confidence: result.confidence || 'medium',
      muscleGroups: result.muscleGroups || {},
      assessment: result.bodyFatSummary || result.diagnosis || '',
      focusAreas: result.priorityAreas || result.weakestGroups || [],
      recommendation: result.recommendation || eng?.diagnosis?.primary?.recommended_action || '',
      dailyTargets: {
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
        steps: m.steps || 9000,
        trainingDaysPerWeek: m.trainingDaysPerWeek || 4,
      },
    };
    const history = [...LS.get(LS_KEYS.scanHistory, []), entry];
    LS.set(LS_KEYS.activePlan, plan);
    LS.set(LS_KEYS.stats, { calories: 0, protein: 0 });
    LS.set(LS_KEYS.scanHistory, history);
    setScanHistory(history);
    onPlanApplied(plan, history);
    // Regenerate meal plan with scan data in background
    generateMealPlan(profile, plan, result)
      .then(days => { LS.set(LS_KEYS.mealplan, { weekKey: weekKey2(), days }); })
      .catch(err => console.error('Meal plan regen failed:', err));
    showToast('✓ Plan applied. Generating your meal plan...');
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
    const prevScan = scanHistory[scanHistory.length - 1];
    const bfTrend = prevScan ? Number(result.bodyFatPct || 0) - Number(prevScan.bodyFat || 0) : null;
    const lmTrend = prevScan ? Number(result.leanMass || 0) - Number(prevScan.leanMass || 0) : null;
    const predictedTrajectory = getTrajectoryStatus(prevScan ? [...scanHistory, { bodyFat: result.bodyFatPct, leanMass: result.leanMass }] : scanHistory, profile.goal);
    const nextDecision = result.confidence === 'low'
      ? 'Retake scan with improved lighting before committing plan updates.'
      : predictedTrajectory.tone === 'warn'
        ? 'Apply plan with adjustment and review again in 2–3 weeks.'
        : 'Apply plan and continue current phase until next checkpoint.';

    return (
      <div className="screen" style={{ gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="screen-title" style={{ fontSize: 30 }}>Scan Results</h1>
          <button className="bp" onClick={() => setResult(null)} style={{ background: C.cardElevated, border: 'none', color: C.muted, padding: '6px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Retake</button>
        </div>

        {/* 1 – Phase Hero */}
        <div className="su">
          <SummaryCard
            label={`Body Scan · ${fmt.date(todayStr())}`}
            title={fmt.pct(result.bodyFatPct, 1)}
            subtitle={`Estimated body fat → target review ${fmt.date(result.nextScanDate)}`}
            progressPct={Math.min(100, Math.max(0, (result.physiqueScore || 0)))}
            tone={phColor}
            metrics={[
              { label: 'Lean Mass', value: fmt.leanMass(result.leanMass, profile?.unitSystem) },
              { label: 'Symmetry', value: `${result.symmetryScore || '—'}/100` },
              { label: 'Phase', value: ph.label || 'Maintain' },
              { label: 'Score', value: `${result.physiqueScore || '—'}/100` },
            ]}
            insight={ph.objective || result.diagnosis}
            nextStep={result.recommendation || 'Apply this update and execute this week’s targets.'}
          />
        </div>

        {/* 2 – Why this works */}
        <Card className="su" style={{ animationDelay: '.03s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <span style={{ fontWeight: 700 }}>Why this plan works</span>
          </div>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{result.whyThisWorks}</p>
        </Card>

        {/* 2.5 – Progress delta */}
        <Card className="su" style={{ animationDelay: '.04s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Change vs Previous Scan</span>
            <StatusPill tone={predictedTrajectory.tone === 'good' ? 'good' : predictedTrajectory.tone === 'warn' ? 'warn' : 'neutral'} label={predictedTrajectory.label} />
          </div>
          {prevScan ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>Body Fat</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: (bfTrend || 0) <= 0 ? C.green : C.orange }}>{bfTrend > 0 ? '+' : ''}{(bfTrend || 0).toFixed(1)}%</div>
                </div>
                <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>Lean Mass</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: (lmTrend || 0) >= 0 ? C.green : C.orange }}>{lmTrend >= 0 ? '+' : ''}{(lmTrend || 0).toFixed(1)} lb</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: 0 }}>{predictedTrajectory.note}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>This is your baseline scan. Your next scan will unlock trajectory analysis.</p>
          )}
        </Card>

        {/* 3 – Daily Targets */}
        <div className="su" style={{ animationDelay: '.06s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Execution Targets</div>
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
              { label: 'Lean Mass', value: fmt.leanMass(result.leanMass, profile?.unitSystem), color: C.blue },
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Muscle Development</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(mg).map(([name, level]) => {
              const meta       = getMG(level);
              const isPriority = result.weakestGroups?.includes(name);
              return (
                <div key={name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{name}</span>
                      {isPriority && <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: C.greenBg, padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em' }}>Focus area</span>}
                    </div>
                    <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ width: `${meta.pct}%`, height: '100%', background: meta.color, borderRadius: 99, transition: 'width .6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 6 – Assessment */}
        <Card className="su" style={{ animationDelay: '.14s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Assessment</div>

          {/* Body composition summary */}
          {result.bodyFatSummary && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Body Composition</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.bodyFatSummary}</p>
            </div>
          )}

          {/* Muscle summary */}
          {result.muscleSummary && (
            <div style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Muscle Development</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.muscleSummary}</p>
            </div>
          )}

          {/* Balance */}
          {result.balanceNote && (
            <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Balance</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.balanceNote}</p>
            </div>
          )}

          {/* Fallback to old diagnosis field if new fields absent */}
          {!result.bodyFatSummary && !result.muscleSummary && result.diagnosis && (
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: 0 }}>{result.diagnosis}</p>
          )}
        </Card>

        {/* 7 – Focus areas (replaces "Priority" badge — coach framing) */}
        {result.priorityAreas?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.15s' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Focus Areas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.priorityAreas.map((area, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.greenBg, border: `1px solid ${C.green}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>{i + 1}</span>
                  </div>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{area}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 8 – Recommendation */}
        {result.recommendation && (
          <Card className="su" style={{ animationDelay: '.155s', background: C.greenBg, border: `1px solid ${C.greenDim}` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: C.green }}>→ Next Move</div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.recommendation}</p>
          </Card>
        )}

        {/* Asymmetries — shown only when flagged */}
        {result.asymmetries?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.16s', background: `${C.gold}12`, border: `1px solid ${C.gold}33` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: C.gold, fontSize: 13 }}>Balance note</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {result.asymmetries.map((a, i) => <li key={i} style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{a}</li>)}
            </ul>
          </Card>
        )}

        {/* Confidence indicator */}
        {result.confidence && result.confidence !== 'high' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 14 }}>ℹ️</span>
            <span style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.5 }}>
              {result.confidence === 'medium'
                ? 'Assessment confidence: moderate — a clearer, straight-on photo will improve accuracy.'
                : 'Assessment confidence: limited — photo lighting or angle reduced precision. Retake for better results.'}
            </span>
          </div>
        )}

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
        <Card className="su" style={{ animationDelay: '.171s' }}>
          <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Next decision</div>
          <p style={{ fontSize: 13, color: C.white, lineHeight: 1.55, margin: 0 }}>{nextDecision}</p>
        </Card>
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
    <div className="screen">
      <div>
        <h1 className="screen-title" style={{ marginBottom: 6 }}>Scan</h1>
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
            {[...scanHistory].reverse().map((s, i) => {
              const realIdx = scanHistory.length - 1 - i;
              return (
              <div key={i} className="bp" onClick={() => setViewOld(realIdx)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt.date(s.date)}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Body Fat {Number(s.bodyFat || 0).toFixed(1)}% · Lean {fmt.leanMass(s.leanMass || 0, profile?.unitSystem)}</div>
                  <div style={{ fontSize: 11, color: C.dimmed, marginTop: 3 }}>Tap to view full scan context</div>
                </div>
                <div style={{ background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
                  {s.physiqueScore}/100
                </div>
              </div>
            )})}
          </div>
        </div>
      )}
      {typeof viewOld === 'number' && (
        <ScanDetailModal
          scan={scanHistory[viewOld]}
          prevScan={viewOld > 0 ? scanHistory[viewOld - 1] : null}
          unitSystem={profile?.unitSystem}
          onClose={() => setViewOld(null)}
        />
      )}
    </div>
  );
}

function ScanDetailModal({ scan, prevScan, onClose, unitSystem = 'imperial' }) {
  if (!scan) return null;
  const bfDelta = prevScan ? Number(scan.bodyFat || 0) - Number(prevScan.bodyFat || 0) : null;
  const lmDelta = prevScan ? Number(scan.leanMass || 0) - Number(prevScan.leanMass || 0) : null;
  const lmDeltaDisplay = unitSystem === 'metric' ? (lmDelta || 0) * 0.453592 : (lmDelta || 0);
  const trajectory = getTrajectoryStatus(prevScan ? [prevScan, scan] : [], scan.phase || 'Maintain');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(6,9,7,0.88)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 16, overflowY: 'auto' }}>
      <div style={{ maxWidth: 560, margin: '10px auto 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ background: '#121915', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em' }}>Scan Detail</div>
              <div style={{ fontSize: 20, fontWeight: 740, marginTop: 4 }}>{fmt.date(scan.date)}</div>
            </div>
            <button className="bp" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.cardElevated, color: C.muted, fontSize: 16 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatusPill tone={trajectory.tone === 'good' ? 'good' : trajectory.tone === 'warn' ? 'warn' : 'neutral'} label={trajectory.label} />
            <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>{scan.phase || 'Phase not recorded'}</span>
            <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>Confidence: {scan.confidence || 'medium'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Body Fat', value: fmt.pct(scan.bodyFat || 0, 1), tone: (bfDelta || 0) <= 0 ? C.green : C.orange, delta: bfDelta },
              { label: 'Lean Mass', value: fmt.leanMass(scan.leanMass || 0, unitSystem), tone: (lmDelta || 0) >= 0 ? C.green : C.orange, delta: lmDelta, lb: true },
              { label: 'Physique Score', value: `${scan.physiqueScore || '—'}/100`, tone: C.white },
              { label: 'Symmetry', value: `${scan.symmetryScore || '—'}/100`, tone: C.white },
            ].map((m) => (
              <div key={m.label} style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>{m.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: m.tone }}>{m.value}</div>
                {m.delta !== undefined && m.delta !== null && (
                  <div style={{ fontSize: 11, color: m.tone, marginTop: 3 }}>
                    {m.delta >= 0 ? '+' : ''}{(m.lb ? lmDeltaDisplay : m.delta).toFixed(1)}{m.lb ? (unitSystem === 'metric' ? ' kg' : ' lb') : '%'} vs previous
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Assessment Summary</div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{scan.assessment || 'Historical scan available for comparison. Detailed narrative was not stored for this scan.'}</p>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Focus Areas at this scan</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(scan.focusAreas?.length ? scan.focusAreas : ['No specific focus areas were recorded']).slice(0, 4).map((f, i) => (
                <span key={`${f}-${i}`} style={{ fontSize: 12, color: C.white, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 10px' }}>{f}</span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Plan Context</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 10 }}>
              <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>Calories</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{scan.dailyTargets?.calories ?? '—'} kcal</div>
            </div>
            <div style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 10 }}>
              <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>Protein</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{scan.dailyTargets?.protein ?? '—'} g</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{scan.recommendation || 'Recommendation details were not stored for this scan snapshot.'}</p>
        </Card>
      </div>
    </div>
  );
}

function AuthScreen({ onSubmit, loading, error, notice }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const disabled = loading || !email.trim() || password.length < 6;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{CSS}</style>
      <Card className="glass su" style={{ width: '100%', maxWidth: 420, padding: 24, background: C.cardElevated }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14 }}>MASSIQ</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
          {mode === 'login' ? 'Log in to continue your plan, scans, and progress timeline.' : 'Set up your identity once. MassIQ will remember your profile, scans, and active plan.'}
        </p>

        <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {['login', 'signup'].map((m) => (
            <button key={m} className="bp" onClick={() => setMode(m)} style={{
              flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 650,
              background: mode === m ? C.greenBg : 'transparent',
              color: mode === m ? C.green : C.muted,
              border: 'none',
            }}>
              {m === 'login' ? 'Log In' : 'Create Account'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, fontSize: 14 }} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" type="password" style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, fontSize: 14 }} />
          <Btn disabled={disabled} onClick={() => onSubmit(mode, email.trim(), password)} style={{ width: '100%', marginTop: 6 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </Btn>
        </div>

        {(error || notice) && (
          <div style={{ marginTop: 12, borderRadius: 12, padding: '10px 12px', border: `1px solid ${error ? C.red : C.greenDim}`, background: error ? 'rgba(255,90,95,0.08)' : C.greenBg, fontSize: 12, color: error ? '#FFB4B7' : C.green }}>
            {error || notice}
          </div>
        )}
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

/* ─── Nav config (shared by TabBar + Sidebar) ────────────────────────────── */
const TABS = [
  { key: 'home',      label: 'Home',      icon: '🏠' },
  { key: 'nutrition', label: 'Nutrition', icon: '🥗' },
  { key: 'scan',      label: 'Scan',      icon: '📸' },
  { key: 'plan',      label: 'Plan',      icon: '📋' },
  { key: 'profile',   label: 'Profile',   icon: '👤' },
];

/* ─── Mobile Tab Bar ─────────────────────────────────────────────────────── */
function TabBar({ active, setTab }) {
  return (
    <div className="mobile-tabbar" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(12,18,14,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', padding: '10px 0 max(10px, env(safe-area-inset-bottom))',
    }}>
      {TABS.map(t => {
        const isActive = active === t.key;
        return (
          <button key={t.key} className="bp" onClick={() => setTab(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}>
            <div style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 20, lineHeight: 1,
              background: isActive ? C.greenBg : 'transparent',
            }}>{t.icon}</div>
            <span style={{ fontSize: 10, fontWeight: 580, letterSpacing: '.02em', color: isActive ? C.green : C.dimmed }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Desktop Sidebar ────────────────────────────────────────────────────── */
function Sidebar({ active, setTab, profile }) {
  const goalEmoji = { Cut: '📉', Bulk: '📈', Recomp: '🔄', Maintain: '⚖️' }[profile?.goal] || '🎯';
  return (
    <div className="desktop-sidebar" style={{
      width: 220, minHeight: '100dvh', background: '#101711',
      borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 4, textTransform: 'uppercase' }}>MASSIQ</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 5, letterSpacing: '.02em' }}>AI Physique OS</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {TABS.map(t => {
          const isActive = active === t.key;
          return (
            <button key={t.key} className="bp" onClick={() => setTab(t.key)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', marginBottom: 4,
              background: isActive ? C.greenBg : 'transparent',
              color: isActive ? C.green : C.muted,
              fontFamily: 'inherit', fontSize: 14, fontWeight: isActive ? 700 : 500,
              transition: 'all .15s ease',
            }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
              {isActive && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: C.green }} />}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      {profile && (
        <div style={{ padding: '16px 20px 28px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6 }}>{profile.name}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
            {goalEmoji} {profile.goal}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function MassIQ() {
  const [session,    setSession]    = useState(null);
  const [authReady,  setAuthReady]  = useState(false);
  const [authBusy,   setAuthBusy]   = useState(false);
  const [authError,  setAuthError]  = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [profile,    setProfile]    = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [tab,        setTab]        = useState('home');
  const [ready,      setReady]      = useState(false);
  const [toast,      setToast]      = useState(null);
  const [editing,    setEditing]    = useState(false);
  const [syncing,    setSyncing]    = useState(false);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        const s = await initializeSession();
        if (!mounted) return;
        setSession(s);
      } catch (err) {
        if (!mounted) return;
        setAuthError(err.message || 'Could not restore session.');
      } finally {
        if (mounted) setAuthReady(true);
      }
    };
    boot();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session?.access_token) {
      setProfile(null);
      setActivePlan(null);
      setReady(true);
      return;
    }
    let mounted = true;
    const hydrate = async () => {
      setReady(false);
      try {
        console.info('[sync] getUser:start');
        const user = session.user || await fetchUser(session.access_token);
        console.info('[sync] getUser:ok', { userId: user?.id || null });
        const userId = user?.id;
        if (!userId) throw new Error('Missing user session.');

        let loadedProfile = null;
        let loadedPlan = null;
        let loadedScanHistory = [];
        try {
          console.info('[sync] ensureProfile:start', { userId });
          loadedProfile = await ensureProfile(session.access_token, userId);
          console.info('[sync] ensureProfile:ok', { hasProfile: Boolean(loadedProfile) });
        } catch (profileErr) {
          console.error('sync:ensureProfile failed', profileErr);
          throw profileErr;
        }
        try {
          console.info('[sync] getLatestPlan:start', { userId });
          loadedPlan = await getPlan(session.access_token, userId);
          console.info('[sync] getLatestPlan:ok', { hasPlan: Boolean(loadedPlan) });
        } catch (planErr) {
          console.error('sync:getPlan failed', planErr);
          throw planErr;
        }
        try {
          console.info('[sync] getLatestScan:start', { userId });
          loadedScanHistory = await getScans(session.access_token, userId);
          console.info('[sync] getLatestScan:ok', { scanCount: loadedScanHistory.length });
        } catch (scanErr) {
          console.error('sync:getScans failed (continuing without scans)', scanErr);
          loadedScanHistory = [];
        }

        if (loadedProfile && !loadedPlan) {
          const fallbackPlan = buildBaselinePlanFromProfile(loadedProfile);
          try {
            console.info('[sync] createDefaultPlan:start', { userId });
            await upsertPlan(session.access_token, userId, fallbackPlan);
            console.info('[sync] createDefaultPlan:ok');
          } catch (createPlanErr) {
            console.error('sync:createDefaultPlan failed', createPlanErr);
            throw createPlanErr;
          }
          loadedPlan = fallbackPlan;
        }

        if (mounted) {
          setProfile(loadedProfile);
          setActivePlan(loadedPlan);
          setTab('home');
          LS.set(LS_KEYS.profile, loadedProfile);
          LS.set(LS_KEYS.activePlan, loadedPlan);
          LS.set(LS_KEYS.scanHistory, loadedScanHistory);
        }
      } catch (err) {
        console.error('hydrate account data failed', err);
        if (mounted) setAuthError('We couldn’t finish syncing your account. Please try again.');
      } finally {
        if (mounted) setReady(true);
      }
    };
    hydrate();
    return () => { mounted = false; };
  }, [authReady, session?.access_token]);

  const persistUserState = async (nextProfile, nextPlan, scanHistory = null, source = 'unknown_ui_action') => {
    if (!session?.access_token) return;
    try {
      setSyncing(true);
      const user = session.user || await fetchUser(session.access_token);
      const userId = user?.id;
      const sessionId = session?.session_id || null;
      if (!userId) return;
      console.info('[sync] persistUserState:start', { source, userId, sessionId, hasPlan: Boolean(nextPlan), hasProfile: Boolean(nextProfile) });
      if (nextProfile) await upsertProfile(session.access_token, userId, nextProfile);
      if (nextPlan) {
        console.info('[sync] plans.insert actor', { source, userId, sessionId });
        await upsertPlan(session.access_token, userId, nextPlan);
      }
      if (Array.isArray(scanHistory) && scanHistory.length) {
        const latestScan = scanHistory[scanHistory.length - 1];
        await createScan(session.access_token, userId, latestScan);
      }
    } catch (err) {
      console.error('Persist failed (original Supabase error):', { source, message: err?.message || String(err), error: err });
      showToast('We couldn’t finish syncing your account. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAuthSubmit = async (mode, email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const userPassword = String(password || '');

    const mapAuthError = (err, m) => {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('invalid login') || raw.includes('invalid credentials')) return 'Incorrect email or password.';
      if (raw.includes('already registered') || raw.includes('already been registered') || raw.includes('user already registered')) {
        return 'An account already exists for this email. Log in instead.';
      }
      if (raw.includes('password') && (raw.includes('weak') || raw.includes('6'))) {
        return 'Use a stronger password with at least 6 characters.';
      }
      if (raw.includes('rate limit') || raw.includes('too many requests')) {
        return 'Too many attempts right now. Please wait and try again.';
      }
      if (raw.includes('failed to fetch') || raw.includes('network') || raw.includes('request failed (5')) {
        return 'Connection issue. Please try again.';
      }
      return m === 'signup'
        ? 'Could not create account right now.'
        : 'Could not log in right now.';
    };

    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      const res = mode === 'signup'
        ? await signUpWithPassword(normalizedEmail, userPassword)
        : await signInWithPassword(normalizedEmail, userPassword);
      if (!res?.access_token) {
        setAuthNotice('Could not start your session. Ensure Supabase Confirm Email is disabled for this environment.');
        return;
      }
      setSession(res);
    } catch (err) {
      setAuthError(mapAuthError(err, mode));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (session?.access_token) await signOutSession(session.access_token);
    } catch (err) {
      console.error('Logout failed:', err);
    }
    setSession(null);
    setProfile(null);
    setActivePlan(null);
    setEditing(false);
    setReady(true);
    Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
  };

  const handleReset = () => {
    Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
    setProfile(null); setActivePlan(null); setTab('home'); setEditing(false);
  };

  const handleEditProfile = () => {
    setEditing(true);
  };

  const handleOnboardingComplete = (p, plan) => {
    setProfile(p);
    LS.set(LS_KEYS.profile, p);
    setEditing(false);
    if (plan) {
      LS.set(LS_KEYS.activePlan, plan);
      setActivePlan(plan);
      persistUserState(p, plan, null, 'onboarding_complete');
      // Background: generate meal plan, workout plan, missions
      generateMealPlan(p, plan)
        .then(days => { LS.set(LS_KEYS.mealplan, { weekKey: weekKey2(), days }); })
        .catch(console.error);
      generateWorkoutPlan(p, plan)
        .then(days => { LS.set(LS_KEYS.workoutplan, days); })
        .catch(console.error);
      generateMissions(p, plan)
        .then(missions => { LS.set('massiq:missions', missions); })
        .catch(console.error);
    } else {
      persistUserState(p, activePlan, null, 'profile_update');
    }
  };

  const showToast = (msg) => setToast(msg);

  if (!authReady || !ready) return <div style={{ background: C.bg, minHeight: '100dvh' }} />;

  if (!session?.access_token) {
    return <AuthScreen onSubmit={handleAuthSubmit} loading={authBusy} error={authError} notice={authNotice} />;
  }

  if (!profile || editing) return (
    <>
      <style>{CSS}</style>
      <Onboarding onComplete={handleOnboardingComplete} />
    </>
  );

  const renderTab = () => {
    switch (tab) {
      case 'home':      return <HomeTab profile={profile} activePlan={activePlan} setTab={setTab} />;
      case 'nutrition': return <NutritionTab profile={profile} activePlan={activePlan} showToast={showToast} />;
      case 'scan':      return <ScanTab profile={profile} setTab={setTab} showToast={showToast} onPlanApplied={(p, history) => { setActivePlan(p); persistUserState(profile, p, history, 'scan_apply_plan'); }} />;
      case 'plan':      return <PlanTab profile={profile} activePlan={activePlan} setTab={setTab} showToast={showToast} />;
      case 'profile':   return (
        <ProfileTab
          profile={profile}
          activePlan={activePlan}
          setTab={setTab}
          onEditProfile={handleEditProfile}
          onReset={handleReset}
          onLogout={handleLogout}
          showToast={showToast}
        />
      );
      default: return null;
    }
  };

  return (
    <>
      <style>{CSS}</style>
      {/* Desktop sidebar */}
      <Sidebar active={tab} setTab={setTab} profile={profile} />

      {/* Main content — offset by sidebar on desktop */}
      <div className="app-layout" style={{ background: C.bg, minHeight: '100dvh' }}>
        {/* Spacer column for sidebar (grid col 1 on desktop, 0px on mobile) */}
        <div className="desktop-sidebar" style={{ width: 220, flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, paddingBottom: 96, minWidth: 0 }}>
          <div className="app-content" style={{ maxWidth: 480, margin: '0 auto' }}>
            {renderTab()}
          </div>
        </div>
      </div>

      <TabBar active={tab} setTab={setTab} />
      {syncing && <Toast msg="Syncing your account…" onDone={() => {}} />}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </>
  );
}
