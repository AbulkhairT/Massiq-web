/* ─── MassIQ — Calibrated Language System ────────────────────────────────
   Single source of truth for how physique traits are described.
   Every description key here maps to a specific visible range.
   Rules: relative not absolute, no speculation about history, no harsh labels.
────────────────────────────────────────────────────────────────────────── */

/* ── Body fat descriptors ────────────────────────────────────────────────
   Keyed by gender → sorted ranges. Use the first entry where bf ≤ max.     */

export const BF_DESCRIPTORS = {
  Male: [
    { max: 8,   label: 'very lean',     desc: 'very lean with visible muscle definition and vascularity throughout' },
    { max: 12,  label: 'lean',          desc: 'lean with good muscle definition visible across the upper body' },
    { max: 15,  label: 'moderately lean', desc: 'moderately lean with definition visible in the upper body and shoulders' },
    { max: 20,  label: 'moderate',      desc: 'moderate body fat, with soft tissue present primarily over the midsection' },
    { max: 25,  label: 'elevated',      desc: 'body fat elevated relative to lean mass, limiting visible definition in most areas' },
    { max: 100, label: 'high',          desc: 'higher body fat level with soft tissue coverage throughout' },
  ],
  Female: [
    { max: 16,  label: 'very lean',     desc: 'very lean with visible muscle definition in the upper body and limbs' },
    { max: 20,  label: 'lean',          desc: 'lean with good athletic definition, particularly in the upper body' },
    { max: 25,  label: 'moderately lean', desc: 'moderately lean with natural soft tissue in the lower body and midsection' },
    { max: 30,  label: 'moderate',      desc: 'moderate body fat with soft tissue present in the midsection and lower body' },
    { max: 35,  label: 'elevated',      desc: 'body fat elevated relative to lean mass, with limited definition visible' },
    { max: 100, label: 'high',          desc: 'higher body fat level with soft tissue coverage throughout' },
  ],
}

export function getBFDescriptor(bf: number, gender: 'Male' | 'Female') {
  const table = BF_DESCRIPTORS[gender]
  return table.find(e => bf <= e.max) ?? table[table.length - 1]
}

/* ── Muscle development vocabulary ──────────────────────────────────────
   5 tiers. No negative language. All describe what IS there, not what isn't. */

export const DEVELOPMENT_VOCAB = {
  'not yet defined':  { displayLabel: 'Early stage',   barPct: 20, colour: 'red'    },
  'early':            { displayLabel: 'Developing',    barPct: 30, colour: 'orange' },
  'moderate':         { displayLabel: 'Moderate',      barPct: 52, colour: 'gold'   },
  'solid':            { displayLabel: 'Solid',         barPct: 72, colour: 'green'  },
  'well-developed':   { displayLabel: 'Well developed',barPct: 88, colour: 'green'  },
} as const

export type DevLevel = keyof typeof DEVELOPMENT_VOCAB

/** Map old vocab (from previous prompt) to new vocab so old scan records still display */
export const LEGACY_DEV_MAP: Record<string, DevLevel> = {
  'underdeveloped': 'not yet defined',
  'average':        'moderate',
  'well-developed': 'well-developed',
  'early':          'early',
  'moderate':       'moderate',
  'solid':          'solid',
  'not yet defined':'not yet defined',
}

export function normaliseDev(raw: string): DevLevel {
  return LEGACY_DEV_MAP[raw?.toLowerCase?.()] ?? 'moderate'
}

/* ── Physique / symmetry score calibration ───────────────────────────────
   Prevents Claude from giving harsh low scores (0–30) for average physiques. */

export const SCORE_BANDS = {
  physique: [
    { min: 0,  max: 39,  label: 'early stage',       guidance: '30–45' },  // nobody should get < 30
    { min: 40, max: 55,  label: 'developing',         guidance: '40–55' },
    { min: 56, max: 69,  label: 'moderate',           guidance: '56–69' },
    { min: 70, max: 82,  label: 'good',               guidance: '70–82' },
    { min: 83, max: 100, label: 'excellent',           guidance: '83–95' },
  ],
  symmetry: [
    { min: 0,  max: 59,  label: 'notable imbalance',  guidance: 'rare — only if obvious' },
    { min: 60, max: 74,  label: 'some asymmetry',     guidance: '60–74' },
    { min: 75, max: 87,  label: 'reasonably balanced', guidance: '75–87' },
    { min: 88, max: 100, label: 'well balanced',      guidance: '88–95' },
  ],
}

/* ── Words that must never appear in Claude output ───────────────────────*/

export const FORBIDDEN_WORDS = [
  'underdeveloped', 'below average', 'above average', 'poor', 'lacks',
  'lacking', 'weak', 'weakness', 'bad', 'terrible', 'limited training',
  'training history', 'experience level', 'beginner', 'advanced', 'novice',
  'disappointing', 'unfortunately', 'problem', 'bad news', 'concerning',
  'alarming', 'worrying', 'subpar', 'inadequate',
] as const

/* ── Confidence level modifiers ─────────────────────────────────────────
   Applied to language based on available visual information quality.        */

export const CONFIDENCE_LANGUAGE = {
  high: {
    assertPrefix:   '',
    qualifier:      'appears',
    comparePrefix:  'relative to',
    hedge:          '',
  },
  medium: {
    assertPrefix:   '',
    qualifier:      'appears to be',
    comparePrefix:  'relative to the overall frame,',
    hedge:          'Based on what is visible, ',
  },
  low: {
    assertPrefix:   'It is difficult to assess precisely, but ',
    qualifier:      'may suggest',
    comparePrefix:  'if comparing relative proportions,',
    hedge:          'Photo quality limits precision here — ',
  },
} as const

/* ── The system prompt fragment injected into every scan request ────────
   This is the authoritative language rule set given to Claude.              */

export function buildScanSystemPrompt(gender: 'Male' | 'Female', bfHint?: number): string {
  const bfExample = gender === 'Male' ? '15-18%' : '22-26%'
  return `You are a physique analysis assistant. Your job is to describe visible body composition traits in a measured, professional, non-judgmental way — like an experienced coach reviewing a photo with a client.

CORE RULES:
1. Describe only what is VISIBLE. Never infer training history, lifestyle, habits, or experience.
2. All comparisons must be RELATIVE to the person's own frame — never to external standards.
3. Express uncertainty honestly. If a trait is hard to assess from this photo, say so.
4. Use calibrated language based on what you can actually see, not what you assume.

FORBIDDEN — do not use these words or phrases:
underdeveloped, below average, above average, lacks, lacking, weak, limited training, training history, experience level, beginner, poor development, bad, concerning, inadequate, subpar, disappointing

MUSCLE DEVELOPMENT — use ONLY these five levels:
- "not yet defined" — very early stage, shape not yet clearly visible
- "early" — beginning to take shape, limited definition
- "moderate" — clearly present, moderate development visible
- "solid" — well developed with clear shape and some definition
- "well-developed" — pronounced development with clear definition

MUSCLE COMPARISONS — always frame relative to the person's own body:
✗ "Chest is underdeveloped"
✓ "Chest appears less pronounced relative to shoulder width"
✗ "Low muscle mass"
✓ "Muscle development appears moderate overall"

BODY FAT — provide a 2% range, use the midpoint for bodyFatPct:
${gender === 'Male'
  ? '< 8% very lean | 8-12% lean | 12-15% moderately lean | 15-20% moderate | 20-25% elevated | >25% high'
  : '< 16% very lean | 16-20% lean | 20-25% moderately lean | 25-30% moderate | 30-35% elevated | >35% high'}
Estimate conservatively — photos typically make people look leaner than they are.
Likely range for this person: approximately ${bfHint ? `${bfHint - 4}–${bfHint + 4}%` : bfExample}

PHYSIQUE SCORE (physiqueScore): 30–95 range.
- 30–45: early stage development with elevated body fat
- 46–60: developing physique, moderate body fat
- 61–72: moderate development, reasonably lean
- 73–82: good development and leanness
- 83–95: excellent — only for clearly elite physiques

SYMMETRY SCORE (symmetryScore): 60–95 range.
- Most people are 70–85. Only go below 70 if there is an obvious structural asymmetry.

DIAGNOSIS SECTION — write as a coach, not a critic:
- Start with what is working or what is present
- Frame development gaps as opportunity, not deficit
- Never begin with a negative observation

PRIORITY AREAS — describe as specific, relative observations:
✗ "Core needs work"
✓ "Core definition is not yet clearly visible relative to upper body development"

OUTPUT FORMAT — return ONLY valid JSON, no markdown:`
}
