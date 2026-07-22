/* ============================================================================
   [MODULE: workouts.js]
   The Workout tab's data + per-day state. A LIBRARY of workouts you can pick from
   (built around the movement patterns in your profile), and per-day tracking of
   which workout you chose and which exercises you've checked off. Same localStorage
   store as the rest of Apex. Imports only storage.js (Node-testable).

   Storage keys:
     apex.workout.day.<date> -> { date, workoutId, done:[bool] }
   The library itself is data below — edit freely (add workouts, tweak sets/reps).
   ============================================================================ */

import { getItem, setItem } from "./storage.js";

export const WORKOUT_LIBRARY = [
  { id: "fullbody_a", name: "Full Body A", focus: "Strength · squat + push", exercises: [
    { name: "Back Squat", sets: 4, reps: "6" },
    { name: "Bench Press", sets: 4, reps: "8" },
    { name: "Romanian Deadlift", sets: 3, reps: "10" },
    { name: "Pull-Ups", sets: 3, reps: "8" },
    { name: "Plank", sets: 3, reps: "45s" },
  ] },
  { id: "fullbody_b", name: "Full Body B", focus: "Strength · hinge + press", exercises: [
    { name: "Deadlift", sets: 4, reps: "5" },
    { name: "Overhead Press", sets: 4, reps: "8" },
    { name: "Bulgarian Split Squat", sets: 3, reps: "10" },
    { name: "Barbell Row", sets: 3, reps: "10" },
    { name: "Hanging Leg Raise", sets: 3, reps: "12" },
  ] },
  { id: "fullbody_c", name: "Full Body C", focus: "Strength · balanced", exercises: [
    { name: "Front Squat", sets: 4, reps: "6" },
    { name: "Incline DB Press", sets: 3, reps: "10" },
    { name: "Hip Thrust", sets: 3, reps: "12" },
    { name: "Lat Pulldown", sets: 3, reps: "12" },
    { name: "Farmer Carry", sets: 3, reps: "40 yd" },
  ] },
  { id: "push", name: "Push Day", focus: "Chest · shoulders · triceps", exercises: [
    { name: "Bench Press", sets: 4, reps: "8" },
    { name: "Overhead Press", sets: 3, reps: "10" },
    { name: "Incline DB Press", sets: 3, reps: "10" },
    { name: "Cable Fly", sets: 3, reps: "12" },
    { name: "Triceps Pushdown", sets: 3, reps: "15" },
  ] },
  { id: "pull", name: "Pull Day", focus: "Back · biceps", exercises: [
    { name: "Deadlift", sets: 3, reps: "5" },
    { name: "Pull-Ups", sets: 4, reps: "8" },
    { name: "Barbell Row", sets: 3, reps: "10" },
    { name: "Face Pulls", sets: 3, reps: "15" },
    { name: "Biceps Curls", sets: 3, reps: "12" },
  ] },
  { id: "legs", name: "Leg Day", focus: "Quads · hamstrings · calves", exercises: [
    { name: "Back Squat", sets: 4, reps: "8" },
    { name: "Romanian Deadlift", sets: 3, reps: "10" },
    { name: "Leg Press", sets: 3, reps: "12" },
    { name: "Walking Lunge", sets: 3, reps: "20" },
    { name: "Calf Raise", sets: 4, reps: "15" },
  ] },
  { id: "conditioning", name: "Intervals", focus: "Conditioning · HIIT", exercises: [
    { name: "Warm-up (easy)", sets: 1, reps: "5 min" },
    { name: "Hard interval", sets: 8, reps: "30s" },
    { name: "Easy recovery", sets: 8, reps: "90s" },
    { name: "Cool-down", sets: 1, reps: "5 min" },
  ] },
  { id: "easy_cardio", name: "Easy Cardio", focus: "Zone 2 · recovery", exercises: [
    { name: "Easy run / bike / hike", sets: 1, reps: "30-45 min" },
  ] },
];

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const KEY = (d) => `workout.day.${d}`;

export function library() { return WORKOUT_LIBRARY; }
export function getWorkout(id) { return WORKOUT_LIBRARY.find((w) => w.id === id) || null; }

export function getDay(d = todayStr()) { return getItem(KEY(d), { date: d, workoutId: null, done: [] }); }
function save(day) { setItem(KEY(day.date), day); }

/** Choose today's workout (resets the check-offs to match it). */
export function setWorkout(id, d = todayStr()) {
  const w = getWorkout(id);
  const day = getDay(d);
  day.workoutId = id;
  day.done = (w ? w.exercises : []).map(() => false);
  save(day);
  return day;
}
export function toggleExercise(i, d = todayStr()) {
  const day = getDay(d);
  while (day.done.length <= i) day.done.push(false);
  day.done[i] = !day.done[i];
  save(day);
  return day;
}
export function clearWorkout(d = todayStr()) {
  const day = getDay(d);
  day.workoutId = null; day.done = [];
  save(day);
  return day;
}
export function progress(d = todayStr()) {
  const day = getDay(d);
  const w = getWorkout(day.workoutId);
  const total = w ? w.exercises.length : 0;
  const done = day.done.filter(Boolean).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
