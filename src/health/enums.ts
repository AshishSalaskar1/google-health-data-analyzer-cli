const EXERCISE_TYPES: Record<number, string> = {
  2: "Badminton",
  4: "Baseball",
  8: "Biking",
  9: "Stationary biking",
  13: "Calisthenics",
  16: "Cricket",
  25: "Elliptical",
  33: "Hiking",
  36: "Ice skating",
  41: "Martial arts",
  46: "Rowing",
  47: "Rowing machine",
  53: "Walking",
  54: "Water polo",
  55: "Weightlifting",
  56: "Wheelchair",
  58: "Other workout",
  79: "Running",
};

export function exerciseName(type: number): string {
  return EXERCISE_TYPES[type] ?? `Activity ${type}`;
}
