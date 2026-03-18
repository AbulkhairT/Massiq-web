"use client";
import { useEffect } from "react";

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg:       '#0A0F0A',
  bg2:      '#0D130D',
  card:     '#141A14',
  border:   'rgba(255,255,255,0.08)',
  green:    '#00C853',
  greenBg:  'rgba(0,200,83,0.15)',
  greenDim: '#2D5A3D',
  white:    '#FFFFFF',
  muted:    '#8A9A8A',
  dimmed:   '#556655',
};

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    background:${C.bg};
    color:${C.white};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    overflow-x:hidden;
    -webkit-font-smoothing:antialiased;
  }
  a{text-decoration:none;color:inherit}
  button{cursor:pointer;border:none;font-family:inherit}

  /* ── Scroll fade-up ── */
  .fu{opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease}
  .fu.vis{opacity:1;transform:translateY(0)}
  .d1{transition-delay:.08s}
  .d2{transition-delay:.16s}
  .d3{transition-delay:.24s}
  .d4{transition-delay:.32s}
  .d5{transition-delay:.4s}

  /* ── Keyframes ── */
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
  .float{animation:float 4s ease-in-out infinite}
  .pulse{animation:pulse 2.5s ease-in-out infinite}

  /* ─────────────────────────────────────────────────────────────────────
     MOBILE-FIRST GRID RULES
     Default (mobile): single column
     Desktop (≥768px): multi-column via media query
  ───────────────────────────────────────────────────────────────────── */

  /* Hero: single col mobile, 2-col desktop */
  .hero-grid{
    display:grid;
    grid-template-columns:1fr;
    gap:40px;
    align-items:center;
  }

  /* 3-col card grids: single col mobile */
  .grid3{
    display:grid;
    grid-template-columns:1fr;
    gap:16px;
  }

  /* Loop steps: vertical mobile */
  .loop-steps{
    display:flex;
    flex-direction:column;
    gap:0;
  }
  .loop-step{
    display:flex;
    gap:16px;
    padding:20px 0;
    position:relative;
  }
  .loop-step-line{
    display:block;
  }
  .loop-arrow-h{display:none}

  /* Footer: stack on mobile */
  .footer-inner{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:8px;
    text-align:center;
  }

  /* Section padding: tighter on mobile */
  .sec{padding:60px 20px}
  .sec-inner{max-width:1100px;margin:0 auto}

  /* Hero padding */
  .hero-sec{
    padding:72px 20px 60px;
    position:relative;
    overflow:hidden;
  }

  /* Hero h1 */
  .hero-h1{
    font-size:40px;
    font-weight:800;
    color:${C.white};
    line-height:1.1;
    margin-bottom:20px;
  }

  /* Section h2 */
  .sec-h2{
    font-size:32px;
    font-weight:800;
    color:${C.white};
    line-height:1.15;
    margin-bottom:12px;
  }

  /* CTA final h2 */
  .cta-h2{
    font-size:36px;
    font-weight:800;
    color:${C.white};
    line-height:1.15;
    margin-bottom:16px;
  }

  /* App preview card hidden on mobile */
  .preview-wrap{display:none}

  /* ── Desktop overrides ── */
  @media(min-width:768px){
    .sec{padding:100px 60px}
    .hero-sec{padding:100px 60px 80px}

    .hero-grid{
      grid-template-columns:1fr 1fr;
      gap:64px;
    }

    .preview-wrap{display:flex;justify-content:center}

    .grid3{
      grid-template-columns:repeat(3,1fr);
      gap:24px;
    }

    .loop-steps{
      flex-direction:row;
      align-items:flex-start;
      justify-content:center;
    }
    .loop-step{
      flex-direction:column;
      flex:1;
      gap:0;
      padding:0 8px;
      text-align:center;
    }
    .loop-step-line{display:none}
    .loop-arrow-h{
      display:flex;
      align-items:center;
      padding-top:22px;
      flex-shrink:0;
    }

    .footer-inner{
      flex-direction:row;
      justify-content:space-between;
      text-align:left;
    }

    .hero-h1{font-size:72px}
    .sec-h2{font-size:48px}
    .cta-h2{font-size:56px}
  }
`;

/* ─── Scroll fade-up hook ─────────────────────────────────────────────────── */
function useFadeUp() {
  useEffect(() => {
    const els = document.querySelectorAll(".fu");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("vis"); io.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── CTA Button ─────────────────────────────────────────────────────────── */
function CTABtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        background: C.green,
        color: '#000000',
        fontWeight: 700,
        padding: '16px 32px',
        borderRadius: 99,
        fontSize: 15,
        cursor: 'pointer',
        transition: 'transform .15s ease, box-shadow .15s ease',
        boxShadow: `0 0 28px rgba(0,200,83,0.25)`,
        marginTop: 32,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)';
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px rgba(0,200,83,0.4)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 28px rgba(0,200,83,0.25)`;
      }}
    >
      {children}
    </a>
  );
}

/* ─── Section label ──────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.green,
      letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

/* ─── App preview card ───────────────────────────────────────────────────── */
function AppPreview() {
  return (
    <div className="float" style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 24,
      padding: 24,
      maxWidth: 300,
      width: '100%',
    }}>
      {/* Score */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.dimmed, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>Physique Score</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: C.green, lineHeight: 1 }}>78</div>
      </div>
      {/* Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {[
          ['Body Fat',   '17.2%'],
          ['Lean Mass',  '156 lbs'],
          ['Symmetry',   '84 / 100'],
        ].map(([label, val]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            padding: '10px 14px', border: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{val}</span>
          </div>
        ))}
      </div>
      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: C.greenBg, color: C.green,
        fontSize: 11, fontWeight: 700,
        padding: '5px 12px', borderRadius: 99,
        border: `1px solid ${C.greenDim}`,
      }}>
        <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
        AI Analysis Complete
      </div>
    </div>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────── */
function Card({ icon, title, body, animDelay = '' }: {
  icon: string; title: string; body: string; animDelay?: string;
}) {
  return (
    <div className={`fu ${animDelay}`} style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      padding: 24,
      width: '100%',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: C.greenBg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 20, marginBottom: 16,
      }}>
        {icon}
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 10 }}>{title}</h3>
      <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

/* ─── Feature Card ───────────────────────────────────────────────────────── */
function FeatureCard({ icon, category, title, body, animDelay = '' }: {
  icon: string; category: string; title: string; body: string; animDelay?: string;
}) {
  return (
    <div className={`fu ${animDelay}`} style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      padding: 28,
      width: '100%',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: C.greenBg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 22, marginBottom: 16,
        border: `1px solid ${C.greenDim}`,
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '2px',
        textTransform: 'uppercase', color: C.green, marginBottom: 8,
      }}>
        {category}
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: C.white, marginBottom: 10, lineHeight: 1.25 }}>{title}</h3>
      <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

/* ─── Landing Page ───────────────────────────────────────────────────────── */
export default function LandingPage() {
  useFadeUp();

  return (
    <>
      <style>{CSS}</style>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ═══════════════════════════════════════════════════════════════ */}
      <section className="hero-sec" style={{ background: C.bg }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: -120, right: -100, width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(0,200,83,0.10) 0%,transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="hero-grid sec-inner">
          {/* Copy */}
          <div>
            <div className="fu" style={{
              fontSize: 11, fontWeight: 700, color: C.green,
              letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 24,
            }}>
              AI PHYSIQUE OPTIMIZATION
            </div>

            <h1 className="fu d1 hero-h1">
              The operating system<br />for your physique.
            </h1>

            <p className="fu d2" style={{
              fontSize: 16, color: C.muted, maxWidth: 560,
              lineHeight: 1.6, marginBottom: 0,
            }}>
              MassIQ uses AI to scan your body, diagnose what&apos;s actually happening, and generate
              a personalized plan that updates every time you scan. Not a calorie counter.
              Not a step tracker. A system.
            </p>

            <div className="fu d3">
              <CTABtn href="/app">Get Started Free →</CTABtn>
              <div style={{ fontSize: 12, color: C.dimmed, marginTop: 12 }}>
                Free to start · No app download required
              </div>
            </div>
          </div>

          {/* App preview — hidden on mobile, shown on desktop */}
          <div className="preview-wrap fu d2">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2 — PROBLEM
      ═══════════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg2 }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 40 }}>
            <Label>THE PROBLEM</Label>
            <h2 className="sec-h2">Most fitness apps track<br />the wrong thing.</h2>
            <p style={{ fontSize: 16, color: C.muted, maxWidth: 480, lineHeight: 1.6 }}>
              They optimize for streaks and steps. Not body composition.
            </p>
          </div>

          <div className="grid3">
            <Card
              animDelay="d1"
              icon="⚖️"
              title="The scale lies"
              body="Weight doesn't show if you gained muscle or lost fat. Two people at 170 lb can look completely different."
            />
            <Card
              animDelay="d2"
              icon="🍽️"
              title="Calories without context"
              body="Logging food means nothing without a diagnosis. Without knowing your body composition, targets are guesswork."
            />
            <Card
              animDelay="d3"
              icon="🔁"
              title="No feedback loop"
              body="Tools without a system don't create results. You need a cycle: scan, diagnose, plan, execute, repeat."
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3 — THE LOOP
      ═══════════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 48 }}>
            <Label>THE SYSTEM</Label>
            <h2 className="sec-h2">A system, not a feature.</h2>
          </div>

          <div className="loop-steps">
            {[
              { n: '01', label: 'SCAN',           desc: 'AI analyzes your physique photo' },
              { n: '02', label: 'DIAGNOSIS',       desc: 'Body fat, lean mass, muscle groups, asymmetries' },
              { n: '03', label: 'PLAN',            desc: '12-week program with exact daily targets' },
              { n: '04', label: 'DAILY GUIDANCE',  desc: 'What to eat and train today' },
              { n: '05', label: 'NEXT SCAN',       desc: 'Measure real change. Update your plan.' },
            ].map(({ n, label, desc }, i) => (
              <div key={label} style={{ display: 'flex', flex: 1, alignItems: 'flex-start' }}>
                {/* Step block */}
                <div className={`fu d${i + 1} loop-step`}>
                  {/* Mobile: left-border vertical line */}
                  <div className="loop-step-line" style={{
                    width: 2, background: i < 4 ? C.greenDim : 'transparent',
                    flexShrink: 0, marginLeft: 21, marginTop: 40,
                    alignSelf: 'stretch',
                  }} />

                  <div style={{ flex: 1 }}>
                    {/* Number circle */}
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', margin: '0 auto 12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, letterSpacing: '2px',
                      background: i === 0 ? C.green : C.greenBg,
                      border: `2px solid ${i === 0 ? C.green : C.greenDim}`,
                      color: i === 0 ? '#000' : C.green,
                    }}>{n}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '2px',
                      textTransform: 'uppercase', color: C.green, marginBottom: 6,
                    }}>{label}</div>
                    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{desc}</p>
                  </div>
                </div>

                {/* Arrow between steps — desktop only */}
                {i < 4 && (
                  <div className="loop-arrow-h">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10H16M16 10L11 5M16 10L11 15"
                        stroke={C.greenDim} strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4 — FEATURES
      ═══════════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.bg2 }}>
        <div className="sec-inner">
          <div className="fu" style={{ marginBottom: 40 }}>
            <Label>FEATURES</Label>
            <h2 className="sec-h2">Everything that affects<br />your physique.</h2>
          </div>

          <div className="grid3">
            <FeatureCard
              animDelay="d1"
              icon="📷"
              category="AI BODY SCAN"
              title="Physique analysis from your camera"
              body="Upload a photo and get body fat %, lean mass, muscle group ratings, symmetry score, and a specific diagnosis — not just a number."
            />
            <FeatureCard
              animDelay="d2"
              icon="📋"
              category="PERSONALIZED PLAN"
              title="Your plan updates when your body does"
              body="Every scan generates a 12-week program with exact calorie targets, protein targets, training focus, and weekly missions."
            />
            <FeatureCard
              animDelay="d3"
              icon="🍽"
              category="AI NUTRITION"
              title="Log meals by describing or photographing them"
              body="Type what you ate or photograph your plate. Get calories, protein, carbs, fat instantly. Weekly meal plans generated for your specific goal."
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5 — FINAL CTA
      ═══════════════════════════════════════════════════════════════ */}
      <section className="sec" style={{ background: C.card, padding: '80px 20px', textAlign: 'center' }}>
        <div className="fu sec-inner" style={{ maxWidth: 700 }}>
          <h2 className="cta-h2">Your physique has a story.</h2>
          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            Start tracking it today. Free to start. No app download required.
          </p>
          <div>
            <CTABtn href="/app">Get Started Free →</CTABtn>
          </div>
          <div style={{ fontSize: 12, color: C.dimmed, marginTop: 20 }}>
            Already used by physique-focused athletes
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════════ */}
      <footer style={{
        background: C.bg,
        borderTop: `1px solid ${C.border}`,
        padding: '32px 20px',
      }}>
        <div className="footer-inner sec-inner">
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>MassIQ</div>
          <div style={{ fontSize: 13, color: C.muted }}>The operating system for your physique.</div>
          <div style={{ fontSize: 13, color: C.dimmed }}>
            <a href="#" style={{ color: C.dimmed }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.dimmed}>
              Privacy
            </a>
            {' · '}
            <a href="#" style={{ color: C.dimmed }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.dimmed}>
              Terms
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
