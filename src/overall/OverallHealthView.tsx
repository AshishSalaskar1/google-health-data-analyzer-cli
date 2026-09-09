import { useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Bot, Check, Dumbbell, Footprints, HeartPulse, Info, Moon, RotateCcw, Scale, Sparkles, type LucideIcon } from "lucide-react";
import type { HealthReport } from "../health/models";
import type { Units } from "../health/models";
import type { BodyAgeResponse, HealthAspect, HealthAspectId, HealthProfile } from "./models";
import { requestBodyAge } from "./overallApi";
import { assessOverallHealth } from "./scoring";

const COLORS: Record<HealthAspectId, string> = { movement: "#32d74b", training: "#ff9f0a", sleep: "#5e5ce6", cardio: "#ff375f", body: "#0a84ff" };
const ASPECT_ICONS: Record<HealthAspectId, LucideIcon> = { movement: Footprints, training: Dumbbell, sleep: Moon, cardio: HeartPulse, body: Scale };
const PROFILE_KEY = "health-overall-profile";

function polarPoint(radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: 200 + radius * Math.cos(radians), y: 200 + radius * Math.sin(radians) };
}

function petalPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const corner = Math.min(10, Math.max(2, (outerRadius - innerRadius) / 3));
  const outerDelta = corner / outerRadius * 180 / Math.PI;
  const innerDelta = corner / innerRadius * 180 / Math.PI;
  const startInnerLine = polarPoint(innerRadius + corner, startAngle);
  const startOuterLine = polarPoint(outerRadius - corner, startAngle);
  const startOuterCorner = polarPoint(outerRadius, startAngle);
  const startOuterArc = polarPoint(outerRadius, startAngle + outerDelta);
  const endOuterArc = polarPoint(outerRadius, endAngle - outerDelta);
  const endOuterCorner = polarPoint(outerRadius, endAngle);
  const endOuterLine = polarPoint(outerRadius - corner, endAngle);
  const endInnerLine = polarPoint(innerRadius + corner, endAngle);
  const endInnerCorner = polarPoint(innerRadius, endAngle);
  const endInnerArc = polarPoint(innerRadius, endAngle - innerDelta);
  const startInnerArc = polarPoint(innerRadius, startAngle + innerDelta);
  const startInnerCorner = polarPoint(innerRadius, startAngle);
  return `M ${startInnerLine.x} ${startInnerLine.y} L ${startOuterLine.x} ${startOuterLine.y} Q ${startOuterCorner.x} ${startOuterCorner.y} ${startOuterArc.x} ${startOuterArc.y} A ${outerRadius} ${outerRadius} 0 0 1 ${endOuterArc.x} ${endOuterArc.y} Q ${endOuterCorner.x} ${endOuterCorner.y} ${endOuterLine.x} ${endOuterLine.y} L ${endInnerLine.x} ${endInnerLine.y} Q ${endInnerCorner.x} ${endInnerCorner.y} ${endInnerArc.x} ${endInnerArc.y} A ${innerRadius} ${innerRadius} 0 0 0 ${startInnerArc.x} ${startInnerArc.y} Q ${startInnerCorner.x} ${startInnerCorner.y} ${startInnerLine.x} ${startInnerLine.y} Z`;
}

function validProfile(value: unknown): value is HealthProfile {
  const profile = value as HealthProfile;
  return Boolean(profile && profile.age >= 18 && profile.age <= 100 && profile.heightCm >= 100 && profile.heightCm <= 250 && profile.weightKg >= 30 && profile.weightKg <= 350);
}

function readProfile(): HealthProfile | null {
  try { const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); return validProfile(value) ? value : null; }
  catch { return null; }
}

function ProfileForm({ initial, units, onSave }: { initial: HealthProfile; units: Units; onSave: (profile: HealthProfile) => void }) {
  const imperial = units === "imperial";
  const [age, setAge] = useState(initial.age ? String(initial.age) : "");
  const [height, setHeight] = useState(initial.heightCm ? String(imperial ? initial.heightCm / 2.54 : initial.heightCm) : "");
  const [weight, setWeight] = useState(initial.weightKg ? String(imperial ? initial.weightKg * 2.20462262 : initial.weightKg) : "");
  const [gender, setGender] = useState<NonNullable<HealthProfile["gender"]>>(initial.gender ?? "prefer-not-to-say");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const profile = {
      age: Number(age),
      heightCm: Number(height) * (imperial ? 2.54 : 1),
      weightKg: Number(weight) / (imperial ? 2.20462262 : 1),
      gender,
    };
    if (validProfile(profile)) onSave(profile);
  };
  return <section className="overall-onboarding">
    <div className="onboarding-copy"><span>Your baseline</span><h1>Start with the details your archive cannot know.</h1><p>Age and body measurements put wearable trends in context. These details stay in this browser and are only shared as a small summary when you choose <b>Get my Body Age</b>.</p><div><Check /> Raw archive stays local</div><div><Check /> You can edit or erase this profile</div></div>
    <form onSubmit={submit} className="profile-form"><h2>About you</h2><p>Required fields are used only for this wellness estimate.</p><div className="profile-fields"><label>Age<input required type="number" min="18" max="100" value={age} onChange={(event) => setAge(event.target.value)} /><small>years</small></label><label>Gender<select value={gender} onChange={(event) => setGender(event.target.value as NonNullable<HealthProfile["gender"]>)}><option value="female">Female</option><option value="male">Male</option><option value="nonbinary">Nonbinary</option><option value="prefer-not-to-say">Prefer not to say</option></select></label><label>Height<input required type="number" min={imperial ? 39 : 100} max={imperial ? 98 : 250} step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} /><small>{imperial ? "in" : "cm"}</small></label><label>Weight<input required type="number" min={imperial ? 66 : 30} max={imperial ? 772 : 350} step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} /><small>{imperial ? "lb" : "kg"}</small></label></div><button type="submit">See my overall health</button><small className="form-note"><Info /> For adults 18+. Gender is retained as profile context and does not change the local score formula.</small></form>
  </section>;
}

function HealthFlower({ aspects, selected, onSelect, overall }: { aspects: HealthAspect[]; selected: HealthAspectId; onSelect: (id: HealthAspectId) => void; overall: number }) {
  const activate = (event: KeyboardEvent<SVGGElement>, id: HealthAspectId) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); } };
  return <svg className="health-flower" viewBox="0 0 400 400" role="group" aria-label={`Overall wellness score ${overall} out of 100. Select a petal for details.`}>
    {aspects.map((aspect, index) => {
      const start = -31 + index * 72;
      const end = 31 + index * 72;
      const score = aspect.score ?? 0;
      const fillRadius = 62 + score / 100 * 92;
      const iconPoint = polarPoint(62 + Math.max(18, (fillRadius - 62) * .55), index * 72);
      const labelPoint = polarPoint(174, index * 72);
      const Icon = ASPECT_ICONS[aspect.id];
      return <g className={`health-petal ${selected === aspect.id ? "selected" : ""}`} key={aspect.id} role="button" tabIndex={0} aria-label={`${aspect.label}: ${aspect.score === null ? "not scored" : `${aspect.score} out of 100`}`} onClick={() => onSelect(aspect.id)} onKeyDown={(event) => activate(event, aspect.id)}>
        <path className="petal-shell" d={petalPath(62, 154, start, end)} />
        {aspect.score !== null && <path className="petal-fill" d={petalPath(62, fillRadius, start, end)} style={{ fill: COLORS[aspect.id] }} />}
        {aspect.score !== null && <Icon className="petal-icon" x={iconPoint.x - 10} y={iconPoint.y - 10} width="20" height="20" aria-hidden="true" />}
        <text className="petal-label" x={labelPoint.x} y={labelPoint.y + 3} textAnchor="middle">{aspect.label}</text>
      </g>;
    })}
    <circle cx="200" cy="200" r="57" className="flower-centre" /><text x="200" y="194" className="flower-number" textAnchor="middle">{overall}</text><text x="200" y="216" className="flower-caption" textAnchor="middle">OVERALL</text>
  </svg>;
}

export function OverallHealthView({ report, units }: { report: HealthReport; units: Units }) {
  const latestWeight = report.summary.latestWeightGrams ? report.summary.latestWeightGrams / 1000 : 0;
  const [profile, setProfile] = useState<HealthProfile | null>(readProfile);
  const [selected, setSelected] = useState<HealthAspectId>("movement");
  const [result, setResult] = useState<BodyAgeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saveProfile = (value: HealthProfile) => { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)); setProfile(value); setResult(null); window.scrollTo({ top: 0, behavior: "instant" }); };
  if (!profile) return <ProfileForm initial={{ age: 0, heightCm: 0, weightKg: latestWeight }} units={units} onSave={saveProfile} />;
  const assessment = assessOverallHealth(profile, report);
  const active = assessment.aspects.find((aspect) => aspect.id === selected)!;
  const availableAspects = assessment.aspects.filter((aspect) => aspect.score !== null);
  const strongest = [...availableAspects].sort((a, b) => b.score! - a.score!)[0];
  const priority = [...availableAspects].sort((a, b) => a.score! - b.score!)[0];
  const ageDifference = assessment.estimatedAge - profile.age;
  const displayHeight = units === "imperial" ? `${(profile.heightCm / 2.54).toFixed(1)} in` : `${profile.heightCm.toFixed(0)} cm`;
  const displayWeight = units === "imperial" ? `${(profile.weightKg * 2.20462262).toFixed(1)} lb` : `${profile.weightKg.toFixed(1)} kg`;
  const displayGender = profile.gender === "prefer-not-to-say" || !profile.gender ? "Not specified" : profile.gender === "nonbinary" ? "Nonbinary" : profile.gender[0].toUpperCase() + profile.gender.slice(1);
  const editProfile = () => { localStorage.removeItem(PROFILE_KEY); setProfile(null); window.scrollTo({ top: 0, behavior: "instant" }); };
  const getAge = async () => { setBusy(true); setError(""); try { setResult(await requestBodyAge({ profile, assessment, period: report.range })); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  return <div className="overall-page"><header className="overall-intro"><div><span>Overall health</span><h1>Your signals,<br />in balance.</h1></div><p>A transparent wellness snapshot from {report.summary.trackedDays} tracked days. Select a petal to see what shaped it; missing data lowers confidence, never your score.</p></header>
    <section className="overall-dashboard"><div className="flower-stage"><HealthFlower aspects={assessment.aspects} selected={selected} onSelect={setSelected} overall={assessment.overallScore} /><div className="flower-key" aria-label="Health aspect scores">{assessment.aspects.map((aspect) => <button key={aspect.id} className={selected === aspect.id ? "active" : ""} onClick={() => setSelected(aspect.id)}><i style={{ background: COLORS[aspect.id] }} /><span>{aspect.label}</span><b>{aspect.score ?? "—"}</b></button>)}</div><div className="flower-legend"><span>Colored reach shows score</span><span>{Math.round(assessment.coverage * 100)}% metric coverage</span></div></div>
      <div className="aspect-detail" aria-live="polite" style={{ "--aspect-color": COLORS[active.id] } as CSSProperties}><span>{active.label}</span><strong>{active.score ?? "—"}<small>/100</small></strong><h2>{active.id === "body" && units === "imperial" ? `BMI ${assessment.bmi.toFixed(1)}` : active.value}</h2><p>{active.detail}. {active.evidence}</p><a href={active.sourceUrl} target="_blank" rel="noreferrer">View reference method</a></div></section>
    <section className={`body-age-section ${result ? "has-result" : ""}`}><div className="body-age-copy"><Bot /><span>Body Age</span><h2>{result ? <>Your estimated Body Age is <b>{result.estimatedAge}</b></> : "Get my Body Age"}</h2><div className="body-age-profile" aria-label="Body Age profile details"><span><small>Age</small><b>{profile.age}</b></span><span><small>Gender</small><b>{displayGender}</b></span><span><small>Height</small><b>{displayHeight}</b></span><span><small>Weight</small><b>{displayWeight}</b></span><button onClick={editProfile}>Edit details</button></div>{result && <div className="age-difference"><strong>{ageDifference > 0 ? "+" : ""}{ageDifference} years</strong><span>{ageDifference === 0 ? "the same as" : ageDifference < 0 ? "younger than" : "older than"} your chronological age</span></div>}<p>{result?.summary ?? "Your Body Age estimate combines your chronological age and the five visible wellness scores. AI is used only after you click, to identify the strongest factors and explain them in plain language."}</p><button onClick={getAge} disabled={busy}>{busy ? <RotateCcw className="spin" /> : <Sparkles />}{busy ? "Calculating Body Age..." : result ? "Refresh my Body Age" : "Get my Body Age"}</button>{error && <div className="body-age-error" role="alert">{error}</div>}<small>Wellness estimate only. Not biological age, a diagnosis, or a proprietary device score.</small></div>
      <div className="age-factors" aria-live="polite">{result ? <><div className="result-glance"><span><small>Confidence</small><b>{assessment.confidence}</b></span><span><small>Strongest area</small><b>{strongest?.label ?? "Not enough data"}</b></span><span><small>Best opportunity</small><b>{priority?.label ?? "Not enough data"}</b></span></div><h3>Let's take a look at your results</h3><p className="results-lead">Your {strongest?.label.toLowerCase()} signal is currently the strongest part of the picture. {priority && strongest?.id !== priority.id ? `${priority.label} has the most room to improve this estimate.` : "Your available signals are closely balanced."}</p>{result.topFactors.map((factor) => { const aspect = assessment.aspects.find((item) => item.id === factor.aspectId)!; return <article key={factor.aspectId}><i style={{ background: COLORS[factor.aspectId] }}>{factor.direction === "adds" ? <ArrowUp /> : <ArrowDown />}</i><div><span>{aspect.label} · score {aspect.score}</span><strong>{factor.direction === "adds" ? "+" : "−"}{factor.years} years</strong><p>{factor.explanation}</p></div></article>; })}<details><summary>How this estimate was made</summary><p>{result.methodology} It used {availableAspects.length} of 5 available categories across {report.summary.trackedDays} tracked days.</p></details></> : <div className="age-empty"><span>{profile.age}</span><p>Your chronological age</p><i /><p>AI explanation waits for your permission</p></div>}</div></section>
    <button className="edit-profile" onClick={editProfile}>Edit or clear profile</button></div>;
}
