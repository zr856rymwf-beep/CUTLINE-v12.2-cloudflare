export type FoodEstimate = {
  dishName: string
  estimatedAmount: string
  calories: number
  confidence?: number
}

export interface FoodImageAnalyzer {
  supported: boolean
  analyze(image: File): Promise<FoodEstimate>
}

export const unavailableFoodImageAnalyzer: FoodImageAnalyzer = {
  supported: false,
  async analyze() {
    throw new Error('AI解析機能は準備中です。')
  },
}
