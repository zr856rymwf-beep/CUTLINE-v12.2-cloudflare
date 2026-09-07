export type HealthSnapshot = {
  steps: number | null
  activeEnergyKcal: number | null
  workoutEnergyKcal: number | null
  syncedAt: string | null
}

export interface HealthProvider {
  id: 'web' | 'healthkit'
  supported: boolean
  readDailySnapshot(date: string): Promise<HealthSnapshot>
}

export const webHealthProvider: HealthProvider = {
  id: 'web',
  supported: false,
  async readDailySnapshot() {
    return { steps: null, activeEnergyKcal: null, workoutEnergyKcal: null, syncedAt: null }
  },
}
