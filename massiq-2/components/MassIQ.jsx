"use client";
import { useState, useEffect, useRef, useMemo, Component } from "react";
import { Icon } from './Icon';
import { buildPlanContent, buildMissions, getDailyTip, buildInsights } from '../lib/content/templates';
import { buildWorkoutPlan } from '../lib/content/workouts';
import { buildMealPlan, sumMealDayMacros, sumMealPlanTotals } from '../lib/content/meals';
import { runScanDecisionEngine } from '../lib/engine/scanDecisionEngine';
import { buildAdherenceContextFromFoodLogs } from '../lib/engine/adherenceFromFoodLogs';
import {
  initializeSession,
  getStoredSession,
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
  signOut as signOutSession,
  fetchUser,
  upsertProfile,
  ensureProfile,
  upsertPlan,
  getPlan,
  createScan,
  getScans,
  upsertMealPlan,
  getLatestMealPlan,
  upsertWorkoutProgram,
  getLatestWorkoutProgram,
  createScanComparison,
  createScanDecision,
  createDecisionLog,
  createPlanAdjustment,
  upsertProgressMetric,
  getPriorScanForComparison,
  getScanComparisons,
  getScanDecisions,
  getDecisionLogs,
  createProjection,
  persistPersonalizationArtifacts,
  probeMinimalDecisionEngineRun,
  getFoodLogsRecentForAdherence,
  uploadScanPhoto,
  createScanAsset,
  findAssetBySha256,
  findSimilarAsset,
  getScanByAssetId,
  getSubscription,
  fetchUserEntitlements,
  hydrateUserEntitlements,
  reconcileBodyScanEntitlements,
} from '../lib/supabase/client';
import { computePhysiqueScore, SCORING_VERSION } from '../lib/engine/scoring';
import { computeAdaptation } from '../lib/engine/adaptation';
import { hasFeature, isPremiumActive, FEATURES, canScan, scansRemaining, FREE_SCAN_LIMIT, canFoodScan, foodScansRemainingToday, FREE_FOOD_SCAN_LIMIT, getFoodScansUsedToday, setFoodScanCache, isBodyScanQuotaExhausted } from '../lib/features';

/* ─── Design Tokens ─────────────────────────────────────────────────────── */
const C = {
  bg:           '#0A0D0A',
  card:         '#131713',
  cardElevated: '#181D18',
  border:       'rgba(255,255,255,0.08)',
  green:        '#72B895',        /* soft sage — muted, not neon */
  greenDim:     '#2A4237',
  greenBg:      'rgba(114,184,149,0.08)',
  white:        '#FFFFFF',
  muted:        '#9BA89E',
  dimmed:       '#5C6B62',
  orange:       '#D4724A',
  blue:         '#6FA7FF',
  purple:       '#9B7FD4',
  red:          '#C95C5C',
  gold:         '#C4A832',
};

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;height:100dvh;background:${C.bg}}
  ::-webkit-scrollbar{display:none}
  body{
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    color:${C.white};-webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;letter-spacing:-0.015em;
    font-feature-settings:'cv02','cv03','cv04','cv11';
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
  /* Mobile: clear fixed tab bar + food FAB + hint chip + safe area (see TabBar + HomeTab floats) */
  @media(max-width:768px){
    .screen{padding-bottom:calc(172px + env(safe-area-inset-bottom, 0px))}
  }
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
    .screen{padding-bottom:44px}
    .miq-main-scroll{padding-bottom:96px}
  }
  @media(max-width:768px){
    .miq-main-scroll{padding-bottom:0}
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
// Single authoritative macro calculation function.
// Uses actual stored profile field names (weightLbs, heightCm, activity, unitSystem).
// scanData.leanMass is stored in lbs (always, per sanitizeScanData).
function calcTargets(profile, scanData = null) {
  if (!profile) return { calories: 2000, protein: 150, carbs: 200, fat: 67, tdee: 2400, steps: 9000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4, cardioDays: 2 };

  // Weight: always stored as lbs (onboarding converts metric → lbs on save)
  const weightLbs = Number(profile.weightLbs) || 165;
  const weightKg  = weightLbs * 0.453592;

  // Height: always stored as cm
  const heightCm = Number(profile.heightCm) || 175;

  const age    = Number(profile.age) || 25;
  const isMale = (profile.gender || 'Male') !== 'Female';

  // BMR — Mifflin-St Jeor
  const bmr = isMale
    ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
    : (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;

  // TDEE
  const activityMult = { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725 };
  const mult = activityMult[profile.activity] || 1.375;
  const tdee = Math.round(bmr * mult);

  // Calorie target
  const goal = (profile.goal || 'Maintain').toLowerCase();
  let calories = goal === 'cut' ? tdee - 400
    : goal === 'bulk' ? tdee + 300
    : tdee;
  calories = Math.max(calories, 1500);

  // Protein — use lean mass from scan if available, else body weight
  let protein;
  if (scanData && scanData.leanMass > 0) {
    const leanMassKg = scanData.leanMass * 0.453592; // leanMass stored in lbs
    protein = Math.round(leanMassKg * 2.2);
  } else {
    // Flat 2.0 g/kg body weight — consistent across all goals
    protein = Math.round(weightKg * 2.0);
  }

  // Fat — 25% of calories
  const fat = Math.round((calories * 0.25) / 9);

  // Carbs — remaining calories
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));

  const trainingDaysPerWeek = goal === 'bulk' ? 5 : goal === 'cut' ? 4 : 3;
  const cardioDays = goal === 'cut' ? 3 : goal === 'bulk' ? 1 : 2;

  return {
    calories,
    protein,
    carbs,
    fat,
    tdee,
    steps:               goal === 'cut' ? 10000 : 9000,
    sleepHours:          8,
    waterLiters:         Math.round(weightKg * 0.033 * 10) / 10,
    trainingDaysPerWeek,
    cardioDays,
  };
}

// Kept as thin wrapper so call sites that pass (profile) still work
function calcMacros(profile) {
  return calcTargets(profile, null);
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
  // Absolute floor = 0.7 g/lb bodyweight (bare minimum for nitrogen balance)
  // Engine already calculates 1.0-1.1 g/lb LBM, so this floor rarely triggers
  const minProtein = Math.round(kg * 1.55);   // ~0.7 g/lb — safety net only
  const maxProtein = Math.round(kg * 3.0);
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

// Returns a safely-formatted number, or fallback ('—') if the value is missing/zero/NaN
const safeNum = (val, decimals = 0, fallback = '—') => {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return fallback;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
};

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

// ── Body-fat value helpers ────────────────────────────────────────────────
// scan.bodyFat may be a number OR {low, high, midpoint} object — normalise both
const getBF = (scan) => {
  if (!scan) return null;
  const bf = scan.bodyFatPct ?? scan.bodyFat;
  if (bf == null) return null;
  if (typeof bf === 'number') return bf;
  if (typeof bf === 'object') return bf.midpoint ?? bf.low ?? Object.values(bf)[0] ?? null;
  return parseFloat(bf) || null;
};
const getBFDisplay = (scan) => {
  if (!scan) return '—';
  const bf = scan.bodyFatPct ?? scan.bodyFat;
  if (bf == null) return '—';
  if (typeof bf === 'number') return bf.toFixed(1) + '%';
  if (typeof bf === 'object' && bf.low != null && bf.high != null) return bf.low + '\u2013' + bf.high + '%';
  if (typeof bf === 'object' && bf.midpoint != null) return bf.midpoint.toFixed(1) + '%';
  const n = parseFloat(bf);
  return isNaN(n) ? '—' : n.toFixed(1) + '%';
};

/** Prefer full ISO from DB (scan.date after save) or savedAt — date-only strings skew "hours ago" by timezone. */
function formatRelativeScanTime(isoOrScan) {
  let iso = typeof isoOrScan === 'string' ? isoOrScan : null;
  if (isoOrScan && typeof isoOrScan === 'object') {
    const s = isoOrScan;
    const d = s.date != null ? String(s.date) : '';
    if (s.savedAt && (d.length <= 10 || !/[Tt]\d{2}:/.test(d))) iso = s.savedAt;
    else iso = s.date || s.savedAt || s.createdAt;
  }
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scanInstantMs(s) {
  if (!s) return 0;
  const raw = s.savedAt || s.date || s.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortedRealBodyScansByTime(scanList) {
  return (Array.isArray(scanList) ? scanList : [])
    .filter((s) => s && s.scanStatus !== 'duplicate' && !s.duplicateOfScanId)
    .sort((a, b) => scanInstantMs(a) - scanInstantMs(b));
}

function pickLatestRealScan(scanList) {
  const s = sortedRealBodyScansByTime(scanList);
  return s.length ? s[s.length - 1] : null;
}

function pickPreviousRealScan(scanList) {
  const s = sortedRealBodyScansByTime(scanList);
  return s.length >= 2 ? s[s.length - 2] : null;
}

function countNonDuplicateServerScans(scanList) {
  if (!Array.isArray(scanList)) return 0;
  return scanList.filter((s) => s && s.scanStatus !== 'duplicate' && !s.duplicateOfScanId).length;
}

/** Rough total weight (lbs) from lean mass (lbs) and body fat % — for comparison deltas only */
function estWeightLbsFromComp(leanMassLbs, bfPct) {
  if (leanMassLbs == null || bfPct == null) return null;
  const bf = Number(bfPct) / 100;
  if (!Number.isFinite(bf) || bf >= 0.999) return null;
  return leanMassLbs / (1 - bf);
}

function planAuditSnapshot(plan) {
  if (!plan) return null;
  return {
    phase: plan.phase,
    week: plan.week,
    startDate: plan.startDate,
    targetBF: plan.targetBF,
    startBF: plan.startBF,
    macros: {
      calories: plan?.dailyTargets?.calories ?? plan?.macros?.calories ?? null,
      protein: plan?.dailyTargets?.protein ?? plan?.macros?.protein ?? null,
      carbs: plan?.dailyTargets?.carbs ?? plan?.macros?.carbs ?? null,
      fat: plan?.dailyTargets?.fat ?? plan?.macros?.fat ?? null,
    },
  };
}

function weightKgFromProfile(profile) {
  if (!profile) return null;
  const kg = Number(profile.weightKg);
  if (Number.isFinite(kg) && kg > 0) return Number(kg.toFixed(3));
  const lbs = Number(profile.weightLbs);
  if (Number.isFinite(lbs) && lbs > 0) return Number((lbs * 0.453592).toFixed(3));
  return null;
}

const PHASE_META = {
  Cut:     { label: 'Cut',     icon: 'arrow-down', target: 'Reduce body fat while preserving lean tissue' },
  Bulk:    { label: 'Bulk',    icon: 'arrow-up',   target: 'Increase lean mass with controlled fat gain' },
  Build:   { label: 'Build',   icon: 'arrow-up',   target: 'Increase lean mass with controlled fat gain' },
  Recomp:  { label: 'Recomp',  icon: 'rotate',     target: 'Improve composition while maintaining bodyweight range' },
  Maintain:{ label: 'Maintain',icon: 'scale',      target: 'Hold conditioning and improve weak points' },
};

function getTrajectoryStatus(scanHistory = [], phase = 'Maintain') {
  if (!Array.isArray(scanHistory) || scanHistory.length === 0) return { tone: 'neutral', label: '', note: 'Complete your first body scan to activate trajectory tracking.' };
  if (scanHistory.length < 2) return { tone: 'neutral', label: '', note: 'Complete your next scan to validate your trajectory.' };
  const prev = scanHistory[scanHistory.length - 2];
  const curr = scanHistory[scanHistory.length - 1];
  const bfDelta = (getBF(curr) || 0) - (getBF(prev) || 0);
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

/* ─── Physique Projection helpers ──────────────────────────────────────────
   Deterministic stage classification + projection logic for the Physique
   Projection feature. No LLM. No fake images. Reference-stage system only.
─────────────────────────────────────────────────────────────────────────── */
// Updated stage labels — realistic, not aspirational
const PHYSIQUE_STAGES_M = [
  { key: 'stage_lean',    label: 'Stage Lean',       bfMax:  8, tier: 0, desc: 'Near-extreme leanness — competition or end-of-cut',   color: '#00E676', hw: 13 },
  { key: 'competition',   label: 'Athletic & Defined',bfMax: 13, tier: 1, desc: 'Clear muscle definition — abs visible at rest',        color: '#00C853', hw: 15 },
  { key: 'lean',          label: 'Lean & Fit',        bfMax: 16, tier: 2, desc: 'Fit and lean — definition visible in good lighting',   color: '#69F0AE', hw: 17 },
  { key: 'athletic',      label: 'Healthy & Active',  bfMax: 20, tier: 3, desc: 'Healthy body composition — active appearance',         color: '#FFD600', hw: 19 },
  { key: 'average',       label: 'Building Phase',    bfMax: 25, tier: 4, desc: 'Healthy, working toward more defined composition',      color: '#FF9800', hw: 22 },
  { key: 'high',          label: 'Heavy Bulk',        bfMax: 100, tier: 5, desc: 'Higher body fat — fat loss will unlock more progress', color: '#FF5722', hw: 25 },
];
const PHYSIQUE_STAGES_F = [
  { key: 'stage_lean',    label: 'Stage Lean',        bfMax: 16, tier: 0, desc: 'Near-competition leanness — elite athlete range',     color: '#00E676', hw: 13 },
  { key: 'competition',   label: 'Athletic & Toned',  bfMax: 21, tier: 1, desc: 'Visible muscle tone — athletic silhouette',            color: '#00C853', hw: 15 },
  { key: 'lean',          label: 'Lean & Active',     bfMax: 25, tier: 2, desc: 'Fit and lean — healthy, active appearance',            color: '#69F0AE', hw: 17 },
  { key: 'athletic',      label: 'Healthy & Active',  bfMax: 30, tier: 3, desc: 'Healthy body composition',                             color: '#FFD600', hw: 19 },
  { key: 'average',       label: 'Building Phase',    bfMax: 35, tier: 4, desc: 'Working toward improved composition',                  color: '#FF9800', hw: 22 },
  { key: 'high',          label: 'Heavy Bulk',        bfMax: 100, tier: 5, desc: 'Higher body fat — focus on fat loss and health',      color: '#FF5722', hw: 25 },
];

function getPhysiqueStage(bf, gender = 'Male') {
  const stages = gender === 'Female' ? PHYSIQUE_STAGES_F : PHYSIQUE_STAGES_M;
  return stages.find(s => bf < s.bfMax) || stages[stages.length - 1];
}

function getPhysiqueProjection(currentBF, goal, gender = 'Male', confidence = 'medium') {
  const goalKey = (goal || '').toLowerCase();
  let projBFLow, projBFHigh, timeline, projCopy, goalLabel;

  if (goalKey === 'cut') {
    // Realistic: 0.5%/wk sustainable, 10 weeks
    const rate = confidence === 'high' ? 0.55 : confidence === 'low' ? 0.35 : 0.45;
    const midLoss = +(rate * 10).toFixed(1);
    projBFLow  = Math.max(7,  +(currentBF - midLoss - 0.5).toFixed(1));
    projBFHigh = Math.max(7.5,+(currentBF - midLoss + 0.5).toFixed(1));
    timeline   = '10 weeks';
    projCopy   = 'With consistent adherence to your deficit and protein target, your plan trends toward a visibly leaner look.';
    goalLabel  = null; // use BF-based label
  } else if (goalKey === 'bulk' || goalKey === 'build') {
    projBFLow  = Math.min(30, +(currentBF + 1.0).toFixed(1));
    projBFHigh = Math.min(32, +(currentBF + 2.0).toFixed(1));
    timeline   = '10–12 weeks';
    projCopy   = 'Lean bulk — muscle density and size increase while body fat stays controlled.';
    goalLabel  = 'Built & Strong';
  } else if (goalKey === 'recomp') {
    const loss = +(0.3 * 10).toFixed(1);
    projBFLow  = Math.max(7,  +(currentBF - loss - 0.5).toFixed(1));
    projBFHigh = Math.max(7.5,+(currentBF - loss + 0.5).toFixed(1));
    timeline   = '10–12 weeks';
    projCopy   = 'Recomp is gradual but sustainable — expect slow fat loss alongside muscle improvement.';
    goalLabel  = 'Recomposed';
  } else {
    projBFLow  = currentBF;
    projBFHigh = currentBF;
    timeline   = 'Ongoing';
    projCopy   = 'Maintenance — preserve current composition with lifestyle consistency.';
    goalLabel  = 'Sustained & Lean';
  }

  const projBFMid      = +(((projBFLow + projBFHigh) / 2)).toFixed(1);
  const currentStage   = getPhysiqueStage(currentBF, gender);
  const projectedStage = getPhysiqueStage(projBFMid,  gender);
  const improving      = projectedStage.tier < currentStage.tier;

  // Override label for non-cut goals
  const projLabel = goalLabel || projectedStage.label;

  const stageCopy = improving
    ? `Plan projects you from "${currentStage.label}" toward "${projLabel}" over ${timeline}.`
    : goalKey === 'bulk' || goalKey === 'build'
    ? `Lean bulk — focus is muscle density and size, not fat reduction. Stage is stable by design.`
    : goalKey === 'recomp'
    ? `Gradual recomposition over ${timeline} — small fat loss with muscle improvement.`
    : `Maintenance keeps your stage stable. Focus on consistency.`;

  return { currentStage, projectedStage, projBFLow, projBFHigh, projBFMid, projLabel, timeline, projCopy, stageCopy, improving };
}

function getActiveTargets(activePlan, profile) {
  // Always recalculate from calcTargets — never use stale stored plan macros
  const latestScan = LS.get(LS_KEYS.scanHistory, []).slice(-1)[0] || null;
  const fresh = calcTargets(profile, latestScan);
  const stored = activePlan?.dailyTargets || activePlan?.macros || {};
  // Preserve non-macro plan targets (steps, sleep, water) from plan if set
  const targets = {
    ...fresh,
    steps:               stored.steps               || fresh.steps,
    sleepHours:          stored.sleepHours          || fresh.sleepHours,
    waterLiters:         stored.waterLiters         || fresh.waterLiters,
    trainingDaysPerWeek: stored.trainingDaysPerWeek || fresh.trainingDaysPerWeek,
    cardioDays:          stored.cardioDays          || fresh.cardioDays,
  };
  return clampMacros(targets, profile) || { calories: 2000, protein: 150, carbs: 210, fat: 60, steps: 9000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4, cardioDays: 2 };
}

function buildBaselinePlanFromProfile(profile) {
  // Use the physiological calculator — never hardcode macro values
  const computed = calcMacros(profile) || {};
  const targets = clampMacros({
    calories:            computed.calories            || 2000,
    protein:             computed.protein             || 150,
    carbs:               computed.carbs               || 210,
    fat:                 computed.fat                 || 60,
    steps:               computed.steps               || 9000,
    sleepHours:          computed.sleepHours          || 8,
    waterLiters:         computed.waterLiters         || 3,
    trainingDaysPerWeek: computed.trainingDaysPerWeek || 4,
    cardioDays:          computed.cardioDays          || 2,
  }, profile);
  const nextScan = new Date();
  nextScan.setDate(nextScan.getDate() + 28);
  return {
    phase:      profile?.goal || 'Maintain',
    phaseName:  `${profile?.goal || 'Maintain'} Phase`,
    objective:  `${profile?.goal || 'Maintain'} phase calibrated from your profile.`,
    week:       1,
    startDate:  todayStr(),
    nextScanDate: nextScan.toISOString().slice(0, 10),
    macros: {
      calories: targets.calories,
      protein:  targets.protein,
      carbs:    targets.carbs,
      fat:      targets.fat,
    },
    dailyTargets: targets,
    trainDays:    targets.trainingDaysPerWeek,
    sleepHrs:     targets.sleepHours,
    waterL:       targets.waterLiters,
    steps:        targets.steps,
    cardioDays:   targets.cardioDays,
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
    icon: meal.icon || 'bowl',
    name: invalidVegan ? 'Plant protein bowl' : safeName,
    calories,
    protein,
    carbs,
    fat,
    description: meal.description || '',
    whyNow: meal.whyNow || 'Matched to your remaining calorie and protein budget.',
    ...(meal.photoThumb ? { photoThumb: meal.photoThumb } : {}),
  };
}

function sanitizeScanData(scan, profile) {
  if (!scan) return scan;
  // Support bodyFatRange object from new prompt OR flat bodyFatPct from old prompt
  const bfLow  = Number(scan.bodyFatRange?.low  || 0);
  const bfHigh = Number(scan.bodyFatRange?.high || 0);
  const bfMid  = bfLow && bfHigh ? (bfLow + bfHigh) / 2 : 0;
  const rawBf  = bfMid || Number(scan.bodyFatPct || scan.bodyFat || (profile?.gender === 'Female' ? 28 : 20));
  const bodyFatPct = Math.min(55, Math.max(4, rawBf));
  const bodyFatRange = bfLow && bfHigh
    ? { low: Math.max(4, bfLow), high: Math.min(55, bfHigh), midpoint: Number(bodyFatPct.toFixed(1)) }
    : { low: Math.max(4, bodyFatPct - 2), high: Math.min(55, bodyFatPct + 2), midpoint: Number(bodyFatPct.toFixed(1)) };
  const weight = Number(profile?.weightLbs || 180);
  // Always derive leanMass from weight (lbs) × (1 - BF%) — never trust Claude's raw leanMass
  // value since the model may return it in kg while we store/display everything in lbs.
  // Example: 75 kg person, 14% BF → weightLbs=165.3, leanMass=165.3×0.86=142.2 lbs ✓
  const computedLeanMass = weight * (1 - bodyFatPct / 100);
  const leanMass = Number(Math.min(weight * 0.96, Math.max(weight * 0.35, computedLeanMass)).toFixed(1));
  const confidence = ['low', 'medium', 'high'].includes(scan.bodyFatConfidence || scan.confidence)
    ? (scan.bodyFatConfidence || scan.confidence)
    : 'medium';
  // Deterministic scoring — replaces raw Claude clamping
  // Claude's visual estimate is one component (visualAssessment), not the whole score.
  const heightCm = profile?.heightCm || (profile?.heightIn ? Math.round(Number(profile.heightIn) * 2.54) : 170);
  const claudeRawScore    = Number(scan.physiqueScore || scan.overallPhysiqueScore || scan.score || 60);
  const claudeRawSymmetry = Number(scan.symmetryScore || 75);
  const scored = computePhysiqueScore({
    bodyFatPct,
    leanMassLbs:    leanMass,
    heightCm,
    gender:         profile?.gender || 'Male',
    claudeScore:    claudeRawScore,
    claudeSymmetry: claudeRawSymmetry,
    confidence,
  });

  return {
    ...scan,
    bodyFatPct: Number(bodyFatPct.toFixed(1)),
    bodyFatRange,
    bodyFatConfidence: confidence,
    bodyFatReasoning: scan.bodyFatReasoning || '',
    leanMass: Number(leanMass.toFixed(1)),
    leanMassTrend: ['gaining', 'losing', 'maintaining', 'unknown'].includes(scan.leanMassTrend) ? scan.leanMassTrend : 'unknown',
    physiqueScore:    scored.physiqueScore,
    symmetryScore:    scored.symmetryScore,
    ffmi:             scored.ffmi,
    scoringBreakdown: scored.breakdown,
    scoringVersion:   SCORING_VERSION,
    symmetryDetails: scan.symmetryDetails || '',
    confidence,
    limitingFactor: scan.limitingFactor || '',
    limitingFactorExplanation: scan.limitingFactorExplanation || '',
    photoQualityIssues: Array.isArray(scan.photoQualityIssues) ? scan.photoQualityIssues : [],
    trainingFocus: scan.trainingFocus || null,
    nutritionKeyChange: scan.nutritionKeyChange || '',
  };
}

/* ─── Content Generators — Zero-LLM ─────────────────────────────────────────
   All plan/mission/tip/insight generation is now deterministic.
   LLM is reserved ONLY for: physique scan (vision), meal suggestions,
   recipe details, meal swaps, and food photo analysis.
   Cost: ~$0.005/session (down from ~$0.17 with all-Sonnet approach).
─────────────────────────────────────────────────────────────────────────── */

async function generateInitialPlan(profile, macros, engineOutput = null) {
  // Build template plan (deterministic, always succeeds)
  const plan = buildPlanContent(profile, macros, engineOutput);
  // Overlay Claude-generated narrative from engine when available
  const n = engineOutput?.narrative;
  if (n) {
    if (n.objective)           plan.phase.objective    = n.objective;
    if (n.whyThisWorks)        plan.whyThisWorks       = n.whyThisWorks;
    if (n.nutritionKeyChange)  plan.nutritionKeyChange = n.nutritionKeyChange;
    if (n.primaryAction && plan.weeklyMissions?.length > 0) {
      plan.weeklyMissions[0] = n.primaryAction;
    }
  }
  return plan;
}

async function generateMealPlan(profile, activePlan) {
  // Synchronous — no LLM call. Template database with macro-matching.
  const m          = getActiveTargets(activePlan, profile);
  const trainDays  = m.trainingDaysPerWeek || activePlan?.trainDays || 4;
  const targetCalories = m.calories || 2000;
  const targetProtein = m.protein || 150;

  const de = activePlan?.decisionEngine;
  const na = de?.nutrition_adjustments;
  const directives = {
    simplifyRepeat: Boolean(na?.simplify_meals),
    trainingCarbEmphasis: Boolean(na?.carb_training_emphasis),
    satietyFocus: Boolean(na?.satiety_focus),
    deficitAggressiveness: na?.deficit_aggressiveness,
    phaseContext: activePlan?.phase || profile.goal,
    proteinDistributionEven: na?.protein_distribution === 'even',
    carbTiming: na?.carb_timing === 'around_training' ? 'around_training' : 'even',
    vegetarianProteinOptimize: Boolean(na?.vegetarian_protein_optimize),
  };

  /** First day daily totals (template uses breakfast/lunch/dinner/snack, not meals[]) */
  const computeFirstDayTotals = (days) => {
    const first = Array.isArray(days) && days[0] ? days[0] : null;
    return sumMealDayMacros(first);
  };

  const withinTolerance = (totals) => (
    Math.abs(Number(totals.calories || 0) - targetCalories) <= 75
    && Math.abs(Number(totals.protein || 0) - targetProtein) <= 10
  );

  const rebalancePlan = (days) => (Array.isArray(days) ? days : []).map((d) => {
    const totals = sumMealDayMacros(d);
    const calScale = totals.calories > 0 ? targetCalories / totals.calories : 1;
    const proteinDelta = targetProtein - totals.protein;
    const slotCount = Array.isArray(d?.meals) && d.meals.length
      ? d.meals.length
      : 4;
    const proteinPerSlot = proteinDelta / Math.max(1, slotCount);

    const mapMeal = (meal) => {
      if (!meal) return meal;
      const baseProtein = Number(meal?.protein || 0) * calScale;
      const protein = Math.max(0, baseProtein + proteinPerSlot);
      const carbs = Math.max(0, Number(meal?.carbs || 0) * calScale);
      const fat = Math.max(0, Number(meal?.fat || 0) * calScale);
      const calories = Math.max(0, (protein * 4) + (carbs * 4) + (fat * 9));
      return {
        ...meal,
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
      };
    };

    if (Array.isArray(d?.meals) && d.meals.length) {
      return { ...d, meals: d.meals.map(mapMeal) };
    }
    return {
      ...d,
      breakfast: mapMeal(d.breakfast),
      lunch: mapMeal(d.lunch),
      dinner: mapMeal(d.dinner),
      snack: mapMeal(d.snack),
    };
  });

  let generated = buildMealPlan(
    targetCalories,
    targetProtein,
    trainDays,
    profile.dietPrefs || [],
    profile.avoid     || [],
    directives,
  );
  let totals = computeFirstDayTotals(generated);

  // Try deterministic regeneration around target before rebalance.
  if (!withinTolerance(totals)) {
    const targets = [
      { c: targetCalories + 50, p: targetProtein },
      { c: targetCalories - 50, p: targetProtein },
      { c: targetCalories, p: targetProtein + 8 },
      { c: targetCalories, p: targetProtein - 8 },
    ];
    for (const t of targets) {
      const candidate = buildMealPlan(
        t.c,
        t.p,
        trainDays,
        profile.dietPrefs || [],
        profile.avoid || [],
        directives,
      );
      const candidateTotals = computeFirstDayTotals(candidate);
      if (withinTolerance(candidateTotals)) {
        generated = candidate;
        totals = candidateTotals;
        break;
      }
    }
  }

  if (!withinTolerance(totals)) {
    generated = rebalancePlan(generated);
    totals = computeFirstDayTotals(generated);
  }

  console.info('[meal:verify] generated meal plan totals', {
    target_calories: targetCalories,
    target_protein: targetProtein,
    actual_calories: totals.calories,
    actual_protein: totals.protein,
    calories_ok: Math.abs(Number(totals.calories || 0) - targetCalories) <= 75,
    protein_ok: Math.abs(Number(totals.protein || 0) - targetProtein) <= 10,
  });
  return generated;
}

async function generateSuggestions(profile, activePlan, todayMeals) {
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

async function generatePatterns(profile, activePlan, latestScan = null) {
  // Synchronous — no LLM call. Returns same shape as previous Claude version.
  const m         = getActiveTargets(activePlan, profile);
  const trainDays = m.trainingDaysPerWeek || activePlan?.trainDays || 4;

  // Reconstruct engineOutput shape from data saved on the activePlan at scan time.
  // This ensures insights reflect the actual diagnosis from the user's latest scan.
  const engineOutput = activePlan?.engineDiagnosis ? {
    diagnosis:  activePlan.engineDiagnosis,
    physio:     { tdee: activePlan.tdee ?? null },
    trajectory: activePlan.engineTrajectory ?? null,
  } : null;

  const insights = buildInsights(
    { goal: profile.goal, activity: profile.activity || 'Moderate' },
    { calories: m.calories || 2000, protein: m.protein || 150 },
    trainDays,
    engineOutput,
  );
  return { insights };
}

async function generateMissions(profile, activePlan) {
  // Synchronous — no LLM call. Template-based tier system.
  const m         = getActiveTargets(activePlan, profile);
  const trainDays = m.trainingDaysPerWeek || activePlan?.trainDays || 4;
  return buildMissions(profile.goal, { calories: m.calories||2000, protein: m.protein||150 }, trainDays);
}

async function generateWorkoutPlan(profile, activePlan) {
  // Synchronous — no LLM call. Evidence-based split selection by training days + scan decision.
  const trainDays = getActiveTargets(activePlan, profile)?.trainingDaysPerWeek || activePlan?.trainDays || 4;
  const de = activePlan?.decisionEngine;
  const ta = de?.training_adjustments;
  const goal = activePlan?.phase || de?.phase_decision?.recommended_phase || profile.goal;
  const intel = {
    priorityMusclesHigh: ta?.priority_muscles_high,
    priorityMusclesMedium: ta?.priority_muscles_medium,
    volumeDelta: typeof ta?.volume_delta_sets === 'number' ? ta.volume_delta_sets : undefined,
    cardioDelta: typeof ta?.cardio_delta === 'number' ? ta.cardio_delta : undefined,
    trainingEmphasis: ta?.unilateral ? 'correction' : undefined,
    symmetryActions: ta?.unilateral ? [{ area: 'Balance', action: 'Add unilateral accessories for lagging or asymmetric sides.' }] : undefined,
    recoveryNotes: typeof ta?.recovery_notes === 'string' ? ta.recovery_notes : undefined,
    movePriorityEarlyInWeek: Boolean(ta?.move_priority_muscles_early_in_week),
    weeklySetBonusMap: ta?.weekly_set_targets && typeof ta.weekly_set_targets === 'object' ? ta.weekly_set_targets : undefined,
  };
  return buildWorkoutPlan(goal, trainDays, intel);
}

async function generateRecipeDetails(meal, profile) {
  // Use Haiku — recipe generation is simple structured output, no complex reasoning needed.
  const text = await callClaude([{ role: 'user', content:
    `Recipe for: ${meal.name} (${meal.calories} kcal, ${meal.protein}g P, ${meal.carbs}g C, ${meal.fat}g F). Goal: ${profile?.goal||'fitness'}.
Return ONLY JSON: {"ingredients":["200g chicken breast"],"steps":[{"text":"Cook step","timerSeconds":null}]}`
  }], 500, 'haiku');
  return parseJSON(text);
}

async function swapMealAPI(currentMeal, profile) {
  // Use Haiku — simple substitution task with structured output.
  const mealType = currentMeal.mealType || currentMeal.time || 'Meal';
  const text = await callClaude([{ role: 'user', content:
    `Suggest a different ${mealType} meal. Target: ${currentMeal.calories} kcal, ${currentMeal.protein}g protein. Goal: ${profile?.goal}. Avoid: ${(profile?.avoid||[]).join(',')||'none'}.
Return ONLY JSON: {"name":"","description":"","icon":"emoji","calories":${currentMeal.calories},"protein":${currentMeal.protein},"carbs":${currentMeal.carbs||0},"fat":${currentMeal.fat||0},"prepTime":"","whyThisMeal":""}`
  }], 300, 'haiku');
  return parseJSON(text);
}

/* ─── Error Boundary ─────────────────────────────────────────────────────── */
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { if (process.env.NODE_ENV === 'development') console.error('[TabErrorBoundary]', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Icon name="warning" size={32} color={C.orange} /></div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {String(this.state.error?.message || 'Unexpected error')}
          </div>
          <button
            style={{ padding: '10px 20px', borderRadius: 10, background: C.green, color: '#071109', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="brain" size={28} color={C.green} strokeWidth={1.25} /></div>
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
  { key: 'Cut',      icon: 'arrow-down', label: 'Cut',      desc: 'Lose fat, preserve muscle' },
  { key: 'Bulk',     icon: 'arrow-up',   label: 'Bulk',     desc: 'Build maximum muscle mass' },
  { key: 'Recomp',   icon: 'rotate',     label: 'Recomp',   desc: 'Lose fat & gain muscle simultaneously' },
  { key: 'Maintain', icon: 'scale',      label: 'Maintain', desc: 'Stay lean at current weight' },
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

function Onboarding({ onComplete, currentUserId, isEditing }) {
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
    // Skip pre-fill if the cache belongs to a different user OR has no user id stamp
    if (currentUserId && saved.id !== currentUserId) {
      console.info('[onboarding] skipping pre-fill — cached profile mismatch or unscoped', { cached: saved.id, current: currentUserId });
      return;
    }
    // Skip pre-fill if the cached profile is a skeleton (all core fields null).
    // This happens when ensureProfile creates an empty row and hydration caches it.
    // Spreading null values into data breaks controlled inputs (value={null} → React warning
    // → Next.js error overlay blocks clicks).
    if (!saved.age && !saved.weightLbs && !saved.heightCm && !saved.weightKg) {
      console.info('[onboarding] skipping pre-fill — skeleton profile (no data to restore)');
      return;
    }
    const inches = saved.heightCm ? saved.heightCm / 2.54 : (saved.heightIn || 0);
    setData((p) => ({
      ...p,
      name: saved.name || p.name || '',
      age: saved.age ? String(saved.age) : p.age || '',
      gender: saved.gender || p.gender || 'Male',
      goal: saved.goal || p.goal || '',
      activity: saved.activity || p.activity || '',
      unitSystem: saved.unitSystem || p.unitSystem || 'imperial',
      dietPrefs: Array.isArray(saved.dietPrefs) ? saved.dietPrefs : p.dietPrefs || [],
      cuisines: Array.isArray(saved.cuisines) ? saved.cuisines : p.cuisines || [],
      avoid: Array.isArray(saved.avoid) ? saved.avoid : p.avoid || [],
      weightLbs: saved.weightLbs ? String(saved.weightLbs) : p.weightLbs || '',
      weightKg: saved.weightLbs ? (saved.weightLbs * 0.453592).toFixed(1) : (saved.weightKg ? String(saved.weightKg) : p.weightKg || ''),
      heightCm: saved.heightCm ? String(saved.heightCm) : p.heightCm || '',
      heightFt: inches ? String(Math.floor(inches / 12)) : p.heightFt || '',
      heightInch: inches ? String(Math.round(inches % 12)) : p.heightInch || '',
    }));
  }, []);

  const TOTAL = 9; // steps 0-8

  const canNext = [
    !!(data.name || '').trim(),                // 0 name
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
    // Build explicit profile — no form-only keys; every field maps to correct DB column
    const profile = {
      name: String(data.name || '').trim(),
      goal: data.goal || null,
      unitSystem: data.unitSystem === 'metric' ? 'metric' : 'imperial',
      age: Number(data.age),
      weightLbs: Number(normalizedWeightLbs.toFixed(1)),
      weightKg: Number((normalizedWeightLbs * 0.453592).toFixed(2)),
      heightCm: Number(normalizedHeightCm.toFixed(1)),
      heightIn: Number((normalizedHeightCm / 2.54).toFixed(1)),
      gender: data.gender || 'Male',
      activity: data.activity || null,
      dietPrefs: Array.isArray(data.dietPrefs) ? data.dietPrefs : [],
      cuisines: Array.isArray(data.cuisines) ? data.cuisines : [],
      avoid: Array.isArray(data.avoid) ? data.avoid : [],
    };
    if (process.env.NODE_ENV !== 'production') {
      console.info('[onboarding:debug] final profile payload (before save)', JSON.stringify({
        name: profile.name, goal: profile.goal, unitSystem: profile.unitSystem,
        age: profile.age, weightLbs: profile.weightLbs, heightCm: profile.heightCm,
        gender: profile.gender, activity: profile.activity,
        dietPrefs: profile.dietPrefs, cuisines: profile.cuisines, avoid: profile.avoid,
      }));
    }
    LS.set(LS_KEYS.profile, profile);

    // Editing existing profile — skip plan gen (use explicit flag, not stale LS cache)
    if (isEditing) { onComplete(profile, null); return; }

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
            onKeyDown={e => e.key === 'Enter' && (data.name || '').trim() && goNext()}
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
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <Icon name={g.icon} size={36} color={data.goal === g.key ? C.green : C.muted} strokeWidth={1.5} />
                </div>
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
          <div style={{ marginBottom: 20 }}><Icon name="bolt" size={52} color={C.green} strokeWidth={1} /></div>
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
        <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="brain" size={26} color={C.green} strokeWidth={1.25} /></div>
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
  return <span>{tip}</span>;
}

function TargetTile({ icon, label, current, target, unit, color, showProgress = true, sourceLabel }) {
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
      {sourceLabel && (
        <div style={{ fontSize: 10, color: C.dimmed, marginTop: 2 }}>{sourceLabel}</div>
      )}
    </div>
  );
}

/* ─── Home insight derivation ────────────────────────────────────────────── */
function getHomeInsight(activePlan, scanHistory, macros, todayStats) {
  if (!activePlan) return null;

  /* 1 — Engine diagnosis (most authoritative) */
  const diag = activePlan?.engineDiagnosis?.primary;
  if (diag?.primary_issue) {
    const latestScan = Array.isArray(scanHistory) ? scanHistory.slice(-1)[0] : null;
    const currentBF  = getBF(latestScan);
    const targetBF   = activePlan?.goalBF || activePlan?.targetBF;
    return {
      title:       diag.primary_issue,
      explanation: diag.explanation || null,
      actionType:  'diagnosis',
      projection:  (currentBF && targetBF) ? `${currentBF}% → ${targetBF}% · ~10 weeks` : null,
    };
  }

  /* 2 — Trajectory warning */
  const traj = getTrajectoryStatus(scanHistory, activePlan?.phase);
  if (traj.tone === 'warn') {
    const titleMap = {
      'Too aggressive': 'Cutting too aggressively',
      'Behind':         'Progress is slower than expected',
      'Off balance':    'Fat gain is outpacing muscle growth',
    };
    return {
      title:       titleMap[traj.label] || traj.note?.split('.')[0] || 'Trajectory needs attention',
      explanation: traj.note?.split('.')?.[1]?.trim() || null,
      actionType:  'trajectory',
      projection:  null,
    };
  }

  /* 3 — Today's protein lagging */
  const protPct = macros?.protein > 0 ? todayStats.protein / macros.protein : 1;
  if (protPct < 0.45 && todayStats.calories > 300) {
    return {
      title:       'Protein intake is too low',
      explanation: 'Your current rate risks muscle loss — add a high-protein meal',
      actionType:  'protein',
      projection:  null,
    };
  }

  /* 4 — On track positive */
  if (traj.tone === 'good') {
    return {
      title:       "Progress is on track",
      explanation: traj.note || null,
      actionType:  'positive',
      projection:  null,
    };
  }

  return null;
}

/* ─── Premium Gate + Paywall ─────────────────────────────────────────────────
   Central gating layer. Use <PremiumGate> to wrap any premium-only section.
   Pass onUpgrade to open the paywall from any locked teaser card.
────────────────────────────────────────────────────────────────────────────── */

const FEATURE_COPY = {
  [FEATURES.FULL_SCAN_DETAILS]:  { title: 'Full Scan Analysis',           desc: 'Unlock detailed limiting factors, muscle group assessments, and actionable recommendations from every scan.' },
  [FEATURES.SCAN_COMPARISON]:    { title: 'See What Actually Changed',    desc: 'Every scan shows precise before/after deltas — body fat lost, lean mass gained, score shift. Know if your effort is working.' },
  [FEATURES.SCAN_HISTORY]:       { title: 'Track Progress Over Time',     desc: 'See how your body fat, lean mass, and physique score are trending across all your scans with full deltas.' },
  [FEATURES.PROJECTIONS]:        { title: 'Your Timeline to the Goal',    desc: 'Based on your actual scan pace, Premium calculates how many weeks to reach your target body fat. No guessing.' },
  [FEATURES.ADAPTIVE_PLAN]:      { title: 'Macros That Update With You',  desc: 'After each scan, your calorie and protein targets automatically adjust to what your body actually needs right now.' },
  [FEATURES.DECISION_LOG]:       { title: 'Why Your Plan Changed',        desc: 'Every macro update comes with a specific reason — plateau detected, pace off target, lean mass shift. Full transparency.' },
  [FEATURES.CORRECTIONS]:        { title: 'Fix the Weakest Links',        desc: 'Premium identifies muscle imbalances from your scan and gives you specific protocol adjustments to correct them.' },
  [FEATURES.PREMIUM_INSIGHTS]:   { title: 'Deeper Body Composition Data', desc: 'FFMI, scoring breakdown, and composition analytics beyond body fat — for users who want the full picture.' },
  [FEATURES.TREND_ANALYSIS]:     { title: 'Track Progress Over Time',     desc: 'See how your body fat, lean mass, and physique score are trending week over week across all your scans.' },
  [FEATURES.WORKOUT_ADJUSTMENTS]:{ title: 'Training Adjusts to Your Scan',desc: 'When scan results show a plateau or imbalance, your training volume and priority areas update automatically.' },
};

function PremiumGate({ feature, subscription, onUpgrade, children }) {
  if (hasFeature(subscription, feature)) return children;

  const copy = FEATURE_COPY[feature] || { title: 'Premium Feature', desc: 'Upgrade to MassIQ Premium to unlock this.' };

  return (
    <div style={{
      borderRadius: 18, border: `1px solid rgba(114,184,149,0.18)`,
      background: 'rgba(114,184,149,0.04)', padding: '20px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: 'rgba(114,184,149,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="lock" size={11} color={C.green} strokeWidth={2.5} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.green, textTransform: 'uppercase' }}>Premium</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>{copy.title}</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{copy.desc}</div>
      <button
        className="bp"
        onClick={onUpgrade}
        style={{
          marginTop: 4, background: C.green, color: '#0A0D0A', border: 'none',
          padding: '10px 20px', borderRadius: 99, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', alignSelf: 'flex-start',
        }}
      >
        Unlock Premium →
      </button>
    </div>
  );
}

// persistGate — a React ref whose .current holds the Promise from the initial
// onboarding profile write. The Paywall awaits it before opening Stripe so that
// we NEVER navigate away while a DB write is still in flight (which would cause
// the browser to cancel it, leaving an incomplete profile in the DB and routing
// the user back into onboarding on return from checkout).
function Paywall({ userId, accessToken, onClose, persistGate }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [prepStep, setPrepStep] = useState('');

  const handleUpgrade = async () => {
    if (!userId || !accessToken) {
      setError('Please sign in to continue.');
      return;
    }
    setLoading(true);
    setError('');
    setPrepStep('Preparing checkout...');

    const pendingSync = persistGate?.current;
    if (pendingSync) {
      try {
        setPrepStep('Finalizing your profile...');
        await pendingSync;
        persistGate.current = null;
      } catch (syncErr) {
        setError('Your profile could not be saved. Check your connection and try again before upgrading.');
        setLoading(false);
        return;
      }
    }
    // Fresh-account hardening: ensure a profile row exists before redirecting away.
    // This prevents return-time onboarding/login confusion when checkout starts too early.
    try {
      setPrepStep('Stabilizing account...');
      await ensureProfile(accessToken, userId);
    } catch (profileErr) {
      setError('Your profile is still syncing. Please retry in a moment.');
      setLoading(false);
      return;
    }

    try {
      setPrepStep('Redirecting to checkout...');
      const returnOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      console.info('[checkout] starting', { return_origin: returnOrigin, href: typeof window !== 'undefined' ? window.location.href : '' });
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ return_origin: returnOrigin }),
      });
      const { url, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);
      if (!url) { setLoading(false); return; }
      try {
        sessionStorage.setItem('massiq:billing-return', '1');
        localStorage.setItem('massiq:checkout-origin', returnOrigin || window.location.origin);
      } catch {}
      window.location.href = url;
      return;
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
    }
    setPrepStep('');
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(6,10,7,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'flex-end', padding: 0,
    }}>
      <div style={{
        width: '100%', maxWidth: 520, margin: '0 auto',
        background: '#111811', borderRadius: '28px 28px 0 0',
        border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none',
        padding: '28px 24px max(28px, env(safe-area-inset-bottom))',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.green, textTransform: 'uppercase', marginBottom: 6 }}>
              MassIQ Premium
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.white, lineHeight: 1.15 }}>
              Your scan data<br />should drive decisions.
            </div>
          </div>
          <button
            onClick={onClose}
            className="bp"
            style={{
              width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', color: C.muted, fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Subheadline */}
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
          Free shows you where you are. Premium tells you exactly what to do next — and updates your plan as you progress.
        </div>

        {/* 4 core outcome blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {[
            {
              icon: 'scan',
              label: 'Unlimited scans',
              desc: 'Body scans and food scans with no limits. Track your physique and meals as often as you need.',
            },
            {
              icon: 'rotate',
              label: 'Macros that adapt after every scan',
              desc: 'Stop guessing. After each scan, your calorie and protein targets update automatically based on what your body actually shows.',
            },
            {
              icon: 'clock',
              label: 'Know how many weeks to your goal',
              desc: 'Premium calculates your timeline to target body fat based on your actual pace — not generic estimates.',
            },
            {
              icon: 'bolt',
              label: 'See exactly what changed and why',
              desc: 'Scan-to-scan comparison with precise deltas. Understand whether you\'re progressing, plateauing, or need a correction.',
            },
          ].map(b => (
            <div key={b.label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              background: 'rgba(114,184,149,0.05)', border: '1px solid rgba(114,184,149,0.12)',
              borderRadius: 16, padding: '14px 16px',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: 'rgba(114,184,149,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={b.icon} size={17} color={C.green} strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4, lineHeight: 1.3 }}>{b.label}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        {error && (
          <div style={{ fontSize: 12, color: '#FFB4B7', marginBottom: 12, padding: '10px 12px', background: 'rgba(255,90,95,0.08)', borderRadius: 10 }}>
            {error}
          </div>
        )}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          style={{
            width: '100%', background: loading ? 'rgba(114,184,149,0.5)' : C.green,
            color: '#0A0D0A', border: 'none', padding: '16px', borderRadius: 99,
            fontSize: 16, fontWeight: 800, cursor: loading ? 'default' : 'pointer', marginBottom: 12,
          }}
        >
          {loading ? (prepStep || 'Loading…') : 'Upgrade to Premium'}
        </button>
        <button
          onClick={onClose}
          className="bp"
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, color: C.dimmed, padding: '8px', marginBottom: 8,
          }}
        >
          Continue with free
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: C.dimmed }}>
          Cancel anytime · No hidden charges
        </div>
      </div>
    </div>
  );
}

async function fetchFoodScanStatus(accessToken) {
  if (!accessToken) return { premium: false, remaining_today: FREE_FOOD_SCAN_LIMIT, used_today: 0 };
  const res = await fetch('/api/food-scan/status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
  return data;
}

async function recordFoodScanSuccess(accessToken, payload) {
  if (!accessToken) throw new Error('Missing session');
  const res = await fetch('/api/food-scan/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `complete ${res.status}`);
  const fl = data?.food_log;
  if (fl && fl.ok === false && fl.skip_reason !== 'no_valid_calories') {
    console.warn('[food-log] not persisted', { skip_reason: fl.skip_reason, error: fl.error });
  }
  return data;
}

/* ─── Home Tab ───────────────────────────────────────────────────────────── */
function HomeTab({ profile, activePlan, setTab, showToast, scanHistory, subscription, entitlements, onUpgrade, userId, accessToken, onFoodScanComplete }) {
  const today      = new Date().toISOString().slice(0, 10);
  const macros     = getActiveTargets(activePlan, profile);
  const [meals, setMeals]           = useState(() => LS.get(LS_KEYS.meals(today), []));
  const [scanning, setScanning]     = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [foodRemainingToday, setFoodRemainingToday] = useState(isPremiumActive(subscription) ? Infinity : FREE_FOOD_SCAN_LIMIT);
  const fileRef = useRef(null);

  const refreshFoodStatus = async () => {
    if (!accessToken) return { premium: false, remaining_today: FREE_FOOD_SCAN_LIMIT, used_today: 0 };
    try {
      const status = await fetchFoodScanStatus(accessToken);
      setFoodRemainingToday(status?.premium ? Infinity : Math.max(0, Number(status?.remaining_today ?? FREE_FOOD_SCAN_LIMIT)));
      return status;
    } catch {
      const fallbackRemaining = isPremiumActive(subscription) ? Infinity : FREE_FOOD_SCAN_LIMIT;
      setFoodRemainingToday(fallbackRemaining);
      return { premium: isPremiumActive(subscription), remaining_today: fallbackRemaining, used_today: 0 };
    }
  };

  useEffect(() => {
    refreshFoodStatus();
  }, [accessToken, userId, subscription?.status]);

  const todayStats = meals.reduce(
    (a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0) }),
    { calories: 0, protein: 0 }
  );

  const calMet  = macros?.calories > 0 && todayStats.calories >= macros.calories * 0.9;
  const protMet = macros?.protein  > 0 && todayStats.protein  >= macros.protein  * 0.9;

  const focusItems = [
    {
      id: 'calories', label: 'Calories',
      current: todayStats.calories, target: macros?.calories || 2000, unit: 'kcal', met: calMet,
      detail: `${todayStats.calories} of ${macros?.calories || 2000} kcal`,
    },
    {
      id: 'protein', label: 'Protein',
      current: todayStats.protein, target: macros?.protein || 150, unit: 'g', met: protMet,
      detail: `${todayStats.protein}g of ${macros?.protein || 150}g target`,
    },
    {
      id: 'training', label: 'Training',
      current: 0, target: activePlan?.trainDays || 3, unit: 'sessions/wk', met: false,
      detail: `${activePlan?.trainDays || 3} sessions this week`,
    },
    {
      id: 'steps', label: 'Steps',
      current: 0, target: macros?.steps || 8000, unit: 'steps', met: false,
      detail: `Target: ${(macros?.steps || 8000).toLocaleString()} per day`,
    },
  ];

  const completedCount  = focusItems.filter(i => i.met).length;
  const resolvedHistory = Array.isArray(scanHistory) && scanHistory.length ? scanHistory : LS.get(LS_KEYS.scanHistory, []);
  const realBodyScans   = resolvedHistory.filter((s) => s && s.scanStatus !== 'duplicate' && !s.duplicateOfScanId);
  const hasScan         = realBodyScans.length > 0;
  const insight         = getHomeInsight(activePlan, resolvedHistory, macros, todayStats);

  /* Status line */
  const statusText = !activePlan
    ? 'Start your first scan'
    : completedCount === focusItems.length ? 'All goals hit today'
    : completedCount >= 2               ? "You're on track"
    : getTrajectoryStatus(resolvedHistory, activePlan?.phase).tone === 'warn'
                                        ? 'Needs attention today'
    : "Let's get going";
  const statusGood = activePlan && (completedCount >= 2 || getTrajectoryStatus(resolvedHistory, activePlan?.phase).tone === 'good');

  /* Insight action pills — context-aware navigation */
  const insightActions = (() => {
    if (!insight) return [];
    const t = (insight.actionType || '');
    if (t === 'diagnosis') return [
      { label: 'View plan',    fn: () => setTab('plan') },
      { label: 'Log meal',     fn: () => setTab('nutrition') },
    ];
    if (t === 'trajectory')  return [{ label: 'View progress', fn: () => setTab('profile') }];
    if (t === 'protein')     return [{ label: 'Log meal',      fn: () => setTab('nutrition') }];
    return [];
  })();

  /* Food scan — enforced server-side via /api/food-scan */
  const handleScanFile = async (file) => {
    if (!file) return;
    if (!accessToken) {
      showToast?.('Please sign in to scan food.');
      return;
    }
    const status = await refreshFoodStatus();
    if (!status?.premium && Number(status?.remaining_today ?? 0) <= 0) {
      showToast?.(`You've reached your daily limit. Upgrade for unlimited scans.`);
      onUpgrade?.();
      return;
    }
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/api/food-scan', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
              { type: 'text', text: `Identify this food and return ONLY valid JSON: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0}. If the image does not contain food, return {"error":"not_food"}.` },
            ]}],
            max_tokens: 150,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            showToast?.(data?.error || `Food scan limit reached. Upgrade for unlimited scans.`);
            return;
          }
          throw new Error(data?.error || `API ${res.status}`);
        }
        const match = (data?.text || '').match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON in response');
        const parsed = JSON.parse(match[0]);
        if (parsed?.error === 'not_food') throw new Error('NOT_FOOD');
        setScanResult(parsed);
      } catch (err) {
        console.error('Food scan error:', err);
        const msg = String(err?.message || '');
        showToast?.(msg.includes('NOT_FOOD') || msg.includes('scan a food') ? 'Oops, you need to scan a food.' : 'Scan failed — try again');
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const confirmScan = async () => {
    if (!scanResult) return;
    const meal = sanitizeMeal({
      id: Date.now(), name: scanResult.name || 'Food', category: 'Meal',
      calories: scanResult.calories || 0, protein: scanResult.protein || 0,
      carbs: scanResult.carbs || 0, fat: scanResult.fat || 0,
    }, macros, profile);
    const updated = [...meals, meal];
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
    try {
      await onFoodScanComplete?.({
        source: 'home',
        meal_name: meal.name,
        meal_id: String(meal.id),
        calories: meal.calories,
        protein_g: meal.protein,
        carbs_g: meal.carbs,
        fat_g: meal.fat,
        food_items: [{ name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat }],
      });
      await refreshFoodStatus();
    } catch (err) {
      console.error('[food-scan] completion write failed:', err?.message);
    }
    setScanResult(null);
    showToast?.('Meal logged');
  };

  return (
    <div className="screen">

      {/* ══ BODY SCAN CARD ═══════════════════════════════════════════════════ */}
      {(() => {
        const lastScan  = pickLatestRealScan(resolvedHistory);
        const prevScan  = pickPreviousRealScan(resolvedHistory);
        const currentBF = lastScan?.bodyFat  ?? null;
        const targetBF  = activePlan?.targetBF ?? null;
        const startBF   = activePlan?.startBF  ?? currentBF ?? null;
        const leanMassLbs = lastScan?.leanMass ?? null;
        const symmetry  = lastScan?.symmetryScore ?? null;
        const phase     = activePlan?.phase ?? null;
        const phaseColor = phase === 'Cut' ? C.orange : phase === 'Bulk' ? C.blue : C.green;

        /* ── STATE A: No scans yet — render polished pre-scan hero ── */
        if (!hasScan) {
          const freeLeft = accessToken
            ? (entitlements != null
                ? Math.max(0, (Number(entitlements.free_scan_limit) || FREE_SCAN_LIMIT) - (Number(entitlements.free_scans_used) || 0))
                : null)
            : scansRemaining(subscription, resolvedHistory, null, false);
          const isPremium = isPremiumActive(subscription);
          return (
            <div style={{
              borderRadius: 22,
              background: '#0D1810',
              border: '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.dimmed }} />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: C.dimmed }}>
                    BODY SCAN
                  </span>
                </div>
                {!isPremium && freeLeft != null && freeLeft > 0 && (
                  <span style={{ fontSize: 11, color: C.dimmed }}>
                    {freeLeft} free scan{freeLeft !== 1 ? 's' : ''} included
                  </span>
                )}
                {!isPremium && freeLeft === null && !!accessToken && (
                  <span style={{ fontSize: 11, color: C.dimmed }}>Checking scan allowance…</span>
                )}
                {!isPremium && freeLeft != null && freeLeft <= 0 && (
                  <button className="bp" onClick={onUpgrade} style={{
                    fontSize: 11, fontWeight: 700, color: C.green, background: 'none',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}>Upgrade →</button>
                )}
              </div>

              {/* Pre-scan content */}
              <div style={{ padding: '24px 18px 22px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8, lineHeight: 1.2 }}>
                  Complete your first body scan
                </div>
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 22 }}>
                  Your target body fat, timeline, and next-step plan will appear after your first scan.
                </div>
                <button className="bp" onClick={() => setTab('scan')} style={{
                  background: C.green, color: '#0A0D0A', border: 'none',
                  padding: '13px 28px', borderRadius: 99, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  Start first scan →
                </button>
              </div>
            </div>
          );
        }

        /* progress toward target: 0→1 */
        const bfProgress = (startBF != null && targetBF != null && startBF !== targetBF && currentBF != null)
          ? Math.min(1, Math.max(0, (startBF - currentBF) / (startBF - targetBF)))
          : 0;

        /* weeks remaining estimate */
        const weeksLeft = currentBF != null && targetBF != null && currentBF > targetBF
          ? Math.max(1, Math.round((currentBF - targetBF) / 0.38))
          : null;

        /* week number */
        const todayISO = new Date().toISOString().slice(0, 10);
        const weekNum  = activePlan?.startDate
          ? Math.min(12, Math.max(1, Math.floor(daysBetween(activePlan.startDate, todayISO) / 7) + 1))
          : (activePlan?.week || 1);

        /* scan date label */
        const scanDateLabel = lastScan?.date
          ? new Date(lastScan.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
          : null;

        /* next scan */
        const nextScanDate  = activePlan?.nextScanDate ?? null;
        const daysToScan    = nextScanDate ? Math.max(0, daysBetween(todayISO, nextScanDate)) : null;
        const nextScanLabel = nextScanDate
          ? new Date(nextScanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null;

        /* diagnosis */
        const diag = activePlan?.engineDiagnosis?.primary;
        const diagTitle = diag?.primary_issue ?? null;
        const diagExpl  = diag?.explanation ?? null;

        /* ADJUST NOW rows — show current targets, with before if prev scan available */
        const dt = activePlan?.dailyTargets || activePlan?.macros || {};
        const ptPrev = prevScan?.dailyTargets?.protein  ?? null;
        const calPrev = prevScan?.dailyTargets?.calories ?? null;
        const slpPrev = prevScan?.dailyTargets?.sleepHours ?? null;
        const adjustRows = [
          { label: 'Protein',  dir: ptPrev  != null ? (dt.protein  > ptPrev  ? '↑' : '↓') : '↑', old: ptPrev,  now: dt.protein,   unit: 'g',   color: C.green },
          { label: 'Calories', dir: calPrev != null ? (dt.calories > calPrev ? '↑' : '↓') : null, old: calPrev, now: dt.calories,  unit: 'kcal', color: C.orange },
          { label: 'Sleep',    dir: slpPrev != null ? (dt.sleepHours > slpPrev ? '↑' : '↓') : '↑', old: slpPrev, now: dt.sleepHours ?? activePlan?.sleepHrs ?? 8, unit: 'hrs', color: C.blue },
        ].filter(r => r.now != null);

        return (
          <div style={{
            borderRadius: 22,
            background: '#0D1810',
            border: `1px solid ${hasScan ? 'rgba(114,184,149,0.25)' : 'rgba(255,255,255,0.07)'}`,
            overflow: 'hidden',
          }}>

            {/* ── Header row ── */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px 12px',
              borderBottom: `1px solid rgba(255,255,255,0.06)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: hasScan ? C.green : C.dimmed }} />
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: hasScan ? C.green : C.dimmed }}>
                  BODY SCAN{scanDateLabel ? ` \u00b7 ${scanDateLabel}` : ''}
                </span>
              </div>
              {activePlan ? (
                <span style={{ fontSize: 12, color: C.dimmed, fontWeight: 500 }}>Week {weekNum} / 12</span>
              ) : (
                <span style={{ fontSize: 12, color: C.dimmed }}>No plan yet</span>
              )}
            </div>

            {/* ── BF% row ── */}
            <div style={{ padding: '18px 18px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 4 }}>Current Body Fat</div>
                  <div style={{ fontSize: 38, fontWeight: 900, color: hasScan ? C.white : 'rgba(255,255,255,0.18)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {currentBF != null ? `${currentBF}%` : '--'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18, color: C.dimmed }}>→</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 4 }}>Target</div>
                    {targetBF != null ? (
                      <div style={{ fontSize: 38, fontWeight: 900, color: C.green, lineHeight: 1 }}>
                        {targetBF}%
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.dimmed, lineHeight: 1.2, marginTop: 6 }}>
                        Pending
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 99, background: C.green,
                  width: hasScan ? `${bfProgress * 100}%` : '0%',
                  transition: 'width .6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: C.dimmed }}>{hasScan ? `Week ${weekNum}` : 'Scan to activate'}</span>
                {weeksLeft != null && <span style={{ fontSize: 11, color: C.dimmed }}>~{weeksLeft} weeks to target</span>}
              </div>
            </div>

            {/* ── 3-col stats ── */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              borderTop: `1px solid rgba(255,255,255,0.06)`,
              borderBottom: `1px solid rgba(255,255,255,0.06)`,
            }}>
              {[
                { label: 'LEAN MASS',  value: leanMassLbs != null ? fmt.leanMass(leanMassLbs, profile?.unitSystem) : '—', color: C.blue },
                { label: 'SYMMETRY',   value: symmetry    != null ? `${symmetry}/100`    : '—', color: C.purple },
                { label: 'PHASE',      value: phase ?? '—',                                     color: phaseColor },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding: '12px 0', textAlign: 'center',
                  borderRight: i < 2 ? `1px solid rgba(255,255,255,0.06)` : 'none',
                }}>
                  <div style={{ fontSize: 9, color: C.dimmed, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: hasScan ? s.color : 'rgba(255,255,255,0.18)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── Diagnosis ── */}
            {hasScan && diagTitle ? (
              <div style={{ padding: '14px 18px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                <div style={{ fontSize: 9, color: C.dimmed, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Diagnosis</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name="bolt" size={16} color={C.orange} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 3 }}>{diagTitle}</div>
                    {diagExpl && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{diagExpl}</div>}
                  </div>
                </div>
              </div>
            ) : !hasScan ? (
              <div style={{ padding: '16px 18px', borderBottom: `1px solid rgba(255,255,255,0.06)`, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: C.dimmed, marginBottom: 14 }}>Run a body scan to unlock your full analysis</div>
                <button className="bp" onClick={() => setTab('scan')} style={{
                  background: C.green, color: '#0A0D0A', border: 'none',
                  padding: '11px 28px', borderRadius: 99, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  Start scan →
                </button>
              </div>
            ) : null}

            {/* ── Adjust Now ── */}
            {hasScan && adjustRows.length > 0 && (
              <div style={{ padding: '14px 18px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                <div style={{ fontSize: 9, color: C.dimmed, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>Adjust Now</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {adjustRows.map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.dir && (
                          <Icon name={r.dir === '↑' ? 'arrow-up' : 'arrow-down'} size={12} color={r.dir === '↑' ? C.green : C.orange} />
                        )}
                        <span style={{ fontSize: 14, color: C.muted, fontWeight: 400 }}>{r.label}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: r.color }}>{r.now}{r.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            {activePlan && (
              <div style={{
                padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, color: C.dimmed }}>
                  {nextScanLabel ? `Next scan: ${nextScanLabel}` : 'Next scan: TBD'}
                </span>
                {daysToScan != null && (
                  <button className="bp" onClick={() => setTab('scan')} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, color: C.green, padding: 0,
                  }}>
                    {daysToScan} days →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ PREMIUM: Adaptation Insight ══════════════════════════════════════ */}
      {hasScan && (
        <PremiumGate feature={FEATURES.DECISION_LOG} subscription={subscription} onUpgrade={onUpgrade}>
          {(() => {
            const latestScan = pickLatestRealScan(resolvedHistory);
            const decision   = latestScan?.adaptationDecision;
            const rationale  = latestScan?.adaptationRationale;
            const cmp        = latestScan?.scanComparison;
            if (!decision) return null;

            const decisionLabel = {
              keep_plan:            { label: 'On Track',            color: C.green,  icon: 'check' },
              reduce_calories:      { label: 'Reduce Surplus',      color: C.orange, icon: 'arrow-down' },
              increase_protein:     { label: 'Protein Needs Boost', color: C.blue,   icon: 'arrow-up' },
              flag_plateau:         { label: 'Plateau Detected',    color: C.gold || '#FFD600', icon: 'warning' },
              aggressive_deficit:   { label: 'Too Aggressive',      color: C.red || '#FF5A5F', icon: 'warning' },
              bulk_pace_too_fast:   { label: 'Slowing Fat Gain',    color: C.orange, icon: 'arrow-down' },
              low_confidence_rescan:{ label: 'Rescan Needed',       color: C.muted,  icon: 'scan' },
              duplicate_reused:     { label: 'Duplicate Photo',     color: C.dimmed, icon: 'copy' },
            }[decision] || { label: decision, color: C.muted, icon: 'bolt' };

            return (
              <Card style={{ background: '#0E1A12', border: `1px solid rgba(114,184,149,0.18)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: decisionLabel.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: decisionLabel.color, textTransform: 'uppercase' }}>
                    Adaptation · {decisionLabel.label}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: C.white, lineHeight: 1.6, marginBottom: cmp ? 14 : 0 }}>
                  {rationale}
                </div>
                {cmp && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'BF Change',    value: `${cmp.bf_delta > 0 ? '+' : ''}${cmp.bf_delta}%`,    color: cmp.bf_delta <= 0 ? C.green : C.orange },
                      { label: 'Lean Mass',    value: `${cmp.lm_delta_lbs >= 0 ? '+' : ''}${cmp.lm_delta_lbs} lb`, color: cmp.lm_delta_lbs >= 0 ? C.green : C.orange },
                      { label: 'Score',        value: `${cmp.score_delta >= 0 ? '+' : ''}${cmp.score_delta}`, color: cmp.score_delta >= 0 ? C.green : C.orange },
                    ].map(m => (
                      <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })()}
        </PremiumGate>
      )}

      {/* ══ PREMIUM: Goal Timeline ════════════════════════════════════════════ */}
      {hasScan && activePlan?.engineTrajectory && (
        <PremiumGate feature={FEATURES.PROJECTIONS} subscription={subscription} onUpgrade={onUpgrade}>
          {(() => {
            const traj       = activePlan.engineTrajectory;
            const weeksLeft  = traj?.timeline_weeks;
            const targetBF   = activePlan.targetBF ?? activePlan.bodyFat;
            const currentBF  = pickLatestRealScan(resolvedHistory)?.bodyFat ?? null;
            const weeklyRate = traj?.weekly_change;
            if (!weeksLeft) return null;
            return (
              <Card style={{ background: '#0E1A12', border: `1px solid rgba(114,184,149,0.18)` }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.green, textTransform: 'uppercase', marginBottom: 10 }}>
                  Goal Timeline
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: C.white, lineHeight: 1 }}>
                      {Math.max(1, Math.round(weeksLeft))}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>weeks to target</div>
                  </div>
                  {targetBF != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Target BF</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{targetBF}%</div>
                    </div>
                  )}
                </div>
                {weeklyRate && (
                  <div style={{ fontSize: 12, color: C.muted, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
                    Expected pace: <span style={{ color: C.white, fontWeight: 600 }}>{Math.abs(weeklyRate).toFixed(2)}% BF / week</span>
                  </div>
                )}
              </Card>
            );
          })()}
        </PremiumGate>
      )}

      {/* ══ TODAY'S FOCUS (only after first scan) ════════════════════════════ */}
      {activePlan && hasScan && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: C.dimmed, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
              Today's focus
            </span>
            <span style={{ fontSize: 12, color: C.muted }}>
              {completedCount} of {focusItems.length} completed
            </span>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99, marginBottom: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, background: C.green, opacity: 0.65,
              width: `${(completedCount / focusItems.length) * 100}%`,
              transition: 'width .4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {focusItems.map((item, idx) => {
              const isExpanded = expandedItem === item.id;
              const isLast     = idx === focusItems.length - 1;
              return (
                <div
                  key={item.id}
                  className="bp"
                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                  style={{
                    padding: '14px 2px',
                    borderBottom: isLast ? 'none' : `1px solid rgba(255,255,255,0.05)`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.met ? C.green : 'transparent',
                      border: item.met ? 'none' : `1.5px solid rgba(255,255,255,0.2)`,
                    }}>
                      {item.met && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#0A0D0A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontSize: 15, fontWeight: 500, flex: 1,
                      color: item.met ? C.dimmed : C.white,
                      textDecoration: item.met ? 'line-through' : 'none',
                    }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: 10, color: C.dimmed, lineHeight: 1,
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform .18s ease',
                      display: 'inline-block',
                    }}>▾</span>
                  </div>
                  {isExpanded && (
                    <div style={{ paddingLeft: 36, paddingTop: 7, fontSize: 12, color: C.muted }}>
                      {item.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ══ YOUR PATTERNS ════════════════════════════════════════════════════ */}
      {activePlan && <AIPatterns profile={profile} activePlan={activePlan} scanHistory={scanHistory} />}

      {/* Hidden camera input */}
      <input
        ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }}
        onChange={e => handleScanFile(e.target.files?.[0])}
      />

      {/* ══ 4. PRIMARY ACTION — floating Scan button + usage indicator ═══ */}
      {(() => {
        const foodRemaining = isPremiumActive(subscription) ? Infinity : Number(foodRemainingToday ?? FREE_FOOD_SCAN_LIMIT);
        const premium       = isPremiumActive(subscription);
        const limitHit      = !premium && foodRemaining <= 0;
        return (
          <>
            {!premium && (
              <div style={{
                position: 'fixed',
                bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
                left: '50%', transform: 'translateX(-50%)',
                zIndex: 115, fontSize: 11, color: C.muted, background: 'rgba(10,13,10,0.85)',
                backdropFilter: 'blur(8px)', padding: '4px 14px', borderRadius: 99,
                border: `1px solid ${C.border}`, whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 24px)',
                pointerEvents: 'auto',
              }}>
                {limitHit ? (
                  <>
                    <span>0 food scans left today</span>
                    <span style={{ margin: '0 6px', color: C.dimmed }}>·</span>
                    <button className="bp" onClick={onUpgrade} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, color: C.green, padding: 0,
                    }}>Upgrade for unlimited →</button>
                  </>
                ) : (
                  `${foodRemaining} food scan${foodRemaining !== 1 ? 's' : ''} left today (2 per day)`
                )}
              </div>
            )}
            <button
              className="bp"
              onClick={() => {
                if (limitHit) { onUpgrade(); return; }
                fileRef.current?.click();
              }}
              disabled={scanning}
              style={{
                position: 'fixed',
                bottom: 'calc(82px + env(safe-area-inset-bottom, 0px))',
                left: '50%', transform: 'translateX(-50%)',
                zIndex: 120, height: 50, paddingInline: 28, borderRadius: 25,
                background: scanning ? C.greenDim : limitHit ? C.dimmed : C.green, border: 'none',
                color: limitHit ? C.muted : '#0A0D0A', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 7,
                cursor: scanning ? 'default' : 'pointer',
                whiteSpace: 'nowrap', opacity: scanning ? 0.7 : 1,
                boxShadow: '0 6px 24px rgba(0,0,0,0.35)', pointerEvents: 'auto',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>⊙</span>
              {scanning ? 'Scanning…' : limitHit ? 'Limit reached' : 'Scan'}
            </button>
          </>
        );
      })()}

      {/* Scan result confirm sheet */}
      {scanResult && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', pointerEvents: 'auto' }}
          onClick={() => setScanResult(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, margin: '0 auto',
              background: C.card, borderRadius: '20px 20px 0 0', padding: '28px 22px',
              paddingBottom: 'max(28px, calc(22px + env(safe-area-inset-bottom, 0px)))',
              border: `1px solid ${C.border}`,
              maxHeight: 'min(88dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 24px))',
              overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: C.white, marginBottom: 3 }}>
              {scanResult.name || 'Food'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Review before logging</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'kcal',    value: scanResult.calories || 0 },
                { label: 'protein', value: `${scanResult.protein || 0}g` },
                { label: 'carbs',   value: `${scanResult.carbs || 0}g` },
                { label: 'fat',     value: `${scanResult.fat || 0}g` },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', background: C.cardElevated, borderRadius: 12, padding: '12px 6px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.dimmed, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" onClick={() => setScanResult(null)} style={{
                flex: 1, padding: 14, borderRadius: 14,
                background: C.cardElevated, border: `1px solid ${C.border}`,
                color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
              <button className="bp" onClick={confirmScan} style={{
                flex: 2, padding: 14, borderRadius: 14,
                background: C.green, border: 'none',
                color: '#0A0D0A', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>Add to log</button>
            </div>
          </div>
        </div>
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
        { name: 'Chicken + greens bowl', icon: 'leaf', ratio: 0.28 },
        { name: 'Greek yogurt protein snack', icon: 'bowl', ratio: 0.16 },
        { name: 'Salmon + vegetables plate', icon: 'utensils', ratio: 0.33 },
      ],
      Bulk: [
        { name: 'Rice + lean beef bowl', icon: 'bowl', ratio: 0.34 },
        { name: 'Oats + whey + berries', icon: 'bowl', ratio: 0.22 },
        { name: 'Pasta + chicken plate', icon: 'bowl', ratio: 0.36 },
      ],
      Recomp: [
        { name: 'Egg + toast breakfast plate', icon: 'utensils', ratio: 0.25 },
        { name: 'Turkey rice bowl', icon: 'bowl', ratio: 0.3 },
        { name: 'Steak + potato dinner', icon: 'bolt', ratio: 0.32 },
      ],
      Maintain: [
        { name: 'Balanced protein bowl', icon: 'bowl', ratio: 0.3 },
        { name: 'High-protein wrap', icon: 'utensils', ratio: 0.24 },
        { name: 'Fish + grains plate', icon: 'utensils', ratio: 0.31 },
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
function LogMealModal({ onClose, onAdd, macros, profile, subscription, onUpgrade, userId, accessToken, entitlements, onFoodScanComplete }) {
  const [aiTab,     setAiTab]     = useState('describe');
  const [descText,  setDescText]  = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [form,    setForm]    = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('Lunch');
  const [error, setError] = useState('');
  const [photoThumb, setPhotoThumb] = useState(null);
  const [foodRemainingToday, setFoodRemainingToday] = useState(isPremiumActive(subscription) ? Infinity : FREE_FOOD_SCAN_LIMIT);
  const fileRef = useRef(null);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const refreshFoodStatus = async () => {
    if (!accessToken) return { premium: false, remaining_today: FREE_FOOD_SCAN_LIMIT, used_today: 0 };
    try {
      const status = await fetchFoodScanStatus(accessToken);
      setFoodRemainingToday(status?.premium ? Infinity : Math.max(0, Number(status?.remaining_today ?? FREE_FOOD_SCAN_LIMIT)));
      return status;
    } catch {
      const fallbackRemaining = isPremiumActive(subscription) ? Infinity : FREE_FOOD_SCAN_LIMIT;
      setFoodRemainingToday(fallbackRemaining);
      return { premium: isPremiumActive(subscription), remaining_today: fallbackRemaining, used_today: 0 };
    }
  };

  useEffect(() => {
    refreshFoodStatus();
  }, [accessToken, userId, subscription?.status]);

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

  const analyzePhoto = async (file) => {
    if (!file) return;
    if (!accessToken) {
      setError('Please sign in to scan food.');
      return;
    }
    const status = await refreshFoodStatus();
    if (!status?.premium && Number(status?.remaining_today ?? 0) <= 0) {
      setError(`You've reached your daily limit. Upgrade for unlimited scans.`);
      onUpgrade?.();
      return;
    }
    setAnalyzing(true); setError('');
    const reader = new FileReader();
    reader.onerror = () => { setError('Could not read image file.'); setAnalyzing(false); };
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          try {
            const SIZE = 56;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE; canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - side) / 2;
            const sy = (img.naturalHeight - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
            setPhotoThumb(canvas.toDataURL('image/jpeg', 0.6));
          } catch { /* thumbnail generation is optional */ }
        };
        img.src = dataUrl;
        const base64 = dataUrl.split(',')[1];
        const res = await fetch('/api/food-scan', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
                { type: 'text', text: `Identify this food and return ONLY valid JSON: {"name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"comment":"one personalized sentence about this meal for their ${profile?.goal||'fitness'} goal"}. If the image does not contain food, return {"error":"not_food"}.` },
              ],
            }],
            max_tokens: 200,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            setError(data?.error || 'Food scan limit reached. Upgrade for unlimited scans.');
            return;
          }
          throw new Error(data?.error || `API ${res.status}`);
        }
        const match = (data?.text || '').match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON in response');
        const raw = JSON.parse(match[0]);
        if (raw?.error === 'not_food') throw new Error('NOT_FOOD');
        const d = sanitizeMeal(raw, macros, profile);
        setForm({ name: d?.name || 'Food', calories: String(d?.calories || ''), protein: String(d?.protein || ''), carbs: String(d?.carbs || ''), fat: String(d?.fat || '') });
        setComment(raw?.comment || '');
      } catch (err) {
        console.error('Photo analysis error:', err);
        const msg = String(err?.message || '');
        setError(msg.includes('NOT_FOOD') || msg.includes('scan a food') ? 'Oops, you need to scan a food.' : 'Photo analysis failed — fill in manually.');
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const meals = LS.get(LS_KEYS.meals(today), []);
    const fromPhoto = Boolean(photoThumb);
    const meal = {
      id: Date.now(), name: form.name.trim(), category,
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      photoThumb: photoThumb || undefined,
    };
    const safeMeal = sanitizeMeal(meal, macros, profile);
    LS.set(LS_KEYS.meals(today), [...meals, safeMeal]);
    if (fromPhoto) {
      try {
        await onFoodScanComplete?.({
          source: 'nutrition',
          meal_name: safeMeal.name,
          meal_id: String(safeMeal.id),
          calories: safeMeal.calories,
          protein_g: safeMeal.protein,
          carbs_g: safeMeal.carbs,
          fat_g: safeMeal.fat,
          food_items: [{ name: safeMeal.name, calories: safeMeal.calories, protein: safeMeal.protein, carbs: safeMeal.carbs, fat: safeMeal.fat }],
        });
        await refreshFoodStatus();
      } catch (err) {
        console.error('[food-scan] completion write failed:', err?.message);
      }
    }
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
              {[['describe','Describe'],['photo','Photo']].map(([k, lbl]) => (
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
                {!isPremiumActive(subscription) && (() => {
                  const left = Number(foodRemainingToday ?? FREE_FOOD_SCAN_LIMIT);
                  return (
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                      {left} food scan{left !== 1 ? 's' : ''} left today (2 per day)
                    </div>
                  );
                })()}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => analyzePhoto(e.target.files?.[0])} />
                {(isPremiumActive(subscription) || Number(foodRemainingToday ?? 0) > 0) ? (
                  <button className="bp" onClick={() => fileRef.current?.click()} style={{
                    width: '100%', padding: '28px 0', borderRadius: 12, border: `1.5px dashed ${C.green}`,
                    background: C.greenBg, color: C.green, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {analyzing ? 'Analyzing…' : 'Take or upload a photo'}
                  </button>
                ) : (
                  <button className="bp" onClick={() => onUpgrade?.()} style={{
                    width: '100%', padding: '28px 0', borderRadius: 12, border: `1.5px dashed ${C.dimmed}`,
                    background: 'rgba(255,255,255,0.03)', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>
                    0 food scans left today — Upgrade for unlimited
                  </button>
                )}
              </div>
            )}
            {error && <p style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{error}</p>}
          </div>

          {comment && (
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenDim}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.green, lineHeight: 1.5 }}>
              {comment}
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
function ExerciseCard({ ex, exIdx, completedSets, onToggleSet, loggedWeight, onWeightChange }) {
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
        <div style={{ fontSize: 12, color: C.blue, marginBottom: 10 }}>{ex.weight}</div>
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
      {/* Weight logger */}
      {onWeightChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: C.dimmed, whiteSpace: 'nowrap' }}>Weight used</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder={ex.weight || 'e.g. 60kg'}
            value={loggedWeight || ''}
            onChange={e => onWeightChange(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, background: C.cardElevated, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '5px 9px', fontSize: 12, color: C.white,
              outline: 'none',
            }}
          />
        </div>
      )}
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
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{meal.name}</h2>
          {/* Why this meal */}
          {(meal.whyThisMeal || meal.whyNow) && (
            <p style={{ fontSize: 13, color: C.green, fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
              {meal.whyThisMeal || meal.whyNow}
            </p>
          )}
          {/* Compact macro row */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, padding: '10px 12px', background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}` }}>
            {[
              { label: `${meal.calories || 0} kcal`, color: C.orange },
              { label: `P ${meal.protein || 0}g`,    color: C.blue },
              { label: `C ${meal.carbs || 0}g`,      color: C.gold },
              { label: `F ${meal.fat || 0}g`,        color: C.muted },
            ].map((t, i) => (
              <span key={i} style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.label}</span>
            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`d${i}`} style={{ color: C.border, fontSize: 13 }}>·</span>, el], [])}
          </div>
          {/* Description if separate from whyThisMeal */}
          {meal.description && meal.description !== meal.whyThisMeal && meal.description !== meal.whyNow && (
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>{meal.description}</p>
          )}
          {meal.prepTime && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>⏱ {meal.prepTime}</div>
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
  // loggedWeights: { [exIdx]: string } — one weight entry per exercise
  const [loggedWeights, setLoggedWeights] = useState({});

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
                <span style={{ fontSize: 14, fontWeight: 600 }}>Warmup</span>
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
              <ExerciseCard
                key={exIdx} ex={ex} exIdx={exIdx}
                completedSets={completedSets} onToggleSet={handleToggleSet}
                loggedWeight={loggedWeights[exIdx] || ''}
                onWeightChange={(w) => setLoggedWeights(p => ({ ...p, [exIdx]: w }))}
              />
            ))}
          </div>
          {workout.cooldown && (
            <div style={{ background: C.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${C.border}`, marginBottom: 18, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: C.white }}>Cooldown:</span> {workout.cooldown}
            </div>
          )}
          <Btn onClick={() => {
            // Save workout log to localStorage
            const dateKey = todayStr();
            const log = {
              date: dateKey,
              workoutType: workout.workoutType,
              exercises: (workout.exercises || []).map((ex, i) => ({
                name: ex.name,
                sets: ex.sets || 3,
                reps: ex.reps,
                weight: loggedWeights[i] || null,
                setsCompleted: Array.from({ length: ex.sets || 3 }).filter((_, si) => completedSets[`${i}-${si}`]).length,
              })),
              completedPct: pct,
            };
            LS.set(`massiq:workout:${dateKey}`, log);
            onFinish?.(); onClose();
          }} style={{ width: '100%' }}>
            {pct === 100 ? 'Workout Complete!' : `Finish Workout (${pct}% done)`}
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
  const todayLog = LS.get(`massiq:workout:${todayStr()}`, null);

  if (!todayWorkout) return null;

  if (!todayWorkout.isTrainingDay) {
    return (
      <Card className="su" style={{ animationDelay: '.15s', opacity: 0.75 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}><Icon name="moon" size={24} color={C.dimmed} /></div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            <span style={{ display: 'flex', gap: 16 }}>
              {exCount > 0 && <span>{exCount} exercises</span>}
              {todayWorkout.duration && <span>⏱ {todayWorkout.duration}</span>}
            </span>
            {todayLog && (
              <span style={{ color: C.green, fontWeight: 650 }}>✓ Logged {todayLog.completedPct}%</span>
            )}
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
function NutritionTab({ profile, activePlan, showToast, setTab, subscription, onUpgrade, userId, accessToken, entitlements, onFoodScanComplete }) {
  const today = new Date().toISOString().slice(0, 10);
  const [meals,        setMeals]        = useState(() => LS.get(LS_KEYS.meals(today), []));
  const [showModal,    setShowModal]    = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

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

  const handleLogMeal = (m) => {
    const meal = sanitizeMeal({ id: Date.now(), name: m.name, category: m.mealType || m.time || m.category || 'Meal', calories: m.calories || 0, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0 }, macros, profile);
    const updated = [...meals, meal];
    setMeals(updated);
    LS.set(LS_KEYS.meals(today), updated);
    setSelectedMeal(null);
    showToast?.('✓ Meal logged');
  };

  const remaining = Math.max(0, macros.calories - totals.calories);

  return (
    <div className="screen">
      <h1 className="screen-title">Nutrition</h1>

      {/* ── Protein hero card ── */}
      {(() => {
        const protPct   = macros.protein > 0 ? Math.min(100, Math.round((totals.protein / macros.protein) * 100)) : 0;
        const ringColor = protPct >= 80 ? C.green : protPct >= 50 ? C.gold : '#ef4444';
        const protRem   = Math.max(0, macros.protein - totals.protein);
        const hour      = new Date().getHours();
        const lateEnough = hour >= 12; // midday check
        const tip = protPct >= 80
          ? `✓ On track with protein. Focus on hitting your calories.`
          : lateEnough && protPct < 50
            ? `You need ${protRem}g more protein today. Add chicken, eggs, or Greek yogurt to your next meal.`
            : null;
        const ringDeg = Math.round(protPct * 3.6);
        return (
          <Card className="su glass" style={{ background: '#0D1F0D', border: '1px solid rgba(0,200,83,0.2)' }}>
            {/* Top row: number + ring */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Protein</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 48, fontWeight: 800, color: C.white, lineHeight: 1 }}>{totals.protein}</span>
                  <span style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>g</span>
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>/ {macros.protein}g target</div>
              </div>
              {/* CSS conic ring */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
                background: `conic-gradient(${ringColor} ${ringDeg}deg, rgba(255,255,255,0.07) ${ringDeg}deg)`,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 8, left: 8, right: 8, bottom: 8,
                  borderRadius: '50%', background: '#0D1F0D',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: ringColor }}>{protPct}%</span>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginBottom: 6 }}>
              <div style={{ height: '100%', borderRadius: 99, background: ringColor, width: `${protPct}%`, transition: 'width .4s ease' }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: protRem === 0 ? C.green : C.muted, marginBottom: tip ? 12 : 0 }}>
              {protRem > 0 ? `${protRem}g remaining` : '✓ Target hit'}
            </div>
            {tip && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.06)` }}>{tip}</div>
            )}
          </Card>
        );
      })()}

      {/* ── Calories row ── */}
      <div className="su" style={{ animationDelay: '.02s', display: 'flex', alignItems: 'center', background: C.cardElevated, borderRadius: 16, padding: '12px 16px' }}>
        {[
          { label: 'Eaten',     value: `${(totals.calories || 0).toLocaleString()} kcal`, color: C.white },
          { label: 'Target',    value: `${(macros.calories || 2000).toLocaleString()} kcal`, color: C.muted },
          { label: 'Remaining', value: `${Math.abs(remaining).toLocaleString()} kcal`, color: remaining > 0 ? C.green : '#ef4444' },
        ].map((s, i) => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.dimmed, marginTop: 2 }}>{i === 2 && remaining < 0 ? 'Over target' : s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Carbs & Fat (informational) ── */}
      <div className="su" style={{ animationDelay: '.03s', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Carbs', eaten: totals.carbs,  target: macros.carbs,  note: 'Adjust based on energy levels' },
          { label: 'Fat',   eaten: totals.fat,    target: macros.fat,    note: 'Focus on quality sources' },
        ].map(m => (
          <div key={m.label} style={{ background: C.cardElevated, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>{m.eaten}g eaten</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>~{m.target}g suggested</div>
            <div style={{ fontSize: 11, color: C.dimmed, marginTop: 6, lineHeight: 1.4 }}>{m.note}</div>
          </div>
        ))}
      </div>

      {/* ── Logged Today ── */}
      <div className="su" style={{ animationDelay: '.05s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Logged Today</div>
          <button className="bp" onClick={() => setShowModal(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.green, fontSize: 13, fontWeight: 600, padding: 0,
          }}>+ Add</button>
        </div>

        {meals.length === 0 ? (
          <div style={{ background: C.cardElevated, borderRadius: 16, padding: '20px 18px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              No meals logged today. Use the meal plan in the Plan tab to log meals, or tap + to add manually.
            </div>
            <button className="bp" onClick={() => setTab?.('plan')} style={{
              background: C.greenBg, border: `1px solid ${C.greenDim}`, color: C.green,
              fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 10, cursor: 'pointer', marginTop: 14,
            }}>View meal plan →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meals.map(m => (
              <div key={m.id} className="bp" onClick={() => setSelectedMeal({ ...m, mealType: m.category || 'Meal' })} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: C.card, borderRadius: 14, padding: '11px 14px',
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>P {m.protein}g · C {m.carbs}g · F {m.fat}g</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.orange }}>{m.calories}</span>
                  <button className="bp" onClick={e => { e.stopPropagation(); deleteMeal(m.id); }} style={{
                    background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2,
                  }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <LogMealModal
          onClose={() => setShowModal(false)}
          onAdd={(meal) => setMeals(prev => [...prev, meal])}
          macros={macros}
          profile={profile}
          subscription={subscription}
          onUpgrade={onUpgrade}
          userId={userId}
          accessToken={accessToken}
          entitlements={entitlements}
          onFoodScanComplete={onFoodScanComplete}
        />
      )}

      {selectedMeal && (
        <RecipeModal
          meal={selectedMeal}
          profile={profile}
          onClose={() => setSelectedMeal(null)}
          onLog={() => handleLogMeal(selectedMeal)}
          onSwap={() => setSelectedMeal(null)}
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

// Generate actionable weekly priorities — never raw numbers
function getWeeklyPriorities(profile, targets, plan) {
  const goal     = profile?.goal || 'Maintain';
  const protein  = targets?.protein  || 150;
  const calories = targets?.calories || 2000;
  const trainDays = plan?.trainDays || targets?.trainingDaysPerWeek || 4;
  const sleep    = plan?.sleepHrs   || targets?.sleepHours          || 8;

  const p1 = goal === 'Cut'
    ? `Hit ${protein}g protein every day to preserve muscle while in deficit`
    : goal === 'Bulk'
    ? `Reach ${calories} kcal daily — especially on training days to fuel growth`
    : `Hit ${protein}g protein and stay within ${calories} kcal each day`;

  const p2 = plan?.trainingFocus?.primary
    ? `Train ${plan.trainingFocus.primary} — complete all ${trainDays} sessions this week`
    : `Complete all ${trainDays} training sessions — consistency drives results`;

  const p3 = `Sleep ${sleep} hours per night — recovery is when muscle is built`;

  return [p1, p2, p3];
}

function PlanTab({ profile, activePlan, setTab, showToast, subscription, onUpgrade }) {
  const weekKey = getWeekKey();
  const [openSections,  setOpenSections]  = useState(() => new Set(['week', 'focus']));
  const [workoutPage,   setWorkoutPage]   = useState(() => {
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const days = LS.get(LS_KEYS.workoutplan, []) || [];
    const idx = days.findIndex(d => d.day === dayName);
    return idx >= 0 ? idx : 0;
  });
  const [selectedMeal,  setSelectedMeal]  = useState(null);
  const [swappingKey,   setSwappingKey]   = useState(null);
  const [mealPlanDays,  setMealPlanDays]  = useState(() => {
    const stored = LS.get(LS_KEYS.mealplan, null);
    return stored?.days || null;
  });
  const [activeDayIdx,  setActiveDayIdx]  = useState(() => {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const days = LS.get(LS_KEYS.mealplan, null)?.days || [];
    const idx = days.findIndex(d => d.day === todayName);
    return idx >= 0 ? idx : 0;
  });
  const [loggedMeals,   setLoggedMeals]   = useState(() => LS.get(LS_KEYS.logged(todayStr()), {}));
  const [missions, setMissions] = useState(() => {
    const saved = LS.get(`massiq:missions:${weekKey}`, null);
    const isRawNumber = (t) => /^\d[\d,]*\s*(kcal|g)\s*(\/day)?$/i.test(String(t).trim());
    const storedMissions = (activePlan?.weeklyMissions || []).filter(t => !isRawNumber(t));
    const activeMacros = getActiveTargets(activePlan, profile);
    const texts = storedMissions.length >= 2
      ? storedMissions
      : getWeeklyPriorities(profile, activeMacros, activePlan);
    if (saved && saved.length === texts.length) return saved;
    return texts.map((text, i) => ({ id: i, text, done: false }));
  });

  const toggleSection = (key) => setOpenSections(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleMission = (id) => {
    const updated = missions.map(m => m.id === id ? { ...m, done: !m.done } : m);
    setMissions(updated);
    LS.set(`massiq:missions:${weekKey}`, updated);
  };

  /* Collapsible section header */
  const SectionRow = ({ sectionKey, label, meta }) => {
    const isOpen = openSections.has(sectionKey);
    return (
      <div className="bp" onClick={() => toggleSection(sectionKey)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: isOpen ? 14 : 0,
        marginBottom: isOpen ? 2 : 0,
        borderBottom: isOpen ? `1px solid rgba(255,255,255,0.06)` : 'none',
        cursor: 'pointer',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {meta && <span style={{ fontSize: 12, color: C.dimmed }}>{meta}</span>}
          <span style={{
            fontSize: 10, color: C.dimmed, display: 'inline-block',
            transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease',
          }}>▾</span>
        </div>
      </div>
    );
  };

  /* ── No active plan ── */
  if (!activePlan) {
    return (
      <div className="screen">
        <div style={{ fontSize: 11, color: C.dimmed, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 20 }}>
          Your plan
        </div>
        <div style={{
          background: C.card, borderRadius: 20, padding: '36px 24px',
          border: `1px solid rgba(255,255,255,0.08)`, textAlign: 'center',
        }}>
          <div style={{ marginBottom: 18 }}><Icon name="clipboard" size={36} color={C.dimmed} /></div>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.white, marginBottom: 8 }}>
            Your plan comes from your scan
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, maxWidth: 240, margin: '0 auto 28px' }}>
            MassIQ analyzes your physique to build a 12-week program.
          </div>
          <button className="bp" onClick={() => setTab('scan')} style={{
            background: C.green, color: '#0A0D0A', border: 'none',
            padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            Start scan →
          </button>
        </div>
      </div>
    );
  }

  /* ── Derived values ── */
  const macros     = getActiveTargets(activePlan, profile);
  const phase      = activePlan.phase || profile?.goal || 'Maintain';
  const today      = new Date().toISOString().slice(0, 10);
  const week       = activePlan.startDate
    ? Math.min(12, Math.max(1, Math.floor(daysBetween(activePlan.startDate, today) / 7) + 1))
    : (activePlan.week || 1);
  // [plan:week] verification log — remove after verifying
  console.info('[plan:week] current week computed', { start_date: activePlan.startDate || null, stored_week: activePlan.week || null, computed_week: week, source: 'plans' });
  const phasePct   = Math.round((week / 12) * 100);
  const startDate  = activePlan.startDate || today;
  const nextScanDate = activePlan.nextScanDate || (() => {
    const d = new Date(startDate); d.setDate(d.getDate() + 84); return d.toISOString().slice(0, 10);
  })();
  const daysLeft   = Math.max(0, daysBetween(today, nextScanDate));
  const startBF    = activePlan.startBF ?? null;
  const targetBF   = activePlan.targetBF ?? null;
  const trainDays  = activePlan.trainDays || 4;
  const cardioDays = activePlan.cardioDays || 2;
  const sleepHrs   = activePlan.sleepHrs || 8;
  const waterL     = activePlan.waterL || 3;
  const steps      = activePlan.steps || macros.steps || 8000;
  const scanHistory = LS.get(LS_KEYS.scanHistory, []);
  const latestScan  = scanHistory.slice(-1)[0] || null;

  const FOCUS_CARDS = [
    { label: 'Protein',  value: `${macros.protein || 150}g daily`,                reason: 'preserve muscle' },
    { label: 'Training', value: `${trainDays} sessions/wk`,                       reason: 'consistency' },
    { label: 'Sleep',    value: `${sleepHrs}h nightly`,                           reason: 'recovery' },
    { label: 'Steps',    value: `${(steps).toLocaleString()}/day`,                reason: 'energy balance' },
  ];

  const MILESTONES = [
    { w: 3,  label: 'Baseline set' },
    { w: 6,  label: 'Habits established' },
    { w: 9,  label: 'Mid-plan check-in' },
    { w: 12, label: 'Final scan + new plan' },
  ];

  return (
    <div className="screen">

      {/* ══ 1. PLAN HERO ════════════════════════════════════════════════ */}
      <div>
        <div style={{ fontSize: 11, color: C.dimmed, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>
          Your plan
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.white, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {PHASE_META[phase]?.label || phase} Phase
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
          {daysLeft > 0 ? `${daysLeft} days remaining` : 'Final week'}
          {latestScan && targetBF != null ? ` \u00b7 ${getBFDisplay(latestScan)} \u2192 ${targetBF}%` : ''}
        </div>
        <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 99, marginBottom: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: C.green, opacity: 0.7,
            width: `${phasePct}%`, transition: 'width .4s ease',
          }} />
        </div>
        <div style={{ fontSize: 11, color: C.dimmed }}>Week {week} of 12</div>
      </div>

      {/* ══ 2. THIS WEEK ════════════════════════════════════════════════ */}
      <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
        <SectionRow sectionKey="week" label="This week" meta={`${week}/12`} />
        {openSections.has('week') && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Calories',  value: `${(macros.calories || 2000).toLocaleString()} kcal` },
              { label: 'Protein',   value: `${macros.protein || 150}g` },
              { label: 'Training',  value: `${trainDays} sessions` },
              { label: 'Steps',     value: `${(steps).toLocaleString()} / day` },
              { label: 'Sleep',     value: `${sleepHrs}h` },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 12, paddingBottom: i < arr.length - 1 ? 12 : 0,
                borderBottom: i < arr.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
              }}>
                <span style={{ fontSize: 14, color: C.muted }}>{row.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ PREMIUM: Why this plan ══════════════════════════════════════ */}
      <PremiumGate feature={FEATURES.ADAPTIVE_PLAN} subscription={subscription} onUpgrade={onUpgrade}>
        {latestScan?.adaptationDecision ? (
          <div style={{ background: '#0E1A12', borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(114,184,149,0.2)` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.green, textTransform: 'uppercase', marginBottom: 10 }}>
              Why this plan
            </div>
            <div style={{ fontSize: 14, color: C.white, lineHeight: 1.65, marginBottom: latestScan.scanComparison ? 14 : 0 }}>
              {latestScan.adaptationRationale || 'Plan is based on your latest scan results.'}
            </div>
            {latestScan.scanComparison?.pace_vs_expected && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(114,184,149,0.1)', borderRadius: 99, padding: '5px 12px', marginTop: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: latestScan.scanComparison.pace_vs_expected === 'on_track' ? C.green : C.orange }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: latestScan.scanComparison.pace_vs_expected === 'on_track' ? C.green : C.orange }}>
                  {latestScan.scanComparison.pace_vs_expected === 'on_track' ? 'Pace: on track' : latestScan.scanComparison.pace_vs_expected === 'ahead' ? 'Pace: ahead' : 'Pace: behind'}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </PremiumGate>

      {/* ══ 3. FOCUS ════════════════════════════════════════════════════ */}
      <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
        <SectionRow sectionKey="focus" label="Focus" />
        {openSections.has('focus') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FOCUS_CARDS.map(card => (
              <div key={card.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '11px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: C.green, background: C.greenBg, borderRadius: 6, padding: '3px 8px', flexShrink: 0,
                  }}>{card.label}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{card.value}</span>
                </div>
                <span style={{ fontSize: 12, color: C.dimmed, flexShrink: 0, marginLeft: 8 }}>{card.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 4. TIMELINE ═════════════════════════════════════════════════ */}
      <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
        <SectionRow sectionKey="timeline" label="Timeline" meta={`Week ${week} of 12`} />
        {openSections.has('timeline') && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {MILESTONES.map((m, i) => {
              const isPast    = week > m.w;
              const isCurrent = week <= m.w && week > (MILESTONES[i - 1]?.w || 0);
              return (
                <div key={m.w} style={{ display: 'flex', gap: 12, paddingBottom: i < MILESTONES.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', marginTop: 3, flexShrink: 0,
                      background: isPast || isCurrent ? C.green : 'transparent',
                      border: `1.5px solid ${isPast || isCurrent ? C.green : C.dimmed}`,
                      opacity: isCurrent ? 1 : isPast ? 0.55 : 0.3,
                    }} />
                    {i < MILESTONES.length - 1 && (
                      <div style={{ width: 1, flex: 1, minHeight: 22, background: isPast ? `${C.green}44` : 'rgba(255,255,255,0.07)', margin: '3px 0' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: C.dimmed, fontWeight: 600 }}>W{m.w}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? C.white : isPast ? C.muted : C.dimmed }}>
                        {m.label}
                      </span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, color: C.green, background: C.greenBg, padding: '1px 7px', borderRadius: 99, fontWeight: 600 }}>
                          Now
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ 5. MEALS ════════════════════════════════════════════════════ */}
      {mealPlanDays && (
        <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
          <SectionRow sectionKey="meals" label="Today's meals" meta="tap to expand" />
          {openSections.has('meals') && (() => {
            const day    = mealPlanDays[activeDayIdx];
            const today2 = todayStr();
            const MEAL_KEYS = [
              { key: 'breakfast', label: 'Breakfast' },
              { key: 'lunch',     label: 'Lunch' },
              { key: 'dinner',    label: 'Dinner' },
              { key: 'snack',     label: 'Snack' },
            ];
            return (
              <>
                {/* Day selector */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 14 }}>
                  {mealPlanDays.map((d, i) => {
                    const isTodayDay = d.day === new Date().toLocaleDateString('en-US', { weekday: 'long' });
                    const isActive   = activeDayIdx === i;
                    return (
                      <button key={i} className="bp" onClick={() => setActiveDayIdx(i)} style={{
                        flexShrink: 0, padding: '6px 12px', borderRadius: 99,
                        border: `1.5px solid ${isActive ? C.green : isTodayDay ? `${C.green}44` : C.border}`,
                        background: isActive ? C.greenBg : 'transparent',
                        color: isActive ? C.green : isTodayDay ? C.white : C.muted,
                        fontSize: 12, fontWeight: isActive || isTodayDay ? 700 : 500, cursor: 'pointer',
                      }}>
                        {d.day.slice(0, 3)}{d.isTrainingDay ? ' ·' : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Meal rows */}
                {day && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {MEAL_KEYS.map(({ key, label }) => {
                      const meal       = day[key];
                      if (!meal?.name) return null;
                      const logKey     = `${day.day}-${key}`;
                      const isLogged   = !!loggedMeals[logKey];
                      const isSwapping = swappingKey === logKey;
                      return (
                        <div key={key} style={{
                          borderRadius: 14, overflow: 'hidden',
                          border: `1px solid ${isLogged ? `${C.green}38` : C.border}`,
                          background: C.cardElevated,
                          opacity: isSwapping ? 0.6 : 1,
                        }}>
                          <div className="bp" onClick={() => setSelectedMeal({ ...meal, mealType: label })} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px 14px', cursor: 'pointer',
                          }}>
                            <div>
                              <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                                {label}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: isLogged ? C.muted : C.white }}>
                                {isLogged && <span style={{ color: C.green, marginRight: 6 }}>✓</span>}
                                {meal.name}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{meal.calories} kcal</div>
                              <div style={{ fontSize: 11, color: C.dimmed }}>{meal.protein}g P</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', borderTop: `1px solid rgba(255,255,255,0.04)` }}>
                            <button className="bp" onClick={async () => {
                              if (isSwapping) return;
                              setSwappingKey(logKey);
                              try {
                                const newMeal = await swapMealAPI({ ...meal, mealType: label }, profile, activePlan);
                                const updated = mealPlanDays.map((d2, i2) => i2 !== activeDayIdx ? d2 : { ...d2, [key]: { ...d2[key], ...newMeal } });
                                setMealPlanDays(updated);
                                LS.set(LS_KEYS.mealplan, { ...LS.get(LS_KEYS.mealplan, {}), days: updated });
                                showToast?.('Meal swapped');
                              } catch { showToast?.('Swap failed'); }
                              setSwappingKey(null);
                            }} style={{
                              flex: 1, padding: '9px 0', background: 'none',
                              border: 'none', borderRight: `1px solid rgba(255,255,255,0.04)`,
                              color: C.dimmed, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                              {isSwapping ? '⟳' : '\u21ba Swap'}
                            </button>
                            <button className="bp" onClick={() => {
                              if (isLogged) return;
                              const todayMeals = LS.get(LS_KEYS.meals(today2), []);
                              const entry = { id: Date.now(), name: meal.name, category: label, calories: meal.calories || 0, protein: meal.protein || 0, carbs: meal.carbs || 0, fat: meal.fat || 0 };
                              LS.set(LS_KEYS.meals(today2), [...todayMeals, entry]);
                              const updated = { ...loggedMeals, [logKey]: true };
                              setLoggedMeals(updated);
                              LS.set(LS_KEYS.logged(today2), updated);
                              showToast?.('Logged');
                            }} style={{
                              flex: 1, padding: '9px 0', background: 'none', border: 'none',
                              color: isLogged ? C.green : C.muted, fontSize: 12, fontWeight: 600,
                              cursor: isLogged ? 'default' : 'pointer',
                            }}>
                              {isLogged ? '\u2713 Logged' : 'Log \u2192'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ══ 6. PRIORITIES ═══════════════════════════════════════════════ */}
      <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
        <SectionRow sectionKey="priorities" label="This week's priorities" />
        {openSections.has('priorities') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {missions.map((m, idx) => (
              <div key={m.id} className="bp" onClick={() => toggleMission(m.id)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 2px',
                borderBottom: idx < missions.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
                cursor: 'pointer',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: m.done ? C.green : 'transparent',
                  border: m.done ? 'none' : `1.5px solid rgba(255,255,255,0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {m.done && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="#0A0D0A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: 14, color: m.done ? C.dimmed : C.muted, lineHeight: 1.45,
                  textDecoration: m.done ? 'line-through' : 'none', flex: 1,
                }}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 7. WORKOUTS ═════════════════════════════════════════════════ */}
      {(() => {
        const workoutDays = LS.get(LS_KEYS.workoutplan, []) || [];
        if (!workoutDays.length) return null;
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const safeIdx = Math.min(workoutPage, workoutDays.length - 1);
        const day = workoutDays[safeIdx];
        const isToday = day.day === todayName;
        return (
          <div style={{ background: C.card, borderRadius: 20, padding: '18px 20px', border: `1px solid rgba(255,255,255,0.08)` }}>
            <SectionRow sectionKey="workouts" label="Workout plan" meta={`${trainDays}x/wk`} />
            {openSections.has('workouts') && (
              <div>
                {/* Pager nav */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button
                    onClick={() => setWorkoutPage(p => Math.max(0, p - 1))}
                    disabled={safeIdx === 0}
                    style={{ background: 'none', border: 'none', cursor: safeIdx === 0 ? 'default' : 'pointer',
                      color: safeIdx === 0 ? C.dimmed : C.muted, fontSize: 20, padding: '4px 8px', lineHeight: 1 }}
                  >‹</button>

                  {/* Dot indicators */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {workoutDays.map((d, i) => {
                      const isCur  = i === safeIdx;
                      const isDot  = d.day === todayName;
                      return (
                        <button
                          key={d.day}
                          onClick={() => setWorkoutPage(i)}
                          style={{
                            width: isCur ? 20 : 6, height: 6, borderRadius: 99,
                            background: isCur ? C.green : isDot ? 'rgba(114,184,149,0.35)' : 'rgba(255,255,255,0.15)',
                            border: 'none', cursor: 'pointer', padding: 0,
                            transition: 'width .2s ease, background .2s ease',
                          }}
                        />
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setWorkoutPage(p => Math.min(workoutDays.length - 1, p + 1))}
                    disabled={safeIdx === workoutDays.length - 1}
                    style={{ background: 'none', border: 'none', cursor: safeIdx === workoutDays.length - 1 ? 'default' : 'pointer',
                      color: safeIdx === workoutDays.length - 1 ? C.dimmed : C.muted, fontSize: 20, padding: '4px 8px', lineHeight: 1 }}
                  >›</button>
                </div>

                {/* Single workout card */}
                <div style={{
                  borderRadius: 16, overflow: 'hidden',
                  background: C.cardElevated,
                  border: `1px solid ${isToday ? 'rgba(114,184,149,0.22)' : 'rgba(255,255,255,0.07)'}`,
                  opacity: day.isTrainingDay ? 1 : 0.65,
                }}>
                  {/* Header */}
                  <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{day.day}</span>
                        {isToday && (
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: C.green,
                            background: C.greenBg, padding: '2px 8px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
                            TODAY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>{day.workoutType}</div>
                      {day.isTrainingDay && (day.focus || []).length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {(day.focus || []).map(f => (
                            <span key={f} style={{ fontSize: 11, color: C.blue, background: 'rgba(74,158,255,0.08)',
                              padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(74,158,255,0.15)', fontWeight: 600 }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: day.isTrainingDay ? C.green : C.dimmed, fontWeight: 600, marginTop: 2 }}>
                      {day.isTrainingDay ? (day.duration || 'Train') : 'Rest'}
                    </span>
                  </div>

                  {/* Exercise list — full, no truncation */}
                  {day.isTrainingDay && (day.exercises || []).length > 0 && (
                    <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {(day.exercises || []).map((ex, ei) => (
                        <div key={`${ex.name}-${ei}`} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 0',
                          borderBottom: ei < day.exercises.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                        }}>
                          <div>
                            <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>{ex.name}</div>
                            {ex.notes && <div style={{ fontSize: 11, color: C.dimmed, marginTop: 1 }}>{ex.notes}</div>}
                          </div>
                          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                            {ex.sets}×{ex.reps}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!day.isTrainingDay && (
                    <div style={{ padding: '12px 16px', borderTop: `1px solid rgba(255,255,255,0.05)`, fontSize: 13, color: C.dimmed }}>
                      Active recovery — light walk, stretching, or full rest.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Symmetry & Balance Suggestions ── */}
      {(() => {
        const latestScan = LS.get(LS_KEYS.scanHistory, []).slice(-1)[0];
        const weakGroups = latestScan?.weakestGroups || [];
        if (weakGroups.length === 0) return null;

        const SYMMETRY_EXERCISES = {
          chest: [{ name: 'Single-Arm Cable Fly', sets: '3', reps: '12–15', note: 'Isolates each side independently' }, { name: 'Dumbbell Press', sets: '4', reps: '8–12', note: 'Expose left/right imbalances' }],
          shoulders: [{ name: 'Single-Arm Lateral Raise', sets: '3', reps: '15', note: 'Correct shoulder height imbalance' }, { name: 'Cable Face Pull', sets: '3', reps: '15–20', note: 'Rear delt and rotator balance' }],
          back: [{ name: 'Single-Arm Dumbbell Row', sets: '4', reps: '10–12', note: 'Match rep quality both sides' }, { name: 'Lat Pulldown (neutral grip)', sets: '3', reps: '10–12', note: 'Bilateral engagement check' }],
          arms: [{ name: 'Alternating Dumbbell Curl', sets: '3', reps: '12 each', note: 'Identify strength gap between arms' }, { name: 'Single-Arm Tricep Pushdown', sets: '3', reps: '12–15', note: 'Equalise tricep volume' }],
          core: [{ name: 'Pallof Press', sets: '3', reps: '12 each side', note: 'Anti-rotation for core symmetry' }, { name: 'Copenhagen Plank', sets: '3', reps: '20s each', note: 'Adductor and hip balance' }],
          legs: [{ name: 'Bulgarian Split Squat', sets: '4', reps: '8–10 each', note: 'Expose quad/glute imbalance' }, { name: 'Single-Leg Press', sets: '3', reps: '10–12', note: 'Match load both legs' }],
        };

        const suggestions = weakGroups.slice(0, 3).flatMap(g => {
          const key = String(g).toLowerCase().replace(/[^a-z]/g, '');
          return (SYMMETRY_EXERCISES[key] || []).slice(0, 2).map(ex => ({ ...ex, group: g }));
        });

        if (suggestions.length === 0) return null;

        const symScore = latestScan?.symmetryScore;
        return (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.dimmed, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                Symmetry corrections
              </span>
              {symScore != null && (
                <span style={{ fontSize: 12, color: C.purple, fontWeight: 700 }}>{symScore}/100</span>
              )}
            </div>
            <div style={{ borderRadius: 16, background: C.cardElevated, border: `1px solid rgba(255,255,255,0.07)`, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {weakGroups.slice(0, 3).map(g => (
                  <span key={g} style={{ fontSize: 11, color: C.orange, background: 'rgba(255,140,0,0.08)',
                    padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(255,140,0,0.15)', fontWeight: 600, textTransform: 'capitalize' }}>
                    {g}
                  </span>
                ))}
              </div>
              {suggestions.map((ex, i) => (
                <div key={`${ex.name}-${i}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: i < suggestions.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>{ex.name}</div>
                    {ex.note && <div style={{ fontSize: 11, color: C.dimmed, marginTop: 1 }}>{ex.note}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>{ex.sets}×{ex.reps}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* selectedMeal modal */}
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
            showToast?.('Meal logged');
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
      position: 'fixed',
      bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      background: C.green, color: '#000', fontWeight: 700, fontSize: 14,
      padding: '10px 22px', borderRadius: 99, zIndex: 520, whiteSpace: 'nowrap',
      maxWidth: 'calc(100vw - 32px)', textAlign: 'center', lineHeight: 1.35,
      boxShadow: '0 4px 20px rgba(0,200,83,0.4)', pointerEvents: 'none',
    }}>{msg}</div>
  );
}

/* Mission definitions */
const MISSIONS = [
  { id: 'm_log_meal',    tier: 'Bronze', icon: 'bowl',        title: 'Log First Meal',       desc: 'Log your first meal today',              xp: 100, requires: [] },
  { id: 'm_water',       tier: 'Bronze', icon: 'droplet',     title: 'Hydration Init',        desc: 'Drink 2L of water',                       xp: 100, requires: [] },
  { id: 'm_sleep',       tier: 'Bronze', icon: 'moon',        title: 'Sleep Starter',         desc: 'Get 7 hours of sleep',                    xp: 100, requires: [] },
  { id: 'm_steps',       tier: 'Bronze', icon: 'footsteps',   title: 'First Steps',           desc: 'Hit 7,000 steps in a day',                xp: 100, requires: [] },
  { id: 'm_protein3',    tier: 'Silver', icon: 'bolt',        title: 'Protein King',          desc: 'Hit protein target 3 days in a row',      xp: 250, requires: ['m_log_meal','m_water','m_sleep','m_steps'] },
  { id: 'm_log5',        tier: 'Silver', icon: 'notebook',    title: 'Meal Streak',           desc: 'Log meals 5 days straight',               xp: 250, requires: ['m_log_meal','m_water','m_sleep','m_steps'] },
  { id: 'm_fullweek',    tier: 'Gold',   icon: 'trophy',      title: 'Full Week on Plan',     desc: 'Complete a full week on plan',            xp: 500, requires: ['m_protein3','m_log5'] },
  { id: 'm_alltargets',  tier: 'Gold',   icon: 'target',      title: 'Perfect Day',           desc: 'Hit all targets in one day',              xp: 500, requires: ['m_protein3','m_log5'] },
];
const TIER_ORDER  = ['Bronze','Silver','Gold','Platinum','Legendary'];
const TIER_COLORS = { Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: C.gold, Platinum: C.purple, Legendary: C.green };

/* Simple SVG line chart — physique score over scans */
function PhysiqueChart({ scans }) {
  if (!scans || scans.length < 2) return null;
  const sorted = [...scans].sort((a, b) => new Date(a.date) - new Date(b.date));
  const scores = sorted.map(s => s.physiqueScore || 50);
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
function AIPatterns({ profile, activePlan, scanHistory }) {
  const latestScan = Array.isArray(scanHistory) && scanHistory.length ? scanHistory[scanHistory.length - 1] : null;
  // Cache key includes protein AND latest scan date so patterns regenerate after each new scan
  const m        = getActiveTargets(activePlan, profile);
  const scanDate = latestScan?.date || latestScan?.savedAt || '';
  const cacheKey = `massiq:patterns:p${m.protein}:s${scanDate}`;
  const isStale  = (() => { const c = LS.get(cacheKey, null); return !c || (Date.now() - (c.ts||0) > 7*24*3600*1000); })();
  const [insights, setInsights] = useState(() => isStale ? null : LS.get(cacheKey, null)?.insights);
  const [loading,  setLoading]  = useState(isStale);
  useEffect(() => {
    if (!loading) return;
    let ok = true;
    generatePatterns(profile, activePlan, latestScan)
      .then(data => {
        if (!ok) return;
        const arr = data.insights || [];
        setInsights(arr);
        LS.set(cacheKey, { insights: arr, ts: Date.now() });
        setLoading(false);
      })
      .catch(err => { console.error('Patterns failed:', err); if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [cacheKey]);

  return (
    <div className="su" style={{ animationDelay: '.10s' }}>
      <div style={{ fontSize: 11, color: C.dimmed, letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Patterns</div>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {loading ? (
          [1,2,3].map((i, idx) => (
            <div key={i} style={{
              padding: '13px 16px',
              borderBottom: idx < 2 ? `1px solid rgba(255,255,255,0.05)` : 'none',
            }}>
              <div className="skeleton" style={{ height: 10, width: '40%', borderRadius: 6, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 8, width: '75%', borderRadius: 6 }} />
            </div>
          ))
        ) : insights?.length ? (
          insights.map((ins, i) => (
            <div key={i} style={{
              padding: '13px 16px',
              borderBottom: i < insights.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.dimmed, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {ins.label || 'INSIGHT'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
                  {ins.metric}
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>{ins.pattern}</div>
            </div>
          ))
        ) : (
          <div style={{ padding: '20px 16px', color: C.dimmed, fontSize: 13, textAlign: 'center' }}>
            Complete your plan to see patterns.
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ profile, setTab, onEditProfile, onDeleteScanHistory, onDeleteAccount, onLogout, showToast, onUpdateUnits, subscription, onUpgrade, scanHistoryFromDb = [], accessToken = null }) {
  const rawScanHistory = Array.isArray(scanHistoryFromDb) && scanHistoryFromDb.length > 0 ? scanHistoryFromDb : LS.get(LS_KEYS.scanHistory, []);
  // Always display in chronological order (oldest first)
  const scanHistory = [...rawScanHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteHistoryBusy, setDeleteHistoryBusy] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [selectedScan, setSelectedScan] = useState(null);
  const [reminders, setReminders] = useState(() => LS.get(LS_KEYS.reminders, {
    workout: { enabled: true, time: '17:30' },
    cardio: { enabled: false, time: '07:30' },
    protein: { enabled: true, time: '19:00' },
    hydration: { enabled: false, time: '14:00' },
    checkpoint: { enabled: true, time: '09:00' },
  }));

  /* Health score from latest non-duplicate scan (or last row) */
  const lastScan =
    [...scanHistory].filter((s) => s && s.scanStatus !== 'duplicate' && !s.duplicateOfScanId).slice(-1)[0]
    || scanHistory[scanHistory.length - 1]
    || null;

  /* Delta summary for scan history */
  const firstScan = scanHistory[0];
  const bfDelta   = firstScan && lastScan ? ((getBF(lastScan) || 0) - (getBF(firstScan) || 0)).toFixed(1)  : null;
  const lmDelta   = firstScan && lastScan ? (lastScan.leanMass - firstScan.leanMass).toFixed(1) : null;

  const GOAL_COLORS = { Cut: C.orange, Bulk: C.blue, Recomp: C.purple, Maintain: C.green };
  const goalColor = GOAL_COLORS[profile?.goal] || C.green;
  const updateReminder = async (key, patch) => {
    const next = { ...reminders, [key]: { ...reminders[key], ...patch } };
    // If turning on, request notification permission
    if (patch.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied');
      if (perm !== 'granted') {
        showToast('Enable browser notifications in your settings to receive reminders.');
      }
    }
    setReminders(next);
    LS.set(LS_KEYS.reminders, next);
  };

  // Schedule reminders: check every minute if a notification should fire
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const check = () => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const stored = LS.get(LS_KEYS.reminders, {});
      const LABELS = {
        workout: 'Workout Window', cardio: 'Cardio Session',
        protein: 'Protein Check', hydration: 'Hydration', checkpoint: 'Scan Checkpoint',
      };
      const BODIES = {
        workout: 'Your workout window starts soon. Time to train.',
        cardio: 'Cardio session scheduled for today.',
        protein: 'Check your protein intake — stay on target.',
        hydration: 'Hydration check-in. Hit your water target.',
        checkpoint: 'Review your progress checkpoint.',
      };
      const firedKey = `massiq:notif:fired:${todayStr()}`;
      const fired = LS.get(firedKey, {});
      Object.entries(stored).forEach(([key, cfg]) => {
        if (cfg?.enabled && cfg?.time === hhmm && !fired[key]) {
          try {
            new Notification(`MassIQ — ${LABELS[key] || key}`, {
              body: BODIES[key] || '',
              icon: '/favicon.ico',
              silent: false,
            });
            LS.set(firedKey, { ...fired, [key]: true });
          } catch {}
        }
      });
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  const isPremium     = isPremiumActive(subscription);
  const isCanceling   = subscription?.cancel_at_period_end === true;
  const isPastDue     = subscription?.status === 'past_due';
  const periodEnd     = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const [portalLoading, setPortalLoading] = useState(false);
  const openBillingPortal = async () => {
    if (!accessToken) {
      showToast('Sign in to manage billing.');
      return;
    }
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not open billing portal.');
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      showToast(err?.message || 'Could not open billing portal.');
    }
    setPortalLoading(false);
  };

  return (
    <div className="screen">
      <h1 className="screen-title">Profile</h1>

      {/* ── Subscription status ─────────────────────────────────────────── */}
      <Card className="su" style={{
        animationDelay: '.01s',
        background: isPremium ? '#0E1A12' : C.card,
        border: isPremium
          ? `1px solid ${isPastDue ? 'rgba(212,114,74,0.4)' : isCanceling ? 'rgba(196,168,50,0.3)' : 'rgba(114,184,149,0.25)'}`
          : `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 5,
              color: isPastDue ? C.orange : isCanceling ? C.gold : isPremium ? C.green : C.dimmed }}>
              {isPastDue ? 'Payment Failed' : isCanceling ? 'Premium · Canceling' : isPremium ? 'Premium · Active' : 'Free Plan'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>
              {isPremium ? 'MassIQ Premium' : 'MassIQ Free'}
            </div>
            {isPremium && periodEnd && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                {isCanceling
                  ? `Access until ${periodEnd} — won't renew`
                  : isPastDue
                    ? `Payment issue — update billing to keep access`
                    : `Renews ${periodEnd}`}
              </div>
            )}
            {!isPremium && (
              <div style={{ fontSize: 12, color: C.dimmed, marginTop: 3 }}>
                {FREE_SCAN_LIMIT} free scans included
              </div>
            )}
          </div>
          {!isPremium && (
            <button
              className="bp"
              onClick={onUpgrade}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '9px 18px', borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Upgrade →
            </button>
          )}
          {isPremium && !isPastDue && !isCanceling && (
            <div style={{
              background: 'rgba(114,184,149,0.12)', borderRadius: 10,
              padding: '6px 12px', fontSize: 12, color: C.green, fontWeight: 600, flexShrink: 0,
            }}>
              Active
            </div>
          )}
          {isPastDue && (
            <div style={{
              background: 'rgba(212,114,74,0.12)', borderRadius: 10,
              padding: '6px 12px', fontSize: 12, color: C.orange, fontWeight: 600, flexShrink: 0,
            }}>
              Past Due
            </div>
          )}
        </div>

        {/* Manage Billing — server loads stripe_customer_id from DB */}
        {isPremium && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid rgba(255,255,255,0.07)` }}>
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="bp"
              style={{
                background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`,
                color: C.muted, borderRadius: 10, padding: '9px 16px', fontSize: 13,
                fontWeight: 600, cursor: portalLoading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <Icon name="settings" size={13} color={C.muted} strokeWidth={2} />
              {portalLoading ? 'Opening…' : isCanceling ? 'Renew or Manage Billing' : 'Manage Billing'}
            </button>
            {isCanceling && (
              <div style={{ fontSize: 11, color: C.dimmed, marginTop: 8, lineHeight: 1.5 }}>
                You can reactivate anytime before {periodEnd} to keep your scan history and premium access.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 1+2 ── No-scan placeholder (covers Journey + Health Score) ── */}
      {!lastScan && (
        <Card className="su" style={{ background: '#141A14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32, textAlign: 'center', animationDelay: '.02s' }}>
          <div style={{ marginBottom: 12 }}><Icon name="camera" size={40} color={C.dimmed} strokeWidth={1} /></div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 10 }}>No scan data yet</div>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 24 }}>
            Complete your first body scan to see your physique metrics, health score, and journey timeline.
          </p>
          <Btn onClick={() => setTab('scan')} style={{ width: '100%' }}>Go to Scan →</Btn>
        </Card>
      )}

      {/* 1 ── Physique Journey ── */}
      {lastScan && <div className="su">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Your Physique Journey</div>
        {scanHistory.length === 0 ? null : (
          <Card style={{ padding: 16 }}>
            {bfDelta !== null && (
              <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 14 }}>
                Since you started: {Number(bfDelta) <= 0 ? `${Math.abs(bfDelta)}% body fat lost` : `${bfDelta}% body fat gained`}
                {lmDelta !== null && `, ${Number(lmDelta) >= 0 ? '+' : ''}${lmDelta} lbs lean mass`}
              </div>
            )}
            {/* Horizontal scroll of scan cards — oldest left, newest right */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
              {scanHistory.map((s, i) => {
                const prev = scanHistory[i - 1];
                const bfΔ = prev ? Number((getBF(s) || 0) - (getBF(prev) || 0)) : null;
                const lmΔ = prev ? Number((s.leanMass || 0) - (prev.leanMass || 0)) : null;
                const scoreΔ = prev ? (s.physiqueScore || 0) - (prev.physiqueScore || 0) : null;
                const isLatestScan = i === scanHistory.length - 1;
                return (
                  <div key={i} className="bp" onClick={() => setSelectedScan({ scan: s, isLatest: isLatestScan })} style={{
                    flexShrink: 0, background: C.cardElevated, borderRadius: 14, padding: '12px 14px', minWidth: 136, cursor: 'pointer',
                    border: `1px solid ${isLatestScan ? C.green + '44' : s.isBaseline ? C.purple + '44' : C.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: C.muted }}>{s.date ? fmt.date(s.date) : `Scan ${i + 1}`}</div>
                      {s.isBaseline && <span style={{ fontSize: 8, fontWeight: 700, color: C.purple, background: C.purple + '22', padding: '1px 5px', borderRadius: 99, textTransform: 'uppercase' }}>Base</span>}
                      {isLatestScan && !s.isBaseline && <span style={{ fontSize: 8, fontWeight: 700, color: C.green, background: C.greenBg, padding: '1px 5px', borderRadius: 99, textTransform: 'uppercase' }}>Latest</span>}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.white }}>{safeNum(s.physiqueScore)}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>score{scoreΔ !== null && <span style={{ color: scoreΔ >= 0 ? C.green : C.red }}> {scoreΔ >= 0 ? '+' : ''}{scoreΔ}</span>}</div>
                    <div style={{ marginTop: 6, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ color: C.muted }}>
                        BF: <span style={{ fontWeight: 600, color: C.white }}>{getBFDisplay(s)}</span>
                        {bfΔ !== null && <span style={{ color: bfΔ <= 0 ? C.green : C.red }}> ({bfΔ > 0 ? '+' : ''}{bfΔ.toFixed(1)}%)</span>}
                      </div>
                      <div style={{ color: C.muted }}>
                        LM: <span style={{ fontWeight: 600, color: C.white }}>{s.leanMass > 0 ? fmt.leanMass(s.leanMass, profile?.unitSystem) : '—'}</span>
                        {lmΔ !== null && <span style={{ color: lmΔ >= 0 ? C.green : C.red }}> ({lmΔ >= 0 ? '+' : ''}{lmΔ.toFixed(1)})</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: C.green, marginTop: 6, opacity: 0.7 }}>Tap for details →</div>
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
      </div>}


      {/* 4 ── Profile Info ── */}
      <Card className="su" style={{ animationDelay: '.12s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Profile Info</span>
          <Btn variant="outline" onClick={onEditProfile} style={{ padding: '8px 16px', fontSize: 13 }}>Edit Profile</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Name',     profile?.name || 'Not set'],
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
          {/* Units toggle */}
          {onUpdateUnits && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Units</span>
              <div style={{ display: 'flex', background: C.cardElevated, borderRadius: 99, padding: 3, gap: 2, border: `1px solid ${C.border}` }}>
                {[{ key: 'imperial', label: 'Imperial (lbs)' }, { key: 'metric', label: 'Metric (kg)' }].map(u => {
                  const active = (profile?.unitSystem || 'imperial') === u.key;
                  return (
                    <button
                      key={u.key}
                      onClick={() => onUpdateUnits(u.key)}
                      style={{
                        fontSize: 12, fontWeight: active ? 700 : 500,
                        padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                        background: active ? C.green : 'transparent',
                        color: active ? '#000' : C.muted,
                        transition: 'all .18s',
                      }}
                    >{u.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 5 ── Reminder Preferences ── */}
      <Card className="su" style={{ animationDelay: '.14s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Reminder Preferences</div>
          {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
            <button className="bp" onClick={async () => {
              const p = await Notification.requestPermission().catch(() => 'denied');
              if (p !== 'granted') showToast('Notifications blocked — enable them in browser settings.');
              else showToast('Notifications enabled!');
            }} style={{ fontSize: 11, fontWeight: 650, borderRadius: 999, padding: '4px 10px', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
              Enable notifications
            </button>
          )}
        </div>
        {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
          <div style={{ fontSize: 12, color: C.gold, marginBottom: 10, padding: '8px 10px', background: 'rgba(255,214,10,0.08)', borderRadius: 8, border: '1px solid rgba(255,214,10,0.2)' }}>
            Notifications are blocked. Go to your browser settings to allow them.
          </div>
        )}
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

      {/* Legal ── */}
      <Card style={{ padding: '4px 0' }}>
        {[
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
        ].map((item, i) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '13px 16px',
              borderBottom: i === 0 ? `1px solid ${C.border}` : 'none',
              color: C.muted, fontSize: 14, fontWeight: 500, textDecoration: 'none',
            }}
          >
            <span>{item.label}</span>
            <Icon name="arrow-right" size={14} color={C.dimmed} strokeWidth={2} />
          </a>
        ))}
      </Card>

      {/* 6 ── Destructive actions ── */}
      <div style={{ paddingTop: 8, textAlign: 'center' }}>
        <button className="bp" onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 0 14px' }}>
          Log Out
        </button>

        {/* Delete scan history */}
        {!confirmDeleteHistory ? (
          <button className="bp" onClick={() => setConfirmDeleteHistory(true)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: C.red, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0' }}>
            Delete scan history
          </button>
        ) : (
          <Card style={{ border: `1px solid ${C.red}`, textAlign: 'center', padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Delete all scans?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Your scan photos and results will be permanently deleted. This does not restore free scan credits — those are tracked separately.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setConfirmDeleteHistory(false)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn disabled={deleteHistoryBusy} onClick={async () => {
                setDeleteHistoryBusy(true);
                try { await onDeleteScanHistory(); } finally { setDeleteHistoryBusy(false); setConfirmDeleteHistory(false); }
              }} style={{ flex: 1, background: C.red, color: C.white }}>
                {deleteHistoryBusy ? 'Deleting…' : 'Yes, delete'}
              </Btn>
            </div>
          </Card>
        )}

        {/* Delete account */}
        {!confirmDeleteAccount ? (
          <button className="bp" onClick={() => setConfirmDeleteAccount(true)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: C.red, fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '6px 0 14px', opacity: 0.7 }}>
            Delete account
          </button>
        ) : (
          <Card style={{ border: `1px solid ${C.red}`, textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Permanently delete your account?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Your account, profile, all scans, and all data will be permanently erased. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setConfirmDeleteAccount(false)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn disabled={deleteAccountBusy} onClick={async () => {
                setDeleteAccountBusy(true);
                try { await onDeleteAccount(); } finally { setDeleteAccountBusy(false); setConfirmDeleteAccount(false); }
              }} style={{ flex: 1, background: C.red, color: C.white }}>
                {deleteAccountBusy ? 'Deleting…' : 'Yes, delete account'}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {/* Scan history detail modal */}
      {selectedScan && (
        <ScanHistoryModal
          scan={selectedScan.scan}
          isLatest={selectedScan.isLatest}
          profile={profile}
          onClose={() => setSelectedScan(null)}
        />
      )}
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

/* Validates a new scan against the previous one to catch outlier estimates */
function validateScanConsistency(newScan, prevScan, daysBetween) {
  if (!prevScan) return [];
  const days = Math.max(1, daysBetween);
  const issues = [];
  // ~0.5% BF / week max realistic change, floor 2%
  const maxBFChange = Math.max(2, days / 14);
  const bfChange = Math.abs((newScan.bodyFatPct || 0) - (getBF(prevScan) || 0));
  if (bfChange > maxBFChange) {
    issues.push({
      metric: 'bodyFat',
      message: `Body fat changed ${bfChange.toFixed(1)}% since your last scan (${days} days ago). Maximum realistic change over this period is ~${maxBFChange.toFixed(1)}%. This likely reflects lighting or angle differences, not real change.`,
      severity: 'warning',
    });
  }
  // ~0.5 lb lean mass / week max, floor 3 lbs
  const maxLMChange = Math.max(3, days / 7);
  const lmChange = Math.abs((newScan.leanMass || 0) - (prevScan.leanMass || 0));
  if (lmChange > maxLMChange) {
    issues.push({
      metric: 'leanMass',
      message: `Lean mass changed ${lmChange.toFixed(1)} lbs since your last scan. Maximum realistic change is ~${maxLMChange.toFixed(0)} lbs. This is likely estimation variance, not real change.`,
      severity: 'warning',
    });
  }
  // Large score drop is almost always a photo quality issue
  const scoreChange = (newScan.physiqueScore || 0) - (prevScan.physiqueScore || 0);
  if (scoreChange < -15) {
    issues.push({
      metric: 'score',
      message: `Score dropped ${Math.abs(scoreChange)} points. Drops this large are typically caused by photo angle or lighting differences, not actual physique change.`,
      severity: 'warning',
    });
  }
  return issues;
}

function getLastValidScan(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const s = history[i];
    if (s && s.scanStatus !== 'duplicate') return s;
  }
  return null;
}

/* ─── Scan History Detail Modal ─────────────────────────────────────────────
   Shown when user taps a previous scan card.
   Shows key results only — keeps it focused and fast to parse.
─────────────────────────────────────────────────────────────────────────── */
function ScanHistoryModal({ scan, isLatest, profile, onClose }) {
  if (!scan) return null;
  const phaseColor = PHASE_COLORS[scan.phase] || C.green;
  const dt = scan.dailyTargets || {};

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88dvh', overflowY: 'auto',
        background: C.surface, borderRadius: '24px 24px 0 0',
        padding: '0 0 32px',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>
              {scan.date ? fmt.date(scan.date) : 'Scan'} · SCAN RESULTS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Physique Summary</span>
              {scan.phase && (
                <span style={{ fontSize: 10, fontWeight: 700, color: phaseColor, background: phaseColor + '22', padding: '2px 8px', borderRadius: 99 }}>
                  {scan.phase}
                </span>
              )}
              {isLatest && (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: C.greenBg, padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Active
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="bp" style={{
            background: C.cardElevated, border: 'none', color: C.muted,
            width: 32, height: 32, borderRadius: '50%', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Key metrics 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Body Fat',      value: getBFDisplay(scan), color: C.orange },
              { label: 'Lean Mass',     value: scan.leanMass > 0 ? fmt.leanMass(scan.leanMass, profile?.unitSystem) : '—',                                                    color: C.blue },
              { label: 'Physique Score', value: `${safeNum(scan.physiqueScore)}/100`,                                                                                          color: C.green },
              { label: 'Symmetry',      value: `${safeNum(scan.symmetryScore)}/100`,                                                                                           color: C.purple },
            ].map(m => (
              <div key={m.label} style={{ background: C.cardElevated, borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Limiting factor */}
          {scan.limitingFactor && (
            <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Limiting Factor</div>
              <p style={{ fontSize: 13, color: C.white, lineHeight: 1.55, margin: '0 0 6px', fontWeight: 600 }}>{scan.limitingFactor}</p>
              {scan.limitingFactorExplanation && (
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: 0 }}>{scan.limitingFactorExplanation}</p>
              )}
            </div>
          )}

          {/* Plan applied */}
          {(dt.calories || dt.protein) && (
            <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Plan Applied</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Calories',  value: dt.calories ? `${dt.calories} kcal` : '—' },
                  { label: 'Protein',   value: dt.protein  ? `${dt.protein}g`       : '—' },
                  { label: 'Training',  value: dt.trainingDaysPerWeek ? `${dt.trainingDaysPerWeek} sessions/wk` : '—' },
                  { label: 'Phase',     value: scan.phase || '—' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em' }}>{r.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{r.value}</div>
                  </div>
                ))}
              </div>
              {scan.nutritionKeyChange && (
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  Key change: {scan.nutritionKeyChange}
                </p>
              )}
            </div>
          )}

          {/* Focus areas */}
          {(scan.weakestGroups?.length > 0 || scan.focusAreas?.length > 0) && (
            <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Focus Areas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(scan.weakestGroups || scan.focusAreas || []).slice(0, 3).map((area, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment fallback */}
          {!scan.limitingFactor && scan.assessment && (
            <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Assessment</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{scan.assessment}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScanTab({ profile, setTab, showToast, onPlanApplied, onPersistProgramArtifacts, subscription, entitlements, parentScanHistory, onRefreshEntitlements, isLoggedIn }) {
  const photoRef  = useRef(null);
  const uploadRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn || !Array.isArray(parentScanHistory)) return;
    setScanHistory(parentScanHistory);
    try {
      LS.set(LS_KEYS.scanHistory, parentScanHistory);
    } catch {}
  }, [isLoggedIn, parentScanHistory]);

  const [scanning,          setScanning]          = useState(false);
  const [applying,          setApplying]          = useState(false);
  const [result,            setResult]            = useState(null);
  const [error,             setError]             = useState('');
  const [scanHistory,       setScanHistory]       = useState(() => LS.get(LS_KEYS.scanHistory, []));
  const [viewOld,           setViewOld]           = useState(null);
  const [showCalcDetails,      setShowCalcDetails]      = useState(false);
  const [showPhysiqueDetails,  setShowPhysiqueDetails]  = useState(false);
  const [consistencyWarnings, setConsistencyWarnings] = useState([]);
  const [warningsAccepted,  setWarningsAccepted]  = useState(false);
  const [selectedScan,      setSelectedScan]      = useState(null);

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
    setScanning(true); setResult(null); setError(''); setConsistencyWarnings([]); setWarningsAccepted(false);
    try {
      if (isLoggedIn && onRefreshEntitlements) {
        try {
          const entFresh = await onRefreshEntitlements();
          if (entFresh == null) {
            console.warn('[entitlements:body] before scan — no DB row (cannot enforce limit safely)');
            setError('Could not load your scan allowance from the server. Check your connection and try again.');
            return;
          }
          const allowed = canScan(subscription, parentScanHistory, entFresh, isLoggedIn);
          console.info('[entitlements:body] before scan', {
            can_scan: allowed,
            free_scans_used: entFresh?.free_scans_used,
            free_scan_limit: entFresh?.free_scan_limit,
            lifetime_scan_count: entFresh?.lifetime_scan_count,
          });
          if (!allowed) {
            console.info('[entitlements:body] blocked — free body scan quota exhausted');
            setError('You have used your free body scans. Upgrade to Premium for unlimited scans.');
            showToast('Free scan limit reached. Upgrade for unlimited scans.');
            return;
          }
        } catch (refErr) {
          console.warn('[entitlements:body] refresh before scan failed', refErr?.message);
          setError('Could not verify scan allowance. Check your connection and try again.');
          return;
        }
      }

      // ── Step 0: Compute image hashes ─────────────────────────────────────
      // SHA-256 for exact-duplicate detection (DB-backed)
      // Perceptual hash for near-duplicate detection
      let sha256Hash   = null;
      let pHash        = null;
      let imgDimensions = { width: null, height: null };

      try {
        // SHA-256 via WebCrypto (browser native, no library needed)
        // NOTE: only available in secure contexts (HTTPS / localhost)
        const encoder = new TextEncoder();
        const data    = encoder.encode(base64);
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        sha256Hash    = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.info('[scan:hash] SHA-256 computed:', sha256Hash.slice(0, 16) + '…');
      } catch (hashErr) {
        console.warn('[scan:hash] SHA-256 unavailable (non-HTTPS context?):', hashErr?.message);
      }

      // Perceptual hash via canvas (dHash — difference hash, 64 bits → 16 hex chars)
      try {
        pHash = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              imgDimensions = { width: img.naturalWidth, height: img.naturalHeight };
              const SIZE = 9; // 9×8 pixels for dHash
              const c    = document.createElement('canvas');
              c.width = SIZE; c.height = SIZE - 1;
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0, SIZE, SIZE - 1);
              const px   = ctx.getImageData(0, 0, SIZE, SIZE - 1).data;
              const gray = [];
              for (let i = 0; i < px.length; i += 4) gray.push(0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2]);
              let bits = '';
              for (let row = 0; row < 8; row++)
                for (let col = 0; col < 8; col++)
                  bits += gray[row * 9 + col] < gray[row * 9 + col + 1] ? '1' : '0';
              let hex = '';
              for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
              resolve(hex);
            } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = 'data:image/jpeg;base64,' + base64;
        });
      } catch {}

      // ── Step 0b: Exact-duplicate check against Supabase scan_assets ──────
      const session    = getStoredSession();
      const userId     = session?.user?.id || session?.user_id || null;
      if (session?.access_token && userId && sha256Hash) {
        try {
          const existingAsset = await findAssetBySha256(session.access_token, userId, sha256Hash);
          if (existingAsset) {
            console.info('[scan] Exact duplicate detected (SHA-256 match):', existingAsset.id);
            console.info('[entitlements:body] duplicate skip (same photo SHA — no new scan, no usage)');
            console.info('[entitlement:update]', { increment_applied: false, reason: 'duplicate_skip' });
            // Retrieve the scan that was linked to this asset
            const priorScan = await getScanByAssetId(session.access_token, existingAsset.id).catch(() => null);
            if (priorScan) {
              // Re-run engine on the prior scan data so targets are fresh, but reuse visual analysis
              const scanForEngine = { date: new Date().toISOString().slice(0, 10), bodyFat: priorScan.bodyFat, weight: profile?.weightLbs || 170, leanMass: priorScan.leanMass };
              const engineOutput  = await callEngine(profile, [...LS.get(LS_KEYS.scanHistory, []), scanForEngine]);
              const scanTargets   = calcTargets(profile, { leanMass: priorScan.leanMass });
              const engineBase    = engineOutput?.macro_targets || calcMacros({ ...profile, goal: profile.goal });
              setResult({
                ...priorScan,
                dailyTargets:    clampMacros({ ...engineBase, protein: scanTargets.protein }, profile),
                phase:           { label: profile.goal, name: `${profile.goal} Phase`, durationWeeks: 12, objective: engineOutput?.diagnosis?.primary?.recommended_action || '' },
                whyThisWorks:    engineOutput?.diagnosis?.primary?.primary_issue || priorScan.assessment,
                weeklyMissions:  engineOutput?.next_actions?.slice(0, 3).map(a => a.value) || [],
                nextScanDate:    (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
                engineOutput,
                isDuplicate:         true,
                duplicateOfScanId:   priorScan.id,
                assetId:             existingAsset.id,
                imageHash:           sha256Hash,
                perceptualHash:      pHash,
              });
              showToast('This photo was already scanned — previous result loaded to prevent duplicate history.');
              setScanning(false);
              return;
            }
          }
        } catch (dupErr) {
          // Non-fatal: if dedup check fails, continue with fresh scan
          console.warn('[scan] Duplicate check failed (non-fatal):', dupErr?.message);
        }
      }

      // ── Step 0c: localStorage 7-day cache (lightweight, no DB needed) ─────
      const cacheKey = `massiq:scan_cache:${sha256Hash || (base64.slice(0, 64) + base64.length)}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { visualData: cachedVisual, ts } = JSON.parse(cached);
          if (Date.now() - ts < 7 * 86400 * 1000 && cachedVisual) {
            console.info('[scan] returning localStorage-cached result for same photo');
            console.info('[entitlements:body] duplicate skip (same photo — local cache, no new scan)');
            console.info('[entitlement:update]', { increment_applied: false, reason: 'duplicate_skip' });
            const scanForEngine = { date: new Date().toISOString().slice(0, 10), bodyFat: cachedVisual.bodyFatPct, weight: profile?.weightLbs || 170, leanMass: cachedVisual.leanMass };
            const engineOutput = await callEngine(profile, [...LS.get(LS_KEYS.scanHistory, []), scanForEngine]);
            const scanTargets = calcTargets(profile, { leanMass: cachedVisual.leanMass });
            const engineBase = engineOutput?.macro_targets || calcMacros({ ...profile, goal: profile.goal });
            setResult({
              ...cachedVisual,
              dailyTargets: clampMacros({ ...engineBase, protein: scanTargets.protein }, profile),
              phase: { label: profile.goal, name: `${profile.goal} Phase`, durationWeeks: 12, objective: engineOutput?.diagnosis?.primary?.recommended_action || '' },
              whyThisWorks: engineOutput?.diagnosis?.primary?.primary_issue || cachedVisual.diagnosis,
              weeklyMissions: engineOutput?.next_actions?.slice(0, 3).map(a => a.value) || [],
              nextScanDate: (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
              engineOutput,
              imageHash:      sha256Hash,
              perceptualHash: pHash,
            });
            setScanning(false);
            return;
          }
        }
      } catch {}

      const age    = profile?.age       || 25;
      const gender = profile?.gender    || 'Male';
      const height = profile?.heightIn  || 70;
      const weight = profile?.weightLbs || 170;
      const heightCm = Math.round(height * 2.54);
      const weightKg = Math.round(weight * 0.4536);

      // Read history BEFORE API call so we can anchor Claude to the baseline
      const currentHistory  = LS.get(LS_KEYS.scanHistory, []);
      const baselineScan    = currentHistory.find(s => s.isBaseline) || currentHistory[0] || null;
      const prevScan        = currentHistory[currentHistory.length - 1] || null;
      const daysSinceBaseline = baselineScan?.date
        ? Math.round((Date.now() - new Date(baselineScan.date).getTime()) / 86400000) : 0;
      const daysSincePrev   = prevScan?.date
        ? Math.round((Date.now() - new Date(prevScan.date).getTime()) / 86400000) : 0;
      const maxBFChange     = Math.max(2, daysSinceBaseline / 14).toFixed(1);
      const maxLMChange     = Math.max(3, daysSinceBaseline / 7).toFixed(1);

      const baselineContext = baselineScan
        ? `\n\nCONSISTENCY ANCHOR — this user's baseline scan was ${daysSinceBaseline} days ago:\n- Baseline body fat: ${baselineScan.bodyFat}%  |  Lean mass: ${baselineScan.leanMass} lbs  |  Score: ${baselineScan.physiqueScore}\nRealistic change limits given ${daysSinceBaseline} days: ±${maxBFChange}% BF, ±${maxLMChange} lbs lean mass.\nIf your visual estimate falls significantly outside these limits, use the conservative estimate closer to the baseline. Focus on RELATIVE CHANGE detection, not fresh absolute estimates.`
        : '';

      // Step 1: Claude analyzes the PHYSIQUE (visual assessment only — engine handles targets)
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          system: `You are a physique analysis AI. Analyze this photo using visual body composition estimation techniques.

IMPORTANT RULES:
- Give body fat as a RANGE not single number (e.g. low:15, high:18)
- Be conservative — photos consistently make people look leaner than they are
- Flag any photo quality issues that reduce accuracy
- Explain your reasoning for each estimate with specific visual markers
- Do not give medical advice
- State confidence level clearly based on photo quality and visibility
- BANNED words: underdeveloped, below average, above average, lacks, lacking, weak, beginner, poor, inadequate, unfortunately
- Muscle levels (use exactly): "not yet defined"|"early"|"moderate"|"solid"|"well-developed"
- SCORES: physique 30-95 (calibrated, avg 52-65), symmetry 60-95 (avg 70-85). Be honest, not generous.${baselineContext}`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: `Person details: ${age}yo ${gender}, ${heightCm}cm (${height}in), ${weightKg}kg (${weight}lbs).

Return ONLY this JSON (no markdown, no extra text):
{"bodyFatRange":{"low":0,"high":0,"midpoint":0},"bodyFatConfidence":"medium","bodyFatReasoning":"specific visual markers that led to this range","leanMass":0,"leanMassTrend":"maintaining","physiqueScore":0,"symmetryScore":0,"symmetryDetails":"specific description of balance or imbalances","muscleGroups":{"chest":"moderate","shoulders":"moderate","back":"moderate","arms":"moderate","core":"moderate","legs":"moderate"},"weakestGroups":[],"limitingFactor":"the single most important thing holding this physique back","limitingFactorExplanation":"specific explanation with reference to their stats and what is visible","strengths":[],"asymmetries":[],"bodyFatSummary":"","muscleSummary":"","priorityAreas":[],"balanceNote":"","diagnosis":"2-3 sentence honest assessment referencing their specific stats","photoQualityIssues":[],"photoQuality":{"overall":"medium","lighting":"good","clothing":"acceptable","pose":"acceptable","notes":""},"recommendation":"2-3 sentence specific recommendation referencing their weight and goal","disclaimer":"Visual AI estimate based on photo. Accuracy improves with consistent lighting and front/side pose."}` },
            ],
          }],
          max_tokens: 1800,
          temperature: 0,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const { text, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse scan result');
      const visualData = sanitizeScanData(JSON.parse(match[0]), profile);

      // ── Step 1b: Upload photo to Supabase Storage + create scan_asset row ─
      // sha256Hash is optional — upload proceeds even without it (non-HTTPS fallback).
      // Upload is REQUIRED for logged-in users — failure surfaces as a scan error.
      let resolvedAssetId = null;
      if (session?.access_token && userId) {
        console.info('[scan:asset] Pipeline start', {
          userId,
          hasSha256: !!sha256Hash,
          hasPHash:  !!pHash,
          mediaType,
          base64Length: base64.length,
        });

        // Step A — storage upload (throws on failure — do not silently continue)
        let storagePath;
        try {
          storagePath = await uploadScanPhoto(session.access_token, userId, base64, mediaType);
          console.info('[scan:asset] Storage upload OK →', storagePath);
        } catch (uploadErr) {
          console.error('[scan:asset] Storage upload FAILED:', uploadErr?.message);
          throw new Error(`Photo upload failed: ${uploadErr?.message || 'storage error'}. Check your connection and try again.`);
        }

        // Step B — scan_assets row (throws on failure)
        try {
          const asset = await createScanAsset(session.access_token, userId, {
            storagePath,
            mimeType:       mediaType,
            fileSizeBytes:  Math.round(base64.length * 0.75),
            sha256:         sha256Hash,
            perceptualHash: pHash,
            width:          imgDimensions.width,
            height:         imgDimensions.height,
          });
          resolvedAssetId = asset?.id || null;
          if (resolvedAssetId) {
            console.info('[scan:asset] scan_assets row created, assetId:', resolvedAssetId);
          } else {
            console.error('[scan:asset] scan_assets insert returned no id — check RLS SELECT policy', asset);
            throw new Error('Scan record could not be saved (asset id missing). Check Supabase RLS policies on scan_assets.');
          }
        } catch (assetErr) {
          if (assetErr.message.includes('asset id missing') || assetErr.message.includes('RLS')) throw assetErr;
          console.error('[scan:asset] scan_assets insert FAILED:', assetErr?.message);
          throw new Error(`Scan metadata could not be saved: ${assetErr?.message || 'database error'}.`);
        }
      } else {
        console.warn('[scan:asset] Skipping upload — user not logged in', {
          hasToken: !!session?.access_token,
          userId,
        });
      }

      // Cache this result keyed by SHA-256 (or lightweight fallback) so re-scanning same photo returns same result
      try { localStorage.setItem(cacheKey, JSON.stringify({ visualData, ts: Date.now() })); } catch {}

      // Consistency check: flag suspicious swings before showing results
      if (prevScan) {
        const warnings = validateScanConsistency(visualData, prevScan, daysSincePrev);
        if (warnings.length) setConsistencyWarnings(warnings);
      }

      // Step 2: Run the engine with this scan data to get precise targets
      const scanForEngine  = { date: new Date().toISOString().slice(0, 10), bodyFat: visualData.bodyFatPct, weight, leanMass: visualData.leanMass };
      const engineOutput   = await callEngine(profile, [...currentHistory, scanForEngine]);

      // Step 3: Merge — visual assessment from Claude, targets from engine
      // Protein always from calcTargets (uses leanMass from scan) — single authoritative formula
      const scanTargets = calcTargets(profile, { leanMass: visualData.leanMass });
      const engineBase  = engineOutput?.macro_targets || calcMacros({ ...profile, goal: profile.goal });
      const data = {
        ...visualData,
        dailyTargets:    clampMacros({ ...engineBase, protein: scanTargets.protein }, profile),
        phase:           { label: profile.goal, name: `${profile.goal} Phase`, durationWeeks: 12, objective: engineOutput?.diagnosis?.primary?.recommended_action || '' },
        whyThisWorks:    engineOutput?.diagnosis?.primary?.primary_issue || visualData.diagnosis,
        weeklyMissions:  engineOutput?.next_actions?.slice(0, 3).map(a => a.value) || [],
        nextScanDate:    (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
        engineOutput,    // attach full engine output for applyPlan to use
        imageHash:       sha256Hash,
        perceptualHash:  pHash,
        assetId:         resolvedAssetId,
      };
      console.log('[plan:state] scan result set', { bodyFat: data?.bodyFatPct, leanMass: data?.leanMass });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Scan failed. Please try again.');
    }
    setScanning(false);
  };

  const applyPlan = async () => {
    console.log('[plan:apply] clicked', { hasResult: !!result, hasProfile: !!profile });
    if (!result) {
      console.error('[plan:apply] no result found — cannot build plan');
      return;
    }
    const today  = new Date().toISOString().slice(0, 10);
    const eng    = result.engineOutput;          // engine output attached by runScan
    const previousPlanTargets = getActiveTargets(LS.get(LS_KEYS.activePlan, null), profile);
    // Use result.dailyTargets which already has protein from calcTargets (set in runScan)
    const baseTargets = clampMacros(result.dailyTargets || calcMacros(profile), profile);
    const isLowConfidence = (result.confidence || '').toLowerCase() === 'low';
    let m = isLowConfidence
      ? clampMacros({
          ...baseTargets,
          calories: Math.round((previousPlanTargets.calories * 0.7) + (baseTargets.calories * 0.3)),
          protein: Math.round((previousPlanTargets.protein * 0.7) + (baseTargets.protein * 0.3)),
          carbs: Math.round((previousPlanTargets.carbs * 0.7) + (baseTargets.carbs * 0.3)),
          fat: Math.round((previousPlanTargets.fat * 0.7) + (baseTargets.fat * 0.3)),
        }, profile)
      : baseTargets;

    // Compute week/startDate BEFORE building plan (was causing ReferenceError — used before declared)
    const existingHistory = LS.get(LS_KEYS.scanHistory, []);
    const isFirstScan     = existingHistory.length === 0;
    const existingPlan    = LS.get(LS_KEYS.activePlan, null);
    const prevScanForAdaptation = getLastValidScan(existingHistory);
    // startDate is set once on first scan and kept — there is no "new 10-week block" reset.
    // `week` is a rolling 1–12 index for UI only; phase/macros come from runScanDecisionEngine + scans, not from week rollover.
    const startDate = isFirstScan ? today : (existingPlan?.startDate || today);
    const week = existingPlan?.startDate
      ? Math.min(12, Math.max(1, Math.floor(daysBetween(existingPlan.startDate, today) / 7) + 1))
      : 1;

    let adherenceContext = null;
    const sessApply = getStoredSession();
    if (sessApply?.access_token && sessApply?.user?.id) {
      try {
        const foodRows = await getFoodLogsRecentForAdherence(sessApply.access_token, sessApply.user.id);
        adherenceContext = buildAdherenceContextFromFoodLogs(foodRows, { scanHistory: existingHistory });
        console.info('[adherence] context for engine', {
          skipped_meals_est: adherenceContext.skipped_meals_per_week_estimate,
          weekend_slip: adherenceContext.weekend_slip_score,
          logs_7d_sample: foodRows.filter((r) => {
            const t = new Date(r.created_at).getTime();
            return Number.isFinite(t) && Date.now() - t <= 7 * 86400000;
          }).length,
        });
      } catch (adhErr) {
        console.error('[adherence] food_logs unavailable — engine runs without meal adherence signals', adhErr?.message);
      }
    }

    const targetBF = eng?.target_bf ?? (profile.goal === 'Cut' ? result.bodyFatPct - 4 : result.bodyFatPct);
    const startBFEng = eng?.start_bf ?? result.bodyFatPct;
    const currentPlanForEngine = {
      phase: existingPlan?.phase || profile.goal,
      targetBF,
      startBF: startBFEng,
      dailyTargets: existingPlan?.dailyTargets || m,
      engineTrajectory: existingPlan?.engineTrajectory || eng?.trajectory || null,
    };

    const adaptationInput = { date: today, bodyFat: result.bodyFatPct, leanMass: result.leanMass, physiqueScore: result.physiqueScore, symmetryScore: result.symmetryScore, confidence: result.confidence || 'medium' };
    console.info('[scan:adapt] adaptation input', { newScan: adaptationInput, prevScan: prevScanForAdaptation ? { date: prevScanForAdaptation.date, bodyFat: getBF(prevScanForAdaptation), leanMass: prevScanForAdaptation.leanMass, scanStatus: prevScanForAdaptation.scanStatus || 'complete' } : null, planCtx: { phase: currentPlanForEngine.phase, week, startDate } });

    const engineDecision = runScanDecisionEngine({
      profile,
      latestScan: {
        date: today,
        bodyFatPct: result.bodyFatPct,
        bodyFat: result.bodyFatPct,
        leanMass: result.leanMass,
        physiqueScore: result.physiqueScore,
        symmetryScore: result.symmetryScore,
        confidence: result.confidence || 'medium',
        weakestGroups: result.weakestGroups,
        muscleGroups: result.muscleGroups,
      },
      previousScan: prevScanForAdaptation,
      currentPlan: currentPlanForEngine,
      scanResult: result,
      adherenceContext,
    });

    const adaptation = engineDecision.adaptation_legacy;
    const adj = adaptation.adjustment || {};
    const na = engineDecision.nutrition_adjustments || {};
    m = clampMacros({
      ...m,
      calories: m.calories + (adj.calories_delta ?? na.calories_delta ?? 0),
      protein: m.protein + (adj.protein_delta_g ?? na.protein_delta_g ?? 0),
      carbs: m.carbs + (na.carbs_delta_g ?? 0),
      fat: m.fat + (adj.fat_delta_g ?? 0),
    }, profile);

    const recommendedPhase = engineDecision.phase_decision?.recommended_phase || profile.goal;
    console.info('[scan:adapt] adaptation output', adaptation);

    const plan = {
      phase:          recommendedPhase,
      phaseName:      `${recommendedPhase} Phase`,
      objective:      eng?.diagnosis?.primary?.recommended_action || '',
      week,
      startDate,
      nextScanDate:   result.nextScanDate || (() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toISOString().slice(0, 10); })(),
      macros:         { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
      dailyTargets:   m,
      trainDays:      m.trainingDaysPerWeek || 4,
      sleepHrs:       m.sleepHours          || 8,
      waterL:         m.waterLiters         || 3,
      steps:          m.steps               || 9000,
      bodyFat:        result.bodyFatPct,
      leanMass:       result.leanMass,
      startBF:        startBFEng,
      targetBF,
      weeklyMissions: result.weeklyMissions  || [],
      whyThisWorks:   result.whyThisWorks    || '',
      cardioDays:     m.cardioDays           || 2,
      engineDiagnosis: eng?.diagnosis        || null,
      engineTrajectory: eng?.trajectory      || null,
      tdee:           eng?.physio?.tdee      || null,
      decisionEngine: engineDecision,
      decisionExplanation: engineDecision.human_explanation || '',
    };
    console.log('[plan:apply] plan built (current plan before apply)', { week, startDate, phase: plan.phase, start_date: startDate, computed_week: week });

    // Build scan_context: adaptation + scoring breakdown + image hash + premium analysis
    const scanContext = {
      adaptation:       { decision: adaptation.decision, rationale: adaptation.rationale, adjustment: adaptation.adjustment || null },
      comparison:       adaptation.comparison || null,
      adherence_context: adherenceContext,
      decision_engine:  engineDecision,
      scoring_breakdown: result.scoringBreakdown || null,
      scoring_version:  result.scoringVersion   || null,
      ffmi:             result.ffmi             || null,
      image_hash:       result.imageHash        || null,
      perceptual_hash:  result.perceptualHash   || null,
      premium_analysis: {
        body_fat_summary:  result.bodyFatSummary   || null,
        muscle_summary:    result.muscleSummary     || null,
        muscle_groups:     result.muscleGroups      || null,
        balance_note:      result.balanceNote       || null,
        diagnosis:         result.diagnosis         || null,
        strengths:         result.strengths         || null,
      },
    };

    const entry = {
      date: today,
      savedAt: new Date().toISOString(),
      bodyFat: result.bodyFatPct,
      bodyFatRange: result.bodyFatRange || null,
      leanMass: result.leanMass,
      physiqueScore: result.physiqueScore,
      symmetryScore: result.symmetryScore,
      phase: recommendedPhase,
      confidence: result.confidence || 'medium',
      // Keep only weak group names — not full muscleGroups object (saves storage)
      weakestGroups: result.weakestGroups || (result.priorityAreas || []).slice(0, 3),
      assessment: result.bodyFatSummary || result.diagnosis || '',
      limitingFactor: eng?.diagnosis?.primary?.primary_issue || result.diagnosis || '',
      limitingFactorExplanation: eng?.diagnosis?.primary?.recommended_action || '',
      nutritionKeyChange: result.nutritionKeyChange || '',
      recommendation: result.recommendation || eng?.diagnosis?.primary?.recommended_action || '',
      ...(isFirstScan && { isBaseline: true, lockedAt: new Date().toISOString() }),
      dailyTargets: {
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
        steps: m.steps || 9000,
        trainingDaysPerWeek: m.trainingDaysPerWeek || 4,
      },
      // Extended persistence fields
      engineVersion:   SCORING_VERSION,
      scanStatus:      result.isDuplicate ? 'duplicate' : 'complete',
      duplicateOfScanId: result.duplicateOfScanId || null,
      assetId:         result.assetId        || null,
      scanContext,
      // Expose adaptation for UI display without re-computing
      adaptationDecision:  adaptation.decision,
      adaptationRationale: adaptation.rationale,
      scanComparison:      adaptation.comparison || null,
      decisionEngine:      engineDecision,
      decisionExplanation: engineDecision.human_explanation || '',
      adherenceContextSnapshot: adherenceContext,
    };
    // Save plan + stats to LS immediately (safe to be optimistic)
    LS.set(LS_KEYS.activePlan, plan);
    LS.set(LS_KEYS.stats, { calories: 0, protein: 0 });

    // Do NOT touch scanHistory until the DB insert confirms — otherwise a failed
    // insert leaves a ghost scan that disappears after logout.
    setApplying(true);
    setError('');
    try {
      console.info('[plan:apply] awaiting DB persistence');
      await onPlanApplied(plan, entry);
      // DB confirmed — now read the freshly-stamped history back from LS
      setScanHistory(LS.get(LS_KEYS.scanHistory, []));
      console.log('[plan:apply] success — plan and scan persisted to DB');
    } catch (persistErr) {
      console.error('[plan:apply] DB persist failed', persistErr?.message, persistErr);
      const msg = String(persistErr?.message || '');
      const userMsg = msg.includes('401') || msg.includes('Missing Authorization')
        ? 'Session expired. Please sign in again and try again.'
        : msg.includes('403') || msg.includes('Forbidden')
          ? 'You don\'t have permission to save this scan.'
          : 'Your scan could not be saved. Check your connection and try again.';
      setError(userMsg);
      setApplying(false);
      return; // Stay on scan tab so user can retry
    } finally {
      setApplying(false);
    }

    // Regenerate meal plan + workout plan with scan data in background
    generateMealPlan(profile, plan)
      .then(async (days) => {
        LS.set(LS_KEYS.mealplan, { weekKey: weekKey2(), days });
        if (onPersistProgramArtifacts) {
          try { await onPersistProgramArtifacts(profile, plan, { mealDays: days }); } catch (e) { console.warn('[sync] persist meal_plans failed (non-fatal)', e?.message); }
        }
      })
      .catch(err => console.error('Meal plan regen failed:', err));
    generateWorkoutPlan(profile, plan)
      .then(async (days) => {
        LS.set(LS_KEYS.workoutplan, days);
        if (onPersistProgramArtifacts) {
          try { await onPersistProgramArtifacts(profile, plan, { workoutDays: days }); } catch (e) { console.warn('[sync] persist workout_programs failed (non-fatal)', e?.message); }
        }
      })
      .catch(err => console.error('Workout plan regen failed:', err));
    showToast('Plan applied. Generating your meal plan...');
    setTab('plan');
  };

  /* Pre-scan derived state + logging — MUST stay above any conditional returns (hooks order). */
  const isPremium = isPremiumActive(subscription);
  const historyForUi = isLoggedIn && Array.isArray(parentScanHistory) ? parentScanHistory : scanHistory;
  const remaining = isLoggedIn
    ? (entitlements != null
        ? Math.max(0, (Number(entitlements.free_scan_limit) || FREE_SCAN_LIMIT) - (Number(entitlements.free_scans_used) || 0))
        : null)
    : scansRemaining(subscription, parentScanHistory, null, false);
  const scanLocked = isBodyScanQuotaExhausted(subscription, parentScanHistory, entitlements, isLoggedIn);
  const dbFreeLimit = entitlements?.free_scan_limit != null ? Number(entitlements.free_scan_limit) : FREE_SCAN_LIMIT;

  /* ── Scanning spinner ── */
  if (scanning) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80dvh', gap: 24, padding: 24 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.greenBg}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="scan" size={28} color={C.green} /></div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Analyzing your physique…</div>
        <div style={{ fontSize: 14, color: C.muted }}>Estimating body composition, muscle development, and symmetry</div>
      </div>
    </div>
  );

  /* ── Results view ── */
  if (result) {
    const premium = isPremiumActive(subscription);
    const ph      = result.phase || {};
    const phColor = PHASE_LABEL_COLORS[ph.label] || C.green;
    const dt      = result.dailyTargets || {};
    const mg      = result.muscleGroups || {};
    const prevScan = getLastValidScan(scanHistory);
    const bfTrend = prevScan ? Number(result.bodyFatPct || 0) - (getBF(prevScan) || 0) : null;
    const lmTrend = prevScan ? Number(result.leanMass || 0) - Number(prevScan.leanMass || 0) : null;
    const predictedTrajectory = getTrajectoryStatus(prevScan ? [...scanHistory, { bodyFat: result.bodyFatPct, leanMass: result.leanMass }] : scanHistory, profile.goal);
    // Compute adaptation for display — uses real scan deltas, not generic text
    const minimalPlan = { phase: profile.goal };
    const adaptationForDisplay = computeAdaptation(
      { date: new Date().toISOString().slice(0, 10), bodyFat: result.bodyFatPct, leanMass: result.leanMass, physiqueScore: result.physiqueScore, symmetryScore: result.symmetryScore, confidence: result.confidence || 'medium' },
      prevScan,
      minimalPlan,
    );
    // Near-target: suggest maintain when Cut phase and already lean
    const isNearTarget = profile.goal === 'Cut' && (profile.gender === 'Female' ? (result.bodyFatPct || 99) <= 22 : (result.bodyFatPct || 99) <= 14);
    const nextDecision = result.confidence === 'low'
      ? 'Retake scan with improved lighting before committing plan updates.'
      : isNearTarget
        ? 'You\'re close to target. Apply plan and consider transitioning to maintain once you hit your goal.'
        : prevScan && adaptationForDisplay.rationale
          ? adaptationForDisplay.rationale
          : predictedTrajectory.tone === 'warn'
            ? 'Apply plan with adjustment and review again in 2–3 weeks.'
            : 'Apply plan and continue current phase until next checkpoint.';
    // [plan:next] verification log — remove after verifying
    console.info('[plan:next] next decision payload', { prevScan: prevScan ? { date: prevScan.date, bodyFat: getBF(prevScan), leanMass: prevScan.leanMass } : null, adaptationDecision: adaptationForDisplay.decision, nextDecision: nextDecision.substring(0, 80) });
    // [scan:compare] verification log — remove after verifying
    if (prevScan) console.info('[scan:compare] previous scan used for comparison', { date: prevScan.date, bodyFat: getBF(prevScan), leanMass: prevScan.leanMass, physiqueScore: prevScan.physiqueScore });
    // FREE users see full current scan analysis — entitlement diff is history/persistence only
    const trajectoryView = predictedTrajectory;
    const shortSummary = (() => {
      const base = String(result.bodyFatSummary || result.diagnosis || '').trim();
      if (!base) return 'Scan complete.';
      const parts = base.split('.').map(s => s.trim()).filter(Boolean).slice(0, 2);
      return parts.length ? `${parts.join('. ')}.` : base;
    })();

    return (
      <div className="screen" style={{ gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="screen-title" style={{ fontSize: 30 }}>Scan Results</h1>
          <button className="bp" onClick={() => setResult(null)} style={{ background: C.cardElevated, border: 'none', color: C.muted, padding: '6px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Retake</button>
        </div>

        {/* ⚠ Consistency Warning Panel — shown before results when large swings detected */}
        {consistencyWarnings.length > 0 && !warningsAccepted && (
          <Card style={{ background: `${C.gold}14`, border: `1px solid ${C.gold}55`, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Icon name="warning" size={18} color={C.gold} />
              <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>Consistency Check</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {consistencyWarnings.map((w, i) => (
                <p key={i} style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{w.message}</p>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" onClick={() => { setResult(null); setConsistencyWarnings([]); }} style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: C.greenBg, color: C.green, border: `1px solid ${C.greenDim}`,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Retake Photo for Better Accuracy</button>
              <button className="bp" onClick={() => setWarningsAccepted(true)} style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: C.cardElevated, color: C.white, border: `1px solid ${C.border}`,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Use These Results Anyway</button>
            </div>
          </Card>
        )}

        {/* 1 – LIMITING FACTOR — FREE: title only, PREMIUM: full details */}
        {(() => {
          const diag = result.engineOutput?.diagnosis?.primary;
          const lf   = result.limitingFactor;
          if (!diag && !lf) return null;
          const CODE_LABELS = {
            aggressive_deficit:   'Aggressive Deficit',
            insufficient_deficit: 'Insufficient Deficit',
            low_protein:          'Low Protein Intake',
            lean_mass_risk:       'Lean Mass Risk',
            phase_mismatch:       'Phase Mismatch',
            excessive_surplus:    'Excessive Surplus',
            default:              'Optimization Opportunity',
          };
          const SEVERITY_COLOR = { critical: C.orange, warning: C.gold, info: C.blue };
          const label    = diag ? (CODE_LABELS[diag.code] || CODE_LABELS.default) : lf;
          const color    = diag ? (SEVERITY_COLOR[diag.severity] || C.muted) : C.orange;
          const severity = diag?.severity;
          const signals  = diag && Array.isArray(diag.supporting_signals) ? diag.supporting_signals : [];
          const explanation = result.limitingFactorExplanation || diag?.primary_issue;

          return (
            <Card className="su" style={{ borderColor: color + '44' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: explanation ? 12 : 0 }}>
                <Icon name="stethoscope" size={18} color={color} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>Primary Limiting Factor</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
                </div>
                {severity && (
                  <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '22', padding: '3px 10px', borderRadius: 99, textTransform: 'capitalize', flexShrink: 0 }}>{severity}</span>
                )}
              </div>
              {explanation && (
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: signals.length ? 12 : 0 }}>{explanation}</p>
              )}
              {signals.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dimmed, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>Why this conclusion</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {signals.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color, fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

        {/* 2 – Body fat RANGE with confidence badge */}
        {(() => {
          const range     = result.bodyFatRange;
          const conf      = result.bodyFatConfidence || result.confidence || 'medium';
          const CONF_COLOR = { high: C.green, medium: C.gold, low: C.orange };
          const confColor  = CONF_COLOR[conf] || C.muted;
          const display    = range?.low && range?.high
            ? `${range.low}–${range.high}%`
            : result.bodyFatPct ? `${result.bodyFatPct}%` : '—';
          return (
            <Card className="su" style={{ animationDelay: '.02s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Body Fat · {fmt.date(todayStr())}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{display}</div>
                  {range?.midpoint && range?.low && range?.high && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Midpoint estimate: {range.midpoint}%</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: confColor, background: confColor + '22', padding: '4px 10px', borderRadius: 99, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {conf} confidence
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>Score: {safeNum(result.physiqueScore)}/100</span>
                </div>
              </div>
              {conf !== 'high' && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: confColor + '12', borderRadius: 10, border: `1px solid ${confColor}33` }}>
                  <span style={{ fontSize: 13 }}>ℹ️</span>
                  <span style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.5 }}>
                    {conf === 'medium'
                      ? 'Moderate confidence — a straight-on photo with good lighting narrows this range.'
                      : 'Limited confidence — retake with better lighting or angle for a tighter estimate.'}
                  </span>
                </div>
              )}
            </Card>
          );
        })()}

        {/* 3 – Phase diagnosis — FREE: phase label + short summary, PREMIUM: full details */}
        <Card className="su" style={{ animationDelay: '.03s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.green}` }}>
              {ph.label || 'Maintain'}
            </span>
            <StatusPill tone={trajectoryView.tone === 'good' ? 'good' : trajectoryView.tone === 'warn' ? 'warn' : 'neutral'} label={trajectoryView.label} />
          </div>
          <>
            {result.bodyFatSummary && (
              <div style={{ marginBottom: result.muscleSummary ? 12 : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Body Composition</div>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.bodyFatSummary}</p>
              </div>
            )}
            {result.muscleSummary && (
              <div style={{ paddingTop: result.bodyFatSummary ? 10 : 0, borderTop: result.bodyFatSummary ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Muscle Development</div>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.muscleSummary}</p>
              </div>
            )}
            {!result.bodyFatSummary && !result.muscleSummary && result.diagnosis && (
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: 0 }}>{result.diagnosis}</p>
            )}
            {trajectoryView.note && (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>{trajectoryView.note}</p>
            )}
          </>
        </Card>

        {/* 4 – ADJUST NOW (before → after targets) */}
        <div className="su" style={{ animationDelay: '.04s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{prevScan ? 'ADJUST NOW' : 'Your Targets'}</div>
          {prevScan && prevScan.dailyTargets && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Calories', before: prevScan.dailyTargets.calories, after: dt.calories, unit: 'kcal', color: C.orange },
                { label: 'Protein',  before: prevScan.dailyTargets.protein,  after: dt.protein,  unit: 'g',    color: C.blue },
              ].map(t => (
                <div key={t.label} style={{ background: C.cardElevated, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{t.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.dimmed, textDecoration: 'line-through' }}>{t.before ?? '—'}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>→</span>
                    <span style={{ fontSize: 19, fontWeight: 700, color: t.color }}>{t.after ?? '—'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.dimmed, marginTop: 2 }}>{t.unit}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { icon: 'flame',     label: 'Calories', value: dt.calories,            unit: 'kcal', color: C.orange },
              { icon: 'bolt',      label: 'Protein',  value: dt.protein,             unit: 'g',    color: C.blue },
              { icon: 'footsteps', label: 'Steps',    value: dt.steps,               unit: '/day', color: C.green },
              { icon: 'moon',      label: 'Sleep',    value: dt.sleepHours,          unit: 'hrs',  color: C.purple },
              { icon: 'droplet',   label: 'Water',    value: dt.waterLiters,         unit: 'L',    color: '#4AD4FF' },
              { icon: 'dumbbell',  label: 'Training', value: dt.trainingDaysPerWeek, unit: 'x/wk', color: C.red },
            ].map(t => (
              <div key={t.label} style={{ background: C.cardElevated, borderRadius: 14, padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `${t.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={14} color={t.color} strokeWidth={1.75} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{t.value ?? '—'}</div>
                <div style={{ fontSize: 10, color: C.dimmed }}>{t.unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 5 – Muscle group assessment */}
        <Card className="su" style={{ animationDelay: '.05s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Muscle Assessment</div>
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
          {result.balanceNote && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Balance</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{result.balanceNote}</p>
            </div>
          )}
        </Card>

        {/* 6 – Detailed metrics */}
        <div className="su" style={{ animationDelay: '.06s' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Physique Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Lean Mass', value: safeNum(result.leanMass, 1) !== '—' ? fmt.leanMass(result.leanMass, profile?.unitSystem) : '—', color: C.blue },
              { label: 'Score',     value: `${safeNum(result.physiqueScore)}/100`,             color: C.green },
              { label: 'Symmetry',  value: `${safeNum(result.symmetryScore)}/100`,             color: C.purple },
              { label: 'Body Fat',  value: `${safeNum(result.bodyFatPct, 1)}%`,                color: C.orange },
            ].map(m => (
              <div key={m.label} style={{ background: C.cardElevated, borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 6.5 – Physique Projection */}
        {(() => {
          const bf  = Number(result.bodyFatPct || 0);
          if (!bf) return null;
          const gen  = profile?.gender || 'Male';
          const proj = getPhysiqueProjection(bf, profile?.goal, gen, result.confidence);
          const curr = proj.currentStage;
          const leanMassDisplay = result.leanMass > 0
            ? fmt.leanMass(result.leanMass, profile?.unitSystem) : null;

          // Projected Outcome card — clean data summary, no decorative silhouettes
          const goalKey         = (profile?.goal || '').toLowerCase();
          const projRangeLabel  = proj.projBFLow === proj.projBFHigh
            ? `${proj.projBFMid}%`
            : `${proj.projBFLow}–${proj.projBFHigh}%`;
          const confColor = result.confidence === 'high' ? C.green
            : result.confidence === 'low' ? C.red : C.gold;
          const confBg = result.confidence === 'high' ? 'rgba(114,184,149,0.10)'
            : result.confidence === 'low' ? 'rgba(201,92,92,0.10)' : 'rgba(196,168,50,0.10)';
          const explanation = goalKey === 'cut'
            ? `At your current pace, you are projected to move from ${curr.label} to ${proj.projLabel} over the next ${proj.timeline}.`
            : (goalKey === 'bulk' || goalKey === 'build')
              ? `A lean bulk keeps body fat controlled while adding muscle mass. Your projected stage over ${proj.timeline} reflects that trajectory.`
              : goalKey === 'recomp'
                ? `Body recomposition is gradual. Over ${proj.timeline}, consistent training and nutrition should shift your stage toward ${proj.projLabel}.`
                : `Consistent effort over ${proj.timeline} is projected to maintain or refine your current physique stage.`;

          return (
            <div className="su" style={{
              animationDelay: '.065s',
              background: '#0F1410',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 24,
              padding: '22px 22px 20px',
            }}>
              {/* Section label */}
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(114,184,149,0.45)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 18 }}>
                Projected Outcome
              </div>

              {/* Current → Projected data row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', alignItems: 'flex-start', gap: 8, marginBottom: 18 }}>
                {/* Current */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Now</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.white, letterSpacing: '-.03em', lineHeight: 1 }}>{bf}%</div>
                  <div style={{ fontSize: 12, color: C.dimmed, marginTop: 6, lineHeight: 1.35 }}>{curr.label}</div>
                </div>
                {/* Arrow */}
                <div style={{ paddingTop: 20, color: C.dimmed, fontSize: 14, textAlign: 'center' }}>→</div>
                {/* Projected */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(114,184,149,0.5)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Projected</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.green, letterSpacing: '-.03em', lineHeight: 1 }}>{projRangeLabel}</div>
                  <div style={{ fontSize: 12, color: 'rgba(114,184,149,0.6)', marginTop: 6, lineHeight: 1.35 }}>{proj.projLabel}</div>
                </div>
              </div>

              {/* Hairline */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 16 }} />

              {/* Chips */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 99, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name="clock" size={11} color={C.dimmed} strokeWidth={2} />
                  <span style={{ fontSize: 11, color: C.dimmed, fontWeight: 500 }}>~{proj.timeline}</span>
                </div>
                {result.confidence && (
                  <div style={{
                    background: confBg, border: `1px solid ${confColor}44`,
                    borderRadius: 99, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: confColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: confColor, fontWeight: 500 }}>{result.confidence} confidence</span>
                  </div>
                )}
              </div>

              {/* Explanation */}
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: '0 0 16px' }}>
                {explanation}
              </p>

              {/* "Why this projection" toggle */}
              <button onClick={() => setShowPhysiqueDetails(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: C.dimmed, fontSize: 12, fontWeight: 500,
              }}>
                <span>Why this projection</span>
                <span style={{ display: 'inline-block', fontSize: 9, transform: showPhysiqueDetails ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
              </button>

              {showPhysiqueDetails && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.65, margin: 0 }}>
                    This projection is derived from your current body fat percentage, stated training goal, and standard physiological progress rates for your phase. It represents a realistic range based on consistent effort — not a guaranteed outcome.
                  </p>
                  {leanMassDisplay && (
                    <div style={{ fontSize: 12, color: C.dimmed }}>Current lean mass estimate: {leanMassDisplay}</div>
                  )}
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6, margin: 0 }}>
                    AI estimate only. Individual results vary. Consult a qualified professional for medical or nutritional advice.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* 7 – Training focus */}
        {(result.trainingFocus || result.priorityAreas?.length > 0) && (
          <Card className="su" style={{ animationDelay: '.07s' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Training Focus</div>
            {result.trainingFocus && typeof result.trainingFocus === 'string' && (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: result.priorityAreas?.length ? 12 : 0 }}>{result.trainingFocus}</p>
            )}
            {result.priorityAreas?.length > 0 && (
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
            )}
          </Card>
        )}

        {/* 8 – Weekly missions */}
        {result.weeklyMissions?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.08s' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Weekly Missions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.weeklyMissions.slice(0, 5).map((mission, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, color: C.green, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{mission}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 8.5 – Photo Reliability */}
        {result.photoQuality && (
          <Card className="su" style={{ animationDelay: '.085s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Icon name="camera" size={16} color={C.muted} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>Scan Reliability</span>
              {(() => {
                const overall = result.photoQuality.overall || 'medium';
                const overallColor = overall === 'high' ? C.green : overall === 'low' ? C.orange : C.gold;
                return (
                  <span style={{ fontSize: 11, fontWeight: 700, color: overallColor, background: overallColor + '22', padding: '2px 8px', borderRadius: 99, textTransform: 'capitalize' }}>
                    {overall}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: result.photoQuality.notes ? 10 : 0 }}>
              {[
                { label: 'Lighting', value: result.photoQuality.lighting },
                { label: 'Clothing', value: result.photoQuality.clothing },
                { label: 'Pose',     value: result.photoQuality.pose },
              ].map(item => (
                <div key={item.label} style={{ fontSize: 12 }}>
                  <span style={{ color: C.dimmed }}>{item.label}: </span>
                  <span style={{
                    fontWeight: 600, textTransform: 'capitalize',
                    color: (item.value === 'good' || item.value === 'optimal') ? C.green
                      : (item.value === 'poor' || item.value === 'suboptimal') ? C.orange : C.muted,
                  }}>{item.value || '—'}</span>
                </div>
              ))}
            </div>
            {result.photoQuality.notes && (
              <p style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.55, margin: 0 }}>{result.photoQuality.notes}</p>
            )}
          </Card>
        )}

        {/* 9 – "How we calculate this" expandable */}
        <div className="su" style={{ animationDelay: '.09s' }}>
          <button className="bp" onClick={() => setShowCalcDetails(o => !o)} style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: showCalcDetails ? '14px 14px 0 0' : 14,
            padding: '12px 16px', cursor: 'pointer', color: C.white, fontSize: 14, fontWeight: 600,
          }}>
            <span>How we calculate this</span>
            <span style={{ color: C.muted, fontSize: 13, display: 'inline-block', transition: 'transform .2s', transform: showCalcDetails ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
          {showCalcDetails && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '14px 16px' }}>
              {[
                { label: 'Body Fat %',     desc: 'AI visual estimate from your photo using muscle separation, skin fold appearance, and vascularity cues. Comparable to the skinfold method ±3–4%.' },
                { label: 'Lean Mass',      desc: 'Calculated as total body weight minus estimated fat mass, expressed in lbs.' },
                { label: 'Symmetry Score', desc: 'Rates left/right balance of visible muscle groups — chest, arms, shoulders, and lats — on a 0–100 scale.' },
                { label: 'Physique Score', desc: 'Composite of body fat level, lean mass development, and symmetry, weighted for your current phase goal.' },
                { label: 'Calorie target', desc: `TDEE from your profile (weight, height, activity) with a phase-appropriate offset: ${ph.label === 'Cut' ? '−300–500 kcal deficit' : ph.label === 'Bulk' ? '+200–300 kcal surplus' : 'maintenance range'}.` },
                { label: 'Protein target', desc: 'Set at 2.2–2.4 g per kg of lean body mass to maximise muscle retention during a cut or support growth in a bulk.' },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 3 }}>{item.label}</div>
                  <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asymmetries — shown only when flagged */}
        {result.asymmetries?.length > 0 && (
          <Card className="su" style={{ animationDelay: '.10s', background: `${C.gold}12`, border: `1px solid ${C.gold}33` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: C.gold, fontSize: 13 }}>Balance note</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {result.asymmetries.map((a, i) => <li key={i} style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{a}</li>)}
            </ul>
          </Card>
        )}

        {/* 10 – Apply This Plan → */}
        <Btn
          type="button"
          onClick={applyPlan}
          disabled={applying}
          style={{ width: '100%', marginTop: 4, position: 'relative', zIndex: 1 }}
        >
          {applying ? 'Saving to account…' : 'Apply This Plan →'}
        </Btn>
        <Card className="su" style={{ animationDelay: '.11s' }}>
          <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Next decision</div>
          <p style={{ fontSize: 13, color: C.white, lineHeight: 1.55, margin: 0 }}>{nextDecision}</p>
        </Card>
        <div style={{ textAlign: 'center', marginTop: -4 }}>
          <button className="bp" onClick={() => setResult(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer' }}>Retake Scan</button>
        </div>

        {result.disclaimer && (
          <p style={{ fontSize: 11, color: C.dimmed, textAlign: 'center', lineHeight: 1.6, padding: '0 8px' }}>{result.disclaimer}</p>
        )}
      </div>
    );
  }

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
            { icon: 'chart-bar',   label: 'Body Fat Range' },
            { icon: 'figure-lift', label: 'Muscle Assessment' },
            { icon: 'scale',       label: 'Lean Mass Estimate' },
            { icon: 'rotate',      label: 'Symmetry Score' },
            { icon: 'target',      label: 'Training Focus' },
            { icon: 'utensils',    label: 'Nutrition Adjustment' },
          ].map(t => (
            <div key={t.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <Icon name={t.icon} size={24} color={C.muted} strokeWidth={1.5} />
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <Card style={{ background: C.cardElevated }}>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          <strong style={{ color: C.white }}>Best results:</strong> good lighting, fitted clothing or shirtless, facing camera, full body visible.
        </div>
      </Card>

      {/* ── Free scan remaining notice ── */}
      {!scanLocked && !isPremium && remaining != null && remaining < Infinity && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: remaining === 1 ? 'rgba(212,114,74,0.08)' : 'rgba(114,184,149,0.06)',
          border: `1px solid ${remaining === 1 ? 'rgba(212,114,74,0.3)' : 'rgba(114,184,149,0.2)'}`,
          borderRadius: 12, padding: '10px 14px',
        }}>
          <Icon name="camera" size={14} color={remaining === 1 ? C.orange : C.green} strokeWidth={2} />
          <span style={{ fontSize: 13, color: remaining === 1 ? C.orange : C.muted, flex: 1 }}>
            {remaining === 1
              ? 'Last free scan. Upgrade before your next check-in to keep tracking.'
              : `${remaining} free scan${remaining !== 1 ? 's' : ''} remaining.`}
          </span>
        </div>
      )}
      {!scanLocked && !isPremium && isLoggedIn && remaining === null && (
        <div style={{ fontSize: 13, color: C.dimmed, padding: '8px 4px' }}>Checking scan allowance…</div>
      )}

      {/* ── Scan limit reached — upgrade gate ── */}
      {scanLocked && (
        <div style={{
          background: 'rgba(114,184,149,0.04)', border: '1px solid rgba(114,184,149,0.2)',
          borderRadius: 20, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(114,184,149,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="lock" size={16} color={C.green} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.green, textTransform: 'uppercase' }}>Free Limit Reached</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginTop: 2 }}>Upgrade to keep scanning</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>
            You&apos;ve used your {dbFreeLimit} free scans. Premium gives you unlimited scans — plus adaptive macros, progress tracking, and a timeline to your goal.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Unlimited scans — scan weekly or monthly',
              'Macros that update after every scan',
              'Precise scan-to-scan progress comparison',
              'Goal timeline: weeks to your target body fat',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ color: C.green, fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{item}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTab('profile')}
            style={{
              background: C.green, color: '#0A0D0A', border: 'none',
              padding: '14px', borderRadius: 99, fontSize: 15, fontWeight: 800,
              cursor: 'pointer', width: '100%',
            }}
          >
            Upgrade to Premium →
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 14, padding: '12px 16px', fontSize: 13, color: C.red, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, flexShrink: 0, opacity: 0.7 }}>×</button>
        </div>
      )}

      {/* Buttons — hidden when at limit */}
      {!scanLocked && (
        <>
          <input ref={photoRef}  type="file" accept="image/*" capture="user"  style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          <input ref={uploadRef} type="file" accept="image/*"                 style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Btn onClick={() => photoRef.current?.click()}  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="camera" size={16} color="currentColor" /> Take Photo</Btn>
            <Btn onClick={() => uploadRef.current?.click()} variant="outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="arrow-up" size={16} color="currentColor" /> Upload</Btn>
          </div>
        </>
      )}

      {/* Privacy trust note */}
      {!scanLocked && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 12, padding: '11px 14px',
        }}>
          <Icon name="lock" size={13} color={C.dimmed} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.6 }}>
            Your photos are private and securely stored. They are used only to generate your personal analysis and track progress. We never sell, share, or use your images for AI training.
          </span>
        </div>
      )}

      {/* Scan history — premium: browsable list; free: upsell only (no partial list) */}
      {isPremium && scanHistory.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Previous Scans</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...scanHistory].reverse().map((s, i) => {
              const realIdx = scanHistory.length - 1 - i;
              const cmp = s?.dbComparison || null;
              return (
              <div key={i} className="bp" onClick={() => setViewOld(realIdx)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, borderRadius: 14, padding: '12px 14px', border: `1px solid ${s.isBaseline ? C.purple + '55' : C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt.date(s.date)}</div>
                    {s.isBaseline && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.purple, background: C.purple + '22', padding: '2px 7px', borderRadius: 99, border: `1px solid ${C.purple}44`, textTransform: 'uppercase', letterSpacing: '.06em' }}>Baseline</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Body Fat {getBFDisplay(s)} · Lean {s.leanMass > 0 ? fmt.leanMass(s.leanMass, profile?.unitSystem) : '—'}</div>
                  {cmp && (
                    <div style={{ fontSize: 11, color: C.dimmed, marginTop: 3 }}>
                      DB deltas: BF {Number(cmp.body_fat_delta || 0) >= 0 ? '+' : ''}{Number(cmp.body_fat_delta || 0).toFixed(1)}% · Lean {Number(cmp.lean_mass_delta || 0) >= 0 ? '+' : ''}{Number(cmp.lean_mass_delta || 0).toFixed(1)} lb
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.dimmed, marginTop: 3 }}>Tap to view full scan context</div>
                </div>
                <div style={{ background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
                  {s.physiqueScore > 0 ? s.physiqueScore : '—'}/100
                </div>
              </div>
            )})}
          </div>
        </div>
      )}
      {!isPremium && sortedRealBodyScansByTime(historyForUi).length >= 2 && (
        <Card style={{ marginTop: 8 }}>
          <div style={{ padding: '12px 14px', background: 'rgba(114,184,149,0.06)', borderRadius: 12, border: `1px solid rgba(114,184,149,0.15)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={12} color={C.green} strokeWidth={2.5} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Scan history &amp; comparisons are a Premium feature</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.55 }}>
              Upgrade to browse past scans, deltas, and full context.
            </div>
          </div>
        </Card>
      )}
      {typeof viewOld === 'number' && (
        <ScanDetailModal
          scan={scanHistory[viewOld]}
          prevScan={viewOld > 0 ? scanHistory[viewOld - 1] : null}
          unitSystem={profile?.unitSystem}
          premium={isPremium}
          onClose={() => setViewOld(null)}
        />
      )}
    </div>
  );
}

function ScanDetailModal({ scan, prevScan, onClose, unitSystem = 'imperial', premium = false }) {
  if (!scan) return null;
  const dbCmp = scan?.dbComparison || null;
  // [scan:source] verification log — remove after verifying
  console.info('[scan:source] modal data sources', {
    scan_id: scan?.id || scan?.dbId || null,
    last_scan_used: prevScan ? { id: prevScan.id || prevScan.dbId || null, date: prevScan.date } : null,
    comparison_source: dbCmp ? 'scan_comparisons' : 'derived',
    comparison_row_id: dbCmp?.id || null,
    decision_source: scan?.dbDecision ? 'scan_decisions' : (scan?.dbDecisionLog ? 'decision_log' : 'scan_context'),
    decision_row_id: scan?.dbDecision?.id || scan?.dbDecisionLog?.id || null,
  });
  const bfDelta = dbCmp?.body_fat_delta ?? (prevScan ? (getBF(scan) || 0) - (getBF(prevScan) || 0) : null);
  const lmDelta = dbCmp?.lean_mass_delta ?? (prevScan ? Number(scan.leanMass || 0) - Number(prevScan.leanMass || 0) : null);
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
            <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>
              Comparison source: {dbCmp ? 'scan_comparisons' : 'derived'}
            </span>
            <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>
              Decision source: {scan?.dbDecision ? 'scan_decisions' : (scan?.dbDecisionLog ? 'decision_log' : 'scan_context')}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Body Fat', value: getBFDisplay(scan), tone: (bfDelta || 0) <= 0 ? C.green : C.orange, delta: bfDelta },
              { label: 'Lean Mass', value: fmt.leanMass(scan.leanMass || 0, unitSystem), tone: (lmDelta || 0) >= 0 ? C.green : C.orange, delta: lmDelta, lb: true },
              { label: 'Physique Score', value: `${scan.physiqueScore || '—'}/100`, tone: C.white },
              { label: 'Symmetry', value: `${scan.symmetryScore || '—'}/100`, tone: C.white },
            ].map((m) => (
              <div key={m.label} style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>{m.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: m.tone }}>{m.value}</div>
                {premium && m.delta !== undefined && m.delta !== null && (
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
          {premium ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{scan.assessment || 'Historical scan available for comparison. Detailed narrative was not stored for this scan.'}</p>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: C.dimmed, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Focus Areas at this scan</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(scan.focusAreas?.length ? scan.focusAreas : ['No specific focus areas were recorded']).slice(0, 4).map((f, i) => (
                    <span key={`${f}-${i}`} style={{ fontSize: 12, color: C.white, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 10px' }}>{f}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 6, padding: '12px 14px', background: 'rgba(114,184,149,0.06)', borderRadius: 12, border: `1px solid rgba(114,184,149,0.15)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="lock" size={12} color={C.green} strokeWidth={2.5} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Unlock full analysis, plan, and progress tracking</span>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Plan Context</div>
          {premium ? (
            <>
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
            </>
          ) : (
            <div style={{ marginTop: 6, padding: '12px 14px', background: 'rgba(114,184,149,0.06)', borderRadius: 12, border: `1px solid rgba(114,184,149,0.15)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="lock" size={12} color={C.green} strokeWidth={2.5} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Unlock full analysis, plan, and progress tracking</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function AuthScreen({ onSubmit, onForgotPassword, loading, error, notice }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [touched,  setTouched]  = useState({ email: false, password: false });

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const emailOk    = isValidEmail(email);
  const passwordOk = password.length >= 6;

  const emailErr   = touched.email    && email.trim()    && !emailOk    ? 'Enter a valid email address.' : '';
  const passwordErr= touched.password && password.length && !passwordOk ? 'Password must be at least 6 characters.' : '';

  const canSubmit  = !loading && emailOk && (mode === 'forgot' || passwordOk);

  const handleSubmit = () => {
    setTouched({ email: true, password: true });
    if (!canSubmit) return;
    if (mode === 'forgot') { onForgotPassword(email.trim()); return; }
    onSubmit(mode, email.trim(), password);
  };

  const switchMode = (m) => {
    setMode(m);
    setTouched({ email: false, password: false });
  };

  const inputStyle = (hasErr) => ({
    padding: '12px 14px', borderRadius: 12, fontSize: 14, width: '100%',
    border: `1px solid ${hasErr ? C.red + '88' : C.border}`,
    background: hasErr ? `rgba(201,92,92,0.06)` : C.card,
    color: C.white, outline: 'none',
  });

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{CSS}</style>
      <Card className="glass su" style={{ width: '100%', maxWidth: 420, padding: 24, background: C.cardElevated }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 16 }}>MASSIQ</div>

        {/* ── Forgot password mode ── */}
        {mode === 'forgot' ? (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>Reset your password</h1>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                placeholder="Email address"
                type="email"
                autoComplete="email"
                style={inputStyle(!!emailErr)}
              />
              {emailErr && <div style={{ fontSize: 11, color: C.red, paddingLeft: 4 }}>{emailErr}</div>}
              <Btn disabled={!canSubmit || loading} onClick={handleSubmit} style={{ width: '100%', marginTop: 8 }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </Btn>
            </div>
            {(error || notice) && (
              <div style={{ marginTop: 12, borderRadius: 12, padding: '10px 12px', border: `1px solid ${error ? C.red + '66' : C.greenDim}`, background: error ? 'rgba(201,92,92,0.08)' : C.greenBg, fontSize: 12, color: error ? '#FFB4B7' : C.green }}>
                {error || notice}
              </div>
            )}
            <button className="bp" onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginTop: 16, width: '100%', textAlign: 'center' }}>
              ← Back to log in
            </button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
              {mode === 'login'
                ? 'Log in to continue your plan, scans, and progress timeline.'
                : 'Set up your account once. MassIQ will remember your profile, scans, and progress.'}
            </p>

            {/* Mode toggle */}
            <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {['login', 'signup'].map(m => (
                <button key={m} className="bp" onClick={() => switchMode(m)} style={{
                  flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 650,
                  background: mode === m ? C.greenBg : 'transparent',
                  color: mode === m ? C.green : C.muted, border: 'none',
                }}>
                  {m === 'login' ? 'Log In' : 'Create Account'}
                </button>
              ))}
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                placeholder="Email address"
                type="email"
                autoComplete={mode === 'login' ? 'email' : 'email'}
                style={inputStyle(!!emailErr)}
              />
              {emailErr && <div style={{ fontSize: 11, color: C.red, paddingLeft: 4 }}>{emailErr}</div>}

              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, password: true }))}
                placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ ...inputStyle(!!passwordErr), marginTop: 4 }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              {passwordErr && <div style={{ fontSize: 11, color: C.red, paddingLeft: 4 }}>{passwordErr}</div>}

              <Btn disabled={!canSubmit} onClick={handleSubmit} style={{ width: '100%', marginTop: 8 }}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
              </Btn>
            </div>

            {/* Error / notice */}
            {(error || notice) && (
              <div style={{ marginTop: 12, borderRadius: 12, padding: '10px 12px', border: `1px solid ${error ? C.red + '66' : C.greenDim}`, background: error ? 'rgba(201,92,92,0.08)' : C.greenBg, fontSize: 12, color: error ? '#FFB4B7' : C.green }}>
                {error || notice}
              </div>
            )}

            {/* Legal acknowledgment — signup only */}
            {mode === 'signup' && (
              <p style={{ fontSize: 11, color: C.dimmed, lineHeight: 1.6, marginTop: 14, textAlign: 'center' }}>
                By creating an account, you agree to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: 'underline' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: 'underline' }}>Privacy Policy</a>.
              </p>
            )}

            {/* Forgot password link — login only */}
            {mode === 'login' && (
              <button className="bp" onClick={() => switchMode('forgot')} style={{ background: 'none', border: 'none', color: C.dimmed, fontSize: 12, cursor: 'pointer', marginTop: 14, width: '100%', textAlign: 'center' }}>
                Forgot your password?
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ─── Nav config (shared by TabBar + Sidebar) ────────────────────────────── */
const TABS = [
  { key: 'home',      label: 'Home',      icon: 'home' },
  { key: 'nutrition', label: 'Nutrition', icon: 'utensils' },
  { key: 'scan',      label: 'Scan',      icon: 'camera' },
  { key: 'plan',      label: 'Plan',      icon: 'clipboard' },
  { key: 'profile',   label: 'Profile',   icon: 'person' },
];

/* ─── Mobile Tab Bar ─────────────────────────────────────────────────────── */
function TabBar({ active, setTab }) {
  return (
    <div className="mobile-tabbar" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(12,18,14,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', padding: '10px 0 max(10px, env(safe-area-inset-bottom))',
      pointerEvents: 'auto',
    }}>
      {TABS.map(t => {
        const isActive = active === t.key;
        return (
          <button key={t.key} className="bp" onClick={() => setTab(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}>
            <div style={{
              padding: '4px 12px', borderRadius: 16, lineHeight: 1,
              background: isActive ? C.greenBg : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={t.icon} size={22} color={isActive ? C.green : C.dimmed} strokeWidth={isActive ? 2 : 1.5} />
            </div>
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
  const goalIconName = { Cut: 'arrow-down', Bulk: 'arrow-up', Recomp: 'rotate', Maintain: 'scale' }[profile?.goal] || 'target';
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
              <Icon name={t.icon} size={18} color={isActive ? C.green : C.muted} strokeWidth={isActive ? 2 : 1.5} />
              {t.label}
              {isActive && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: C.green }} />}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      {profile && (
        <div style={{ padding: '16px 20px 28px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6 }}>{profile.name || 'Athlete'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: `1px solid ${C.greenDim}` }}>
            <Icon name={goalIconName} size={11} color="currentColor" /> {profile.goal}
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
  const [scanHistory,   setScanHistory]   = useState(() => LS.get(LS_KEYS.scanHistory, []));
  const [subscription,  setSubscription]  = useState(null);
  const [entitlements,  setEntitlements]  = useState(null);
  const [paywallOpen,   setPaywallOpen]   = useState(false);
  const [checkoutActivating, setCheckoutActivating] = useState(false);
  const [checkoutRetryExhausted, setCheckoutRetryExhausted] = useState(false);
  const onboardingPersistRef = useRef(null);

  // ── SINGLE SOURCE OF TRUTH FOR TARGETS ────────────────────────────────────
  // Sub-components call getActiveTargets() themselves so they stay fresh.
  // This top-level memo is the authoritative value passed where needed.
  const targets = useMemo(() => {
    const latestScan = LS.get(LS_KEYS.scanHistory, []).slice(-1)[0] || null;
    return calcTargets(profile, latestScan);
  }, [profile, activePlan]);

  useEffect(() => {
    // If the user landed on /app with a Supabase recovery token in the URL hash
    // (e.g. site URL fallback when redirect_to URL isn't in the Supabase allowlist),
    // forward them to the dedicated reset-password page so the flow works properly.
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      if (params.get('type') === 'recovery' && params.get('access_token')) {
        window.location.replace(`/reset-password#${hash}`);
        return;
      }
    } catch {}

    let mounted = true;
    const boot = async () => {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const qs = typeof window !== 'undefined' ? window.location?.search || '' : '';
        const hasCheckoutReturn = qs.includes('checkout_success=1');
        const storedRaw = typeof window !== 'undefined' ? (() => { try { return !!localStorage.getItem('massiq:auth:session'); } catch { return false; } })() : false;
        console.info('[auth:boot] start', { origin, has_checkout_success: hasCheckoutReturn, has_stored_session: storedRaw });

        let s = await initializeSession();
        const storedAfterFirst = getStoredSession();
        console.info('[auth:boot] first initializeSession', {
          hasSession: !!s?.access_token,
          hasStored: !!storedAfterFirst,
          hasCheckoutReturn: hasCheckoutReturn,
        });
        if (!s?.access_token) {
          let needsRetry = false;
          try {
            needsRetry = sessionStorage.getItem('massiq:billing-return') === '1'
              || sessionStorage.getItem('massiq:premium-return') === '1'
              || qs.includes('premium_activated=1')
              || hasCheckoutReturn;
          } catch {}
          const maxAttempts = hasCheckoutReturn ? 90 : 24;
          if (needsRetry) {
            console.info('[auth:boot] retrying session', { maxAttempts, intervalMs: 500, hasCheckoutReturn });
            for (let i = 0; i < maxAttempts && !s?.access_token && mounted; i++) {
              await new Promise(r => setTimeout(r, 500));
              s = await initializeSession();
              if (!s?.access_token && (i === 0 || i === 29 || i === 59 || i === maxAttempts - 1)) {
                const stored = getStoredSession();
                console.info('[auth:boot] retry', { attempt: i + 1, hasStored: !!stored, hasRawKey: typeof localStorage !== 'undefined' ? !!localStorage.getItem('massiq:auth:session') : null });
              }
            }
          }
        }
        if (!mounted) return;
        if (s?.access_token) {
          console.info('[auth:boot] session restored', { userId: s?.user?.id || s?.user_id });
        } else {
          console.info('[auth:boot] no session after retries', {
            had_checkout_return: hasCheckoutReturn,
            hasStoredSession: !!getStoredSession(),
          });
        }
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

  // ── Extended session retry for checkout return ─────────────────────────────
  // When checkout_success=1 and no session after boot, keep retrying. Do NOT
  // show login until session is definitively unrecoverable (no stored session)
  // or 5 min hard cap. While stored session exists, keep retrying — refresh may succeed.
  useEffect(() => {
    if (!authReady || session?.access_token) return;
    const qs = typeof window !== 'undefined' ? window.location?.search || '' : '';
    if (!qs.includes('checkout_success=1')) return;

    let cancelled = false;
    const MAX_ATTEMPTS = 300;
    const INTERVAL_MS = 1000;
    const HARD_CAP_MS = 5 * 60 * 1000;
    const startTime = Date.now();
    const log = (msg, data = {}) => {
      if (!cancelled) console.info('[auth:checkout-return]', msg, data);
    };
    const returnOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const checkoutOrigin = typeof window !== 'undefined' ? localStorage.getItem('massiq:checkout-origin') : null;
    const originMismatch = checkoutOrigin && returnOrigin && checkoutOrigin !== returnOrigin;
    log('starting extended retry — no session after boot', {
      url: typeof window !== 'undefined' ? window.location.href : '',
      origin: returnOrigin,
      checkout_origin_stored: checkoutOrigin,
      origin_mismatch: originMismatch,
      hasStored: !!getStoredSession(),
      maxAttempts: MAX_ATTEMPTS,
      intervalMs: INTERVAL_MS,
      hardCapMs: HARD_CAP_MS,
    });

    const run = async () => {
      for (let i = 0; i < MAX_ATTEMPTS && !cancelled; i++) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        if (cancelled) return;
        const elapsed = Date.now() - startTime;
        if (elapsed >= HARD_CAP_MS) {
          log('hard cap reached — will allow login', { elapsedMs: elapsed });
          setCheckoutRetryExhausted(true);
          return;
        }
        const s = await initializeSession();
        if (s?.access_token) {
          log('session restored on extended retry', { attempt: i + 1, userId: s?.user?.id });
          setSession(s);
          return;
        }
        const hasStored = !!getStoredSession();
        if (i === 0 || i === 29 || i === 59 || i === MAX_ATTEMPTS - 1) {
          log('retry no session', { attempt: i + 1, hasStored, elapsedMs: elapsed });
        }
        if (i === MAX_ATTEMPTS - 1) {
          if (!hasStored) {
            log('exhausted and no stored session — definitively unrecoverable', { totalAttempts: MAX_ATTEMPTS });
          } else {
            log('exhausted but stored session exists — hard cap will apply', { totalAttempts: MAX_ATTEMPTS });
          }
          setCheckoutRetryExhausted(true);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [authReady, session?.access_token]);

  useEffect(() => {
    if (!authReady) return;
    if (!session?.access_token) {
      setProfile(null);
      setActivePlan(null);
      setScanHistory([]);
      setSubscription(null);
      setEntitlements(null);
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
        let loadedMealPlan = null;
        let loadedWorkoutProgram = null;
        let loadedComparisons = [];
        let loadedDecisions = [];
        let loadedDecisionLogs = [];
        try {
          console.info('[sync] ensureProfile:start', { userId });
          loadedProfile = await ensureProfile(session.access_token, userId);
          console.info('[sync] ensureProfile:ok', { hasProfile: Boolean(loadedProfile) });
          // Recovery: if DB returned an incomplete profile (fields null — e.g. because
          // the browser navigated away during onboarding before the upsert finished),
          // but localStorage has a complete profile that belongs to THIS user, re-sync it.
          if (loadedProfile && (!loadedProfile.age || !loadedProfile.weightLbs || !loadedProfile.heightCm)) {
            const cachedProfile = LS.get(LS_KEYS.profile, null);
            if (cachedProfile?.id === userId && cachedProfile.age && cachedProfile.weightLbs && cachedProfile.heightCm) {
              console.info('[sync] ensureProfile: incomplete DB profile — recovering from local cache');
              try {
                await upsertProfile(session.access_token, userId, cachedProfile);
                loadedProfile = { ...loadedProfile, ...cachedProfile, id: userId };
                console.info('[sync] ensureProfile: recovery ok');
              } catch (recoveryErr) {
                console.error('[sync] ensureProfile: profile recovery failed', recoveryErr?.message);
              }
            }
          }
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
        try {
          loadedMealPlan = await getLatestMealPlan(session.access_token, userId);
          console.info('[sync] getLatestMealPlan:ok', { hasMealPlan: Boolean(loadedMealPlan) });
        } catch (mealErr) {
          console.warn('sync:getLatestMealPlan failed (non-fatal)', mealErr?.message);
        }
        try {
          loadedWorkoutProgram = await getLatestWorkoutProgram(session.access_token, userId);
          console.info('[sync] getLatestWorkoutProgram:ok', { hasWorkoutProgram: Boolean(loadedWorkoutProgram) });
        } catch (workoutErr) {
          console.warn('sync:getLatestWorkoutProgram failed (non-fatal)', workoutErr?.message);
        }
        try {
          loadedComparisons = await getScanComparisons(session.access_token, userId, 100);
          loadedDecisions = await getScanDecisions(session.access_token, userId, 100);
          loadedDecisionLogs = await getDecisionLogs(session.access_token, userId, 100);
          console.info('[sync] decision/comparison:ok', {
            comparisons: loadedComparisons.length,
            decisions: loadedDecisions.length,
            decision_logs: loadedDecisionLogs.length,
          });
        } catch (intelErr) {
          console.warn('sync:intel reads failed (non-fatal)', intelErr?.message);
        }

        // Load subscription status (non-fatal — null means free tier)
        try {
          const sub = await getSubscription(session.access_token, userId);
          if (mounted) setSubscription(sub);
          const premium = sub && ['active', 'trialing'].includes(sub.status);
          console.info('[sync] subscription:ok', {
            status: sub?.status || 'none',
            stripe_sub_id: sub?.stripe_subscription_id ?? null,
            premium_decision: premium ? 'granted' : 'not_granted',
          });
        } catch {
          // Non-fatal: free tier assumed
        }

        // Entitlements: hydrate from DB — insert 0-used row only if server has zero scans; else reconcile from scans count
        try {
          const nd = countNonDuplicateServerScans(loadedScanHistory);
          const ent = await hydrateUserEntitlements(session.access_token, userId, nd);
          if (mounted) {
            setEntitlements(ent);
            if (ent != null && ent.free_food_scans_date) {
              const today = new Date().toISOString().slice(0, 10);
              if (String(ent.free_food_scans_date).slice(0, 10) === today) setFoodScanCache(userId, ent.free_food_scans_used_today ?? 0);
            }
          }
          if (ent != null) {
            console.info('[entitlements] hydrated from DB', {
              free_scans_used: ent.free_scans_used,
              free_scan_limit: ent.free_scan_limit,
              lifetime_scan_count: ent.lifetime_scan_count,
            });
          } else {
            console.warn('[sync] entitlements:null — run migration 024 (RPC) or check connection');
          }
          console.info('[sync] entitlements:ok', { free_scans_used: ent?.free_scans_used ?? 0, free_food_scans_used: ent?.free_food_scans_used ?? 0 });
        } catch {
          // Non-fatal
        }

        if (loadedProfile && loadedProfile.age && loadedProfile.weightLbs && loadedProfile.heightCm && !loadedPlan && loadedScanHistory.length > 0) {
          const fallbackPlan = buildBaselinePlanFromProfile(loadedProfile);
          try {
            console.info('[sync] createDefaultPlan:start', { userId, reason: 'profile complete + scans exist but no plan' });
            await upsertPlan(session.access_token, userId, fallbackPlan);
            console.info('[sync] createDefaultPlan:ok');
          } catch (createPlanErr) {
            console.error('sync:createDefaultPlan failed', createPlanErr);
            throw createPlanErr;
          }
          loadedPlan = fallbackPlan;
        }

        // Enrich plan with targetBF/startBF from scan data when not stored in DB.
        // These columns require migration 004 which may not be applied.
        // Compute from the latest scan + profile goal instead.
        if (loadedPlan && loadedPlan.targetBF == null && loadedScanHistory.length > 0) {
          const latestScan = loadedScanHistory[loadedScanHistory.length - 1];
          const currentBF = latestScan?.bodyFat ?? latestScan?.bodyFatPct ?? null;
          if (currentBF != null) {
            loadedPlan = { ...loadedPlan, startBF: currentBF };
            const goal = (loadedPlan.phase || loadedProfile?.goal || 'Maintain').toLowerCase();
            if (goal === 'cut') loadedPlan.targetBF = Math.max(6, currentBF - 4);
            else if (goal === 'bulk' || goal === 'build') loadedPlan.targetBF = currentBF + 2;
            else if (goal === 'recomp') loadedPlan.targetBF = Math.max(6, currentBF - 2);
            else loadedPlan.targetBF = currentBF;
            console.info('[sync] enriched plan with computed BF targets', { startBF: loadedPlan.startBF, targetBF: loadedPlan.targetBF });
          }
        }

        if (mounted) {
          // [plan:hydrate] verification log — current plan start_date / week after DB read
          if (loadedPlan) console.info('[plan:hydrate] plan loaded from DB', { start_date: loadedPlan.startDate ?? loadedPlan.start_date, week: loadedPlan.week, phase: loadedPlan.phase });
          // Stamp the current user so a future sign-in can detect a user switch
          localStorage.setItem('massiq:current-user', userId);
          // Restore name if DB doesn't have it — check a logout-resilient key first,
          // then fall back to the profile cache (may have been cleared on logout)
          if (loadedProfile && !loadedProfile.name) {
            const persistedName = localStorage.getItem(`miq:name:${userId}`);
            const cached = LS.get(LS_KEYS.profile, null);
            const fallbackName = persistedName || cached?.name || null;
            if (fallbackName) loadedProfile = { ...loadedProfile, name: fallbackName };
          }
          // [onboarding:debug] — remove after verifying end-to-end mapping (logged after name fallback)
          if (loadedProfile) {
            console.info('[onboarding:debug] hydrated profile (after read + name fallback)', JSON.stringify({
              name: loadedProfile.name, goal: loadedProfile.goal, unitSystem: loadedProfile.unitSystem,
              age: loadedProfile.age, weightLbs: loadedProfile.weightLbs, heightCm: loadedProfile.heightCm,
              gender: loadedProfile.gender, activity: loadedProfile.activity,
              dietPrefs: loadedProfile.dietPrefs, cuisines: loadedProfile.cuisines, avoid: loadedProfile.avoid,
            }));
          }
          setProfile(loadedProfile);
          setActivePlan(loadedPlan);
          setTab('home');
          LS.set(LS_KEYS.profile, loadedProfile);
          LS.set(LS_KEYS.activePlan, loadedPlan);
          if (loadedMealPlan?.meals) {
            LS.set(LS_KEYS.mealplan, {
              weekKey: weekKey2(),
              days: Array.isArray(loadedMealPlan.meals) ? loadedMealPlan.meals : [],
              dbMealPlanId: loadedMealPlan.id,
              dbPlanId: loadedMealPlan.plan_id,
            });
          }
          if (loadedWorkoutProgram?.structure?.days) {
            LS.set(LS_KEYS.workoutplan, Array.isArray(loadedWorkoutProgram.structure.days) ? loadedWorkoutProgram.structure.days : []);
          }
          // DB is the authoritative source for scan history.
          // Each DB row now carries physique_score, symmetry_score, scan_confidence,
          // muscle_assessment (jsonb), and scan_notes so the history card renders
          // correctly after re-login with no dependency on local cache.
          // For older rows that predate full-column storage and have physique_score = null,
          // we attempt to enrich from local cache as a graceful fallback.
          const localHistory = LS.get(LS_KEYS.scanHistory, []);
          if (loadedScanHistory.length > 0) {
            const comparisonByCurrentScanId = new Map((loadedComparisons || []).map(c => [String(c.current_scan_id), c]));
            const decisionByScanId = new Map((loadedDecisions || []).map(d => [String(d.scan_id), d]));
            const decisionLogByScanId = new Map((loadedDecisionLogs || []).map(d => [String(d.scan_id), d]));
            const hydrated = loadedScanHistory.map(dbScan => {
              const scanIdKey = String(dbScan.id || dbScan.dbId || '');
              const mergedDbScan = {
                ...dbScan,
                dbComparison: comparisonByCurrentScanId.get(scanIdKey) || null,
                dbDecision: decisionByScanId.get(scanIdKey) || null,
                dbDecisionLog: decisionLogByScanId.get(scanIdKey) || null,
                // Prefer persisted decision tables over embedded scan_context fields.
                adaptationDecision: (decisionByScanId.get(scanIdKey)?.decision_type) || dbScan.adaptationDecision,
                adaptationRationale: (decisionByScanId.get(scanIdKey)?.decision_reason) || (decisionLogByScanId.get(scanIdKey)?.explanation) || dbScan.adaptationRationale,
                scanComparison: dbScan.scanComparison || (() => {
                  const c = comparisonByCurrentScanId.get(scanIdKey);
                  if (!c) return null;
                  return {
                    bf_delta: c.body_fat_delta,
                    lm_delta_lbs: c.lean_mass_delta,
                    score_delta: c.physique_score_delta,
                    symmetry_delta: c.symmetry_score_delta,
                  };
                })(),
              };
              // Rows saved after the schema was complete have physiqueScore — use as-is.
              if (dbScan.physiqueScore != null) return mergedDbScan;
              // Older row: try to enrich from local cache by matching dbId.
              const localMatch = localHistory.find(ls =>
                ls.dbId === dbScan.id || ls.dbId === String(dbScan.id)
              );
              return localMatch ? { ...localMatch, ...mergedDbScan, id: dbScan.id, dbId: dbScan.id } : mergedDbScan;
            });
            LS.set(LS_KEYS.scanHistory, hydrated);
            setScanHistory(hydrated);
            const latestHydrated = hydrated[hydrated.length - 1] || null;
            if (latestHydrated) {
              console.info('[scan:source] hydrated latest source ids', {
                scan_id: latestHydrated.id || latestHydrated.dbId || null,
                comparison_row_id: latestHydrated?.dbComparison?.id || null,
                decision_row_id: latestHydrated?.dbDecision?.id || latestHydrated?.dbDecisionLog?.id || null,
              });
            }
            console.info('[sync] hydrate: loaded', hydrated.length, 'scan(s) from DB');
          } else {
            // DB returned 0 scans for this user — clear ALL local scan entries.
            // Any entries with dbId from a previous user should not persist.
            if (localHistory.length > 0) {
              console.warn('[sync] hydrate: DB has 0 scans — clearing', localHistory.length, 'local scan entries');
              LS.set(LS_KEYS.scanHistory, []);
              setScanHistory([]);
            }
          }
        }
      } catch (err) {
        console.error('hydrate account data failed', err);
        if (mounted) setAuthError("We couldn't finish syncing your account. Please try again.");
      } finally {
        if (mounted) setReady(true);
      }
    };
    hydrate();
    return () => { mounted = false; };
  }, [authReady, session?.access_token]);

  // ── Premium return / checkout success ─────────────────────────────────────
  // When user returns from Stripe: checkout_success=1&session_id=... in URL.
  // 1. Call backend to verify session
  // 2. Set massiq:premium-return so we poll subscription
  // 3. Poll until subscription is active (webhook may be delayed)
  useEffect(() => {
    if (!ready || !session?.access_token) return;

    let cancelled = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const checkoutSuccess = params.get('checkout_success');
      const sessionId = params.get('session_id');
      const hasSsFlag = sessionStorage.getItem('massiq:premium-return');
      const hasPremiumActivated = params.get('premium_activated');

      if (checkoutSuccess && sessionId) {
        window.history.replaceState({}, '', window.location.pathname);
        try { sessionStorage.setItem('massiq:premium-return', '1'); } catch {}
        if (!cancelled) setCheckoutActivating(true);
      }
      if (hasPremiumActivated) window.history.replaceState({}, '', window.location.pathname);

      const shouldPoll = hasSsFlag || checkoutSuccess || hasPremiumActivated;
      if (!shouldPoll) return;

      if (!cancelled) setCheckoutActivating(true);
      const userId = session.user?.id;
      if (!userId) return;

      if (isPremiumActive(subscription)) {
        try { sessionStorage.removeItem('massiq:premium-return'); } catch {}
        if (!cancelled) setCheckoutActivating(false);
        return;
      }

      console.info('[premium-poll] detected checkout return — calling verify-session then polling');
      const poll = async () => {
        const sessionId = params.get('session_id');
        if (sessionId) {
          try {
            const verifyRes = await fetch('/api/stripe/verify-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ session_id: sessionId }),
            });
            const verifyData = await verifyRes.json();
            if (!cancelled) console.info('[premium-poll] verify-session', { ok: verifyData?.ok, status: verifyData?.subscription_status, error: verifyData?.error });
            if (verifyData?.error && !cancelled) setToast('Could not verify payment. Please refresh or contact support.');
          } catch (e) {
            if (!cancelled) setToast('Could not verify payment. Retrying...');
          }
        }

        let attempts = 0;
        while (attempts < 12 && !cancelled) {
          attempts++;
          try {
            const sub = await getSubscription(session.access_token, userId);
            if (sub && isPremiumActive(sub)) {
              if (!cancelled) {
                setSubscription(sub);
                try {
                  const ent = await fetchUserEntitlements(session.access_token, userId);
                  if (!cancelled) {
                    setEntitlements(ent);
                    if (ent != null && ent.free_food_scans_date) {
                      const today = new Date().toISOString().slice(0, 10);
                      if (String(ent.free_food_scans_date).slice(0, 10) === today) setFoodScanCache(userId, ent.free_food_scans_used_today ?? 0);
                    }
                  }
                } catch {}
                try {
                  sessionStorage.removeItem('massiq:premium-return');
                  // Also clear the pre-redirect billing-return flag set in the Paywall.
                  // Without this it lingers for the rest of the tab session and triggers
                  // unnecessary auth-retry loops on subsequent page loads.
                  sessionStorage.removeItem('massiq:billing-return');
                } catch {}
                setCheckoutActivating(false);
                console.info('[premium-poll] subscription activated', { status: sub.status, attempt: attempts });
              }
              return;
            }
          } catch {}
          if (attempts < 12) await new Promise(r => setTimeout(r, 2500));
        }
        try {
          sessionStorage.removeItem('massiq:premium-return');
          sessionStorage.removeItem('massiq:billing-return');
        } catch {}
        if (!cancelled) {
          setCheckoutActivating(false);
          setToast('Premium is still syncing. If you just paid, refresh in a minute or contact support.');
        }
        console.warn('[premium-poll] subscription not confirmed after 12 attempts');
      };
      poll();
    } catch {}
    return () => { cancelled = true; };
  }, [ready, session?.access_token]);

  // criticalProfile: when true the profile write failure is re-thrown instead of
  // swallowed. Used during onboarding so the Paywall can gate checkout on success.
  const persistUserState = async (nextProfile, nextPlan, newScanEntry = null, { criticalProfile = false, previousPlan = null } = {}) => {
    if (!session?.access_token) return;
    setSyncing(true);

    try {
      const user = session.user || await fetchUser(session.access_token);
      const userId = user?.id;
      if (!userId) return;

      // ── Step 1: Profile ─────────────────────────────────────────────────
      if (nextProfile) {
        try {
          console.info('[sync] step1:upsertProfile:start');
          await upsertProfile(session.access_token, userId, nextProfile);
          console.info('[sync] step1:upsertProfile:ok');
        } catch (profileErr) {
          console.error('[sync] step1:upsertProfile:error', profileErr?.message, profileErr);
          if (criticalProfile) throw profileErr;  // Onboarding: surface so checkout is blocked
          // Non-blocking — continue to plan/scan
        }
      }

      // Duplicate photo apply: profile already written — persist plan only (no scan row)
      if (newScanEntry?.scanStatus === 'duplicate') {
        let dupPlanId = null;
        if (nextPlan) {
          try {
            console.info('[sync] duplicate apply: upsertPlan:start', { phase: nextPlan?.phase });
            const planRow = await upsertPlan(session.access_token, userId, nextPlan);
            dupPlanId = planRow?.id ?? null;
            console.info('[sync] duplicate apply: upsertPlan:ok', { persistedPlanId: dupPlanId });
          } catch (planErr) {
            console.error('[sync] duplicate apply: upsertPlan:error', planErr?.message, planErr);
            throw planErr;
          }
        }
        console.info('[entitlements:body] duplicate skip — no DB scan row, counters unchanged');
        console.info('[entitlement:update]', { user_id: userId, increment_applied: false, reason: 'duplicate_skip' });
        setToast('Plan saved. Same photo as a previous scan — no new scan was recorded and free scans were not used.');
        return;
      }

      // ── Step 2: Scan first — capture scans.id from insert response only ─
      let scanId = null;
      let savedScanEntry = null;
      let insertedNewBodyScan = false;
      const historyBeforeInsert = LS.get(LS_KEYS.scanHistory, []);

      if (newScanEntry) {
        if (newScanEntry.dbId) {
          scanId = newScanEntry.dbId;
          savedScanEntry = newScanEntry;
          console.info('[sync] step2:createScan:skipped (already saved)', { scanId });
        } else {
          console.info('[sync] step2:createScan:start', {
            bodyFat: newScanEntry.bodyFat,
            leanMass: newScanEntry.leanMass,
          });
          let saved;
          try {
            saved = await createScan(session.access_token, userId, newScanEntry);
          } catch (scanErr) {
            const full = `${scanErr?.message || ''} ${scanErr?.postgrestMessage || ''} ${scanErr?.postgrestDetails || ''}`;
            if (/body_scan_free_limit|free_limit_reached/i.test(full)) {
              console.info('[entitlements] limit reached', { source: 'db_insert_guard', detail: full.trim() });
              try {
                const ent = await fetchUserEntitlements(session.access_token, userId);
                setEntitlements(ent);
              } catch {}
              setToast('Free scan limit reached. Upgrade for unlimited scans.');
            }
            throw scanErr;
          }
          scanId = saved?.id ?? null;
          console.info('[sync] step2:createScan:response', { scanId, raw: saved });
          if (!scanId) {
            throw new Error('[sync] step2:createScan: Supabase returned no id — scan not saved');
          }
          insertedNewBodyScan = true;
          // Merge DB row (created_at on `date`, ids) so relative time and "latest" are not date-only/stale.
          savedScanEntry = { ...newScanEntry, ...saved, dbId: saved.id || saved.dbId || scanId };
          const newHistory = [...historyBeforeInsert, savedScanEntry];
          LS.set(LS_KEYS.scanHistory, newHistory);
          setScanHistory(newHistory);
          console.info('[latest-scan] UI refreshed from insert', {
            scan_id: savedScanEntry.dbId,
            date: savedScanEntry.date,
          });
          console.info('[sync] step2:createScan:ok — history updated', { scanId, total: newHistory.length });
        }
      }

      // ── Step 3: Plan — plans.id only from upsertPlan return (never local id) ─
      let persistedPlanId = null;
      if (nextPlan) {
        try {
          console.info('[sync] step3:upsertPlan:start', { phase: nextPlan?.phase });
          const planRow = await upsertPlan(session.access_token, userId, nextPlan);
          persistedPlanId = planRow?.id ?? null;
          console.info('[sync] step3:upsertPlan:ok', { persistedPlanId, row: planRow || null });
          if (!persistedPlanId && newScanEntry) {
            console.error('[sync] step3:upsertPlan: returned no id — personalization FK may fail');
          }
        } catch (planErr) {
          console.error('[sync] step3:upsertPlan:error', planErr?.message, planErr);
          if (newScanEntry) throw planErr;
        }
      }

      // Optional debug: minimal decision_engine_runs row (NEXT_PUBLIC_DEBUG_DECISION_ENGINE_PROBE=1 or localStorage massiq:debug:decision_engine_probe=1)
      if (scanId && newScanEntry) {
        try {
          await probeMinimalDecisionEngineRun(session.access_token, userId, scanId, persistedPlanId);
        } catch (probeErr) {
          console.warn('[sync] decision_engine_runs PROBE failed (see logs above)', probeErr?.message);
        }
      }

      if (insertedNewBodyScan && newScanEntry?.scanStatus !== 'duplicate' && scanId) {
        try {
          const entRes = await fetch('/api/scan/apply-entitlement', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ scan_id: scanId }),
          });
          let entJson = null;
          try {
            entJson = await entRes.json();
          } catch {
            entJson = null;
          }
          console.info('[entitlements:body] server apply-entitlement', {
            user_id: userId,
            scan_id: scanId,
            ok: entRes.ok,
            increment_applied: entJson?.rpc?.increment_applied ?? entJson?.increment_applied,
            fallback: entJson?.fallback === true,
          });
          if (!entRes.ok) {
            console.warn('[entitlements:body] apply-entitlement route failed', {
              user_id: userId,
              scan_id: scanId,
              status: entRes.status,
              error: entJson?.error,
            });
            try {
              await reconcileBodyScanEntitlements(session.access_token);
            } catch (recErr) {
              console.warn('[entitlements:body] reconcile failed', recErr?.message);
            }
          }
          const ent = entJson?.entitlements
            || (await fetchUserEntitlements(session.access_token, userId));
          if (ent) {
            setEntitlements(ent);
            console.info('[entitlements:body] refreshed after body scan save', {
              free_scans_used: ent.free_scans_used,
              free_scan_limit: ent.free_scan_limit,
              lifetime_scan_count: ent.lifetime_scan_count,
            });
          }
        } catch (rpcErr) {
          console.warn('[entitlements:body] apply-entitlement request failed', {
            user_id: userId,
            scan_id: scanId,
            error: rpcErr?.message,
          });
          try {
            await reconcileBodyScanEntitlements(session.access_token);
          } catch (recErr) {
            console.warn('[entitlements:body] reconcile failed', recErr?.message);
          }
          try {
            const ent = await fetchUserEntitlements(session.access_token, userId);
            if (ent) setEntitlements(ent);
          } catch (e) {
            console.warn('[entitlements:body] refresh after scan failed', e?.message);
          }
        }
      }

      // ── Step 4: Physique projection — requires both persisted plans.id and scans.id ───
      const projectionAlreadySaved = savedScanEntry?.projectionSaved ?? false;
      if (persistedPlanId && scanId && savedScanEntry && !projectionAlreadySaved) {
        try {
          console.info('[sync] step4:createProjection:start', { persistedPlanId, scanId });
          const proj = await createProjection(
            session.access_token, userId, scanId, persistedPlanId,
            nextPlan, savedScanEntry, nextProfile,
          );
          console.info('[sync] step4:createProjection:ok', { projectionId: proj?.id });
          // Mark so we don't re-insert on the next sync call
          const currentHistory = LS.get(LS_KEYS.scanHistory, []);
          const stamped = currentHistory.map((s, i) =>
            i === currentHistory.length - 1 ? { ...s, projectionSaved: true } : s
          );
          LS.set(LS_KEYS.scanHistory, stamped);
          setScanHistory(stamped);
        } catch (projErr) {
          console.error('[sync] step4:createProjection:error', projErr?.message, projErr);
          // Non-critical — app functions fine without projection row
        }
      } else if (newScanEntry && (!persistedPlanId || !scanId)) {
        console.warn('[sync] step4:createProjection:skipped — missing persistedPlanId or scanId', { persistedPlanId, scanId });
      }

      // ── Step 5: Scan intelligence — each sub-step isolated (one failure must not block others) ─
      if (savedScanEntry?.dbId) {
        const token = session.access_token;
        let priorFromDb = null;
        try {
          priorFromDb = await getPriorScanForComparison(token, userId, savedScanEntry.dbId);
        } catch (priorErr) {
          console.error('[scan:prior] unexpected throw', { user_id: userId, error: priorErr?.message, raw: String(priorErr) });
        }

        const localPrev = (() => {
          for (let i = historyBeforeInsert.length - 1; i >= 0; i -= 1) {
            const s = historyBeforeInsert[i];
            if (s && s.scanStatus !== 'duplicate') return s;
          }
          return null;
        })();

        const priorScan = priorFromDb || (localPrev?.dbId ? localPrev : null);
        if (!priorFromDb && localPrev && !localPrev.dbId) {
          console.info('[scan:prior] note — local prior missing dbId; DB lookup used', { user_id: userId, resolved: Boolean(priorScan) });
        }

        const prevBF = priorScan ? getBF(priorScan) : null;
        const currBF = getBF(savedScanEntry);
        const prevDateStr = priorScan?.date ? String(priorScan.date).slice(0, 10) : null;
        const currDateStr = String(savedScanEntry.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const daysElapsed = prevDateStr
          ? Math.max(1, Math.round(Math.abs(daysBetween(prevDateStr, currDateStr))))
          : null;
        const weeklyBodyFatChange =
          prevBF != null && currBF != null && daysElapsed != null
            ? Number((((currBF - prevBF) / daysElapsed) * 7).toFixed(3))
            : null;

        const wPrevLbs = estWeightLbsFromComp(priorScan?.leanMass, prevBF);
        const wCurrLbs = estWeightLbsFromComp(savedScanEntry.leanMass, currBF);
        const weightDelta =
          wPrevLbs != null && wCurrLbs != null ? Number((wCurrLbs - wPrevLbs).toFixed(2)) : null;
        const weeklyWeightChangePct =
          wPrevLbs != null && wCurrLbs != null && daysElapsed != null
            ? Number(
                (
                  (((wCurrLbs - wPrevLbs) / wPrevLbs) * 100) /
                  (daysElapsed / 7)
                ).toFixed(4),
              )
            : null;

        const sc = savedScanEntry.scanComparison || {};
        const improvedAreas = [];
        const worsenedAreas = [];
        if (typeof sc.bf_delta === 'number') {
          if (sc.bf_delta < -0.05) improvedAreas.push('body_fat');
          if (sc.bf_delta > 0.05) worsenedAreas.push('body_fat');
        }
        if (typeof sc.lm_delta_lbs === 'number') {
          if (sc.lm_delta_lbs > 0.3) improvedAreas.push('lean_mass');
          if (sc.lm_delta_lbs < -0.3) worsenedAreas.push('lean_mass');
        }

        const prevIdForCompare = priorScan?.dbId || priorScan?.id;

        console.info('[db:personalization] resolved ids for pipeline', {
          user_id: userId,
          scan_id: savedScanEntry.dbId,
          persisted_plan_id: persistedPlanId || null,
          scan_id_null: savedScanEntry.dbId == null,
          plan_id_null: persistedPlanId == null,
        });

        try {
          await persistPersonalizationArtifacts(token, userId, {
            scanId: savedScanEntry.dbId,
            planId: persistedPlanId || null,
            previousPhase: previousPlan?.phase ?? null,
            engineOutput: savedScanEntry.decisionEngine || savedScanEntry.scanContext?.decision_engine || null,
            inputSummary: {
              adherence: savedScanEntry.adherenceContextSnapshot || null,
            },
          });
        } catch (peErr) {
          const tbl = peErr?.personalizationTable || 'personalization';
          const detail = peErr?.postgrestMessage || peErr?.message || String(peErr);
          console.error('[personalization] persistPersonalizationArtifacts FAILED', { table: tbl, detail, err: peErr });
          setToast("We couldn't save one part of your scan insights. Your scan and plan are still saved.");
          throw peErr;
        }

        if (prevIdForCompare) {
          try {
            await createScanComparison(token, userId, {
              currentScanId: savedScanEntry.dbId,
              previousScanId: prevIdForCompare,
              bodyFatDelta: currBF != null && prevBF != null ? Number((currBF - prevBF).toFixed(2)) : null,
              leanMassDelta:
                savedScanEntry.leanMass != null && priorScan.leanMass != null
                  ? Number((savedScanEntry.leanMass - priorScan.leanMass).toFixed(2))
                  : null,
              physiqueScoreDelta:
                savedScanEntry.physiqueScore != null && priorScan.physiqueScore != null
                  ? Math.round(savedScanEntry.physiqueScore - priorScan.physiqueScore)
                  : null,
              symmetryScoreDelta:
                savedScanEntry.symmetryScore != null && priorScan.symmetryScore != null
                  ? Math.round(savedScanEntry.symmetryScore - priorScan.symmetryScore)
                  : null,
              weightDelta,
              summary: savedScanEntry.adaptationRationale || null,
              comparisonConfidence: savedScanEntry.confidence || null,
              improvedAreas,
              worsenedAreas,
            });
          } catch (cmpErr) {
            console.error('[scan:compare] sub-step FAILED', { user_id: userId, error: cmpErr?.message, raw: String(cmpErr) });
          }
        } else {
          console.info('[scan:compare] skip', {
            user_id: userId,
            current_scan_id: savedScanEntry.dbId,
            skip_reason: 'no_prior_scan — baseline (no other row in scans for this user before current)',
          });
        }

        try {
          await createScanDecision(token, userId, {
            scanId: savedScanEntry.dbId,
            planId: persistedPlanId || null,
            decisionType: savedScanEntry.adaptationDecision || 'keep_plan',
            decisionReason: savedScanEntry.adaptationRationale || null,
            payload: {
              comparison: savedScanEntry.scanComparison || null,
              confidence: savedScanEntry.confidence || null,
              limiting_factor: savedScanEntry.limitingFactor || null,
              scan_context_adaptation: savedScanEntry.scanContext?.adaptation || null,
              decision_engine: savedScanEntry.decisionEngine || savedScanEntry.scanContext?.decision_engine || null,
              human_explanation: savedScanEntry.decisionExplanation || null,
            },
          });
        } catch (sdErr) {
          const tbl = sdErr?.personalizationTable || 'scan_decisions';
          const detail = sdErr?.postgrestMessage || sdErr?.message || String(sdErr);
          console.error('[db:scan-decision] insert FAILED', { user_id: userId, table: tbl, detail });
          setToast("We couldn't save your adaptation record. Your scan and plan are still saved.");
        }

        try {
          await createDecisionLog(token, userId, {
            scanId: savedScanEntry.dbId,
            planId: persistedPlanId || null,
            decisionCategory: 'scan_adaptation',
            decision: {
              type: savedScanEntry.adaptationDecision || 'keep_plan',
              comparison: savedScanEntry.scanComparison || null,
              limiting_factor: savedScanEntry.limitingFactor || null,
              decision_engine: savedScanEntry.decisionEngine || savedScanEntry.scanContext?.decision_engine || null,
            },
            confidence: savedScanEntry.confidence || null,
            explanation: savedScanEntry.decisionExplanation || savedScanEntry.adaptationRationale || null,
          });
        } catch (dlErr) {
          const tbl = dlErr?.personalizationTable || 'decision_log';
          const detail = dlErr?.postgrestMessage || dlErr?.message || String(dlErr);
          console.error('[db:decision-log] insert FAILED', { user_id: userId, table: tbl, detail });
          setToast("We couldn't save your decision log. Your scan and plan are still saved.");
        }

        try {
          await upsertProgressMetric(token, userId, {
            asOfDate: currDateStr,
            bodyFatPct: currBF != null ? Number(currBF.toFixed(2)) : null,
            leanMassKg: savedScanEntry.leanMass != null ? Number((savedScanEntry.leanMass * 0.453592).toFixed(3)) : null,
            weightKg: weightKgFromProfile(nextProfile),
            weeklyBodyFatChange,
            weeklyWeightChangePct,
            trendStatus: savedScanEntry.adaptationDecision || null,
          });
        } catch (pmErr) {
          console.error('[progress:metrics] sub-step FAILED', { user_id: userId, error: pmErr?.message, raw: String(pmErr) });
        }

        if (persistedPlanId && previousPlan && nextPlan) {
          const oldSnap = planAuditSnapshot(previousPlan);
          const newSnap = planAuditSnapshot(nextPlan);
          const planChanged = JSON.stringify(oldSnap) !== JSON.stringify(newSnap);
          if (planChanged) {
            try {
              await createPlanAdjustment(token, userId, {
                planId: persistedPlanId,
                scanId: savedScanEntry.dbId,
                adjustmentType: 'plan_update',
                oldValue: oldSnap,
                newValue: newSnap,
                triggerReason: savedScanEntry.adaptationDecision || 'scan_update',
                explanation: savedScanEntry.decisionExplanation || savedScanEntry.adaptationRationale || null,
              });
            } catch (paErr) {
              const tbl = paErr?.personalizationTable || 'plan_adjustments';
              const detail = paErr?.postgrestMessage || paErr?.message || String(paErr);
              console.error('[db:plan-adjustment] insert FAILED', { user_id: userId, table: tbl, detail });
              setToast("We couldn't save a plan adjustment record. Your plan update is still saved.");
            }
          } else {
            console.info('[db:plan-adjustment] skip — plan audit snapshot unchanged vs prior active plan', {
              user_id: userId,
              plan_id: persistedPlanId,
              scan_id: savedScanEntry.dbId,
            });
          }
        } else {
          console.info('[db:plan-adjustment] skip — missing persistedPlanId or previousPlan or nextPlan', {
            user_id: userId,
            has_plan_id: Boolean(persistedPlanId),
            has_previous: Boolean(previousPlan),
            has_next: Boolean(nextPlan),
          });
        }
      }

    } catch (err) {
      console.error('[sync] persistUserState:outer error', err?.message, err);
      // Only re-throw when a scan was being saved — so applyPlan can surface the error.
      // Profile/plan/unit-update calls (newScanEntry = null) log and continue.
      if (newScanEntry) throw err;
    } finally {
      setSyncing(false);
    }
  };

  const persistProgramArtifacts = async (nextProfile, nextPlan, { mealDays = null, workoutDays = null } = {}) => {
    if (!session?.access_token || !nextPlan) return;
    const user = session.user || await fetchUser(session.access_token);
    const userId = user?.id;
    if (!userId) {
      console.warn('[db:meal-plan] skip — no user id from session');
      return;
    }
    let planRow;
    try {
      planRow = await upsertPlan(session.access_token, userId, nextPlan);
    } catch (e) {
      console.error('[db:plan] persistProgramArtifacts upsertPlan FAILED', { user_id: userId, error: e?.message });
      setToast('Could not save plan to server. Meal/workout sync skipped.');
      throw e;
    }
    const planId = planRow?.id;
    if (!planId) {
      console.error('[db:plan] persistProgramArtifacts — no plan id after upsert');
      setToast('Plan not synced; meal/workout not saved.');
      return;
    }

    if (Array.isArray(mealDays)) {
      console.info('[db:meal-plan] save start', { user_id: userId, plan_id: planId });
      const totals = sumMealPlanTotals(mealDays);
      console.info('[db:meal-plan] computed totals', {
        total_calories: totals.calories,
        total_protein_g: totals.protein,
        total_carbs_g: totals.carbs,
        total_fat_g: totals.fat,
        days: mealDays.length,
      });
      if (
        totals.calories === 0
        && totals.protein === 0
        && totals.carbs === 0
        && totals.fat === 0
      ) {
        const sample = mealDays[0];
        const hasSlots = sample && (sample.breakfast || sample.lunch || sample.dinner || sample.snack);
        const hasMealsArr = sample && Array.isArray(sample.meals) && sample.meals.length > 0;
        console.warn('[db:meal-plan] computed totals are zero — no macros on meal rows', {
          has_slots: Boolean(hasSlots),
          has_meals_array: Boolean(hasMealsArr),
          day_keys: sample ? Object.keys(sample) : [],
        });
      }
      try {
        await upsertMealPlan(session.access_token, userId, {
          planId,
          preferencesSnapshot: {
            goal: nextProfile?.goal || null,
            diet_prefs: nextProfile?.dietPrefs || [],
            cuisines: nextProfile?.cuisines || [],
            avoid: nextProfile?.avoid || [],
            unit_system: nextProfile?.unitSystem || 'imperial',
          },
          meals: mealDays,
          totals,
        });
        console.info('[db:meal-plan] save success', { user_id: userId, plan_id: planId });
      } catch (e) {
        console.error('[db:meal-plan] persistProgramArtifacts FAILED', { user_id: userId, plan_id: planId, error: e?.message });
        setToast('Meal plan could not be saved to your account.');
        throw e;
      }
    }

    if (Array.isArray(workoutDays)) {
      console.info('[db:workout] save start', { user_id: userId, plan_id: planId });
      try {
        await upsertWorkoutProgram(session.access_token, userId, {
          planId,
          splitName: nextPlan?.phase ? `${nextPlan.phase} Split` : null,
          daysPerWeek: nextPlan?.dailyTargets?.trainingDaysPerWeek || nextPlan?.trainDays || null,
          structure: { days: workoutDays },
          progressionRules: { phase: nextPlan?.phase || null, week: nextPlan?.week || null },
        });
        console.info('[db:workout] save success', { user_id: userId, plan_id: planId });
      } catch (e) {
        console.error('[db:workout] persistProgramArtifacts FAILED', { user_id: userId, plan_id: planId, error: e?.message });
        setToast('Workout program could not be saved to your account.');
        throw e;
      }
    }
  };

  const handlePasswordReset = async (email) => {
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      await requestPasswordReset(email);
      setAuthNotice(`Check your inbox — we sent a reset link to ${email}.`);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('too many')) {
        setAuthError('Too many reset requests. Please wait a minute and try again.');
      } else {
        setAuthError('Could not send reset email. Check the address and try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAuthSubmit = async (mode, email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const userPassword = String(password || '');

    const mapAuthError = (err, m) => {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('invalid login') || raw.includes('invalid credentials') || raw.includes('invalid email or password') || raw.includes('email not confirmed')) {
        return 'Incorrect email or password.';
      }
      if (raw.includes('already registered') || raw.includes('already been registered') || raw.includes('user already registered') || raw.includes('email address is already')) {
        return 'An account already exists for this email. Log in instead.';
      }
      if (raw.includes('email') && raw.includes('invalid')) {
        return 'Enter a valid email address.';
      }
      if (raw.includes('password') && (raw.includes('weak') || raw.includes('6') || raw.includes('short'))) {
        return 'Password must be at least 6 characters.';
      }
      if (raw.includes('email not found') || raw.includes('no user found') || raw.includes('not found')) {
        return m === 'login' ? 'Incorrect email or password.' : 'Could not create account. Try again.';
      }
      if (raw.includes('rate limit') || raw.includes('too many requests') || raw.includes('too many')) {
        return 'Too many attempts. Please wait a minute and try again.';
      }
      if (raw.includes('failed to fetch') || raw.includes('network') || raw.includes('request failed (5') || raw.includes('connection')) {
        return 'Connection issue. Check your internet and try again.';
      }
      if (raw.includes('signup') && raw.includes('disabled')) {
        return 'Sign-ups are temporarily disabled. Try again later.';
      }
      return m === 'signup'
        ? 'Could not create account. Please try again.'
        : 'Could not log in. Please try again.';
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
      // User-switch detection: clear all massiq:* localStorage keys when
      // (a) a different user was previously active, or
      // (b) this is a fresh signup/login with no prior user tracked but stale data exists.
      // This prevents cross-user data leaks in all scenarios.
      const newUserId = res?.user?.id;
      const prevUserId = localStorage.getItem('massiq:current-user');
      const isUserSwitch = prevUserId && newUserId && prevUserId !== newUserId;
      const isFirstLoginWithStaleData = !prevUserId && newUserId && mode === 'signup';
      const cachedProfileId = LS.get(LS_KEYS.profile, null)?.id;
      const isStaleCache = cachedProfileId && newUserId && cachedProfileId !== newUserId;
      if (isUserSwitch || isFirstLoginWithStaleData || isStaleCache) {
        console.info('[auth] clearing stale cache', { from: prevUserId || cachedProfileId, to: newUserId, reason: isUserSwitch ? 'user-switch' : isFirstLoginWithStaleData ? 'fresh-signup' : 'stale-cache' });
        Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
        setScanHistory([]);
        // BUG FIX: The clear above removes massiq:auth:session (set by signIn/signUp).
        // Re-store the session immediately so page refreshes — including Stripe checkout
        // return — can restore auth without sending the user to login.
        try { localStorage.setItem('massiq:auth:session', JSON.stringify(res)); } catch {}
      }
      if (newUserId) localStorage.setItem('massiq:current-user', newUserId);
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
    onboardingPersistRef.current = null;  // cancel any pending checkout gate
    setSession(null);
    setProfile(null);
    setActivePlan(null);
    setScanHistory([]);
    setEditing(false);
    setSubscription(null);
    setEntitlements(null);
    setReady(true);
    Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
    try { sessionStorage.clear(); } catch {}
  };

  const handleDeleteScanHistory = async () => {
    if (!session?.access_token) return;
    await fetch('/api/user/scan-history', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    // Clear local scan state — entitlements are NOT cleared (free credits don't restore)
    setScanHistory([]);
    LS.set(LS_KEYS.scanHistory, []);
    showToast('Scan history deleted.');
  };

  const handleDeleteAccount = async () => {
    if (!session?.access_token) return;
    await fetch('/api/user/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    // Sign out and clear all local data — account is gone
    try { await signOutSession(session.access_token); } catch {}
    onboardingPersistRef.current = null;
    Object.keys(localStorage).filter(k => k.startsWith('massiq:')).forEach(k => localStorage.removeItem(k));
    setSession(null);
    setProfile(null);
    setActivePlan(null);
    setScanHistory([]);
    setSubscription(null);
    setEntitlements(null);
    setTab('home');
  };

  const handleEditProfile = () => {
    setEditing(true);
  };

  const handleOnboardingComplete = (p, plan) => {
    setProfile(p);
    // Store the user's id in the cache so that:
    // 1) profile recovery in the hydration effect can verify ownership
    // 2) Onboarding pre-fill guard can reject mismatched user caches
    const profileWithId = { ...p, id: session?.user?.id || p.id };
    LS.set(LS_KEYS.profile, profileWithId);
    // Persist name under a non-massiq: key so it survives logout/clear
    if (p?.name && session?.user?.id) {
      localStorage.setItem(`miq:name:${session.user.id}`, p.name);
    }
    setEditing(false);

    if (process.env.NODE_ENV !== 'production') {
      console.info('[onboarding:debug] payload about to persist', JSON.stringify({
        name: profileWithId.name, goal: profileWithId.goal, unitSystem: profileWithId.unitSystem,
        age: profileWithId.age, weightLbs: profileWithId.weightLbs, heightCm: profileWithId.heightCm,
        gender: profileWithId.gender, activity: profileWithId.activity,
        dietPrefs: profileWithId.dietPrefs, cuisines: profileWithId.cuisines, avoid: profileWithId.avoid,
      }));
    }

    // ── Critical persistence ─────────────────────────────────────────────────
    // Start the DB write immediately and hold the Promise in a ref.
    // The Paywall reads this ref and AWAITS it before navigating to Stripe.
    // criticalProfile: true means a profile write failure will throw, which the
    // Paywall will catch and surface as an error, blocking checkout.
    const persistTask = persistUserState(
      profileWithId,
      plan || activePlan,
      null,
      { criticalProfile: true },
    ).then(() => {
      console.info('[onboarding] profile+plan persisted to DB');
    }).catch(err => {
      console.error('[onboarding] profile persistence failed — checkout will be blocked', err);
      // Null the ref so a retry Paywall open re-runs the gate cleanly (rejected
      // promises resolve immediately and would always block, so we clear them).
      onboardingPersistRef.current = null;
      throw err;  // re-throw so Paywall's await sees the rejection
    });
    onboardingPersistRef.current = persistTask;
    // ────────────────────────────────────────────────────────────────────────

    if (plan) {
      LS.set(LS_KEYS.activePlan, plan);
      setActivePlan(plan);
      // Background content generation — independent of the DB write above
      generateMealPlan(p, plan)
        .then(async (days) => {
          LS.set(LS_KEYS.mealplan, { weekKey: weekKey2(), days });
          try { await persistProgramArtifacts(p, plan, { mealDays: days }); } catch (e) { console.warn('[sync] onboarding meal_plans persistence failed (non-fatal)', e?.message); }
        })
        .catch(console.error);
      generateWorkoutPlan(p, plan)
        .then(async (days) => {
          LS.set(LS_KEYS.workoutplan, days);
          try { await persistProgramArtifacts(p, plan, { workoutDays: days }); } catch (e) { console.warn('[sync] onboarding workout_programs persistence failed (non-fatal)', e?.message); }
        })
        .catch(console.error);
      generateMissions(p, plan)
        .then(missions => { LS.set('massiq:missions', missions); })
        .catch(console.error);
    }
  };

  const handleFoodScanComplete = async (payload = {}) => {
    if (!session?.access_token) return;
    const data = await recordFoodScanSuccess(session.access_token, payload);
    const fl = data?.food_log;
    if (fl && fl.ok === false && fl.skip_reason !== 'no_valid_calories') {
      setToast('Meal saved in app; server could not store nutrition log. Check connection or try again.');
    }
    if (session?.user?.id) {
      try {
        const ent = await fetchUserEntitlements(session.access_token, session.user.id);
        setEntitlements(ent);
      } catch {}
    }
  };

  const showToast = (msg) => setToast(msg);

  // 1. Auth not ready — show loading. Never use boot null as final auth state.
  if (!authReady) {
    return <div style={{ background: C.bg, minHeight: '100dvh' }} />;
  }

  // 2. Premium activation in progress (user has session, polling subscription)
  if (checkoutActivating) {
    return (
      <div style={{ background: C.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: `2px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>Activating premium...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 3. No session — NEVER show login when checkout_success until retries exhausted
  if (!session?.access_token) {
    const hasCheckoutSuccess = typeof window !== 'undefined' && window.location?.search?.includes('checkout_success=1');
    const stored = getStoredSession();
    const shouldShowRestoring = hasCheckoutSuccess && !checkoutRetryExhausted;

    if (shouldShowRestoring) {
      return (
        <div style={{ background: C.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: `2px solid ${C.green}`, borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>Restoring session...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // Only reach here when: no session AND (no checkout_success OR retries exhausted)
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const checkoutOrigin = typeof window !== 'undefined' ? localStorage.getItem('massiq:checkout-origin') : null;
    const originMismatch = !!(checkoutOrigin && origin && checkoutOrigin !== origin);
    if (process.env.NODE_ENV !== 'production') {
      console.info('[auth:login-render] showing login — exact condition', {
        checkout_success: hasCheckoutSuccess,
        authReady,
        checkoutRetryExhausted,
        getSession_result: !!session,
        hasStoredSession: !!stored,
        url: typeof window !== 'undefined' ? window.location.href : '',
        origin,
        checkout_origin_stored: checkoutOrigin,
        origin_mismatch: originMismatch,
      });
    }
    const loginNotice = hasCheckoutSuccess && originMismatch
      ? 'You may have returned to a different URL. Sign in to activate premium.'
      : authNotice;
    return <AuthScreen onSubmit={handleAuthSubmit} onForgotPassword={handlePasswordReset} loading={authBusy} error={authError} notice={loginNotice} />;
  }

  // 4. Still loading profile/data
  if (!ready) return <div style={{ background: C.bg, minHeight: '100dvh' }} />;

  const profileComplete = profile && (profile.name || '').trim() && profile.age && profile.weightLbs && profile.heightCm;
  if (process.env.NODE_ENV !== 'production') {
    console.info('[route:decision]', {
      userId:           session?.user?.id ?? null,
      sessionPresent:   !!session?.access_token,
      hydrationComplete: ready,
      profileFound:     !!profile,
      profileComplete:  !!profileComplete,
      premium:          subscription?.status ?? 'none',
      decision:         !session?.access_token ? 'auth' : profileComplete && !editing ? 'app' : 'onboarding',
    });
  }
  if (!profileComplete || editing) return (
    <>
      <style>{CSS}</style>
      <Onboarding onComplete={handleOnboardingComplete} currentUserId={session?.user?.id} isEditing={editing} />
    </>
  );

  const refreshEntitlementsForScan = async () => {
    if (!session?.access_token) return null;
    const uid = session?.user?.id ?? session?.user_id;
    if (!uid) return null;
    const ent = await fetchUserEntitlements(session.access_token, uid);
    setEntitlements(ent);
    if (ent && process.env.NODE_ENV !== 'production') {
      console.info('[entitlements] hydrated from DB', {
        free_scans_used: ent.free_scans_used,
        free_scan_limit: ent.free_scan_limit,
        lifetime_scan_count: ent.lifetime_scan_count,
      });
    }
    return ent;
  };

  const renderTab = () => {
    const content = (() => {
      switch (tab) {
        case 'home':      return <HomeTab profile={profile} activePlan={activePlan} setTab={setTab} showToast={showToast} scanHistory={scanHistory} subscription={subscription} entitlements={entitlements} onUpgrade={() => setPaywallOpen(true)} userId={session?.user?.id} accessToken={session?.access_token} onFoodScanComplete={handleFoodScanComplete} />;
        case 'nutrition': return <NutritionTab profile={profile} activePlan={activePlan} showToast={showToast} setTab={setTab} subscription={subscription} onUpgrade={() => setPaywallOpen(true)} userId={session?.user?.id} accessToken={session?.access_token} entitlements={entitlements} onFoodScanComplete={handleFoodScanComplete} />;
        case 'scan':      return <ScanTab profile={profile} setTab={setTab} showToast={showToast} subscription={subscription} entitlements={entitlements} parentScanHistory={scanHistory} onPersistProgramArtifacts={persistProgramArtifacts} onPlanApplied={async (p, entry) => { const prevPlan = activePlan; setActivePlan(p); await persistUserState(profile, p, entry, { previousPlan: prevPlan }); await refreshEntitlementsForScan(); const uid = session?.user?.id ?? session?.user_id; if (session?.access_token && uid) { const fresh = await fetchUserEntitlements(session.access_token, uid); setEntitlements(fresh); } }} onRefreshEntitlements={refreshEntitlementsForScan} isLoggedIn={!!session?.access_token} />;
        case 'plan':      return <PlanTab profile={profile} activePlan={activePlan} setTab={setTab} showToast={showToast} subscription={subscription} onUpgrade={() => setPaywallOpen(true)} />;
        case 'profile':   return (
          <ProfileTab
            profile={profile}
            scanHistoryFromDb={scanHistory}
            setTab={setTab}
            onEditProfile={handleEditProfile}
            onDeleteScanHistory={handleDeleteScanHistory}
            onDeleteAccount={handleDeleteAccount}
            onLogout={handleLogout}
            showToast={showToast}
            subscription={subscription}
            accessToken={session?.access_token || null}
            onUpgrade={() => setPaywallOpen(true)}
            onUpdateUnits={(unit) => {
              const updated = { ...profile, unitSystem: unit };
              setProfile(updated);
              LS.set(LS_KEYS.profile, updated);
              persistUserState(updated, activePlan);
            }}
          />
        );
        default: return null;
      }
    })();
    return <TabErrorBoundary key={tab}>{content}</TabErrorBoundary>;
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
        <div className="miq-main-scroll" style={{ flex: 1, minWidth: 0 }}>
          <div className="app-content" style={{ maxWidth: 480, margin: '0 auto' }}>
            {renderTab()}
          </div>
        </div>
      </div>

      <TabBar active={tab} setTab={setTab} />
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {paywallOpen && (
        <Paywall
          userId={session?.user?.id}
          accessToken={session?.access_token}
          onClose={() => setPaywallOpen(false)}
          persistGate={onboardingPersistRef}
        />
      )}
    </>
  );
}
