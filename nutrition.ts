export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high'

export type NutritionProfile = {
  heightCm: number
  age: number
  sex: Sex
  activityLevel: ActivityLevel
}

export type MealLike = {
  calories: number
  protein: number
  fat: number
  carbs: number
  eatenOn: string
}

export type ExerciseLike = {
  calories: number
  exercisedOn: string
}

export type WeightRecordLike = {
  weight: number
  recordedOn: string
}

export type WeightPlanLike = {
  currentWeight: number
  targetWeight: number
  fightDate: string
  waterCutKg?: number
  weighInType?: 'day_before' | 'same_day'
}

export const activityOptions: Array<{ value: ActivityLevel; label: string; factor: number; hint: string }> = [
  { value: 'sedentary', label: '低い', factor: 1.2, hint: 'デスクワーク中心・運動少なめ' },
  { value: 'light', label: '軽め', factor: 1.375, hint: '週1〜3回ほど運動' },
  { value: 'moderate', label: '普通', factor: 1.55, hint: '週3〜5回ほど運動' },
  { value: 'high', label: '高い', factor: 1.725, hint: '週6〜7回ほど運動' },
  { value: 'very_high', label: '非常に高い', factor: 1.9, hint: '高強度練習＋身体活動が多い' },
]

export function calculateBmr(profile: NutritionProfile, weightKg: number) {
  const sexAdjustment = profile.sex === 'male' ? 5 : -161
  return 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment
}

export function activityFactor(level: ActivityLevel) {
  return activityOptions.find((option) => option.value === level)?.factor ?? 1.55
}

export function calculateDailyNutrition(
  profile: NutritionProfile,
  plan: WeightPlanLike,
  meals: MealLike[],
  exercises: ExerciseLike[],
  todayIso: string,
  daysRemaining: number,
) {
  const bmr = calculateBmr(profile, plan.currentWeight)
  const tdee = bmr * activityFactor(profile.activityLevel)
  const waterCutKg = Number.isFinite(plan.waterCutKg) ? Math.max(0, Number(plan.waterCutKg)) : 0
  const dietTargetWeight = Math.min(plan.currentWeight, plan.targetWeight + waterCutKg)
  const kilogramsToLose = Math.max(0, plan.currentWeight - dietTargetWeight)
  const dailyDeficitNeeded = daysRemaining > 0 ? (kilogramsToLose * 7700) / daysRemaining : 0
  const targetCalories = Math.max(0, tdee - dailyDeficitNeeded)
  const todaysMeals = meals.filter((meal) => meal.eatenOn === todayIso)
  const todaysExercises = exercises.filter((exercise) => exercise.exercisedOn === todayIso)
  const consumed = todaysMeals.reduce((sum, meal) => sum + meal.calories, 0)
  const exerciseCalories = todaysExercises.reduce((sum, exercise) => sum + exercise.calories, 0)
  const effectiveTargetCalories = targetCalories + exerciseCalories
  const protein = todaysMeals.reduce((sum, meal) => sum + meal.protein, 0)
  const fat = todaysMeals.reduce((sum, meal) => sum + meal.fat, 0)
  const carbs = todaysMeals.reduce((sum, meal) => sum + meal.carbs, 0)
  const remaining = effectiveTargetCalories - consumed
  const deficitPercent = tdee > 0 ? (dailyDeficitNeeded / tdee) * 100 : 0
  const extremeLow = targetCalories < 1200 || targetCalories < bmr
  const calorieStatus = extremeLow || deficitPercent > 30 ? 'danger' : deficitPercent > 20 ? 'caution' : 'safe'

  return {
    bmr,
    tdee,
    dailyDeficitNeeded,
    targetCalories,
    effectiveTargetCalories,
    consumed,
    exerciseCalories,
    remaining,
    protein,
    fat,
    carbs,
    deficitPercent,
    calorieStatus,
    extremeLow,
  }
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

export function calculateWeightPrediction(records: WeightRecordLike[], plan: WeightPlanLike, todayIso: string) {
  const sorted = [...records]
    .filter((record) => Number.isFinite(record.weight))
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn))
    .slice(-14)

  if (sorted.length < 3) {
    return { available: false as const, reason: '3回以上の体重記録で予測を表示します。' }
  }

  const startTime = parseLocalDate(sorted[0].recordedOn).getTime()
  const points = sorted.map((record) => ({
    x: (parseLocalDate(record.recordedOn).getTime() - startTime) / 86400000,
    y: record.weight,
  }))
  const spanDays = points[points.length - 1].x - points[0].x
  if (spanDays < 2) {
    return { available: false as const, reason: '数日分の記録がたまると予測精度が上がります。' }
  }

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  const rawSlope = denominator ? numerator / denominator : 0
  const slopePerDay = Math.max(-0.35, Math.min(0.35, rawSlope))
  const today = parseLocalDate(todayIso).getTime()
  const weighInDate = parseLocalDate(plan.fightDate)
  if (plan.weighInType === 'day_before') weighInDate.setDate(weighInDate.getDate() - 1)
  const fight = weighInDate.getTime()
  const daysRemaining = Math.max(0, Math.ceil((fight - today) / 86400000))
  const latest = sorted[sorted.length - 1].weight
  const predictedWeight = Math.max(0, latest + slopePerDay * daysRemaining)
  const waterCutKg = Number.isFinite(plan.waterCutKg) ? Math.max(0, Number(plan.waterCutKg)) : 0
  const dietTargetWeight = Math.min(plan.currentWeight, plan.targetWeight + waterCutKg)
  const differenceFromTarget = predictedWeight - dietTargetWeight

  return {
    available: true as const,
    predictedWeight,
    differenceFromTarget,
    weeklyTrend: slopePerDay * 7,
    samples: sorted.length,
  }
}
