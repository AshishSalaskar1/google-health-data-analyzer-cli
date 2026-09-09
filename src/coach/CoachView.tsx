import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowUp, BookOpen, Bot, CalendarDays, Check, ChevronDown, ChevronUp, Cloud, Database, Download, LoaderCircle, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DatabaseInfo, HealthReport } from "../health/models";
import { requestCoachAnswer, requestContextPlan } from "./coachApi";
import { buildCoachCatalog, executeCoachTools } from "./healthTools";
import { clearCoachState, EMPTY_PROFILE, loadCoachState, saveCoachState } from "./coachStore";
import type { CoachChart, CoachMessage, CoachProfile } from "./models";

interface Props {
  info: DatabaseInfo;
  report: HealthReport;
  analyze: (from: string, to: string) => Promise<HealthReport>;
}

const SUGGESTIONS = ["What changed in my sleep recently?", "How balanced was my activity and recovery?", "Create a realistic weekly plan for me."];
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function inlineContent(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|\[[HG]\d+\])/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\[[HG]\d+\]$/.test(part)) return <span className={`citation ${part[1] === "H" ? "health" : "guidance"}`} key={index}>{part.slice(1, -1)}</span>;
    return part;
  });
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    const nextContent = lines.slice(index + 1).find((item) => item.trim())?.trim() || "";
    const inferredHeading = line.length <= 45 && !/[.!?]$/.test(line) && /^([-*]\s+|\d+[.)]\s+)/.test(nextContent) ? [line, line] : null;
    const heading = line.match(/^#{1,3}\s+(.+)$/) ?? line.match(/^([^:]{2,45}):$/) ?? inferredHeading;
    if (heading) { blocks.push(<h3 key={index}>{inlineContent(heading[1])}</h3>); index++; continue; }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) items.push(lines[index++].trim().replace(/^[-*]\s+/, ""));
      blocks.push(<ul key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item)}</li>)}</ul>); continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) items.push(lines[index++].trim().replace(/^\d+[.)]\s+/, ""));
      blocks.push(<ol key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item)}</li>)}</ol>); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/.test(lines[index].trim())) paragraph.push(lines[index++].trim());
    blocks.push(<p key={index}>{inlineContent(paragraph.join(" "))}</p>);
  }
  return <div className="message-content">{blocks}</div>;
}

const chartDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function InlineChart({ chart }: { chart: CoachChart }) {
  const series = chart.series[0];
  if (!series || !chart.points?.length) return null;
  const data = chart.points.map((item) => ({ label: item.label, ...item.values }));
  const formatChartDate = (value: ReactNode) => { const label = String(value ?? ""); return chartDate.format(new Date(label.includes("T") ? label : `${label}T00:00:00Z`)); };
  const content = chart.type === "bar"
    ? <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} tickFormatter={formatChartDate} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${value}${series.unit}`, series.label]} labelFormatter={formatChartDate} /><Bar dataKey={series.key} fill="var(--chart-violet)" radius={[8, 8, 3, 3]} /></BarChart>
    : <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}><defs><linearGradient id={`coach-${series.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-teal)" stopOpacity=".28" /><stop offset="1" stopColor="var(--chart-teal)" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} tickFormatter={formatChartDate} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${value}${series.unit}`, series.label]} labelFormatter={formatChartDate} /><Area dataKey={series.key} type="monotone" stroke="var(--chart-teal)" strokeWidth={3} fill={`url(#coach-${series.key})`} dot={{ r: 3, fill: "var(--surface)", strokeWidth: 2 }} /></AreaChart>;
  return <figure className="coach-inline-chart"><figcaption><div><span>Data view</span><strong>{chart.title}</strong></div><small>{chart.subtitle}</small></figcaption><div className="coach-chart-canvas"><ResponsiveContainer>{content}</ResponsiveContainer></div></figure>;
}

function ProfileEditor({ profile, onSave }: { profile: CoachProfile; onSave: (value: CoachProfile) => void }) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  return <section className="coach-profile"><div className="coach-section-title"><div><span className="eyebrow">Coach context</span><h2>Make it personal</h2></div><ShieldCheck /></div>
    <label>Your name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Optional" /></label>
    <label>Your goals<textarea value={draft.goals} onChange={(event) => setDraft({ ...draft, goals: event.target.value })} placeholder="Sleep more consistently, run a 5K..." /></label>
    <label>Preferences<textarea value={draft.preferences} onChange={(event) => setDraft({ ...draft, preferences: event.target.value })} placeholder="Activities you enjoy, available days..." /></label>
    <label>Constraints<textarea value={draft.constraints} onChange={(event) => setDraft({ ...draft, constraints: event.target.value })} placeholder="Schedule limits, injuries, clinician advice..." /></label>
    <button className="coach-secondary" onClick={() => { onSave(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2400); }}><Check />{saved ? "Context saved" : "Save context"}</button><span className="sr-status" aria-live="polite">{saved ? "Coach context saved." : ""}</span>
  </section>;
}

function Evidence({ message }: { message: CoachMessage }) {
  const [open, setOpen] = useState(false);
  if (!message.evidence?.length) return null;
  return <div className="coach-evidence"><button onClick={() => setOpen(!open)}>{open ? <ChevronUp /> : <ChevronDown />} {message.evidence.length} sources used</button>{open && <div className="evidence-list">{message.evidence.map((item) => <article key={item.id}><span>{item.kind === "health" ? <Database /> : <BookOpen />}{item.id}</span><div><strong>{item.title}</strong><small>{item.source}{item.period ? ` · ${item.period}` : ""}</small>{item.coverage && <p>{item.coverage}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">Open source</a>}</div></article>)}</div>}</div>;
}

export function CoachView({ info, report, analyze }: Props) {
  const initial = useRef(loadCoachState()).current;
  const [consented, setConsented] = useState(initial.consented);
  const [profile, setProfile] = useState(initial.profile);
  const [messages, setMessages] = useState(initial.messages);
  const [weeklyPlan, setWeeklyPlan] = useState(initial.weeklyPlan);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInteracted = useRef(false);

  useEffect(() => { saveCoachState({ consented, profile, messages, weeklyPlan }); }, [consented, profile, messages, weeklyPlan]);
  useEffect(() => {
    if (!hasInteracted.current) return;
    endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0";
    input.style.height = `${Math.max(58, input.scrollHeight)}px`;
  }, [question]);

  const send = async (text: string, wantsWeeklyPlan = /\b(plan|week|schedule)\b/i.test(text)) => {
    const value = text.trim();
    if (!value || busy) return;
    hasInteracted.current = true;
    const user: CoachMessage = { id: id(), role: "user", content: value, createdAt: Date.now() };
    const nextMessages = [...messages, user];
    setMessages(nextMessages); setQuestion(""); setBusy(true); setError("");
    try {
      const common = { question: value, profile, catalog: buildCoachCatalog(report), history: messages.slice(-8).map(({ role, content }) => ({ role, content })), wantsWeeklyPlan };
      const plan = await requestContextPlan(common);
      const healthEvidence = await executeCoachTools({ info, analyze: (filters) => analyze(filters.from, filters.to) }, plan.requests);
      const result = await requestCoachAnswer({ ...common, evidence: healthEvidence });
      const assistant: CoachMessage = { id: id(), role: "assistant", content: result.answer, createdAt: Date.now(), evidence: result.evidence, chart: result.chart, urgent: result.urgent };
      setMessages([...nextMessages, assistant]);
      if (result.weeklyPlan) setWeeklyPlan(result.weeklyPlan);
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : String(cause)} Your conversation is still here. Check your connection and try sending again.`); }
    finally { setBusy(false); }
  };

  const reset = () => {
    if (!window.confirm("Delete your coach profile, conversation, and weekly plan from this browser? This cannot be undone.")) return;
    clearCoachState(); setConsented(false); setProfile(EMPTY_PROFILE); setMessages([]); setWeeklyPlan(undefined);
  };
  const clearChat = () => {
    if (!messages.length || !window.confirm("Clear this conversation? Your coach profile and weekly plan will be kept.")) return;
    setMessages([]); setError("");
  };
  const exportPdf = async () => {
    const { exportChatPdf } = await import("./exportChatPdf");
    exportChatPdf(messages, profile, weeklyPlan);
  };
  if (!consented) return <div className="coach-consent"><div className="consent-mark"><Bot /></div><h1>Insights with<br />a clear boundary.</h1><p>The coach uses Azure AI Foundry models to interpret selected summaries from your imported archive. Your questions, profile, and the health aggregates chosen for each question leave this browser for inference. This is personalized wellness guidance, not diagnosis or emergency care.</p><div className="consent-grid"><span><Database /><b>Purpose-selected data</b><small>The model asks for bounded dates and detail.</small></span><span><Cloud /><b>Cloud inference</b><small>Selected data is sent to your configured model.</small></span><span><ShieldCheck /><b>Risk-aware responses</b><small>Risk flags can suggest clinical follow-up, but do not replace emergency services.</small></span></div><button className="coach-primary" onClick={() => setConsented(true)}>I understand, start coaching</button></div>;

  return <div className="coach-page"><section className="coach-main"><header className="coach-hero"><div><span className="kicker">Personal health coach</span><h1>{profile.name ? `${profile.name}, ask about your health.` : "Ask about your health."}</h1><p>Grounded in selected measurements from {info.minDate} through {info.maxDate}.</p></div><div className="coach-hero-actions"><Sparkles /><div><button disabled={!messages.length || busy} onClick={() => void exportPdf()}><Download />Export PDF</button><button disabled={!messages.length || busy} className="danger" onClick={clearChat}><Trash2 />Clear chat</button></div></div></header>
    {!messages.length && <div className="coach-starters"><span>Try asking</span>{SUGGESTIONS.map((item) => <button key={item} onClick={() => void send(item)}>{item}</button>)}</div>}
    <div className="coach-thread" aria-live="polite">{messages.map((message) => <article key={message.id} className={`coach-message ${message.role} ${message.urgent ? "urgent" : ""}`} role={message.urgent ? "alert" : undefined}><div className="message-role">{message.role === "assistant" ? <Bot /> : <span>You</span>}</div><div className="message-surface">{message.urgent && <div className="urgent-guidance"><AlertTriangle /><span><strong>Act on urgent symptoms now</strong>If you may be in immediate danger, contact local emergency services. This coach cannot provide emergency care.</span></div>}{message.role === "assistant" && <span className="message-name">Health coach</span>}<MessageContent content={message.content} />{message.chart && <InlineChart chart={message.chart} />}<Evidence message={message} /></div></article>)}{busy && <article className="coach-message assistant"><div className="message-role"><Bot /></div><div className="message-surface coach-thinking"><LoaderCircle className="spin" /><span>Reading the right health signals and consulting specialists...</span></div></article>}<div ref={endRef} /></div>
    {error && <div className="coach-error" role="alert"><AlertTriangle /><span><strong>The coach could not finish that response.</strong>{error}</span></div>}
    <form className="coach-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void send(question); }}><textarea ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(question); } }} placeholder="Ask about a trend, recovery, or your next week..." rows={1} /><button disabled={busy || !question.trim()} aria-label="Send"><ArrowUp /></button><div className="composer-foot"><small>Selected summaries use your Azure model</small><span><kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</span></div></form>
  </section><aside className="coach-rail"><ProfileEditor profile={profile} onSave={setProfile} />
    <section className="weekly-plan"><div className="coach-section-title"><div><span className="eyebrow">Adaptive plan</span><h2>This week</h2></div><CalendarDays /></div>{weeklyPlan ? <><h3>{weeklyPlan.title}</h3><p>{weeklyPlan.rationale}</p><div>{weeklyPlan.items.map((item, index) => <article key={`${item.day}-${index}`}><span>{item.day}</span><div><strong>{item.focus}</strong><p>{item.action}</p><small>{item.target}</small></div></article>)}</div><em>{weeklyPlan.adjustment}</em></> : <><p>No plan yet. Ask the coach to create a weekly plan from your goals and recent data.</p><button className="coach-secondary" onClick={() => void send("Create a realistic seven-day wellness plan using my goals and recent health data.", true)}>Build my week</button></>}</section>
    <button className="coach-delete" onClick={reset}><Trash2 />Delete coach profile and history</button>
  </aside></div>;
}
