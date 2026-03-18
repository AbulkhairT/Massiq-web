"use client";
import { useEffect } from "react";

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg:       '#0A0F0A',
  card:     '#141A14',
  cardEl:   '#1C251C',
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
  body{background:${C.bg};color:${C.white};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
  a{text-decoration:none;color:inherit}
  button{cursor:pointer;border:none;font-family:inherit}
  .fade-up{opacity:0;transform:translateY(28px);transition:opacity 0.65s ease,transform 0.65s ease}
  .fade-up.visible{opacity:1;transform:translateY(0)}
  .d1{transition-delay:.1s}.d2{transition-delay:.2s}.d3{transition-delay:.3s}.d4{transition-delay:.4s}.d5{transition-delay:.5s}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .float{animation:float 4s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
  .pulse{animation:pulse 2.5s ease-in-out infinite}
  @media(max-width:680px){
    .hero-grid{grid-template-columns:1fr!important}
    .mockup-wrap{display:none!important}
    .grid3{grid-template-columns:1fr!important}
    .loop-row{flex-direction:column!important;align-items:center!important}
    .loop-arrow{transform:rotate(90deg)!important}
    .cta-inner{padding:40px 24px!important}
  }
  @media(max-width:960px){
    .grid3{grid-template-columns:1fr 1fr!important}
  }
`;

/* ─── Scroll fade-up ─────────────────────────────────────────────────────── */
function useFadeUp() {
  useEffect(() => {
    const els = document.querySelectorAll(".fade-up");
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }),
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── CTA Button ─────────────────────────────────────────────────────────── */
function CTA({ href, children, large = false, outline = false, style = {} }: {
  href: string; children: React.ReactNode; large?: boolean; outline?: boolean; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: large ? '16px 40px' : '13px 28px',
    fontSize: large ? 17 : 15, fontWeight: 700,
    borderRadius: 99, cursor: 'pointer', transition: 'all .18s ease',
    ...(outline
      ? { background: 'transparent', color: C.green, border: `2px solid ${C.green}` }
      : { background: C.green, color: '#000', boxShadow: `0 0 32px rgba(0,200,83,0.3)` }),
    ...style,
  };
  return (
    <a href={href} style={base}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}>
      {children}
    </a>
  );
}

/* ─── App mockup ─────────────────────────────────────────────────────────── */
function AppMockup() {
  return (
    <div className="float" style={{ width: '100%', maxWidth: 300, margin: '0 auto' }}>
      {/* Browser chrome */}
      <div style={{ background: C.cardEl, borderRadius: '16px 16px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {['#ff5f57','#febc2e','#28c840'].map(bg => (
          <div key={bg} style={{ width: 10, height: 10, borderRadius: '50%', background: bg }} />
        ))}
        <div style={{ flex: 1, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8, fontSize: 11, color: C.dimmed }}>
          massiq.app
        </div>
      </div>
      {/* Body */}
      <div style={{ background: C.card, borderRadius: '0 0 16px 16px', padding: 20, border: `1px solid ${C.border}`, borderTop: 'none' }}>
        <div style={{ fontSize: 9, color: C.dimmed, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>BODY COMPOSITION</div>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: C.green, lineHeight: 1 }}>82</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Physique Score</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 14 }}>
          {[['Body Fat','16.4%',C.green],['Lean Mass','143 lb',C.muted],['Symmetry','88%','#4A9EFF']].map(([label,val,color]) => (
            <div key={label as string} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 5px', textAlign: 'center', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: color as string }}>{val as string}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{label as string}</div>
            </div>
          ))}
        </div>
        {[['Chest',78],['Back',84],['Legs',71]].map(([g,p]) => (
          <div key={g as string} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 3 }}>
              <span>{g as string}</span><span>{p as number}%</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
              <div style={{ height: '100%', width: `${p as number}%`, borderRadius: 2, background: C.green }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────────────────────── */
function Sec({ children, style = {}, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ padding: '88px 24px', ...style }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

/* ─── Landing Page ───────────────────────────────────────────────────────── */
export default function LandingPage() {
  useFadeUp();

  return (
    <>
      <style>{CSS}</style>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 24px 64px', position: 'relative', overflow: 'hidden' }}>
        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: -100, right: -80, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,200,83,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -60, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,200,83,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{ maxWidth: 1080, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* Copy */}
          <div>
            <div className="fade-up" style={{ display: 'inline-block', background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 99, marginBottom: 24, border: `1px solid ${C.greenDim}` }}>
              AI-Powered Physique Intelligence
            </div>
            <h1 className="fade-up d1" style={{ fontSize: 'clamp(2.2rem,4.2vw,3.5rem)', fontWeight: 800, lineHeight: 1.1, color: C.white, marginBottom: 20 }}>
              The operating system<br />for your physique.
            </h1>
            <p className="fade-up d2" style={{ fontSize: 18, lineHeight: 1.7, color: C.muted, maxWidth: 480, marginBottom: 36 }}>
              MassIQ uses AI to scan your body, diagnose what's actually happening, and generate a personalized plan. Not a calorie counter. A system.
            </p>
            <div className="fade-up d3" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 40 }}>
              <CTA href="/app" large>Get Started Free</CTA>
              <a href="#how-it-works" style={{ fontSize: 15, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, padding: '13px 4px', transition: 'color .2s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
                See how it works
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M8 13l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
            <div className="fade-up d4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex' }}>
                {[C.green, C.muted, '#4A9EFF', '#9B7FD4'].map((bg, i) => (
                  <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: bg, border: `2px solid ${C.bg}`, marginLeft: i > 0 ? -8 : 0 }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: C.dimmed }}>Trusted by physique-focused athletes</span>
            </div>
          </div>

          {/* Mockup */}
          <div className="fade-up d2 mockup-wrap" style={{ display: 'flex', justifyContent: 'center' }}>
            <AppMockup />
          </div>
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────────── */}
      <Sec style={{ background: C.card }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 52 }}>
          <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, color: C.white, marginBottom: 12, lineHeight: 1.2 }}>
            Most fitness apps track the wrong thing.
          </h2>
          <p style={{ color: C.muted, fontSize: 16, maxWidth: 440, margin: '0 auto' }}>
            They optimize for streaks and steps. Not body composition.
          </p>
        </div>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[
            { icon: '⚖️', title: 'The scale lies',           delay: 'd1', body: "Weight doesn't show if you gained muscle or lost fat. Two people at 170 lb can look completely different." },
            { icon: '🍽️', title: 'Calories without context', delay: 'd2', body: "Logging food means nothing without a diagnosis. Without knowing your body composition, targets are guesswork." },
            { icon: '🔁', title: 'No feedback loop',         delay: 'd3', body: "Tools without a system don't create results. You need a cycle: scan, diagnose, plan, execute, repeat." },
          ].map(({ icon, title, delay, body }) => (
            <div key={title} className={`fade-up ${delay}`} style={{ background: C.cardEl, borderRadius: 24, padding: 32, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 10 }}>{title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: C.muted }}>{body}</p>
            </div>
          ))}
        </div>
      </Sec>

      {/* ── THE LOOP ─────────────────────────────────────────────────────── */}
      <Sec style={{ background: C.bg }} id="how-it-works">
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.green, marginBottom: 14 }}>How It Works</div>
          <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, color: C.white, marginBottom: 12 }}>A system, not a feature.</h2>
          <p style={{ fontSize: 16, color: C.muted, maxWidth: 440, margin: '0 auto' }}>Five connected steps that compound over time.</p>
        </div>

        <div className="loop-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {[
            { n: '01', label: 'SCAN',           desc: 'Upload a photo. AI analyzes body composition, muscle groups, and symmetry.' },
            { n: '02', label: 'DIAGNOSIS',       desc: "Get a specific assessment — body fat %, lean mass, physique score, what's lagging." },
            { n: '03', label: 'PLAN',            desc: 'Receive a 12-week program with exact calorie, protein, and training targets.' },
            { n: '04', label: 'DAILY GUIDANCE',  desc: 'Log meals, complete missions, get AI coaching every single day.' },
            { n: '05', label: 'NEXT SCAN',       desc: 'Rescan to measure real progress. Your plan updates. The loop continues.' },
          ].map(({ n, label, desc }, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
              <div className={`fade-up d${i + 1}`} style={{ flex: 1, textAlign: 'center', padding: '0 6px' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, letterSpacing: '.05em',
                  background: i === 0 ? C.green : C.cardEl,
                  border: `2px solid ${i === 0 ? C.green : C.border}`,
                  color: i === 0 ? '#000' : C.muted,
                }}>{n}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.green, marginBottom: 8, textTransform: 'uppercase' }}>{label}</div>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: C.muted }}>{desc}</p>
              </div>
              {i < 4 && (
                <div className="loop-arrow" style={{ display: 'flex', alignItems: 'center', paddingTop: 18, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </Sec>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <Sec style={{ background: C.card }} id="features">
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.green, marginBottom: 14 }}>Features</div>
          <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, color: C.white, lineHeight: 1.2 }}>
            Everything that affects your physique.<br />One place.
          </h2>
        </div>
        <div className="grid3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
          {[
            { icon: '📸', badge: 'AI Body Scan',       delay: 'd1', color: C.green,    title: 'Physique analysis from your camera',         body: 'Upload a photo and get body fat %, lean mass, muscle group ratings, symmetry score, and a specific diagnosis — not just a number.' },
            { icon: '📋', badge: 'Personalized Plan',  delay: 'd2', color: '#4A9EFF',  title: 'Your plan updates when your body does',      body: 'Every scan generates a 12-week program with exact calorie targets, protein targets, training focus, and weekly missions.' },
            { icon: '🥗', badge: 'AI Nutrition',       delay: 'd3', color: '#9B7FD4',  title: 'Log meals by describing or photographing',   body: 'Type what you ate or photograph your plate. Get calories, protein, carbs, fat instantly. Weekly meal plans for your specific goal.' },
          ].map(({ icon, badge, title, body, color, delay }) => (
            <div key={badge} className={`fade-up ${delay}`} style={{ background: C.cardEl, borderRadius: 24, padding: 32, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `1px solid ${color}33` }}>{icon}</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color, marginBottom: 8 }}>{badge}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: C.white, marginBottom: 8, lineHeight: 1.3 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.muted }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Sec>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <Sec style={{ background: C.bg, textAlign: 'center' }}>
        <div className="fade-up cta-inner" style={{
          background: C.card, borderRadius: 32, padding: '72px 48px',
          border: `1px solid ${C.border}`, maxWidth: 680, margin: '0 auto',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow */}
          <div style={{ position: 'absolute', top: -60, right: -60, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,200,83,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.green, marginBottom: 18 }}>Get Started</div>
          <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, color: C.white, marginBottom: 16, lineHeight: 1.2 }}>
            Your physique has a story.<br />Start tracking it.
          </h2>
          <p style={{ fontSize: 16, color: C.muted, maxWidth: 400, margin: '0 auto 36px' }}>
            Free to start. No app download required. Just your browser.
          </p>
          <CTA href="/app" large>Get Started Free</CTA>
        </div>
      </Sec>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ background: C.card, padding: '48px 24px', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 6 }}>MassIQ</div>
          <div style={{ fontSize: 13, color: C.dimmed, marginBottom: 28 }}>The operating system for your physique.</div>
          <div style={{ height: 1, background: C.border, marginBottom: 28 }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
            {['Privacy', 'Terms', 'Contact'].map(link => (
              <a key={link} href="#" style={{ fontSize: 13, color: C.dimmed, transition: 'color .2s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.white}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.dimmed}>
                {link}
              </a>
            ))}
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: C.dimmed, opacity: 0.5 }}>
            © {new Date().getFullYear()} MassIQ. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
