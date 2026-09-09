import { lazy, Suspense, useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import type { Theme } from "./health/models";

const App = lazy(() => import("./App"));

function UploadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
}

function FileHeartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9.5 15.5 12 18l3.5-4a2.1 2.1 0 0 0-3.5-2 2.1 2.1 0 0 0-3.5 2c0 .6.3 1.1 1 1.5Z" /></svg>;
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "light"
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></svg>;
}

function PrivacyIcon({ kind }: { kind: "local" | "readonly" | "coach" }) {
  if (kind === "local") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (kind === "readonly") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M9 8V5h6v3M9 13h.01M15 13h.01M9 16h6" /></svg>;
}

function ImportGate({ busy = false, onFile, theme, onThemeChange }: { busy?: boolean; onFile: (file: File) => void; theme: Theme; onThemeChange: () => void }) {
  const [dragging, setDragging] = useState(false);
  const choose = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onFile(file); };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); };

  return <main className="import-page">
    <div className="import-mark"><FileHeartIcon /><span>Health Studio</span></div>
    <button className="import-theme" onClick={onThemeChange} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><ThemeIcon theme={theme} /></button>
    <section className="import-copy"><h1>Your health archive.<br />Clear and private.</h1><p>Explore activity, heart rate, workouts, recovery, and recorded sleep stages. Your raw database never leaves this browser.</p></section>
    <label className={`drop-zone ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <input type="file" accept=".db,.sqlite,.sqlite3,application/x-sqlite3" disabled={busy} onChange={choose} />
      <div className="drop-icon"><UploadIcon /></div><strong>{busy ? "Opening Health Studio..." : "Open a Health Connect export"}</strong><span>{busy ? "Preparing your private workspace" : "Drop a .db file here or choose a file"}</span>{!busy && <b>Choose database <span aria-hidden="true">›</span></b>}
    </label>
    <footer className="privacy-strip"><div><PrivacyIcon kind="local" /><span><b>Local archive</b>Never uploaded</span></div><div><PrivacyIcon kind="readonly" /><span><b>Read only</b>Original unchanged</span></div><div><PrivacyIcon kind="coach" /><span><b>Coach opt-in</b>Selected summaries use cloud AI</span></div></footer>
  </main>;
}

export default function Bootstrap() {
  const [file, setFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("health-theme") === "dark" ? "dark" : "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("health-theme", theme); }, [theme]);
  const toggleTheme = () => setTheme((current) => current === "light" ? "dark" : "light");
  if (!file) return <ImportGate onFile={setFile} theme={theme} onThemeChange={toggleTheme} />;
  return <Suspense fallback={<ImportGate busy onFile={setFile} theme={theme} onThemeChange={toggleTheme} />}><App initialFile={file} initialTheme={theme} /></Suspense>;
}
