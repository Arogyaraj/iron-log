/* Built-in exercise library and starter programs.
   Pure functions only, no DOM, so they can be tested outside the browser. */

// name|muscle|kind   kind: weight | bodyweight | time
const LIBRARY_TEXT = `
Barbell Bench Press|Chest|weight
Incline Barbell Bench Press|Chest|weight
Dumbbell Bench Press|Chest|weight
Incline Dumbbell Press|Chest|weight
Decline Bench Press|Chest|weight
Cable Crossover|Chest|weight
Pec Deck Fly|Chest|weight
Dumbbell Fly|Chest|weight
Push-Up|Chest|bodyweight
Dips|Chest|bodyweight
Barbell Row|Back|weight
Dumbbell Row|Back|weight
Seated Cable Row|Back|weight
T-Bar Row|Back|weight
Lat Pulldown|Back|weight
Straight-Arm Pulldown|Back|weight
Pull-Up|Back|bodyweight
Chin-Up|Back|bodyweight
Back Extension|Back|bodyweight
Deadlift|Back|weight
Shrug|Back|weight
Overhead Press|Shoulders|weight
Seated Dumbbell Press|Shoulders|weight
Arnold Press|Shoulders|weight
Lateral Raise|Shoulders|weight
Cable Lateral Raise|Shoulders|weight
Rear Delt Fly|Shoulders|weight
Face Pull|Shoulders|weight
Upright Row|Shoulders|weight
Barbell Curl|Biceps|weight
Dumbbell Curl|Biceps|weight
Hammer Curl|Biceps|weight
Incline Dumbbell Curl|Biceps|weight
Preacher Curl|Biceps|weight
Cable Curl|Biceps|weight
Triceps Pushdown|Triceps|weight
Overhead Triceps Extension|Triceps|weight
Skull Crusher|Triceps|weight
Close-Grip Bench Press|Triceps|weight
Bench Dips|Triceps|bodyweight
Back Squat|Quads|weight
Front Squat|Quads|weight
Hack Squat|Quads|weight
Leg Press|Quads|weight
Leg Extension|Quads|weight
Lunge|Quads|weight
Bulgarian Split Squat|Quads|weight
Bodyweight Squat|Quads|bodyweight
Romanian Deadlift|Hamstrings|weight
Lying Leg Curl|Hamstrings|weight
Seated Leg Curl|Hamstrings|weight
Good Morning|Hamstrings|weight
Hip Thrust|Glutes|weight
Glute Bridge|Glutes|bodyweight
Cable Kickback|Glutes|weight
Standing Calf Raise|Calves|weight
Seated Calf Raise|Calves|weight
Plank|Core|time
Side Plank|Core|time
Hanging Leg Raise|Core|bodyweight
Cable Crunch|Core|weight
Ab Wheel Rollout|Core|bodyweight
Russian Twist|Core|weight
Farmer's Carry|Forearms|weight
Wrist Curl|Forearms|weight
Power Clean|Full body|weight
Kettlebell Swing|Full body|weight
Thruster|Full body|weight
Burpee|Full body|bodyweight
Treadmill|Cardio|time
Stationary Bike|Cardio|time
Rowing Machine|Cardio|time
Stair Climber|Cardio|time
Jump Rope|Cardio|time
`;

export const LIBRARY = LIBRARY_TEXT.trim().split("\n").map((line) => {
  const [name, muscle, kind] = line.split("|");
  return { name, muscle, kind };
});

// Starter programs: [exercise, sets, reps, restSeconds]
export const STARTER_PROGRAMS = [
  {
    folder: "Push Pull Legs",
    routines: [
      { name: "Push", exercises: [["Barbell Bench Press", 4, "6-8", 150], ["Overhead Press", 3, "8-10", 120], ["Incline Dumbbell Press", 3, "10-12", 90], ["Triceps Pushdown", 3, "10-12", 60], ["Lateral Raise", 3, "12-15", 60]] },
      { name: "Pull", exercises: [["Lat Pulldown", 4, "8-10", 90], ["Seated Cable Row", 3, "8-12", 90], ["Face Pull", 3, "12-15", 60], ["Barbell Curl", 3, "8-12", 60]] },
      { name: "Legs", exercises: [["Back Squat", 4, "6-8", 180], ["Romanian Deadlift", 3, "8-10", 120], ["Leg Press", 3, "10-12", 90], ["Lying Leg Curl", 3, "10-12", 60], ["Standing Calf Raise", 4, "12-15", 60]] },
    ],
  },
  {
    folder: "Upper Lower",
    routines: [
      { name: "Upper", exercises: [["Barbell Bench Press", 4, "6-8", 150], ["Barbell Row", 4, "6-8", 120], ["Overhead Press", 3, "8-10", 120], ["Lat Pulldown", 3, "10-12", 90], ["Barbell Curl", 2, "10-12", 60], ["Triceps Pushdown", 2, "10-12", 60]] },
      { name: "Lower", exercises: [["Back Squat", 4, "6-8", 180], ["Romanian Deadlift", 3, "8-10", 120], ["Leg Press", 3, "10-12", 90], ["Lying Leg Curl", 3, "10-12", 60], ["Standing Calf Raise", 3, "12-15", 60]] },
    ],
  },
  {
    folder: "Full Body",
    routines: [
      { name: "Full Body A", exercises: [["Back Squat", 3, "5", 180], ["Barbell Bench Press", 3, "5", 150], ["Barbell Row", 3, "8", 120], ["Overhead Press", 3, "8-10", 120], ["Plank", 3, "45s", 60]] },
    ],
  },
];
