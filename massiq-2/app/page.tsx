"use client";
import { useEffect } from "react";
import { Icon } from '../components/Icon';

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg:          '#0A0D0A',
  bg2:         '#0D100D',
  card:        'rgba(255,255,255,0.028)',
  cardSolid:   '#111411',
  border:      'rgba(255,255,255,0.08)',
  borderHi:    'rgba(108,178,140,0.18)',
  green:       '#72B895',        /* soft sage — muted, not neon */
  greenBg:     'rgba(108,178,140,0.07)',
  white:       '#FFFFFF',
  muted:       'rgba(255,255,255,0.58)',
  dim:         'rgba(255,255,255,0.28)',
  orange:      '#D4724A',        /* toned down from neon */
};

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: ${C.bg};
    color: ${C.white};
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  a { text-decoration: none; color: inherit; }
  button { cursor: pointer; border: none; background: none; font-family: inherit; }

  /* ── Fade-up ── */
  .fu { opacity: 0; transform: translateY(26px); transition: opacity .65s ease, transform .65s ease; }
  .fu.vis { opacity: 1; transform: translateY(0); }
  .d1 { transition-delay: .08s; }
  .d2 { transition-delay: .17s; }
  .d3 { transition-delay: .26s; }
  .d4 { transition-delay: .35s; }
  .d5 { transition-delay: .44s; }

  /* ── Animations ── */
  @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }

  .float { animation: float 6s ease-in-out infinite; }

  /* ── Nav ── */
  .nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(8,12,8,0.88);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid ${C.border};
  }
  .nav-inner {
    max-width: 1120px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
  }
  .nav-logo { font-size: 18px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; color: ${C.white}; }
  .nav-sign-in { display: none; }
  .nav-actions { display: flex; align-items: center; gap: 12px; }
  .nav-link { font-size: 13px; color: ${C.muted}; font-weight: 500; transition: color .15s; }
  .nav-link:hover { color: ${C.white}; }
  .nav-btn {
    display: inline-flex; align-items: center;
    background: ${C.green}; color: #000; font-weight: 700;
    font-size: 13px; padding: 8px 16px; border-radius: 99px;
    transition: opacity .15s ease, transform .15s ease;
  }
  .nav-btn:hover { opacity: .88; transform: scale(1.02); }

  /* ── Sections ── */
  .sec { padding: 80px 20px; }
  .sec-inner { max-width: 1120px; margin: 0 auto; }

  /* ── Section label — consistent everywhere ── */
  .lbl {
    font-size: 10px; font-weight: 600; letter-spacing: 2.5px;
    text-transform: uppercase; color: ${C.green}; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .lbl-dot { width: 4px; height: 4px; border-radius: 50%; background: ${C.green}; flex-shrink: 0; opacity: 0.7; }

  /* ── Section headings ── */
  .sec-h2 { font-size: 34px; font-weight: 800; line-height: 1.1; letter-spacing: -1px; color: ${C.white}; }
  .cta-h2 { font-size: 38px; font-weight: 800; line-height: 1.08; letter-spacing: -1.5px; color: ${C.white}; }

  /* ── Hero ── */
  .hero-sec { padding: 88px 20px 80px; position: relative; overflow: hidden; }
  .hero-grid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
  .hero-h1 {
    font-size: 46px; font-weight: 800; line-height: 1.07;
    letter-spacing: -2px; color: ${C.white}; margin-bottom: 22px;
    position: relative; z-index: 1;
  }
  .hero-sub { font-size: 17px; color: ${C.muted}; line-height: 1.68; max-width: 500px; }
  .hero-ctas { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 36px; }
  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center;
    background: ${C.green}; color: #0A0D0A; font-weight: 700;
    font-size: 15px; padding: 16px 32px; border-radius: 99px;
    transition: opacity .15s ease, transform .15s ease;
    width: fit-content;
  }
  .btn-primary:hover { opacity: .88; transform: translateY(-1px); }
  .btn-ghost {
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.04); color: ${C.muted}; font-weight: 600;
    font-size: 14px; padding: 14px 28px; border-radius: 99px;
    border: 1px solid ${C.border};
    transition: background .15s ease, color .15s ease;
    width: fit-content;
  }
  .btn-ghost:hover { background: rgba(255,255,255,0.1); color: ${C.white}; }
  .hero-trust { font-size: 12px; color: ${C.dim}; margin-top: 14px; }

  /* ── Intelligence panel ── */
  .panel-wrap { display: flex; justify-content: center; align-items: center; }

  /* ── Proof strip ── */
  .proof-strip {
    border-top: 1px solid ${C.border};
    border-bottom: 1px solid ${C.border};
    background: transparent;
    padding: 16px 20px;
  }
  .proof-inner {
    max-width: 1120px; margin: 0 auto;
    display: flex; flex-direction: row; align-items: center;
    gap: 0; justify-content: space-evenly;
    overflow: hidden; text-align: center;
  }
  .proof-item { min-width: 0; flex: 1; padding: 0 6px; }
  .proof-item-stat { font-size: 11px; font-weight: 700; color: ${C.white}; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .proof-item-sub { font-size: 10px; color: ${C.dim}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .proof-divider { display: none; width: 1px; height: 28px; background: ${C.border}; flex-shrink: 0; }

  /* ── Problem contrast ── */
  .contrast-pair {
    display: grid; grid-template-columns: 1fr; gap: 20px;
    align-items: stretch;
  }

  /* ── Steps — mobile: vertical list ── */
  .steps-mobile { display: flex; flex-direction: column; }
  .step-m-item { display: flex; gap: 20px; align-items: flex-start; }
  .step-m-left { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
  .step-m-circle {
    width: 48px; height: 48px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; flex-shrink: 0;
  }
  .step-m-vline { width: 1px; flex: 1; min-height: 32px; margin: 6px 0; background: rgba(255,255,255,0.07); }
  .step-m-body { flex: 1; padding: 7px 0 36px; }

  /* Steps — desktop: grid with single connecting line ── */
  .steps-desktop { display: none; }

  /* ── Diagnosis cards ── */
  .diag-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }

  /* ── Comparison ── */
  .comp-wrap { overflow-x: auto; }
  .comp-table { width: 100%; border-collapse: collapse; min-width: 540px; }
  .comp-table th {
    padding: 12px 16px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: 2.5px;
    text-transform: uppercase; color: ${C.dim};
    border-bottom: 1px solid ${C.border};
  }
  .comp-table th.massiq-th { color: ${C.white}; }
  .comp-table td {
    padding: 13px 16px; font-size: 13px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    vertical-align: middle;
  }
  .comp-table td:first-child { color: ${C.muted}; }
  .comp-table .ck { color: ${C.green}; font-size: 15px; }
  .comp-table .cx { color: rgba(255,255,255,0.12); font-size: 15px; }
  .comp-table .massiq-td { background: rgba(255,255,255,0.03); }

  /* ── Outcome grid ── */
  .outcome-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }

  /* ── Footer ── */
  .footer-row {
    max-width: 1120px; margin: 0 auto;
    display: flex; flex-direction: column;
    align-items: center; gap: 10px; text-align: center;
    padding: 0 20px;
  }

  /* ── Desktop overrides (768px+) ── */
  @media (min-width: 768px) {
    .nav-sign-in { display: inline; }
    .nav-inner { padding: 16px 24px; }
    .nav-btn { padding: 9px 22px; }
    .sec { padding: 120px 60px; }
    .hero-sec { padding: 112px 60px 100px; }
    .hero-grid { grid-template-columns: 1fr 1fr; gap: 80px; }
    .hero-h1 { font-size: 76px; letter-spacing: -3px; }
    .hero-sub { font-size: 18px; }
    .hero-ctas { flex-direction: row; align-items: center; }
    .panel-wrap { justify-content: flex-end; }
    .proof-inner { justify-content: center; gap: 52px; }
    .proof-item { padding: 0; }
    .proof-item-stat { font-size: 14px; margin-bottom: 3px; white-space: normal; overflow: visible; text-overflow: clip; }
    .proof-item-sub { font-size: 12px; white-space: normal; overflow: visible; text-overflow: clip; }
    .proof-divider { display: block; }
    .contrast-pair { grid-template-columns: 1fr 1fr; gap: 24px; }
    .steps-mobile { display: none; }
    .steps-desktop { display: block; }
    .diag-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .outcome-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .footer-row { flex-direction: row; justify-content: space-between; text-align: left; padding: 0 60px; }
    .sec-h2 { font-size: 52px; letter-spacing: -2px; }
    .cta-h2 { font-size: 62px; letter-spacing: -2.5px; }
  }
`;

/* ─── Fade-up hook ────────────────────────────────────────────────────────── */
function useFadeUp() {
  useEffect(() => {
    const els = document.querySelectorAll(".fu");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("vis"); io.unobserve(e.target); }
      }),
      { threshold: 0.08 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── Section label ───────────────────────────────────────────────────────── */
function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="lbl">
      <span className="lbl-dot" />
      {children}
    </div>
  );
}

/* ─── Intelligence Panel ──────────────────────────────────────────────────── */
function IntelPanel() {
  const actions = [
    { arrow: '↑', label: 'Protein', from: '185g',     to: '215g',     color: C.green  },
    { arrow: '↓', label: 'Deficit', from: '620 kcal', to: '380 kcal', color: C.orange },
    { arrow: '↑', label: 'Sleep',   from: '6.5 hrs',  to: '8 hrs',    color: C.green  },
  ];
  return (
    <div className="float" style={{
      background: '#101410',
      border: `1px solid rgba(255,255,255,0.1)`,
      borderRadius: 20,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 380,
      boxShadow: `0 24px 56px rgba(0,0,0,0.45)`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 16px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: `1px solid rgba(255,255,255,0.07)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, opacity: 0.8 }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', color: C.muted, textTransform: 'uppercase' }}>
            Body Scan · Mar 15
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.dim }}>Week 4 / 12</span>
      </div>

      {/* BF% → target */}
      <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 3 }}>Current Body Fat</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.white, lineHeight: 1, letterSpacing: '-1px' }}>17.2%</div>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 18 }}>→</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 3 }}>Target</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.green, lineHeight: 1, letterSpacing: '-1px' }}>12%</div>
          </div>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: '40%', background: C.green, borderRadius: 99 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: C.dim }}>Week 4</span>
          <span style={{ fontSize: 10, color: C.dim }}>~10 weeks to target</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        {[
          { label: 'Lean Mass', value: '152.4 lb', accent: false },
          { label: 'Symmetry',  value: '81/100',   accent: false },
          { label: 'Phase',     value: 'CUT',       accent: true  },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 12px', textAlign: 'center',
            borderRight: i < 2 ? `1px solid rgba(255,255,255,0.05)` : 'none',
          }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.accent ? C.orange : C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Diagnosis */}
      <div style={{ padding: '13px 16px', background: 'rgba(255,80,50,0.04)', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>Diagnosis</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="bolt" size={14} color="#D4724A" />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 3 }}>Cutting too aggressively</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>Protein is insufficient at this deficit. Lean mass is at risk.</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '13px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>Adjust Now</div>
        {actions.map(a => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: a.color, width: 12, textAlign: 'center' }}>{a.arrow}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{a.label}</span>
            </div>
            <div style={{ fontSize: 11, color: C.white, fontWeight: 600 }}>
              <span style={{ color: C.dim, textDecoration: 'line-through', marginRight: 5 }}>{a.from}</span>
              {a.to}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.dim }}>Next scan: Apr 12</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>18 days →</span>
      </div>
    </div>
  );
}

/* ─── Step data ───────────────────────────────────────────────────────────── */
const STEPS = [
  {
    n: '01', label: 'Scan',
    title: 'Upload a physique photo',
    body: 'AI reviews your photo and profile details to estimate body-composition ranges (body-fat %, lean mass trend, and symmetry signals). Results are confidence-based estimates, not medical diagnostics.',
  },
  {
    n: '02', label: 'Diagnose',
    title: 'Get a precise reading',
    body: 'MassIQ highlights your most likely limiting factor (fat-loss rate, lean-mass risk, or phase mismatch) and explains why that conclusion was selected.',
  },
  {
    n: '03', label: 'Execute',
    title: 'Run your exact plan',
    body: 'Get a structured 12-week plan with calorie and protein targets, training priorities, sleep guidance, step goals, and weekly checkpoints tailored to your current data.',
  },
  {
    n: '04', label: 'Adapt',
    title: 'Scan again. Update everything.',
    body: 'Each new scan and check-in updates your estimates and recommendations so your plan stays aligned with measurable progress over time.',
  },
];

/* ─── Landing page ────────────────────────────────────────────────────────── */
export default function LandingPage() {
  // If Supabase redirects a recovery link to the root URL (site-URL fallback when
  // redirect_to isn't in the allowlist), forward to the dedicated reset-password page.
  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      if (params.get('type') === 'recovery' && params.get('access_token')) {
        window.location.replace(`/reset-password#${hash}`);
      }
    } catch {}
  }, []);

  useFadeUp();

  return (
    <>
      <style>{CSS}</style>

      {/* ═══════════════════════════════════════════════════════════
          NAV
      ═══════════════════════════════════════════════════════════ */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-logo">MassIQ</div>
          <div className="nav-actions">
            <a href="/app" className="nav-link nav-sign-in">Sign in</a>
            <a href="/app" className="nav-btn">Get started</a>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="hero-sec" style={{ background: C.bg }}>
        <div className="hero-grid sec-inner">
          {/* Copy */}
          <div>
            <div className="fu" style={{ marginBottom: 24 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 99, padding: '5px 14px',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, display: 'inline-block', opacity: 0.8 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                  Physique Intelligence
                </span>
              </div>
            </div>

            {/* H1 */}
            <div className="fu d1">
              <h1 className="hero-h1">
                Know exactly<br />
                what&apos;s holding<br />
                your physique back.
              </h1>
            </div>

            <p className="fu d2 hero-sub">
              MassIQ scans your body, diagnoses what&apos;s actually
              happening, and gives you a precise plan — then updates
              every time you scan again. Snap your meals to track
              calories. Not a step tracker. A system.
            </p>

            <div className="fu d3 hero-ctas">
              <a href="/app" className="btn-primary">Run Your First Scan →</a>
              <a href="#how" className="btn-ghost">See how it works</a>
            </div>
            <div className="fu d4 hero-trust">
              Free to start · No download required · Private
            </div>
          </div>

          {/* Intelligence panel — desktop only */}
          <div className="panel-wrap fu d2">
            <IntelPanel />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PROOF STRIP
      ═══════════════════════════════════════════════════════════ */}
      <div className="proof-strip">
        <div className="proof-inner">
          {[
            { stat: 'Public Beta',      sub: 'AI physique analysis'               },
            { stat: 'AI-Powered',       sub: 'Vision + physiology engine'         },
            { stat: 'Body + Food Scan', sub: 'Physique analysis + meal tracking'  },
          ].map((p, i) => (
            <>
              {i > 0 && <div key={`div-${i}`} className="proof-divider" />}
              <div key={p.stat} className="proof-item">
                <div className="proof-item-stat">{p.stat}</div>
                <div className="proof-item-sub">{p.sub}</div>
              </div>
            </>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PROBLEM — CONTRAST
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg2 }}>
        <div className="sec-inner">
          <div className="fu" style={{ maxWidth: 640, marginBottom: 52 }}>
            <Lbl>The Problem</Lbl>
            <h2 className="sec-h2" style={{ marginBottom: 18 }}>
              You&apos;ve been tracking inputs.<br />Not outcomes.
            </h2>
            <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7 }}>
              Calorie apps tell you what you ate. Step trackers tell you how far you walked.
              Neither one tells you what&apos;s actually happening to your body —
              or what to do differently.
            </p>
          </div>

          <div className="contrast-pair fu d1">

            {/* ── Left: what your current app tells you ── */}
            <div style={{
              background: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20, padding: 32,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, flexShrink: 0,
                }}><Icon name="chart-bar" size={16} color="#556655" /></div>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '2px',
                  textTransform: 'uppercase', color: '#556655',
                }}>What your current app tells you</span>
              </div>

              {[
                '"You ate 2,140 calories today."',
                '"You walked 7,432 steps."',
                '"You\'re 0.8 lbs below your goal weight."',
                '"Your streak is 14 days."',
              ].map(line => (
                <div key={line} style={{
                  fontSize: 15, color: '#6B7280',
                  padding: '14px 18px',
                  background: '#222222',
                  borderRadius: 10, marginBottom: 8,
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontStyle: 'italic', lineHeight: 1.5,
                }}>{line}</div>
              ))}

              <div style={{
                marginTop: 16, fontSize: 13, color: '#4B5563',
                fontStyle: 'italic', lineHeight: 1.6,
              }}>
                None of this tells you whether you&apos;re gaining muscle or losing fat.
                None of it tells you if your plan is actually working.
              </div>
            </div>

            {/* ── Right: what MassIQ tells you ── */}
            <div style={{
              background: C.cardSolid,
              border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 20, padding: 32,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, flexShrink: 0,
                }}><Icon name="brain" size={16} color="#72B895" /></div>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '2px',
                  textTransform: 'uppercase', color: C.white,
                }}>What MassIQ tells you</span>
              </div>

              {[
                { heading: 'Where you are',         body: 'Body fat: 17.2%. Lean mass: 152.4 lb. Symmetry score: 81/100.' },
                { heading: 'What\'s holding you back', body: 'Your deficit is too aggressive. At this rate, you\'re losing lean mass.' },
                { heading: 'Your exact next move',  body: 'Increase protein to 215g. Drop deficit to 380 kcal. Sleep 8 hrs.' },
                { heading: 'Your trajectory',       body: 'On track for 12% body fat in ~10 weeks if you follow the adjusted plan.' },
              ].map(item => (
                <div key={item.heading} style={{
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 10, marginBottom: 8,
                  border: `1px solid rgba(255,255,255,0.07)`,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: C.green,
                    letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4,
                  }}>{item.heading}</div>
                  <div style={{ fontSize: 14, color: C.white, lineHeight: 1.5 }}>{item.body}</div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          HOW IT WORKS — 4 STEPS
      ═══════════════════════════════════════════════════════════ */}
      <section id="how" className="sec" style={{ background: C.bg }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 56, maxWidth: 520 }}>
            <Lbl>The System</Lbl>
            <h2 className="sec-h2">Scan. Diagnose. Execute. Adapt.</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginTop: 14 }}>
              Built for practical coaching decisions: conservative estimates, transparent reasoning, and updates based on your latest check-ins.
            </p>
          </div>

          {/* ── Mobile: vertical list ── */}
          <div className="steps-mobile fu d1">
            {STEPS.map((s, i) => (
              <div key={s.n} className="step-m-item">
                <div className="step-m-left">
                  <div className="step-m-circle" style={{
                    background: i === 0 ? C.green : 'transparent',
                    color: i === 0 ? '#0A0D0A' : C.muted,
                    border: i === 0 ? 'none' : `1px solid rgba(255,255,255,0.14)`,
                  }}>{s.n}</div>
                  {i < STEPS.length - 1 && <div className="step-m-vline" />}
                </div>
                <div className="step-m-body">
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.white, marginBottom: 8, lineHeight: 1.3 }}>{s.title}</div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: grid with single connecting line ── */}
          <div className="steps-desktop fu d1">
            <div style={{ position: 'relative' }}>
              {/* Single line connecting all 4 circle centers */}
              <div style={{
                position: 'absolute',
                top: 24,
                left: 'calc(12.5%)',
                right: 'calc(12.5%)',
                height: 1,
                background: 'rgba(255,255,255,0.07)',
                zIndex: 0,
              }} />

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                alignItems: 'start',
              }}>
                {STEPS.map((s, i) => (
                  <div key={s.n} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', textAlign: 'center',
                    padding: '0 16px',
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      background: i === 0 ? C.green : 'transparent',
                      color: i === 0 ? '#0A0D0A' : C.muted,
                      border: i === 0 ? 'none' : `1px solid rgba(255,255,255,0.14)`,
                      position: 'relative', zIndex: 1,
                      flexShrink: 0,
                      marginBottom: 24,
                    }}>{s.n}</div>

                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 10, lineHeight: 1.3 }}>{s.title}</div>
                    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{s.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          INTELLIGENCE — WHAT MASSIQ DIAGNOSES
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg2 }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 48, maxWidth: 600 }}>
            <Lbl>Body Intelligence</Lbl>
            <h2 className="sec-h2" style={{ marginBottom: 18 }}>
              MassIQ doesn&apos;t log your data.<br />It interprets your body.
            </h2>
            <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7 }}>
              Most tools record what you do. MassIQ reads what&apos;s actually happening
              and tells you specifically what to change — and why.
            </p>
          </div>

          <div className="diag-grid">
            {[
              {
                icon: 'bolt', tag: 'Fat Loss Phase', delay: 'd1',
                title: 'You\'re losing weight too fast',
                body: 'Your caloric deficit is too aggressive for your lean mass target. At this rate, you\'ll lose muscle. The fix: reduce deficit by 220 kcal, increase protein by 30g.',
              },
              {
                icon: 'scale', tag: 'Body Composition', delay: 'd2',
                title: 'Your symmetry is imbalanced',
                body: 'Upper-body development is lagging significantly behind lower body. Training focus should shift to chest, shoulders, and arms for the next 4–6 weeks.',
              },
              {
                icon: 'rotate', tag: 'Phase Shift', delay: 'd3',
                title: 'Time to stop cutting',
                body: 'You\'ve reached 13.1% body fat — your target. Continuing the cut risks lean mass loss. MassIQ is shifting you to a recomposition phase.',
              },
              {
                icon: 'bowl', tag: 'Food Scan', delay: 'd1',
                title: 'Scan food. Get instant macros.',
                body: 'Snap a photo of your meal and MassIQ estimates calories, protein, carbs, and fat — keeping your nutrition aligned with your body scan targets.',
              },
              {
                icon: 'chart-bar', tag: 'Progress Tracking', delay: 'd2',
                title: 'See how your body changes',
                body: 'Track body fat, symmetry, and muscle development across scans — and see exactly what\u2019s improving over time.',
              },
              {
                icon: 'brain', tag: 'Continuous Intelligence', delay: 'd3',
                title: 'Built to evolve with you',
                body: 'Your plan adapts after every scan — adjusting nutrition and training as your body changes.',
              },
            ].map(card => (
              <div key={card.title} className={`fu ${card.delay}`} style={{
                background: C.cardSolid, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: 28,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, marginBottom: 16,
                }}><Icon name={card.icon} size={20} color="rgba(255,255,255,0.65)" strokeWidth={1.5} /></div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: C.muted, marginBottom: 10 }}>
                  {card.tag}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 12, lineHeight: 1.3 }}>{card.title}</h3>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          COMPARISON
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 44 }}>
            <Lbl>How We&apos;re Different</Lbl>
            <h2 className="sec-h2">Not a tracker. A system.</h2>
          </div>

          <div className="fu d1 comp-wrap">
            <table className="comp-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}></th>
                  <th className="massiq-th">MassIQ</th>
                  <th>Calorie Tracker</th>
                  <th>Workout App</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Scans your body composition',         true, false, false],
                  ['Tells you your exact limiting factor', true, false, false],
                  ['Generates a personalized plan',        true, false, false],
                  ['Updates plan as body changes',         true, false, false],
                  ['Diagnoses your phase',                 true, false, false],
                  ['Daily targets from real data',         true, false, false],
                  ['Tells you exactly what to do next',   true, false, false],
                ].map(([label, a, b, c]) => (
                  <tr key={String(label)}>
                    <td>{label}</td>
                    <td className="massiq-td"><span className="ck">{a ? '✓' : '—'}</span></td>
                    <td><span className={b ? 'ck' : 'cx'}>{b ? '✓' : '—'}</span></td>
                    <td><span className={c ? 'ck' : 'cx'}>{c ? '✓' : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fu d2" style={{
            marginTop: 24, padding: '18px 24px',
            background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.08)`,
            borderRadius: 20,
            fontSize: 14, color: C.muted, lineHeight: 1.6,
          }}>
            <strong style={{ color: C.white }}>The difference: </strong>
            A calorie counter logs what you put in your body. MassIQ reads what your body is actually doing with it — and tells you when to change the plan.
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          OUTCOME
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg2 }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 48, maxWidth: 580 }}>
            <Lbl>The Outcome</Lbl>
            <h2 className="sec-h2" style={{ marginBottom: 18 }}>
              Clarity on where you are,<br />where you&apos;re going,<br />and what to do next.
            </h2>
          </div>

          <div className="outcome-grid">
            {[
              {
                num: '01', delay: 'd1',
                title: 'Know exactly where you stand',
                body: 'Body fat percentage. Lean mass. Muscle group development. Symmetry score. A real baseline — not a guess.',
              },
              {
                num: '02', delay: 'd2',
                title: 'Know your realistic trajectory',
                body: 'How long your target physique will take. What weekly rate to expect. When to switch phases. No false promises.',
              },
              {
                num: '03', delay: 'd3',
                title: 'Know your next move',
                body: 'Exact protein targets. Calorie targets adjusted for your phase. What to train. What to fix. Updated after every scan.',
              },
            ].map(card => (
              <div key={card.num} className={`fu ${card.delay}`} style={{
                background: C.cardSolid, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: 28,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: -20, right: -10,
                  fontSize: 80, fontWeight: 900,
                  color: 'rgba(255,255,255,0.02)',
                  letterSpacing: '-4px', lineHeight: 1,
                  pointerEvents: 'none', userSelect: 'none',
                }}>{card.num}</div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', color: C.dim, marginBottom: 14 }}>{card.num}</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.white, marginBottom: 12, lineHeight: 1.3 }}>{card.title}</h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          CREDIBILITY
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg, paddingTop: 60, paddingBottom: 60 }}>
        <div className="sec-inner">
          <div className="fu" style={{
            background: C.cardSolid, border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '40px 32px',
            maxWidth: 780, margin: '0 auto', textAlign: 'center',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 99, padding: '5px 14px', marginBottom: 24,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, display: 'inline-block', opacity: 0.8 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: '2px', textTransform: 'uppercase' }}>Public Beta</span>
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: C.white, marginBottom: 16, lineHeight: 1.3 }}>
              Built for people who are serious<br />about changing their physique.
            </h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 28px' }}>
              MassIQ is in public beta. Physique analysis uses AI vision and established
              physiological formulas — results are as accurate as current technology allows,
              but individual variation means estimates may not be exact.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
              {['No fake transformations', 'No generic plans', 'No guesswork'].map(point => (
                <div key={point} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 13, color: C.muted }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FINAL CTA
      ═══════════════════════════════════════════════════════════ */}
      <section className="sec" style={{
        background: C.bg2,
        textAlign: 'center',
      }}>
        <div className="fu sec-inner">
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <Lbl>Get Started</Lbl>
            <h2 className="cta-h2" style={{ marginBottom: 20 }}>
              Stop guessing.<br />Start running a system.
            </h2>
            <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 40px' }}>
              Your body changes every week. Your plan should too.
              MassIQ gives you the signal — not the noise.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <a href="/app" className="btn-primary" style={{ fontSize: 16, padding: '18px 40px' }}>
                Run Your First Scan →
              </a>
              <div style={{ fontSize: 13, color: C.dim }}>Free to start · No credit card · Public Beta</div>
              <div style={{ fontSize: 11, color: C.dim, maxWidth: 360, lineHeight: 1.6, textAlign: 'center', marginTop: 4 }}>
                Results are as accurate as current AI technology allows. Body composition estimates may vary. Always consult a qualified professional for medical decisions.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════ */}
      <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: '28px 0' }}>
        <div className="footer-row">
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: C.white, marginBottom: 4 }}>MassIQ</div>
            <div style={{ fontSize: 12, color: C.dim }}>The operating system for your physique.</div>
          </div>
          <div style={{ fontSize: 12, color: C.dim }}>
            <a href="/privacy" style={{ color: C.dim, transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.dim}>Privacy Policy</a>
            {' · '}
            <a href="/terms" style={{ color: C.dim, transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.dim}>Terms of Service</a>
          </div>
        </div>
      </footer>
    </>
  );
}
