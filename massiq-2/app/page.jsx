"use client";
import { useEffect } from "react";

/* ─── Design tokens ─────────────────────────────────────────── */
const C = {
  cream:  "#FAF6EE",
  terra:  "#C4622D",
  sage:   "#5C7A5A",
  ink:    "#1A1410",
  muted:  "#A89880",
  card:   "#F0E8D8",
  cardBorder: "rgba(100,80,60,0.12)",
  dark:   "#14110D",
  darkCard: "#1F1A14",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ─── Embedded keyframes ─────────────────────────────────────── */
const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:${C.cream};color:${C.ink};font-family:${SANS};overflow-x:hidden}

  .fade-up{opacity:0;transform:translateY(32px);transition:opacity 0.7s ease,transform 0.7s ease}
  .fade-up.visible{opacity:1;transform:translateY(0)}
  .fade-up-delay-1{transition-delay:0.1s}
  .fade-up-delay-2{transition-delay:0.2s}
  .fade-up-delay-3{transition-delay:0.3s}
  .fade-up-delay-4{transition-delay:0.4s}
  .fade-up-delay-5{transition-delay:0.5s}

  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  .float{animation:float 4s ease-in-out infinite}

  a{text-decoration:none;color:inherit}
  button{cursor:pointer;border:none;font-family:inherit}

  @media(max-width:640px){
    .hero-grid{grid-template-columns:1fr!important}
    .hero-mockup{display:none!important}
    .grid-3{grid-template-columns:1fr!important}
    .steps-row{flex-direction:column!important;align-items:center!important}
    .step-connector{display:none!important}
    .timeline-row{flex-direction:column!important;align-items:center!important}
    .timeline-arrow{transform:rotate(90deg)!important}
    .cta-box{padding:40px 24px!important}
  }
  @media(max-width:900px){
    .grid-3{grid-template-columns:1fr 1fr!important}
    .steps-row{gap:0!important}
  }
`;

/* ─── Scroll animation hook ──────────────────────────────────── */
function useFadeUp() {
  useEffect(() => {
    const els = document.querySelectorAll(".fade-up");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── Pill button ────────────────────────────────────────────── */
function PBtn({ children, href, outline, large, style = {} }) {
  const base = {
    display: "inline-block",
    borderRadius: 99,
    padding: large ? "16px 40px" : "13px 28px",
    fontSize: large ? 17 : 15,
    fontWeight: 600,
    letterSpacing: "0.01em",
    transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
    cursor: "pointer",
    ...style,
  };
  const filled = { background: C.terra, color: "#fff", boxShadow: `0 4px 20px ${C.terra}50` };
  const outlineS = { background: "transparent", color: C.cream, border: `1.5px solid rgba(255,255,255,0.35)` };
  const s = { ...base, ...(outline ? outlineS : filled) };
  return (
    <a href={href} style={s}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.opacity = "0.92"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = "1"; }}>
      {children}
    </a>
  );
}

/* ─── App UI mockup card ─────────────────────────────────────── */
function AppMockup() {
  return (
    <div className="float" style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}>
      {/* Browser chrome */}
      <div style={{ background: C.darkCard, borderRadius: "16px 16px 0 0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <div style={{ flex: 1, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>
          massiq.app
        </div>
      </div>
      {/* App body */}
      <div style={{ background: C.dark, borderRadius: "0 0 16px 16px", padding: 20, border: "1px solid rgba(255,255,255,0.05)", borderTop: "none" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>BODY COMPOSITION</div>
        {/* Big score */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 700, color: C.terra, lineHeight: 1 }}>82</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Physique Score</div>
        </div>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["Body Fat", "16.4%", C.terra], ["Lean Mass", "143 lb", C.sage], ["Symmetry", "88%", "#7B8FA0"]].map(([label, val, color]) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 6px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Muscle bars */}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8, letterSpacing: "0.08em" }}>MUSCLE GROUPS</div>
        {[["Chest", 78], ["Back", 84], ["Legs", 71]].map(([g, p]) => (
          <div key={g} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
              <span>{g}</span><span>{p}%</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
              <div style={{ height: "100%", width: `${p}%`, borderRadius: 2, background: `linear-gradient(90deg,${C.terra},${C.sage})` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────────── */
function Section({ children, style = {}, id }) {
  return (
    <section id={id} style={{ padding: "96px 24px", ...style }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

/* ─── Landing page ───────────────────────────────────────────── */
export default function LandingPage() {
  useFadeUp();

  return (
    <>
      <style>{CSS}</style>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section style={{ background: C.cream, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 24px 64px", position: "relative", overflow: "hidden" }}>
        {/* Background blobs */}
        <div style={{ position: "absolute", top: -120, right: -80, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle,${C.terra}18 0%,transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -60, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle,${C.sage}14 0%,transparent 70%)`, pointerEvents: "none" }} />

        <div className="hero-grid" style={{ maxWidth: 1080, margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          {/* Copy */}
          <div>
            <div className="fade-up" style={{ display: "inline-block", background: `${C.terra}18`, color: C.terra, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 14px", borderRadius: 99, marginBottom: 24, border: `1px solid ${C.terra}28` }}>
              AI-Powered Physique Intelligence
            </div>
            <h1 className="fade-up fade-up-delay-1" style={{ fontFamily: SERIF, fontSize: "clamp(2.2rem,4.2vw,3.4rem)", fontWeight: 700, lineHeight: 1.1, color: C.ink, marginBottom: 20 }}>
              The operating system<br />for your physique.
            </h1>
            <p className="fade-up fade-up-delay-2" style={{ fontSize: 18, lineHeight: 1.65, color: "#5A4E44", maxWidth: 480, marginBottom: 36 }}>
              MassIQ uses AI to scan your body, diagnose what's actually happening, and generate a personalized plan. Not a calorie counter. A system.
            </p>
            <div className="fade-up fade-up-delay-3" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <PBtn href="/app">Get Started Free</PBtn>
              <a href="#features" style={{ fontSize: 15, color: C.muted, display: "flex", alignItems: "center", gap: 6, fontWeight: 500, padding: "13px 4px", transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = C.ink}
                onMouseLeave={e => e.currentTarget.style.color = C.muted}>
                See how it works
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3L8 13M8 13L4 9M8 13L12 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
            <div className="fade-up fade-up-delay-4" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 40 }}>
              <div style={{ display: "flex" }}>
                {[C.terra, C.sage, "#7B8FA0", C.muted].map((bg, i) => (
                  <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", background: bg, border: "2px solid #FAF6EE", marginLeft: i > 0 ? -8 : 0 }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: C.muted }}>Trusted by physique-focused athletes</span>
            </div>
          </div>
          {/* Mockup */}
          <div className="fade-up fade-up-delay-2 hero-mockup" style={{ display: "flex", justifyContent: "center" }}>
            <AppMockup />
          </div>
        </div>
      </section>

      {/* ── PROBLEM ───────────────────────────────────────────── */}
      <Section style={{ background: C.dark, color: C.cream }}>
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.7rem,3.2vw,2.6rem)", fontWeight: 700, color: C.cream, marginBottom: 14, lineHeight: 1.2 }}>
            Most fitness apps track the wrong thing.
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, maxWidth: 460, margin: "0 auto" }}>
            They optimize for streaks and steps. Not body composition.
          </p>
        </div>
        <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          {[
            { icon: "⚖️", title: "The scale lies", body: "Weight doesn't show if you gained muscle or lost fat. Two people at 170 lb can look completely different.", delay: "fade-up-delay-1" },
            { icon: "🍽️", title: "Calories without context", body: "Logging food means nothing without a diagnosis. Without knowing your body composition, targets are guesswork.", delay: "fade-up-delay-2" },
            { icon: "🔁", title: "No feedback loop", body: "Tools without a system don't create results. You need a cycle: scan, diagnose, plan, execute, repeat.", delay: "fade-up-delay-3" },
          ].map(({ icon, title, body, delay }) => (
            <div key={title} className={`fade-up ${delay}`} style={{ background: C.darkCard, borderRadius: 24, padding: 32, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{icon}</div>
              <h3 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.cream, marginBottom: 10 }}>{title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.42)" }}>{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── THE SYSTEM ────────────────────────────────────────── */}
      <Section style={{ background: C.cream }} id="how-it-works">
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.terra, marginBottom: 14 }}>How It Works</div>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.7rem,3.2vw,2.6rem)", fontWeight: 700, color: C.ink, marginBottom: 14 }}>A system, not a feature.</h2>
          <p style={{ fontSize: 16, color: C.muted, maxWidth: 460, margin: "0 auto" }}>Five connected steps that compound over time.</p>
        </div>
        <div className="steps-row" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
          {[
            { n: "01", label: "SCAN", desc: "Upload a photo. AI analyzes body composition, muscle groups, and symmetry." },
            { n: "02", label: "DIAGNOSIS", desc: "Get a specific assessment — body fat %, lean mass, physique score, what's lagging." },
            { n: "03", label: "PLAN", desc: "Receive a 12-week program with exact calorie, protein, and training targets." },
            { n: "04", label: "DAILY GUIDANCE", desc: "Log meals, complete missions, get AI coaching every single day." },
            { n: "05", label: "NEXT SCAN", desc: "Rescan to measure real progress. Your plan updates. The loop continues." },
          ].map(({ n, label, desc }, i) => (
            <div key={label} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
              <div className={`fade-up fade-up-delay-${i + 1}`} style={{ flex: 1, textAlign: "center", padding: "0 6px" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: i === 0 ? C.terra : C.card, border: `2px solid ${i === 0 ? C.terra : C.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 11, fontWeight: 700, color: i === 0 ? "#fff" : C.muted, letterSpacing: "0.05em" }}>
                  {n}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.terra, marginBottom: 8, textTransform: "uppercase" }}>{label}</div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: C.muted }}>{desc}</p>
              </div>
              {i < 4 && (
                <div className="step-connector" style={{ display: "flex", alignItems: "center", paddingTop: 18, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke={C.terra} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <Section style={{ background: "#F5EFE4" }} id="features">
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 14 }}>Features</div>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.7rem,3.2vw,2.6rem)", fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
            Everything that affects your physique.<br />One place.
          </h2>
        </div>
        <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          {[
            { icon: "📸", badge: "AI Body Scan", title: "Physique analysis from your camera", body: "Upload a photo and get body fat %, lean mass, muscle group ratings, symmetry score, and a specific diagnosis. Not just a number — a full assessment.", color: C.terra, delay: "fade-up-delay-1" },
            { icon: "📋", badge: "Personalized Plan", title: "Your plan updates when your body does", body: "Every scan generates a 12-week program with exact calorie targets, protein targets, training focus, and weekly missions.", color: C.sage, delay: "fade-up-delay-2" },
            { icon: "🥗", badge: "AI Nutrition", title: "Log meals by describing or photographing them", body: "Type what you ate or photograph your plate. Get calories, protein, carbs, fat instantly. Weekly meal plans generated for your specific goal.", color: "#7B8FA0", delay: "fade-up-delay-3" },
          ].map(({ icon, badge, title, body, color, delay }) => (
            <div key={badge} className={`fade-up ${delay}`} style={{ background: C.card, borderRadius: 24, padding: 32, border: `1px solid ${C.cardBorder}`, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: `1px solid ${color}22` }}>{icon}</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 8 }}>{badge}</div>
                <h3 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8, lineHeight: 1.3 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.muted }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── PHYSIQUE TIMELINE ─────────────────────────────────── */}
      <Section style={{ background: C.dark, color: C.cream }}>
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.terra, marginBottom: 14 }}>Progress Tracking</div>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.7rem,3.2vw,2.6rem)", fontWeight: 700, color: C.cream, marginBottom: 14, lineHeight: 1.2 }}>
            Watch your body composition change over time.
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 480, margin: "0 auto" }}>Not your weight. Your actual fat mass vs lean mass.</p>
        </div>

        <div className="fade-up fade-up-delay-1" style={{ overflowX: "auto", padding: "0 4px" }}>
          <div className="timeline-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40, minWidth: 400 }}>
            {[
              { month: "Jan", bf: "22%", lean: "138 lb", note: null, highlight: false },
              { month: "Mar", bf: "19%", lean: "140 lb", note: "+2 lb lean mass", highlight: false },
              { month: "Jun", bf: "15%", lean: "143 lb", note: "+5 lb lean mass", highlight: true },
            ].map(({ month, bf, lean, note, highlight }, i) => (
              <div key={month} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
                <div style={{ background: C.darkCard, borderRadius: 18, padding: "22px 26px", border: highlight ? `1px solid ${C.terra}55` : "1px solid rgba(255,255,255,0.07)", textAlign: "center", minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", marginBottom: 8 }}>{month}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: highlight ? C.terra : C.cream, lineHeight: 1 }}>{bf}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2, marginBottom: 10 }}>Body Fat</div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 10 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.sage }}>{lean}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>Lean Mass</div>
                  {note && (
                    <div style={{ marginTop: 10, fontSize: 10, color: C.sage, background: `${C.sage}18`, borderRadius: 99, padding: "3px 10px", display: "inline-block" }}>{note}</div>
                  )}
                </div>
                {i < 2 && (
                  <div className="timeline-arrow" style={{ padding: "0 14px", flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke={C.terra} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="fade-up fade-up-delay-2" style={{ maxWidth: 580, margin: "0 auto", textAlign: "center", background: C.darkCard, borderRadius: 18, padding: 28, border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}>
            Recomposition — losing fat while gaining muscle — barely moves the scale.{" "}
            <strong style={{ color: C.cream }}>MassIQ shows you the real story.</strong>
          </p>
        </div>
      </Section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <Section style={{ background: C.cream, textAlign: "center" }}>
        <div className="fade-up cta-box" style={{ background: C.card, borderRadius: 32, padding: "72px 48px", border: `1px solid ${C.cardBorder}`, maxWidth: 680, margin: "0 auto", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle,${C.terra}14 0%,transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.terra, marginBottom: 18 }}>Get Started</div>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.7rem,3.2vw,2.6rem)", fontWeight: 700, color: C.ink, marginBottom: 16, lineHeight: 1.2 }}>
            Your physique has a story.<br />Start tracking it.
          </h2>
          <p style={{ fontSize: 16, color: C.muted, marginBottom: 36, maxWidth: 400, margin: "0 auto 36px" }}>
            Free to start. No app download required. Just your browser.
          </p>
          <PBtn href="/app" large>Get Started Free</PBtn>
        </div>
      </Section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer style={{ background: C.dark, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.cream, marginBottom: 6 }}>MassIQ</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 28 }}>The operating system for your physique.</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 28 }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
            {["Privacy", "Terms", "Contact"].map(link => (
              <a key={link} href="#" style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.65)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.32)"}>
                {link}
              </a>
            ))}
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.14)" }}>
            © {new Date().getFullYear()} MassIQ. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
