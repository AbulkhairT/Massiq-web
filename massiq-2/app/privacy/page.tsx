"use client";

const C = {
  bg:     '#0A0D0A',
  card:   '#111411',
  border: 'rgba(255,255,255,0.07)',
  green:  '#72B895',
  white:  '#F2F7F2',
  muted:  'rgba(242,247,242,0.58)',
  dim:    'rgba(242,247,242,0.28)',
};

const LAST_UPDATED = 'March 2025';

function NavBar() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(10,13,10,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        maxWidth: 860, margin: '0 auto',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ fontSize: 14, fontWeight: 800, color: C.green, letterSpacing: '.04em', textDecoration: 'none' }}>
          MASSIQ
        </a>
        <a href="/app" style={{
          fontSize: 13, fontWeight: 600, color: C.muted, textDecoration: 'none',
          padding: '6px 14px', border: `1px solid ${C.border}`, borderRadius: 99,
          transition: 'color .15s',
        }}>
          Open App
        </a>
      </div>
    </nav>
  );
}

interface Section {
  title: string;
  content: (string | string[])[];
}

const sections: Section[] = [
  {
    title: 'Information We Collect',
    content: [
      'When you use MassIQ, we collect the following categories of information:',
      [
        'Account information: email address and password (securely hashed, never stored in plain text).',
        'Profile data: body metrics you provide, including height, weight, age, gender, and fitness goals.',
        'Scan photos: images you upload for body composition analysis.',
        'Scan results: AI-generated analysis outputs including estimated body fat percentage, physique stage, and recommendations.',
        'Usage data: feature interactions, session activity, and error logs used to improve reliability.',
      ],
    ],
  },
  {
    title: 'How We Use Your Data',
    content: [
      'We use your information solely to provide and improve the MassIQ service:',
      [
        'Generating your personal body composition analysis from uploaded photos.',
        'Storing your progress history so you can track changes over time.',
        'Delivering personalised nutrition and training recommendations.',
        'Diagnosing technical issues and improving app performance.',
        'Sending transactional emails (account confirmation, password reset) when you request them.',
      ],
      'We do not use your data for advertising, third-party marketing, or any purpose unrelated to the service you signed up for.',
    ],
  },
  {
    title: 'Photo and Image Data',
    content: [
      'Your photos receive the highest level of protection we can provide:',
      [
        'Photos are uploaded directly to encrypted cloud storage and are never publicly accessible.',
        'Images are used only to generate your personal analysis — they are not retained for any other purpose.',
        'We do not sell, license, or share your photos with any third party.',
        'We do not use your photos to train AI models, including the models that power MassIQ.',
        'You can request deletion of your photos and associated data at any time.',
      ],
    ],
  },
  {
    title: 'Data Storage and Security',
    content: [
      'Your data is stored on Supabase infrastructure, which provides encrypted storage at rest and in transit using industry-standard protocols (TLS 1.2+, AES-256).',
      'Access to your data is restricted by row-level security policies — only authenticated requests from your own account can read your records.',
      'No MassIQ employee can read your scan photos or analysis results in the normal course of business.',
    ],
  },
  {
    title: 'Third-Party Services',
    content: [
      'MassIQ uses a small number of third-party services to operate:',
      [
        'Supabase — database, file storage, and authentication infrastructure.',
        'Anthropic — the AI model used to analyse scan photos and generate insights.',
        'Stripe — payment processing for Premium subscriptions. We do not store your card details.',
        'Vercel — application hosting and content delivery.',
      ],
      'Each provider processes your data only as necessary to deliver their component of the service, under their own security and privacy standards.',
    ],
  },
  {
    title: 'Data Sharing',
    content: [
      'We do not sell your personal data. We do not share it with advertisers or data brokers.',
      'The only circumstances in which data may be disclosed to a third party are:',
      [
        'When required by law, court order, or valid legal process.',
        'When necessary to prevent imminent harm or protect the rights, property, or safety of MassIQ or its users.',
        'With your explicit written consent.',
      ],
    ],
  },
  {
    title: 'Your Rights',
    content: [
      'You have the following rights regarding your personal data:',
      [
        'Access: request a copy of the data we hold about you.',
        'Correction: request correction of inaccurate data.',
        'Deletion: request deletion of your account and all associated data, including scan photos.',
        'Export: request an export of your scan history and profile data in a portable format.',
        'Withdrawal: discontinue use of the service and close your account at any time.',
      ],
      'To exercise any of these rights, contact us at the address below.',
    ],
  },
  {
    title: "Children's Privacy",
    content: [
      'MassIQ is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If you believe a minor has created an account, please contact us and we will promptly delete the account and associated data.',
    ],
  },
  {
    title: 'Changes to This Policy',
    content: [
      'We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date at the top of this page and, where appropriate, notify you by email.',
      'Your continued use of MassIQ after any change constitutes acceptance of the updated policy.',
    ],
  },
  {
    title: 'Contact',
    content: [
      'For privacy questions, data requests, or concerns, contact us at: privacy@massiq.app',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: C.bg,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: C.white,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <NavBar />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 100px' }}>
        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: C.green,
            textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 14,
          }}>
            Legal
          </div>
          <h1 style={{
            fontSize: 38, fontWeight: 800, color: C.white,
            letterSpacing: '-.03em', lineHeight: 1.1, margin: '0 0 14px',
          }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        {/* Intro */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '22px 24px', marginBottom: 40,
        }}>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>
            MassIQ is a body composition analysis tool. We handle personal health data and photos with care. This policy explains what we collect, how we use it, and your rights as a user. We keep this document plain and direct — no legal filler.
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sections.map((section, i) => (
            <div
              key={section.title}
              style={{
                paddingTop: 36,
                paddingBottom: 36,
                borderBottom: i < sections.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <h2 style={{
                fontSize: 17, fontWeight: 700, color: C.white,
                letterSpacing: '-.015em', margin: '0 0 14px',
              }}>
                {section.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {section.content.map((block, j) => {
                  if (Array.isArray(block)) {
                    return (
                      <ul key={j} style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {block.map((item, k) => (
                          <li key={k} style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={j} style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>
                      {block}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer nav */}
        <div style={{
          marginTop: 56, paddingTop: 32, borderTop: `1px solid ${C.border}`,
          display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <a href="/terms" style={{ fontSize: 13, color: C.muted, textDecoration: 'underline' }}>
            Terms of Service
          </a>
          <a href="/app" style={{ fontSize: 13, color: C.muted, textDecoration: 'underline' }}>
            Back to App
          </a>
        </div>
      </main>
    </div>
  );
}
