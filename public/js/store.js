// Single source of application state. Views read from here and call emit() after changing it.
export const S = {
  pid: "",
  pin: "",
  view: "today",
  profile: { name: "Athlete", goal: 3, settings: { units: "kg", includeWarmups: true, keepAwake: true, showRpe: false, restDefault: 90 } },
  routines: [],
  workouts: [],
  weights: [],
  exercises: [],
  measurements: [],
  stats: null,
  monthCache: {},
  loadingMonth: null,
  sess: null,            // { mode: "live" | "edit", w }
  dirty: false,
  saveTimer: null,
  restEnd: 0,
  restTimer: null,
  liveTimer: null,
  wakeLock: null,
  calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
  calDay: null,
  libQuery: "",
  libMuscle: "",
  editingRoutine: null,
  editingCustom: null,
  exIdx: 0,
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => { for (const fn of listeners) fn(S); };
