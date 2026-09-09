import type { HealthReport } from "../health/models";
import type { HealthAspect, HealthProfile, OverallAssessment } from "./models";

const WHO_ACTIVITY = "https://www.who.int/news-room/fact-sheets/detail/physical-activity";
const CDC_SLEEP = "https://www.cdc.gov/sleep/about/index.html";
const CDC_BMI = "https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html";
const AHA_HEART = "https://www.heart.org/en/healthy-living/fitness/fitness-basics/target-heart-rates";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const rounded = (value: number) => Math.round(value);

function scoreBand(value: number, idealLow: number, idealHigh: number, outerLow: number, outerHigh: number): number {
  if (value >= idealLow && value <= idealHigh) return 100;
  if (value < idealLow) return clamp((value - outerLow) / (idealLow - outerLow) * 100);
  return clamp((outerHigh - value) / (outerHigh - idealHigh) * 100);
}

export function assessOverallHealth(profile: HealthProfile, report: HealthReport): OverallAssessment {
  const days = Math.max(report.summary.trackedDays, 1);
  const weeks = Math.max(days / 7, 1 / 7);
  const exercisePerWeek = report.summary.exerciseMinutes / weeks;
  const bmi = profile.weightKg / ((profile.heightCm / 100) ** 2);
  const latestResting = report.restingHeartRate.at(-1)?.value ?? report.sleep.find((session) => session.restingHeartRate !== null)?.restingHeartRate ?? null;

  const hasMovement = report.activity.length > 0;
  const hasTraining = report.availableTables.includes("exercise_session_record_table");
  const movementScore = hasMovement ? rounded(clamp(report.summary.averageDailySteps / 8000 * 100)) : null;
  const trainingScore = hasTraining ? rounded(clamp(exercisePerWeek / 150 * 100)) : null;
  const sleepHours = report.summary.averageAsleepMinutes === null ? null : report.summary.averageAsleepMinutes / 60;
  const durationScore = sleepHours === null ? null : scoreBand(sleepHours, 7, 9, 4, 12);
  const sleepScore = durationScore === null ? null : rounded(durationScore * .7 + clamp(report.summary.averageSleepEfficiency ?? 0) * .3);
  const cardioScore = latestResting === null ? null : rounded(scoreBand(latestResting, 50, 70, 35, 100));
  const bodyScore = rounded(scoreBand(bmi, 18.5, 24.9, 14, 40));

  const aspects: HealthAspect[] = [
    { id: "movement", label: "Movement", score: movementScore, value: movementScore === null ? "No data" : `${rounded(report.summary.averageDailySteps).toLocaleString()} steps/day`, detail: "Daily movement volume", ageImpact: movementScore === null ? 0 : (75 - movementScore) * .08, evidence: "Daily steps provide context beyond formal workouts; 8,000 is used as a transparent display target, not a medical threshold.", sourceUrl: WHO_ACTIVITY },
    { id: "training", label: "Training", score: trainingScore, value: trainingScore === null ? "No data" : `${rounded(exercisePerWeek)} min/week`, detail: "Recorded exercise pace", ageImpact: trainingScore === null ? 0 : (75 - trainingScore) * .08, evidence: "WHO recommends at least 150 minutes of moderate-intensity activity per week for adults.", sourceUrl: WHO_ACTIVITY },
    { id: "sleep", label: "Sleep", score: sleepScore, value: sleepHours === null ? "No data" : `${sleepHours.toFixed(1)} h/night`, detail: report.summary.averageSleepEfficiency === null ? "No efficiency data" : `${rounded(report.summary.averageSleepEfficiency)}% efficiency`, ageImpact: sleepScore === null ? 0 : (75 - sleepScore) * .08, evidence: "The duration component uses the common adult range of 7–9 hours; recorded efficiency contributes less weight.", sourceUrl: CDC_SLEEP },
    { id: "cardio", label: "Cardio", score: cardioScore, value: latestResting === null ? "No data" : `${rounded(latestResting)} bpm`, detail: "Latest resting heart rate", ageImpact: cardioScore === null ? 0 : (75 - cardioScore) * .08, evidence: "Resting heart rate is interpreted as one wellness signal; medicines, fitness, stress, and illness can affect it.", sourceUrl: AHA_HEART },
    { id: "body", label: "Body", score: bodyScore, value: `BMI ${bmi.toFixed(1)}`, detail: `${profile.weightKg.toFixed(1)} kg at ${profile.heightCm.toFixed(0)} cm`, ageImpact: (75 - bodyScore) * .08, evidence: "BMI is a screening measure and does not distinguish muscle from fat or represent a diagnosis.", sourceUrl: CDC_BMI },
  ];
  const available = aspects.filter((aspect) => aspect.score !== null);
  const overallScore = rounded(available.reduce((sum, aspect) => sum + aspect.score!, 0) / available.length);
  const rawAdjustment = aspects.reduce((sum, aspect) => sum + aspect.ageImpact, 0);
  const adjustment = clamp(rawAdjustment, -8, 12);
  const coverage = available.length / aspects.length;
  return {
    overallScore,
    estimatedAge: rounded(clamp(profile.age + adjustment, 18, 100)),
    confidence: coverage === 1 && days >= 28 ? "strong" : coverage >= .8 && days >= 14 ? "moderate" : "limited",
    bmi,
    aspects,
    coverage,
  };
}
