export type WeightPoint = { weight: number; recordedOn: string }
export type PredictionLike =
  | { available: false; reason?: string }
  | { available: true; predictedWeight: number; differenceFromTarget: number; weeklyTrend: number; samples: number }

function atNoon(value: string) {
  return new Date(`${value}T12:00:00`)
}

function dayDiff(from: string, to: string) {
  return Math.floor((atNoon(to).getTime() - atNoon(from).getTime()) / 86400000)
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function calculateRollingWeightStats(records: WeightPoint[], todayIso: string) {
  const valid = records.filter((record) => Number.isFinite(record.weight) && record.recordedOn <= todayIso)
  const current = valid.filter((record) => {
    const age = dayDiff(record.recordedOn, todayIso)
    return age >= 0 && age <= 6
  })
  const previous = valid.filter((record) => {
    const age = dayDiff(record.recordedOn, todayIso)
    return age >= 7 && age <= 13
  })
  const currentAverage = average(current.map((record) => record.weight))
  const previousAverage = average(previous.map((record) => record.weight))
  return {
    currentAverage,
    previousAverage,
    weeklyChange: currentAverage !== null && previousAverage !== null ? currentAverage - previousAverage : null,
    currentSamples: current.length,
    previousSamples: previous.length,
  }
}

export function calculateAchievementProbability(args: {
  currentWeight: number
  targetWeight: number
  daysRemaining: number
  weeklyRequired: number
  prediction: PredictionLike | null
  recentSamples: number
}) {
  const { currentWeight, targetWeight, daysRemaining, weeklyRequired, prediction, recentSamples } = args
  if (currentWeight <= targetWeight) return 100
  if (daysRemaining <= 0) return 0

  let score = 55
  const weeklyPercent = currentWeight > 0 ? (weeklyRequired / currentWeight) * 100 : 0
  if (weeklyPercent <= 0.5) score += 8
  else if (weeklyPercent <= 0.75) score += 5
  else if (weeklyPercent <= 1.0) score += 0
  else if (weeklyPercent <= 1.25) score -= 4
  else score -= 8

  if (prediction?.available) {
    const miss = prediction.predictedWeight - targetWeight
    if (miss <= -0.3) score += 28
    else if (miss <= 0.2) score += 25
    else if (miss <= 0.7) score += 8
    else if (miss <= 1.5) score -= 18
    else score -= 35
  } else {
    score -= 12
  }

  score += Math.min(12, recentSamples * 3)
  if (daysRemaining <= 7) score -= 3
  if (daysRemaining <= 3) score -= 7
  return Math.max(5, Math.min(99, Math.round(score)))
}

export function calculateConditionScore(entry?: {
  sleepHours: number
  fatigue: number
  hunger: number
  bodyCondition: number
} | null) {
  if (!entry) return null
  const sleep = entry.sleepHours >= 7 && entry.sleepHours <= 9
    ? 100
    : entry.sleepHours >= 6 && entry.sleepHours < 7
      ? 78
      : entry.sleepHours > 9 && entry.sleepHours <= 10
        ? 85
        : entry.sleepHours >= 5
          ? 55
          : 30
  const fatigue = Math.max(0, Math.min(100, 125 - entry.fatigue * 25))
  const hunger = Math.max(0, Math.min(100, 125 - entry.hunger * 25))
  const body = Math.max(0, Math.min(100, entry.bodyCondition * 20))
  return Math.round(sleep * 0.3 + fatigue * 0.25 + hunger * 0.15 + body * 0.3)
}
