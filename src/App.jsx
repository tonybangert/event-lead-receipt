import React, { useState, useEffect, useRef } from 'react';
import { BRAND, EVENT, TOPICS, STORAGE_KEY, CSV_PREFIX } from './config.js';

const C = BRAND.colors;

export default function ReceiptApp() {
  const [stage, setStage] = useState('home');
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(0);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const reset = () => {
    setStage('home');
    setTopic('');
    setName('');
    setTitle('');
    setEmail('');
    setStep(0);
    setSubmittedAt(null);
    setSendStatus(null);
  };

  const handleSubmit = async () => {
    if (!name || !email) return;
    setSending(true);
    const ts = new Date().toISOString();
    setSubmittedAt(ts);

    const record = {
      id: Date.now(),
      timestamp: ts,
      name,
      title,
      email,
      topic: topic || TOPICS[TOPICS.length - 1]
    };

    const updated = [record, ...history];
    setHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}

    try {
      const res = await fetch('/api/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      setSendStatus(res.ok ? 'sent' : 'queued');
    } catch (e) {
      setSendStatus('queued');
    }

    setSending(false);
    setStage('thankyou');
  };

  const exportCSV = () => {
    const headers = 'Timestamp,Name,Title,Email,Topic\n';
    const rows = history.map(r =>
      `"${r.timestamp}","${r.name}","${r.title}","${r.email}","${r.topic}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${CSV_PREFIX}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildLinkedInSearch = (contactName, contactTitle) => {
    const companyMatch = (contactTitle || '').match(/(?:\bat\b|@|,)\s*(.+)$/i);
    const company = companyMatch ? companyMatch[1].trim() : '';
    const query = company ? `${contactName} ${company}` : contactName;
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  };

  return (
    <div style={styles.app}>
      <style>{globalCSS}</style>
      <div style={styles.orb} />
      <div style={styles.orbTwo} />

      <div style={styles.container}>
        {stage === 'home' && <Home onStart={() => setStage('topic')} onLog={() => setStage('log')} count={history.length} />}
        {stage === 'topic' && (
          <TopicPicker onPick={(t) => { setTopic(t); setStage('capture'); }} onBack={() => setStage('home')} />
        )}
        {stage === 'capture' && (
          <Capture
            step={step}
            name={name} setName={setName}
            title={title} setTitle={setTitle}
            email={email} setEmail={setEmail}
            onNext={() => setStep(step + 1)}
            onBack={() => step > 0 ? setStep(step - 1) : setStage('topic')}
            onSubmit={handleSubmit}
            sending={sending}
            topic={topic}
          />
        )}
        {stage === 'thankyou' && <ThankYou onReset={reset} />}
        {stage === 'log' && (
          <Log history={history} onBack={() => setStage('home')} onExport={exportCSV} buildLinkedInSearch={buildLinkedInSearch} />
        )}
      </div>
    </div>
  );
}

function Home({ onStart, onLog, count }) {
  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div style={styles.brandMark}>
          <img src={BRAND.logoSrc} alt="" style={styles.brandLogo} />
          <span style={styles.brandText}>{BRAND.company}</span>
        </div>
        <button onClick={onLog} style={styles.iconButton}>
          <span style={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(250,248,245,0.6)' }}>
            {count} {count === 1 ? 'connection' : 'connections'}
          </span>
        </button>
      </div>

      <div style={styles.heroBlock}>
        <div style={styles.eyebrow}>{EVENT.name} · {EVENT.date} · {EVENT.venue}</div>
      </div>

      <div style={styles.heroButtonWrap}>
        <button onClick={onStart} style={styles.heroButton}>
          <span style={styles.heroButtonLabel}>Let's<br />connect</span>
          <span style={styles.heroButtonArrow}>→</span>
        </button>
      </div>

      <div style={styles.footer}>
        <div style={styles.signature}>
          <div style={styles.sigName}>{BRAND.name}</div>
          <div style={styles.sigTitle}>{BRAND.title}, {BRAND.company}</div>
        </div>
      </div>
    </div>
  );
}

function TopicPicker({ onPick, onBack }) {
  return (
    <div style={styles.screen}>
      <button onClick={onBack} style={styles.backLink}>← Back</button>
      <div style={{ marginTop: 32, marginBottom: 28 }}>
        <div style={styles.eyebrow}>Step 1 of 2</div>
        <h2 style={styles.h2}>What did we talk about?</h2>
        <p style={styles.sub}>Tap one. It'll appear on the receipt I send you.</p>
      </div>
      <div style={styles.topicGrid}>
        {TOPICS.map((t, i) => (
          <button key={t} onClick={() => onPick(t)} style={{ ...styles.topicChip, animationDelay: `${i * 60}ms` }} className="topic-chip">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Capture({ step, name, setName, title, setTitle, email, setEmail, onNext, onBack, onSubmit, sending, topic }) {
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [step]);

  const fields = [
    { label: 'Your name', value: name, set: setName, placeholder: 'e.g. Jane Patel', type: 'text' },
    { label: 'Title & company', value: title, set: setTitle, placeholder: 'e.g. COO at Acme Industries', type: 'text' },
    { label: 'Email', value: email, set: setEmail, placeholder: 'you@company.com', type: 'email' }
  ];
  const isLast = step === fields.length - 1;
  const current = fields[step];
  const canAdvance = current.value.trim().length > 0;

  return (
    <div style={styles.screen}>
      <button onClick={onBack} style={styles.backLink}>← Back</button>
      <div style={{ marginTop: 32, marginBottom: 32 }}>
        <div style={styles.eyebrow}>Step 2 of 2 · {topic}</div>
        <div style={styles.progress}>
          {fields.map((_, i) => (
            <div key={i} style={{ ...styles.progressDot, background: i <= step ? C.accent : 'rgba(250,248,245,0.2)' }} />
          ))}
        </div>
      </div>
      <div key={step} style={styles.fieldBlock} className="field-enter">
        <label style={styles.fieldLabel}>{current.label}</label>
        <input
          ref={inputRef}
          type={current.type}
          value={current.value}
          onChange={(e) => current.set(e.target.value)}
          placeholder={current.placeholder}
          style={styles.input}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) { if (isLast) onSubmit(); else onNext(); } }}
        />
      </div>
      <button
        onClick={isLast ? onSubmit : onNext}
        disabled={!canAdvance || sending}
        style={{ ...styles.primaryButton, opacity: canAdvance && !sending ? 1 : 0.4, cursor: canAdvance && !sending ? 'pointer' : 'not-allowed' }}
      >
        <span>{sending ? 'Sending...' : isLast ? 'Generate receipt' : 'Continue'}</span>
        <span style={styles.buttonArrow}>→</span>
      </button>
    </div>
  );
}

function ThankYou({ onReset }) {
  return (
    <div style={styles.thankYouStage} className="thankyou-enter">
      <div style={styles.thankYouContent}>
        <img src={BRAND.logoSrc} alt="" style={styles.thankYouLogo} />
        <h1 style={styles.thankYouTitle}>Great to meet you!</h1>
        <p style={styles.thankYouBody}>
          Our meeting receipt is in your inbox. Hope to connect again soon.
        </p>
      </div>
      <button onClick={onReset} style={styles.thankYouButton}>
        <span>Next connection</span>
        <span style={styles.buttonArrow}>→</span>
      </button>
    </div>
  );
}

function Log({ history, onBack, onExport, buildLinkedInSearch }) {
  return (
    <div style={styles.screen}>
      <button onClick={onBack} style={styles.backLink}>← Back</button>
      <div style={{ marginTop: 32, marginBottom: 24 }}>
        <div style={styles.eyebrow}>Today's connections</div>
        <h2 style={styles.h2}>{history.length} {history.length === 1 ? 'person' : 'people'}</h2>
      </div>
      {history.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyDot} />
          <p style={styles.emptyText}>No connections yet. Tap below to start.</p>
        </div>
      ) : (
        <>
          <div style={styles.logList}>
            {history.map((r) => (
              <div key={r.id} style={styles.logItem}>
                <div style={styles.logName}>{r.name}</div>
                <div style={styles.logMeta}>{r.title}</div>
                <div style={styles.logFooter}>
                  <span style={styles.logTopic}>{r.topic}</span>
                  <span style={styles.logTime}>{new Date(r.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EVENT.timezone })}</span>
                </div>
                <a href={buildLinkedInSearch(r.name, r.title)} target="_blank" rel="noopener noreferrer" style={styles.logLinkedIn}>
                  <span style={styles.logLinkedInIcon}>in</span>
                  <span>Connect on LinkedIn</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.5 }}>↗</span>
                </a>
              </div>
            ))}
          </div>
          <button onClick={onExport} style={{ ...styles.primaryButton, marginTop: 28 }}>
            <span>Export CSV</span>
            <span style={styles.buttonArrow}>↓</span>
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', background: `radial-gradient(ellipse at top, ${C.primaryMid} 0%, ${C.primary} 50%, ${C.primaryDeep} 100%)`, color: C.paper, fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif', position: 'relative', overflow: 'hidden', padding: '24px 20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  orb: { position: 'absolute', top: '-200px', right: '-150px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(250,168,64,0.18) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' },
  orbTwo: { position: 'absolute', bottom: '-150px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,69,55,0.12) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' },
  container: { position: 'relative', zIndex: 1, maxWidth: '440px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' },
  screen: { display: 'flex', flexDirection: 'column', flex: 1, animation: 'screenEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 },
  brandMark: { display: 'flex', alignItems: 'center', gap: 10 },
  brandLogo: { width: 24, height: 24, objectFit: 'contain' },
  brandText: { fontFamily: '"DM Serif Display", serif', fontSize: 16, letterSpacing: '-0.01em', color: C.paper },
  iconButton: { background: 'rgba(250,248,245,0.06)', border: '1px solid rgba(250,248,245,0.12)', borderRadius: 999, padding: '8px 14px', color: C.paper, cursor: 'pointer', transition: 'all 0.2s ease-out' },
  heroBlock: { marginBottom: 40 },
  eyebrow: { fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.accent, fontWeight: 600, marginBottom: 16 },
  primaryButton: { background: C.accent, color: C.primary, border: 'none', borderRadius: 14, padding: '18px 24px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: '0 8px 30px rgba(250,168,64,0.25)', fontFamily: 'inherit' },
  heroButtonWrap: { display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', padding: '8px 0' },
  heroButton: { width: 'clamp(300px, 88vw, 360px)', height: 'clamp(300px, 88vw, 360px)', borderRadius: '50%', background: 'transparent', border: `2px solid ${C.accent}`, color: C.accent, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit', animation: 'pulse3D 2.4s ease-in-out infinite', willChange: 'transform, box-shadow' },
  heroButtonLabel: { fontSize: 'clamp(32px, 8vw, 40px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', textAlign: 'center' },
  heroButtonArrow: { fontSize: 'clamp(44px, 11vw, 56px)', fontWeight: 400, marginTop: 4, lineHeight: 1 },
  buttonArrow: { fontSize: 20, fontWeight: 400 },
  footer: { marginTop: 'auto', paddingTop: 40 },
  signature: { borderTop: '1px solid rgba(250,248,245,0.1)', paddingTop: 20 },
  sigName: { fontFamily: '"DM Serif Display", serif', fontSize: 18, color: C.paper },
  sigTitle: { fontSize: 13, color: 'rgba(250,248,245,0.6)', marginTop: 2 },
  backLink: { background: 'transparent', border: 'none', color: 'rgba(250,248,245,0.7)', fontSize: 14, cursor: 'pointer', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' },
  h2: { fontFamily: '"DM Serif Display", serif', fontSize: 'clamp(1.8rem, 6vw, 2.4rem)', fontWeight: 400, letterSpacing: '-0.03em', margin: '8px 0 12px 0', lineHeight: 1.1 },
  sub: { color: 'rgba(250,248,245,0.65)', fontSize: 15, lineHeight: 1.5, margin: 0 },
  topicGrid: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 },
  topicChip: { background: 'rgba(250,248,245,0.05)', border: '1px solid rgba(250,248,245,0.12)', color: C.paper, padding: '20px 24px', borderRadius: 12, fontSize: 16, fontWeight: 500, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', opacity: 0, animation: 'chipEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards', transition: 'all 0.2s ease-out' },
  progress: { display: 'flex', gap: 6, marginTop: 16 },
  progressDot: { height: 4, flex: 1, borderRadius: 2, transition: 'background 0.3s ease-out' },
  fieldBlock: { marginBottom: 28 },
  fieldLabel: { display: 'block', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(250,248,245,0.6)', fontWeight: 600, marginBottom: 12 },
  input: { width: '100%', background: 'rgba(250,248,245,0.04)', border: '1px solid rgba(250,248,245,0.15)', borderRadius: 12, padding: '20px 18px', fontSize: 18, color: C.paper, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', transition: 'all 0.2s ease-out' },
  empty: { padding: 40, textAlign: 'center', background: 'rgba(250,248,245,0.04)', border: '1px dashed rgba(250,248,245,0.15)', borderRadius: 14 },
  emptyDot: { width: 12, height: 12, borderRadius: '50%', background: 'rgba(250,168,64,0.4)', margin: '0 auto 16px' },
  emptyText: { color: 'rgba(250,248,245,0.6)', fontSize: 14, margin: 0 },
  logList: { display: 'flex', flexDirection: 'column', gap: 10 },
  logItem: { background: 'rgba(250,248,245,0.05)', border: '1px solid rgba(250,248,245,0.1)', borderRadius: 12, padding: '16px 18px' },
  logName: { fontSize: 16, fontWeight: 600, color: C.paper, fontFamily: '"DM Serif Display", serif' },
  logMeta: { fontSize: 13, color: 'rgba(250,248,245,0.65)', marginTop: 4 },
  logFooter: { marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logTopic: { fontSize: 11, color: C.accent, background: 'rgba(250,168,64,0.12)', padding: '4px 10px', borderRadius: 999, letterSpacing: '0.03em' },
  logTime: { fontSize: 11, color: 'rgba(250,248,245,0.5)', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },
  logLinkedIn: { marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(10,102,194,0.12)', border: '1px solid rgba(10,102,194,0.3)', borderRadius: 8, color: C.paper, fontSize: 13, fontWeight: 500, textDecoration: 'none', transition: 'all 0.2s ease-out' },
  logLinkedInIcon: { width: 22, height: 22, borderRadius: 4, background: '#0a66c2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, fontFamily: 'Georgia, serif' },
  thankYouStage: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100vh', padding: '60px 24px 32px', textAlign: 'center' },
  thankYouContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 },
  thankYouLogo: { width: 110, height: 110, objectFit: 'contain', marginBottom: 36, filter: 'drop-shadow(0 0 24px rgba(250,168,64,0.35))' },
  thankYouTitle: { fontFamily: '"DM Serif Display", serif', fontSize: 'clamp(2.25rem, 8vw, 3rem)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, color: C.paper },
  thankYouBody: { fontSize: 17, lineHeight: 1.55, color: 'rgba(250,248,245,0.78)', maxWidth: '32ch', margin: '20px auto 0' },
  thankYouButton: { background: 'transparent', color: 'rgba(250,248,245,0.7)', border: `1px solid ${C.accent}66`, borderRadius: 14, padding: '14px 20px', fontSize: 14, fontWeight: 600, letterSpacing: '0.02em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', fontFamily: 'inherit' }
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: ${C.primary}; }
  input::placeholder { color: rgba(250,248,245,0.35); }
  input:focus { border-color: rgba(250,168,64,0.6) !important; background: rgba(250,248,245,0.07) !important; box-shadow: 0 0 0 4px rgba(250,168,64,0.12); }
  .topic-chip:hover { background: rgba(250,168,64,0.12) !important; border-color: rgba(250,168,64,0.4) !important; transform: translateY(-2px); }
  .topic-chip:active { transform: translateY(0); }
  button:hover:not(:disabled) { transform: translateY(-1px); }
  button:active:not(:disabled) { transform: translateY(0); }
  @keyframes screenEnter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes chipEnter { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
  .field-enter { animation: fieldEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
  @keyframes fieldEnter { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pulse3D {
    0%, 100% {
      box-shadow:
        0 0 0 0 rgba(250,168,64,0.55),
        0 8px 24px rgba(250,168,64,0.25),
        inset 0 3px 10px rgba(255,255,255,0.10),
        inset 0 -3px 10px rgba(0,0,0,0.25);
      transform: translateY(0);
    }
    50% {
      box-shadow:
        0 0 0 18px rgba(250,168,64,0),
        0 14px 36px rgba(250,168,64,0.45),
        inset 0 3px 10px rgba(255,255,255,0.18),
        inset 0 -3px 10px rgba(0,0,0,0.28);
      transform: translateY(-3px);
    }
  }
  .thankyou-enter { animation: thankYouFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .thankyou-enter > div:first-child > img { animation: thankYouLogoPop 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .thankyou-enter > div:first-child > h1 { animation: thankYouRise 0.7s 0.15s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .thankyou-enter > div:first-child > p { animation: thankYouRise 0.7s 0.30s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .thankyou-enter > button { animation: thankYouRise 0.7s 0.50s cubic-bezier(0.16, 1, 0.3, 1) both; }
  @keyframes thankYouFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes thankYouLogoPop { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes thankYouRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
`;
