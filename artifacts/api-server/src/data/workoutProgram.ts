export interface ExerciseDefinition {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  prescribedWeight: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  order: number;
}

export interface WorkoutDefinition {
  id: string;
  name: string;
  dayLabel: string;
  exercises: ExerciseDefinition[];
}

export interface WeekProgram {
  weekNumber: number;
  workouts: WorkoutDefinition[];
}

const exerciseImages: Record<string, string> = {
  squat: "/api/exercise-image/squat",
  bench: "/api/exercise-image/bench",
  deadlift: "/api/exercise-image/deadlift",
  row: "/api/exercise-image/row",
  press: "/api/exercise-image/press",
  curl: "/api/exercise-image/curl",
  default: "/api/exercise-image/default",
};

function img(key: string): string {
  return exerciseImages[key] ?? exerciseImages.default;
}

const BASE_PROGRAM: WeekProgram[] = Array.from({ length: 12 }, (_, weekIndex) => {
  const week = weekIndex + 1;
  const volumeMultiplier = 1 + weekIndex * 0.05;

  return {
    weekNumber: week,
    workouts: [
      {
        id: `w${week}-A`,
        name: "Training A — Benen & Billen",
        dayLabel: "Maandag",
        exercises: [
          {
            id: `w${week}-A-1`,
            name: "Squat",
            sets: 4,
            reps: "8-10",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=ultWZbUMPL8",
            imageUrl: img("squat"),
            order: 1,
          },
          {
            id: `w${week}-A-2`,
            name: "Roemeense Deadlift",
            sets: 3,
            reps: "10-12",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=JCXUYuzwNrM",
            imageUrl: img("deadlift"),
            order: 2,
          },
          {
            id: `w${week}-A-3`,
            name: "Leg Press",
            sets: 3,
            reps: "12-15",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=IZxyjW7MPJQ",
            imageUrl: img("default"),
            order: 3,
          },
          {
            id: `w${week}-A-4`,
            name: "Leg Curl",
            sets: 3,
            reps: "12-15",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=ELOCsoDSmrg",
            imageUrl: img("curl"),
            order: 4,
          },
          {
            id: `w${week}-A-5`,
            name: "Hip Thrust",
            sets: 3,
            reps: "15-20",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=xDmFkJxPzeM",
            imageUrl: img("default"),
            order: 5,
          },
        ],
      },
      {
        id: `w${week}-B`,
        name: "Training B — Borst & Schouders",
        dayLabel: "Dinsdag",
        exercises: [
          {
            id: `w${week}-B-1`,
            name: "Bench Press",
            sets: 4,
            reps: "6-8",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
            imageUrl: img("bench"),
            order: 1,
          },
          {
            id: `w${week}-B-2`,
            name: "Schouderpers",
            sets: 3,
            reps: "10-12",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=qEwKCR5JCog",
            imageUrl: img("press"),
            order: 2,
          },
          {
            id: `w${week}-B-3`,
            name: "Incline Dumbbell Press",
            sets: 3,
            reps: "10-12",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=0G2_XV7slIg",
            imageUrl: img("bench"),
            order: 3,
          },
          {
            id: `w${week}-B-4`,
            name: "Lateral Raise",
            sets: 3,
            reps: "15-20",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=3VcKaXpzqRo",
            imageUrl: img("press"),
            order: 4,
          },
          {
            id: `w${week}-B-5`,
            name: "Tricep Dips",
            sets: 3,
            reps: "10-15",
            prescribedWeight: null,
            videoUrl: "https://www.youtube.com/watch?v=6kALZikXxLc",
            imageUrl: img("default"),
            order: 5,
          },
        ],
      },
      {
        id: `w${week}-C`,
        name: "Training C — Rug & Biceps",
        dayLabel: "Donderdag",
        exercises: [
          {
            id: `w${week}-C-1`,
            name: "Deadlift",
            sets: 4,
            reps: "5-6",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=ytGaGIn3SjE",
            imageUrl: img("deadlift"),
            order: 1,
          },
          {
            id: `w${week}-C-2`,
            name: "Barbell Row",
            sets: 4,
            reps: "8-10",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=FWJR5Ve8bnQ",
            imageUrl: img("row"),
            order: 2,
          },
          {
            id: `w${week}-C-3`,
            name: "Pull-up / Lat Pulldown",
            sets: 3,
            reps: "8-12",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=eGo4IYlbE5g",
            imageUrl: img("row"),
            order: 3,
          },
          {
            id: `w${week}-C-4`,
            name: "Bicep Curl",
            sets: 3,
            reps: "12-15",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
            imageUrl: img("curl"),
            order: 4,
          },
          {
            id: `w${week}-C-5`,
            name: "Face Pull",
            sets: 3,
            reps: "15-20",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=rep-qVOkqgk",
            imageUrl: img("default"),
            order: 5,
          },
        ],
      },
      {
        id: `w${week}-D`,
        name: "Training D — Volledig Lichaam",
        dayLabel: "Vrijdag",
        exercises: [
          {
            id: `w${week}-D-1`,
            name: "Front Squat",
            sets: 3,
            reps: "8-10",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=m4ytmGGNHKI",
            imageUrl: img("squat"),
            order: 1,
          },
          {
            id: `w${week}-D-2`,
            name: "Push Press",
            sets: 3,
            reps: "8-10",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=iaBVSJm78ko",
            imageUrl: img("press"),
            order: 2,
          },
          {
            id: `w${week}-D-3`,
            name: "Sumo Deadlift",
            sets: 3,
            reps: "8-10",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=XxWcirHIwVo",
            imageUrl: img("deadlift"),
            order: 3,
          },
          {
            id: `w${week}-D-4`,
            name: "Cable Row",
            sets: 3,
            reps: "12-15",
            prescribedWeight: String(),
            videoUrl: "https://www.youtube.com/watch?v=GZbfZ033f74",
            imageUrl: img("row"),
            order: 4,
          },
          {
            id: `w${week}-D-5`,
            name: "Plank",
            sets: 3,
            reps: "45-60 sec",
            prescribedWeight: null,
            videoUrl: "https://www.youtube.com/watch?v=ASdvN_XEl_c",
            imageUrl: img("default"),
            order: 5,
          },
        ],
      },
    ],
  };
});

export function getWeekProgram(weekNumber: number): WeekProgram | undefined {
  return BASE_PROGRAM.find((w) => w.weekNumber === weekNumber);
}

export function getAllWeeks(): number[] {
  return BASE_PROGRAM.map((w) => w.weekNumber);
}

export function getWorkoutById(workoutId: string): (WorkoutDefinition & { weekNumber: number }) | undefined {
  for (const week of BASE_PROGRAM) {
    const workout = week.workouts.find((w) => w.id === workoutId);
    if (workout) {
      return { ...workout, weekNumber: week.weekNumber };
    }
  }
  return undefined;
}
