import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  HeartPulse,
  Home,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  LogOut,
  Mail,
  MessageSquareText,
  Pencil,
  Plus,
  Ruler,
  Save,
  ShieldCheck,
  Target,
  Trash2,
  TrendingDown,
  UserRound,
  Utensils,
  Weight,
  Zap,
} from 'lucide-react'
import {
  activityOptions,
  calculateDailyNutrition,
  calculateWeightPrediction,
  type ActivityLevel,
  type NutritionProfile,
  type Sex,
} from './nutrition'
import { calculateAchievementProbability, calculateConditionScore, calculateRollingWeightStats } from './cutline-metrics'

type WeighInType = 'day_before' | 'same_day'
type Plan = { currentWeight: number; targetWeight: number; fightDate: string; fightMode?: boolean; weighInType?: WeighInType; waterCutKg?: number }
type RecordEntry = { id: number; weight: number; recordedOn: string; note: string }
type Profile = NutritionProfile & { userId?: string; updatedAt?: string }
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type MealEntry = { id: number; eatenOn: string; mealType: MealType; name: string; calories: number; protein: number; fat: number; carbs: number }
type ExerciseEntry = { id: number; exercisedOn: string; name: string; calories: number; source: 'manual' | 'healthkit' }
type ConditionEntry = { id: number; recordedOn: string; sleepHours: number; fatigue: number; hunger: number; trainingIntensity: number; bodyCondition: number; restingHeartRate: number | null; note: string }
type MealTemplate = { id: number; mealType: MealType; name: string; calories: number; protein: number; fat: number; carbs: number }
type User = { id: string; username: string; email: string | null }
type SessionPayload = { user: User; plan: Plan | null; profile: Profile | null; records: RecordEntry[]; meals: MealEntry[]; exercises: ExerciseEntry[]; conditions: ConditionEntry[]; templates: MealTemplate[] }

const isoToday = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`)
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}

function normalizedWaterCut(plan: Plan) {
  return Number.isFinite(plan.waterCutKg) ? Math.max(0, Number(plan.waterCutKg)) : 0
}

function dietTargetWeight(plan: Plan) {
  return Math.min(plan.currentWeight, plan.targetWeight + normalizedWaterCut(plan))
}

function weighInDateIso(plan: Plan) {
  if (plan.weighInType !== 'day_before') return plan.fightDate
  const date = dateAtNoon(plan.fightDate)
  date.setDate(date.getDate() - 1)
  return date.toISOString().slice(0, 10)
}

function weighInLabel(plan: Plan) {
  return plan.weighInType === 'day_before' ? '前日計量' : '当日計量'
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/cutline${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(payload?.error || '通信エラーが発生しました。')
  return payload as T
}

export default function CutlineApp() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [resetToken, setResetToken] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('reset') ?? '')

  useEffect(() => {
    api<SessionPayload>('/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  if (resetToken) return <ResetPasswordScreen token={resetToken} onComplete={() => {
    if (typeof window !== 'undefined') window.history.replaceState({}, '', window.location.pathname)
    setResetToken('')
    setSession(null)
    setLoading(false)
  }} />
  if (loading) return <LoadingScreen />
  if (!session) return <AuthScreen onAuthenticated={setSession} />
  return <Dashboard initialSession={session} onLogout={() => setSession(null)} />
}

function Brand() {
  return (
    <div className="brand" aria-label="CUTLINE">
      <span className="brand-mark"><TrendingDown size={18} strokeWidth={3} /></span>
      <span><strong>CUTLINE</strong><small>減量を1本の線に</small></span>
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Brand />
      <div className="loading-card" aria-label="読み込み中"><span /><span /><span /></div>
    </main>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: SessionPayload) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      if (mode === 'forgot') {
        const result = await api<{ message: string }>('/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
        setNotice(result.message)
        return
      }

      const result = await api<SessionPayload>(mode === 'login' ? '/login' : '/register', {
        method: 'POST',
        body: JSON.stringify({ username, email: mode === 'register' ? email : undefined, password }),
      })
      onAuthenticated(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '処理を完了できませんでした。')
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode: 'login' | 'register' | 'forgot') {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
  }

  const forgotMode = mode === 'forgot'

  return (
    <main className="auth-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="auth-wrap">
        <header><Brand /></header>
        <section className="auth-card">
          <div className="auth-copy">
            <p className="eyebrow">CUTLINE</p>
            <h1>減量を<em>1本の線に</em></h1>
            <p>体重・試合日・食事をまとめて管理し、必要な減量ペースと1日の摂取目安を自動計算します。</p>
            <div className="auth-points">
              <span><ShieldCheck size={20} /> 他のユーザーからデータを分離</span>
              <span><Database size={20} /> 別の端末でも続きから利用可能</span>
            </div>
          </div>
          <div className="auth-panel">
            {!forgotMode && <div className="auth-tabs" role="tablist" aria-label="ログイン方法">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>ログイン</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>新規登録</button>
            </div>}
            {forgotMode && <button type="button" className="auth-back-button" onClick={() => changeMode('login')}><ArrowLeft size={16}/>ログインに戻る</button>}
            <div className="auth-title">
              <h2>{mode === 'login' ? 'おかえりなさい' : mode === 'register' ? 'アカウントを作成' : 'パスワードを再設定'}</h2>
              <p>{mode === 'login' ? '登録した情報でログインしてください。' : mode === 'register' ? 'メールアドレスはパスワード再設定に使用します。' : '登録済みのメールアドレスへ再設定リンクを送ります。'}</p>
            </div>
            <form onSubmit={submit}>
              {!forgotMode && <label>ユーザー名<div className="input-wrap"><UserRound size={18} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="ユーザー名を入力" required minLength={3} maxLength={30} /></div></label>}
              {(mode === 'register' || forgotMode) && <label>メールアドレス<div className="input-wrap"><Mail size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required maxLength={254} /></div></label>}
              {!forgotMode && <label>パスワード<div className="input-wrap"><ShieldCheck size={18} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="8文字以上" required minLength={8} maxLength={128} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
              {mode === 'login' && <button type="button" className="forgot-password-link" onClick={() => changeMode('forgot')}>パスワードを忘れた方</button>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              <button className="primary-button" disabled={submitting}>{submitting ? '送信中…' : mode === 'login' ? 'ログインする' : mode === 'register' ? '新規登録する' : '再設定メールを送る'}<ChevronRight size={18} /></button>
            </form>
            <p className="security-note"><ShieldCheck size={15} /> パスワードは暗号学的ハッシュで保護されます。</p>
          </div>
        </section>
      </div>
    </main>
  )
}

function ResetPasswordScreen({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password !== confirmPassword) return setError('確認用パスワードが一致しません。')
    setSubmitting(true)
    try {
      const result = await api<{ message: string }>('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      setNotice(result.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'パスワードを変更できませんでした。')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="auth-wrap reset-auth-wrap">
      <header><Brand /></header>
      <section className="auth-card reset-auth-card">
        <div className="auth-panel">
          <div className="auth-title"><h2>新しいパスワードを設定</h2><p>8文字以上の新しいパスワードを入力してください。</p></div>
          {notice ? <div className="reset-success"><ShieldCheck size={28}/><p>{notice}</p><button className="primary-button" onClick={onComplete}>ログイン画面へ</button></div> : <form onSubmit={submit}>
            <label>新しいパスワード<div className="input-wrap"><ShieldCheck size={18}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="8文字以上" required minLength={8} maxLength={128}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
            <label>確認用パスワード<div className="input-wrap"><ShieldCheck size={18}/><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="もう一度入力" required minLength={8} maxLength={128}/></div></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={submitting}>{submitting ? '変更中…' : 'パスワードを変更'}<ChevronRight size={18}/></button>
          </form>}
        </div>
      </section>
    </div>
  </main>
}

function Dashboard({ initialSession, onLogout }: { initialSession: SessionPayload; onLogout: () => void }) {
  const [user, setUser] = useState<User>(initialSession.user)
  const [plan, setPlan] = useState<Plan | null>(initialSession.plan)
  const [profile, setProfile] = useState<Profile | null>(initialSession.profile)
  const [records, setRecords] = useState<RecordEntry[]>(initialSession.records ?? [])
  const [meals, setMeals] = useState<MealEntry[]>(initialSession.meals ?? [])
  const [exercises, setExercises] = useState<ExerciseEntry[]>(initialSession.exercises ?? [])
  const [conditions, setConditions] = useState<ConditionEntry[]>(initialSession.conditions ?? [])
  const [templates, setTemplates] = useState<MealTemplate[]>(initialSession.templates ?? [])
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [recordSubTab, setRecordSubTab] = useState<RecordSubTab>('weight')
  const metrics = useMemo(() => plan ? calculateMetrics(plan) : null, [plan])
  const nutrition = useMemo(() => plan && profile && metrics
    ? calculateDailyNutrition(profile, plan, meals, exercises, isoToday(), metrics.cutDays)
    : null, [plan, profile, meals, exercises, metrics])
  const prediction = useMemo(() => plan ? calculateWeightPrediction(records, plan, isoToday()) : null, [records, plan])
  const rollingWeight = useMemo(() => calculateRollingWeightStats(records, isoToday()), [records])
  const latestCondition = conditions.find((entry) => entry.recordedOn === isoToday()) ?? conditions[0] ?? null
  const conditionScore = useMemo(() => calculateConditionScore(latestCondition), [latestCondition])

  async function logout() {
    await api('/logout', { method: 'POST' }).catch(() => undefined)
    onLogout()
  }

  if (!plan || !profile || !metrics) {
    return <SetupScreen user={user} initialPlan={plan} initialProfile={profile} onLogout={logout} onComplete={(savedPlan, savedProfile, firstRecord) => {
      setPlan(savedPlan)
      setProfile(savedProfile)
      if (firstRecord) setRecords((current) => [firstRecord, ...current.filter((record) => record.id !== firstRecord.id && record.recordedOn !== firstRecord.recordedOn)])
    }} />
  }

  async function savePlan() {
    setSaving(true)
    setNotice('')
    try {
      const result = await api<{ plan: Plan }>('/plan', { method: 'PUT', body: JSON.stringify(plan) })
      setPlan(result.plan)
      setNotice('減量プランを保存しました。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  async function updateFightMode(enabled: boolean) {
    if (!plan) return
    const previous = plan
    const next = { ...plan, fightMode: enabled }
    setPlan(next)
    setNotice('')
    try {
      const result = await api<{ plan: Plan }>('/plan', { method: 'PUT', body: JSON.stringify(next) })
      setPlan(result.plan)
      setNotice(enabled ? '試合モードをONにしました。' : '試合モードをOFFにしました。')
    } catch (caught) {
      setPlan(previous)
      setNotice(caught instanceof Error ? caught.message : '試合モードを変更できませんでした。')
    }
  }

  function upsertRecord(record: RecordEntry) {
    setRecords((current) => [record, ...current.filter((item) => item.id !== record.id && item.recordedOn !== record.recordedOn)].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn)))
    setPlan((current) => current ? { ...current, currentWeight: record.weight } : current)
  }

  function upsertMeal(meal: MealEntry) {
    setMeals((current) => [meal, ...current.filter((item) => item.id !== meal.id)].sort((a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.id - a.id))
  }

  function navigate(tab: AppTab, targetId?: string) {
    setActiveTab(tab)
    window.setTimeout(() => {
      if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 20)
  }

  const statusShort = metrics.status === 'safe' ? '順調' : metrics.status === 'caution' ? '注意' : '危険'
  const todayMeals = meals.filter((meal) => meal.eatenOn === isoToday())
  const averageIntake = meals.length ? meals.reduce((sum, meal) => sum + meal.calories, 0) / Math.max(1, new Set(meals.map((meal) => meal.eatenOn)).size) : 0
  const weeklyAverage = rollingWeight.currentAverage ?? plan.currentWeight
  const weeklyChange = rollingWeight.weeklyChange
  const achievementProbability = calculateAchievementProbability({ currentWeight: plan.currentWeight, targetWeight: dietTargetWeight(plan), daysRemaining: metrics.cutDays, weeklyRequired: metrics.weekly, prediction, recentSamples: rollingWeight.currentSamples })
  const predictedFightWeight = prediction?.available ? prediction.predictedWeight : null
  const calorieProgress = nutrition ? Math.min(100, Math.max(0, nutrition.consumed / Math.max(1, nutrition.effectiveTargetCalories) * 100)) : 0
  const activityLabel = activityOptions.find((option) => option.value === profile?.activityLevel)?.label ?? '—'

  return (
    <main className="app-shell app-redesign mockup-ui">
      {activeTab === 'home' && <section className="app-content home-screen v7-home" aria-label="ホーム">
        <div className="home-brand-header"><Brand /></div>
        <section className={`fight-overview-card ${plan.fightMode ? 'fight-mode-on' : ''}`}>
          <div className="fight-overview-top">
            <div><span className="fight-mode-badge">{plan.fightMode ? 'FIGHT MODE' : 'CUTLINE'}</span><small>{formatDate(plan.fightDate)}まで</small></div>
            <button className={`fight-mode-switch ${plan.fightMode ? 'active' : ''}`} onClick={() => updateFightMode(!plan.fightMode)} aria-pressed={Boolean(plan.fightMode)}><Zap size={15}/>{plan.fightMode ? '試合モード ON' : '試合モード'}</button>
          </div>
          <div className="weight-goal-line"><strong>{plan.currentWeight.toFixed(1)}<span>kg</span></strong><ChevronRight size={28}/><div className="target-weight-stack"><strong>{plan.targetWeight.toFixed(1)}<span>kg</span></strong><small>水抜き予定 {normalizedWaterCut(plan).toFixed(1)} kg</small></div></div>
          <div className="fight-countdown"><small>試合まで</small><strong>あと {metrics.days}<span>日</span></strong></div>
          <div className="fight-kpi-grid">
            <button onClick={() => { setRecordSubTab('weight'); navigate('record') }}><small>達成確率</small><strong>{achievementProbability}<span>%</span></strong><em>現在の記録から算出</em></button>
            <button onClick={() => { setRecordSubTab('weight'); navigate('record') }}><small>7日平均</small><strong>{weeklyAverage.toFixed(1)}<span>kg</span></strong><em>{rollingWeight.currentSamples}件の記録</em></button>
            <button onClick={() => { setRecordSubTab('weight'); navigate('record') }}><small>今週</small><strong className={weeklyChange !== null && weeklyChange <= 0 ? 'good' : ''}>{weeklyChange === null ? '—' : `${weeklyChange > 0 ? '+' : '−'}${Math.abs(weeklyChange).toFixed(1)}`}<span>{weeklyChange === null ? '' : 'kg'}</span></strong><em>7日平均の前週比</em></button>
            <button onClick={() => { setRecordSubTab('condition'); navigate('record') }}><small>コンディション</small><strong>{conditionScore ?? '—'}<span>{conditionScore !== null ? '/100' : ''}</span></strong><em>{latestCondition?.recordedOn === isoToday() ? '今日記録済み' : '今日の記録を追加'}</em></button>
          </div>
          <div className="weighin-prediction"><Target size={18}/><div><small>計量時予測（{weighInLabel(plan)}）</small>{predictedFightWeight !== null ? <strong>{Math.max(0, predictedFightWeight - normalizedWaterCut(plan)).toFixed(1)} kg <span>目標差 {predictedFightWeight - normalizedWaterCut(plan) - plan.targetWeight > 0 ? '+' : ''}{(predictedFightWeight - normalizedWaterCut(plan) - plan.targetWeight).toFixed(1)} kg</span></strong> : <strong>体重を3回以上記録すると表示</strong>}</div></div>
        </section>

        <div className={`mockup-warning compact ${metrics.status}`}><AlertTriangle size={18}/><div><strong>{statusShort}：必要ペース {metrics.weekly.toFixed(2)} kg/週</strong><span>{metrics.statusDetail}</span></div></div>

        <section className="mobile-card graph-card mockup-graph-card v7-graph-card">
          <div className="section-title"><div><h2>体重推移</h2><small>実測と目標ライン</small></div></div>
          <WeightChart plan={plan} records={records} />
        </section>
      </section>}

      {activeTab === 'record' && <section className="app-content tab-screen record-screen" aria-label="記録">
        <div className="mockup-screen-title"><h1>記録</h1><CalendarDays size={22}/></div>
        <div className="record-segments" role="tablist" aria-label="記録カテゴリ">
          <button className={recordSubTab === 'weight' ? 'active' : ''} onClick={() => setRecordSubTab('weight')}>体重</button>
          <button className={recordSubTab === 'condition' ? 'active' : ''} onClick={() => setRecordSubTab('condition')}>体調</button>
          <button className={recordSubTab === 'calories' ? 'active' : ''} onClick={() => setRecordSubTab('calories')}>カロリー</button>
          <button className={recordSubTab === 'training' ? 'active' : ''} onClick={() => setRecordSubTab('training')}>運動</button>
        </div>
        {recordSubTab === 'weight' && <>
          <section className="mobile-card graph-card graph-card-large mockup-graph-card"><div className="section-title"><div><h2>体重の推移</h2></div></div><WeightChart plan={plan} records={records} /></section>
          <RecordPanel records={records} onRecordSaved={upsertRecord} onRecordRemoved={(id) => setRecords((current) => current.filter((record) => record.id !== id))} suggestedWeight={plan.currentWeight} />
          <section className="mobile-card compact-section"><div className="section-title"><div><h2>週ごとの目標</h2></div></div><div className="target-list">{metrics.targets.map((target, index) => <div key={target.date} className={index === 0 ? 'current' : ''}><span>{index + 1}週目</span><time>{formatShortDate(target.date)}</time><b>{target.weight.toFixed(1)} kg</b></div>)}</div></section>
        </>}
        {recordSubTab === 'condition' && <ConditionPanel conditions={conditions} onSaved={(condition) => setConditions((current) => [condition, ...current.filter((item) => item.id !== condition.id && item.recordedOn !== condition.recordedOn)].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn)))} onRemoved={(id) => setConditions((current) => current.filter((item) => item.id !== id))} />}
        {recordSubTab === 'calories' && <>
          <div className="analysis-grid mockup-analysis-grid">
            <div><Zap size={19}/><small>BMR</small><strong>{nutrition ? Math.round(nutrition.bmr).toLocaleString() : '—'}<span> kcal</span></strong></div>
            <div><Flame size={19}/><small>TDEE</small><strong>{nutrition ? Math.round(nutrition.tdee).toLocaleString() : '—'}<span> kcal</span></strong></div>
            <div><Target size={19}/><small>目標摂取</small><strong>{nutrition ? Math.round(nutrition.targetCalories).toLocaleString() : '—'}<span> kcal</span></strong></div>
            <div><Utensils size={19}/><small>平均摂取</small><strong>{Math.round(averageIntake).toLocaleString()}<span> kcal</span></strong></div>
          </div>
          <CaloriesPanel nutrition={nutrition} profile={profile} prediction={prediction} />
        </>}
        {recordSubTab === 'training' && <HealthPanel exercises={exercises} onExerciseAdded={(exercise) => setExercises((current) => [exercise, ...current])} onExerciseRemoved={(id) => setExercises((current) => current.filter((exercise) => exercise.id !== id))} />}
      </section>}

      {activeTab === 'meals' && <section className="app-content tab-screen meals-screen" aria-label="食事">
        <div className="mockup-screen-title centered"><h1>食事</h1></div>
        <section className={`meal-summary-card ${nutrition && nutrition.remaining < 0 ? 'over' : ''}`}>
          <div className="calorie-donut" style={{ '--meal-progress': `${calorieProgress * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(nutrition?.consumed ?? 0).toLocaleString()}</strong><span>/ {Math.round(nutrition?.effectiveTargetCalories ?? 0).toLocaleString()} kcal</span></div></div>
          <div className="remaining-calories"><small>残りカロリー</small><strong>{nutrition ? Math.round(nutrition.remaining).toLocaleString() : '—'}<span>kcal</span></strong></div>
          <div className="macro-summary"><span><i>P</i><b>{Math.round(nutrition?.protein ?? 0)} g</b></span><span><i>F</i><b>{Math.round(nutrition?.fat ?? 0)} g</b></span><span><i>C</i><b>{Math.round(nutrition?.carbs ?? 0)} g</b></span></div>
        </section>
        <MealPanel meals={meals} templates={templates} onMealSaved={upsertMeal} onMealRemoved={(id) => setMeals((current) => current.filter((meal) => meal.id !== id))} onTemplateSaved={(template) => setTemplates((current) => [template, ...current])} onTemplateRemoved={(id) => setTemplates((current) => current.filter((template) => template.id !== id))} />
        <details className="feature-details"><summary><Camera size={18}/>写真からカロリー推定<ChevronDown size={18}/></summary><PhotoEstimatePanel /></details>
      </section>}

      {activeTab === 'settings' && <section className="app-content tab-screen settings-screen-page" aria-label="設定">
        <div className="mockup-screen-title centered"><h1>設定</h1></div>
        <section className="settings-profile-card"><span>{user.username.slice(0,1).toUpperCase()}</span><div><strong>{user.username}</strong><small>{user.email ?? 'メール未登録'}</small></div><ChevronRight size={19}/></section>

        <AccountPanel user={user} onUserChanged={setUser} />

        <section className="settings-summary-section">
          <div className="settings-section-head"><h2>体の情報</h2><a href="#profile-edit">編集</a></div>
          <div className="settings-info-grid">
            <div><small>性別</small><strong>{profile?.sex === 'female' ? '女性' : '男性'}</strong></div>
            <div><small>年齢</small><strong>{profile?.age ?? '—'}<span> 歳</span></strong></div>
            <div><small>身長</small><strong>{profile?.heightCm ?? '—'}<span> cm</span></strong></div>
            <div><small>現在体重</small><strong>{plan.currentWeight.toFixed(1)}<span> kg</span></strong></div>
            <div><small>目標体重</small><strong>{plan.targetWeight.toFixed(1)}<span> kg</span></strong><small className="water-cut-sub">水抜き予定 {normalizedWaterCut(plan).toFixed(1)} kg</small></div>
            <div><small>活動量</small><strong>{activityLabel}</strong></div>
          </div>
        </section>

        <section className="settings-summary-section">
          <div className="settings-section-head"><h2>試合情報</h2><a href="#plan-edit">編集</a></div>
          <div className="fight-info-list"><div><span><small>試合日</small><strong>{formatDate(plan.fightDate)}</strong></span><b>あと {metrics.days} 日</b></div><div><span><small>計量</small><strong>{weighInLabel(plan)} / {formatDate(weighInDateIso(plan))}</strong></span></div><div><span><small>階級 / 目標</small><strong>{plan.targetWeight.toFixed(1)} kg</strong></span></div><div><span><small>水抜き予定</small><strong>{normalizedWaterCut(plan).toFixed(1)} kg</strong></span></div><div className="fight-mode-setting"><span><small>試合モード</small><strong>{plan.fightMode ? 'ON' : 'OFF'}</strong></span><button className={`mini-toggle ${plan.fightMode ? 'active' : ''}`} onClick={() => updateFightMode(!plan.fightMode)} aria-pressed={Boolean(plan.fightMode)}><i/></button></div></div>
        </section>

        <section className="settings-summary-section">
          <div className="settings-section-head"><h2>アプリ設定</h2></div>
          <div className="settings-list"><button disabled><MessageSquareText size={19}/><span>通知設定<small>準備中</small></span><ChevronRight size={18}/></button><button disabled><Activity size={19}/><span>ダークモード<small>準備中</small></span><i className="toggle-off"/></button><button className="logout-row" onClick={logout}><LogOut size={19}/><span>ログアウト</span></button></div>
        </section>

        <div id="plan-edit"><section className="panel plan-panel settings-panel-card"><PanelHeading number="01" title="減量プラン編集" subtitle="体重・試合日・計量方法・水抜き予定" /><div className="plan-fields"><label>最新体重<div className="metric-input"><Weight size={19}/><input aria-label="最新体重" type="number" inputMode="decimal" min="30" max="300" step="0.1" value={plan.currentWeight} onChange={(event)=>setPlan({...plan,currentWeight:Number(event.target.value)})}/><span>kg</span></div></label><label>目標体重<div className="metric-input"><Target size={19}/><input aria-label="目標体重" type="number" inputMode="decimal" min="30" max="300" step="0.1" value={plan.targetWeight} onChange={(event)=>setPlan({...plan,targetWeight:Number(event.target.value)})}/><span>kg</span></div></label><label className="date-field">試合日<div className="metric-input"><CalendarDays size={19}/><input aria-label="試合日" type="date" min={isoToday()} value={plan.fightDate} onChange={(event)=>setPlan({...plan,fightDate:event.target.value})}/></div></label><label>計量タイミング<select aria-label="計量タイミング" value={plan.weighInType ?? 'same_day'} onChange={(event)=>setPlan({...plan,weighInType:event.target.value as WeighInType})}><option value="same_day">当日計量</option><option value="day_before">前日計量</option></select></label><label>水抜き予定<div className="metric-input"><TrendingDown size={19}/><input aria-label="水抜き予定" type="number" inputMode="decimal" min="0" max="15" step="0.1" value={normalizedWaterCut(plan)} onChange={(event)=>setPlan({...plan,waterCutKg:Number(event.target.value)})}/><span>kg</span></div></label></div><button className="save-button" onClick={savePlan} disabled={saving}><Save size={17}/>{saving?'保存中…':'変更を保存'}</button>{notice&&<p className="save-notice" role="status">{notice}</p>}</section></div>
        <div id="profile-edit"><ProfilePanel profile={profile} onSaved={setProfile} /></div>
        <details className="feature-details settings-feedback"><summary><MessageSquareText size={18}/>フィードバック<ChevronDown size={18}/></summary><FeedbackPanel /></details>
        <div className="settings-brand"><Brand/><small>Ver. 1.3.0 / v11</small></div>
        <p className="settings-disclaimer">基礎代謝・消費カロリー・体重予測は参考値です。急激な減量や極端な摂取制限は避けてください。</p>
      </section>}

      <BottomNavigation activeTab={activeTab} onChange={navigate} />
    </main>
  )
}

type AppTab = 'home' | 'record' | 'meals' | 'settings'
type RecordSubTab = 'weight' | 'condition' | 'calories' | 'training'

const tabItems: { id: AppTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'record', label: '記録', icon: BarChart3 },
  { id: 'meals', label: '食事', icon: Utensils },
  { id: 'settings', label: '設定', icon: Settings },
]

function BottomNavigation({ activeTab, onChange }: { activeTab: AppTab; onChange: (tab: AppTab) => void }) {
  return <nav className="bottom-navigation" aria-label="下部メニュー">{tabItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => onChange(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
}

function AppHeader({ user, onSettings, onLogout }: { user: User; onSettings?: () => void; onLogout?: () => void }) {
  return <header className="app-header new-app-header"><Brand />{onSettings ? <button className="settings-button" onClick={onSettings} aria-label={`${user.username}の設定を開く`}><Settings size={22}/></button> : onLogout ? <button className="settings-button" onClick={onLogout} aria-label="ログアウト"><LogOut size={21}/></button> : null}</header>
}

function todayTargetWeight(plan: Plan, records: RecordEntry[]) {
  if (!records.length) return plan.currentWeight
  const sorted = [...records].sort((a, b) => a.recordedOn.localeCompare(b.recordedOn))
  const first = sorted[0]
  const start = dateAtNoon(first.recordedOn)
  const today = dateAtNoon(isoToday())
  const fight = dateAtNoon(weighInDateIso(plan))
  const totalDays = Math.max(1, daysBetween(start, fight))
  const elapsed = Math.min(totalDays, daysBetween(start, today))
  const ratio = elapsed / totalDays
  return first.weight - (first.weight - dietTargetWeight(plan)) * ratio
}

function SetupScreen({ user, initialPlan, initialProfile, onLogout, onComplete }: { user: User; initialPlan: Plan | null; initialProfile: Profile | null; onLogout: () => void; onComplete: (plan: Plan, profile: Profile, record: RecordEntry | null) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [currentWeight, setCurrentWeight] = useState(initialPlan ? String(initialPlan.currentWeight) : '')
  const [targetWeight, setTargetWeight] = useState(initialPlan ? String(initialPlan.targetWeight) : '')
  const [fightDate, setFightDate] = useState(initialPlan?.fightDate ?? '')
  const [weighInType, setWeighInType] = useState<WeighInType>(initialPlan?.weighInType ?? 'same_day')
  const [waterCutKg, setWaterCutKg] = useState(initialPlan ? String(initialPlan.waterCutKg ?? 0) : '0')
  const [heightCm, setHeightCm] = useState(initialProfile ? String(initialProfile.heightCm) : '')
  const [age, setAge] = useState(initialProfile ? String(initialProfile.age) : '')
  const [sex, setSex] = useState<Sex>(initialProfile?.sex ?? 'male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initialProfile?.activityLevel ?? 'moderate')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function continueToNutrition(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const current = Number(currentWeight)
    const target = Number(targetWeight)
    const height = Number(heightCm)
    if (!heightCm || !currentWeight || !targetWeight || !fightDate) return setError('身長・現体重・目標体重・試合日を入力してください。')
    if (!(height >= 120 && height <= 230)) return setError('身長は120〜230cmで入力してください。')
    if (!(current >= 30 && current <= 300) || !(target >= 30 && target <= 300)) return setError('体重は30〜300kgで入力してください。')
    if (target >= current) return setError('目標体重は現在体重より軽く設定してください。')
    const waterCut = Number(waterCutKg)
    if (!(waterCut >= 0 && waterCut <= 15)) return setError('水抜き予定は0〜15kgで入力してください。')
    if (waterCut > current - target) return setError('水抜き予定は現在体重と目標体重の差以内で設定してください。')
    if (fightDate < isoToday()) return setError('試合日は今日以降の日付を設定してください。')
    if (weighInType === 'day_before' && weighInDateIso({ currentWeight: current, targetWeight: target, fightDate, weighInType, waterCutKg: waterCut }) < isoToday()) return setError('前日計量日が今日より前になっています。')
    setStep(2)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const plan: Plan = { currentWeight: Number(currentWeight), targetWeight: Number(targetWeight), fightDate, weighInType, waterCutKg: Number(waterCutKg) }
    if (!age) return setError('年齢を入力してください。')
    setSaving(true)
    setError('')
    try {
      const savedPlan = await api<{ plan: Plan }>('/plan', { method: 'PUT', body: JSON.stringify(plan) })
      const savedProfile = await api<{ profile: Profile }>('/profile', { method: 'PUT', body: JSON.stringify({ heightCm: Number(heightCm), age: Number(age), sex, activityLevel }) })
      let firstRecord: RecordEntry | null = null
      if (!initialPlan) {
        try {
          const result = await api<{ record: RecordEntry }>('/records', { method: 'POST', body: JSON.stringify({ weight: plan.currentWeight, recordedOn: isoToday(), note: '初期設定' }) })
          firstRecord = result.record
        } catch {}
      }
      onComplete(savedPlan.plan, savedProfile.profile, firstRecord)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '初期設定を保存できませんでした。')
    } finally { setSaving(false) }
  }

  return <main className="app-shell setup-shell"><AppHeader user={user} onLogout={onLogout} /><section className="setup-card onboarding-card"><div className="setup-intro"><span>初回セットアップ</span><h1>最初に、減量の<br />基準を設定。</h1><p>新規登録後は、ホームへ進む前に身体情報と試合情報を設定します。現在体重は今日の最初の体重記録にも自動保存されます。</p><div className="setup-progress" aria-label="初期設定の進行状況"><span className={step >= 1 ? 'active' : ''}>1</span><i /><span className={step >= 2 ? 'active' : ''}>2</span><small>{step === 1 ? '基本設定' : 'カロリー計算設定'}</small></div></div>
    {step === 1 ? <form onSubmit={continueToNutrition}>
      <div className="setup-form-heading"><strong>基本設定</strong><small>ログイン後、まずこの情報を設定します</small></div>
      <div className="setup-grid onboarding-primary-grid">
        <label>身長<div className="metric-input"><Ruler size={20}/><input type="number" inputMode="decimal" min="120" max="230" step="0.1" value={heightCm} onChange={e=>setHeightCm(e.target.value)} placeholder="例 164" autoFocus required/><span>cm</span></div></label>
        <label>体重（現体重）<div className="metric-input"><Weight size={20}/><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={currentWeight} onChange={e=>setCurrentWeight(e.target.value)} placeholder="例 75.2" required/><span>kg</span></div></label>
        <label className="setup-wide">性別<div className="sex-choice" role="radiogroup" aria-label="性別"><button type="button" role="radio" aria-checked={sex === 'male'} className={sex === 'male' ? 'active' : ''} onClick={()=>setSex('male')}>男性</button><button type="button" role="radio" aria-checked={sex === 'female'} className={sex === 'female' ? 'active' : ''} onClick={()=>setSex('female')}>女性</button></div></label>
        <label>試合日<div className="metric-input"><CalendarDays size={20}/><input type="date" min={isoToday()} value={fightDate} onChange={e=>setFightDate(e.target.value)} required/></div></label>
        <label>目標体重<div className="metric-input"><Target size={20}/><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={targetWeight} onChange={e=>setTargetWeight(e.target.value)} placeholder="例 70.3" required/><span>kg</span></div></label>
        <label>計量タイミング<select value={weighInType} onChange={e=>setWeighInType(e.target.value as WeighInType)}><option value="same_day">当日計量</option><option value="day_before">前日計量</option></select></label>
        <label>水抜き予定<div className="metric-input"><TrendingDown size={20}/><input type="number" inputMode="decimal" min="0" max="15" step="0.1" value={waterCutKg} onChange={e=>setWaterCutKg(e.target.value)} placeholder="例 2.5" required/><span>kg</span></div></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button">次へ<ChevronRight size={18}/></button>
    </form> : <form onSubmit={submit}>
      <div className="setup-form-heading"><strong>カロリー計算設定</strong><small>BMR・TDEEの計算に必要です</small></div>
      <div className="setup-grid">
        <label>年齢<div className="metric-input"><UserRound size={20}/><input type="number" inputMode="numeric" min="16" max="90" value={age} onChange={e=>setAge(e.target.value)} placeholder="例 24" autoFocus required/><span>歳</span></div></label>
        <label>活動量<select value={activityLevel} onChange={e=>setActivityLevel(e.target.value as ActivityLevel)}>{activityOptions.map(o=><option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}</select></label>
      </div>
      <div className="setup-review"><span>身長 <strong>{heightCm}cm</strong></span><span>現体重 <strong>{currentWeight}kg</strong></span><span>目標 <strong>{targetWeight}kg</strong></span><span>水抜き <strong>{Number(waterCutKg || 0).toFixed(1)}kg</strong></span><span>計量 <strong>{weighInType === 'day_before' ? '前日' : '当日'}</strong></span><span>性別 <strong>{sex === 'male' ? '男性' : '女性'}</strong></span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="setup-actions"><button type="button" className="secondary-button" onClick={()=>{ setError(''); setStep(1) }}><ArrowLeft size={17}/>戻る</button><button className="primary-button" disabled={saving}>{saving?'保存中…':'設定を保存して開始'}<ChevronRight size={18}/></button></div>
    </form>}
  </section></main>
}
function PanelHeading({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return <div className="panel-heading"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>
}

function AccountPanel({ user, onUserChanged }: { user: User; onUserChanged: (user: User) => void }) {
  const [email, setEmail] = useState(user.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const isChangingExistingEmail = Boolean(user.email && email.trim().toLowerCase() !== user.email)

  useEffect(() => setEmail(user.email ?? ''), [user.email])

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const result = await api<{ user: User }>('/account/email', {
        method: 'PUT',
        body: JSON.stringify({ email, currentPassword }),
      })
      onUserChanged(result.user)
      setCurrentPassword('')
      setNotice(user.email ? 'メールアドレスを更新しました。' : 'メールアドレスを登録しました。')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'メールアドレスを保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  async function sendResetEmail() {
    if (!user.email) return
    setError('')
    setNotice('')
    setSendingReset(true)
    try {
      const result = await api<{ message: string }>('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: user.email }),
      })
      setNotice(result.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '再設定メールを送信できませんでした。')
    } finally {
      setSendingReset(false)
    }
  }

  return <section className="settings-summary-section account-settings-section" id="account-email">
    <div className="settings-section-head"><h2>アカウント</h2></div>
    <form className="account-settings-card" onSubmit={saveEmail}>
      <label>メールアドレス<div className="account-input"><Mail size={17}/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required maxLength={254}/></div></label>
      {isChangingExistingEmail && <label>現在のパスワード<div className="account-input"><ShieldCheck size={17}/><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="変更確認のため入力" required minLength={8} maxLength={128}/></div></label>}
      <div className="account-actions">
        <button className="account-save-button" disabled={saving}>{saving ? '保存中…' : user.email ? 'メールを変更' : 'メールを登録'}</button>
        {user.email && <button type="button" className="account-reset-button" onClick={sendResetEmail} disabled={sendingReset}><Mail size={15}/>{sendingReset ? '送信中…' : '再設定メールを送る'}</button>}
      </div>
      {!user.email && <p className="account-help">既存アカウントは、ここでメールを登録すると「パスワードを忘れた方」が使えるようになります。</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
    </form>
  </section>
}

function ProfilePanel({ profile, onSaved }: { profile: Profile | null; onSaved: (profile: Profile) => void }) {
  const [heightCm, setHeightCm] = useState(profile ? String(profile.heightCm) : '')
  const [age, setAge] = useState(profile ? String(profile.age) : '')
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile?.activityLevel ?? 'moderate')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setHeightCm(String(profile.heightCm))
    setAge(String(profile.age))
    setSex(profile.sex)
    setActivityLevel(profile.activityLevel)
  }, [profile])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const result = await api<{ profile: Profile }>('/profile', {
        method: 'PUT',
        body: JSON.stringify({ heightCm: Number(heightCm), age: Number(age), sex, activityLevel }),
      })
      onSaved(result.profile)
      setNotice('プロフィールを保存しました。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel profile-panel">
      <PanelHeading number="02" title="身体プロフィール" subtitle="基礎代謝と消費カロリーの計算に使用" />
      <form className="profile-form" onSubmit={submit}>
        <label>身長<div className="metric-input"><Ruler size={18} /><input type="number" inputMode="decimal" min="120" max="230" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例 170" required /><span>cm</span></div></label>
        <label>年齢<div className="metric-input"><UserRound size={18} /><input type="number" inputMode="numeric" min="16" max="90" step="1" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例 24" required /><span>歳</span></div></label>
        <label>性別（BMR計算用）<select value={sex} onChange={(event) => setSex(event.target.value as Sex)}><option value="male">男性</option><option value="female">女性</option></select></label>
        <label className="activity-field">普段の活動量<select value={activityLevel} onChange={(event) => setActivityLevel(event.target.value as ActivityLevel)}>{activityOptions.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>)}</select></label>
        <button className="save-button profile-save" disabled={saving}><Save size={17} />{saving ? '保存中…' : profile ? 'プロフィールを更新' : 'プロフィールを保存'}</button>
      </form>
      {notice && <p className="save-notice" role="status">{notice}</p>}
    </div>
  )
}

function CaloriesPanel({ nutrition, profile, prediction }: { nutrition: ReturnType<typeof calculateDailyNutrition> | null; profile: Profile | null; prediction: ReturnType<typeof calculateWeightPrediction> | null }) {
  return (
    <div className="panel calorie-panel">
      <PanelHeading number="03" title="今日のカロリー" subtitle="BMR・活動量・減量ペースから自動計算" />
      {!profile || !nutrition ? (
        <div className="calorie-empty"><Flame size={30} /><div><strong>プロフィールを入力すると計算できます</strong><p>身長・年齢・性別・活動量から基礎代謝と1日の消費目安を表示します。</p></div></div>
      ) : (
        <>
          <div className="calorie-hero">
            <div><small>今日あと</small><strong className={nutrition.remaining < 0 ? 'over' : ''}>{Math.abs(Math.round(nutrition.remaining)).toLocaleString()}<span>kcal</span></strong><p>{nutrition.remaining >= 0 ? '摂取目安までの残り' : '摂取目安を超過'}</p></div>
            <div className="calorie-ring" aria-label={`摂取 ${Math.round(nutrition.consumed)} kcal / 目標 ${Math.round(nutrition.targetCalories)} kcal`}><span>{Math.round(nutrition.consumed).toLocaleString()}</span><small>/ {Math.round(nutrition.effectiveTargetCalories).toLocaleString()} kcal</small></div>
          </div>
          <div className="calorie-stats">
            <div><Flame size={17} /><small>基礎代謝</small><b>{Math.round(nutrition.bmr).toLocaleString()} kcal</b></div>
            <div><Activity size={17} /><small>推定消費</small><b>{Math.round(nutrition.tdee).toLocaleString()} kcal</b></div>
            <div><TrendingDown size={17} /><small>必要赤字</small><b>{Math.round(nutrition.dailyDeficitNeeded).toLocaleString()} kcal/日</b></div>
          </div>
          <div className="macro-row"><span>P <b>{Math.round(nutrition.protein)}g</b></span><span>F <b>{Math.round(nutrition.fat)}g</b></span><span>C <b>{Math.round(nutrition.carbs)}g</b></span></div>
          {nutrition.calorieStatus !== 'safe' && <div className={`nutrition-warning ${nutrition.calorieStatus}`}><AlertTriangle size={18} /><p>{nutrition.targetCalories < nutrition.bmr ? '必要摂取量の計算値が基礎代謝を下回っています。日程や目標体重の見直しを検討してください。' : '必要なエネルギー赤字が大きめです。体調と練習パフォーマンスを優先してください。'}</p></div>}
          <div className="prediction-box">
            <span>体重予測</span>
            {prediction?.available ? <><strong>計量前予測 {prediction.predictedWeight.toFixed(1)} kg</strong><p>直近{prediction.samples}回の記録：週 {prediction.weeklyTrend > 0 ? '+' : ''}{prediction.weeklyTrend.toFixed(2)} kg。目標との差 {prediction.differenceFromTarget > 0 ? '+' : ''}{prediction.differenceFromTarget.toFixed(1)} kg。</p></> : <><strong>記録を追加してください</strong><p>{prediction?.reason ?? '体重記録が増えると予測を表示します。'}</p></>}
          </div>
        </>
      )}
      <p className="estimate-note">※ BMRはMifflin-St Jeor式、消費カロリーは活動係数を使った推定です。実際の消費量には個人差があります。</p>
    </div>
  )
}

function calculateMetrics(plan: Plan) {
  const today = dateAtNoon(isoToday())
  const fightDays = daysBetween(today, dateAtNoon(plan.fightDate))
  const cutDays = daysBetween(today, dateAtNoon(weighInDateIso(plan)))
  const weeks = Math.max(cutDays / 7, 0.15)
  const dietTarget = dietTargetWeight(plan)
  const toCut = Math.max(0, plan.currentWeight - dietTarget)
  const weekly = toCut / weeks
  const cutPercent = plan.currentWeight ? (toCut / plan.currentWeight) * 100 : 0
  const weeklyPercent = plan.currentWeight ? (weekly / plan.currentWeight) * 100 : 0
  const status = weeklyPercent <= 0.75 ? 'safe' : weeklyPercent <= 1 ? 'caution' : 'danger'
  const statusLabel = status === 'safe' ? '無理の少ないペース' : status === 'caution' ? '注意が必要なペース' : '危険性が高いペース'
  const waterNote = normalizedWaterCut(plan) > 0 ? ` 計量前に水抜き ${normalizedWaterCut(plan).toFixed(1)} kgを予定。` : ''
  const statusMessage = status === 'safe' ? '現在の設定は比較的ゆとりがあります。' : status === 'caution' ? '体調を確認しながら慎重に進めてください。' : '目標・日程の見直しを強く推奨します。'
  const statusDetail = status === 'safe' ? `通常減量は週平均 ${weekly.toFixed(2)} kg。毎日の変化ではなく、7日平均で進捗を確認しましょう。${waterNote}` : status === 'caution' ? `通常減量で週に体重の ${weeklyPercent.toFixed(2)}% を落とす計算です。疲労・睡眠・練習強度に注意してください。${waterNote}` : `通常減量で週に体重の ${weeklyPercent.toFixed(2)}% を落とす計算です。急な水抜きを行わず、専門家へ相談してください。${waterNote}`
  const totalWeeks = Math.max(1, Math.ceil(weeks))
  const targets = Array.from({ length: Math.min(totalWeeks, 12) }, (_, index) => {
    const elapsed = Math.min((index + 1) * 7, cutDays)
    const ratio = cutDays ? elapsed / cutDays : 1
    const date = new Date(today)
    date.setDate(date.getDate() + elapsed)
    return { date: date.toISOString().slice(0, 10), weight: plan.currentWeight - toCut * ratio }
  })
  return { days: fightDays, cutDays, toCut, weekly, weeklyPercent, cutPercent, status, statusLabel, statusMessage, statusDetail, targets, dietTarget }
}

function WeightChart({ plan, records }: { plan: Plan; records: RecordEntry[] }) {
  const [rangeMode, setRangeMode] = useState<'7' | '30' | '90' | 'all'>('30')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const width = 760, height = 220, left = 50, right = 22, top = 18, bottom = 34
  const sorted = [...records].sort((a, b) => a.recordedOn.localeCompare(b.recordedOn))
  const todayMs = dateAtNoon(isoToday()).getTime()
  const fightMs = dateAtNoon(weighInDateIso(plan)).getTime()
  const firstRecord = sorted[0]
  const planStartMs = firstRecord ? dateAtNoon(firstRecord.recordedOn).getTime() : todayMs
  const planStartWeight = firstRecord?.weight ?? plan.currentWeight
  const startMs = rangeMode === '7'
    ? todayMs - 6 * 86400000
    : rangeMode === '30'
      ? todayMs - 29 * 86400000
      : rangeMode === '90'
        ? todayMs - 89 * 86400000
        : Math.min(planStartMs, todayMs)
  const endMs = rangeMode === 'all' ? Math.max(fightMs, todayMs + 86400000) : todayMs
  const visible = sorted.filter((record) => {
    const time = dateAtNoon(record.recordedOn).getTime()
    return time >= startMs && time <= endMs
  })

  const idealWeightAt = (time: number) => {
    if (fightMs <= planStartMs) return dietTargetWeight(plan)
    const ratio = Math.min(1, Math.max(0, (time - planStartMs) / (fightMs - planStartMs)))
    return planStartWeight + (dietTargetWeight(plan) - planStartWeight) * ratio
  }
  const idealStartWeight = idealWeightAt(startMs)
  const idealEndWeight = idealWeightAt(endMs)
  const scaleWeights = [plan.currentWeight, idealStartWeight, idealEndWeight, ...visible.map((record) => record.weight)]
  if (rangeMode === 'all') scaleWeights.push(dietTargetWeight(plan))
  const rawMin = Math.min(...scaleWeights)
  const rawMax = Math.max(...scaleWeights)
  const padding = Math.max(0.6, (rawMax - rawMin) * 0.12)
  const minWeight = Math.floor((rawMin - padding) * 2) / 2
  const maxWeight = Math.ceil((rawMax + padding) * 2) / 2
  const weightRange = Math.max(1, maxWeight - minWeight)
  const x = (date: number) => left + ((Math.max(startMs, Math.min(endMs, date)) - startMs) / Math.max(1, endMs - startMs)) * (width - left - right)
  const y = (weight: number) => top + ((maxWeight - weight) / weightRange) * (height - top - bottom)
  const actualPath = visible.map((record, index) => `${index ? 'L' : 'M'} ${x(dateAtNoon(record.recordedOn).getTime())} ${y(record.weight)}`).join(' ')
  const actualAreaPath = visible.length > 1 ? `${actualPath} L ${x(dateAtNoon(visible[visible.length - 1].recordedOn).getTime())} ${height - bottom} L ${x(dateAtNoon(visible[0].recordedOn).getTime())} ${height - bottom} Z` : ''
  const ticks = Array.from({ length: 4 }, (_, index) => maxWeight - (weightRange * index) / 3)
  const latestVisible = visible[visible.length - 1]
  const selected = visible.find((record) => record.id === selectedId) ?? null
  const shortRange = rangeMode !== 'all'

  return (
    <div className="chart-block">
      <div className="chart-range" role="group" aria-label="グラフ期間">
        <button className={rangeMode === '7' ? 'active' : ''} onClick={() => { setRangeMode('7'); setSelectedId(null) }}>1週</button>
        <button className={rangeMode === '30' ? 'active' : ''} onClick={() => { setRangeMode('30'); setSelectedId(null) }}>1ヶ月</button>
        <button className={rangeMode === '90' ? 'active' : ''} onClick={() => { setRangeMode('90'); setSelectedId(null) }}>3ヶ月</button>
        <button className={rangeMode === 'all' ? 'active' : ''} onClick={() => { setRangeMode('all'); setSelectedId(null) }}>全期間</button>
      </div>
      <div className="chart-wrap redesigned-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="目標ラインと実測体重のグラフ">
          {ticks.map((tick, index) => <g key={`${tick}-${index}`}><line className="grid-line" x1={left} y1={top + index * ((height - top - bottom) / 3)} x2={width - right} y2={top + index * ((height - top - bottom) / 3)} /><text className="weight-label" textAnchor="end" x={left - 9} y={top + index * ((height - top - bottom) / 3) + 4}>{tick.toFixed(1)}</text></g>)}
          {rangeMode === 'all' && <><line className="goal-horizontal" x1={left} y1={y(plan.targetWeight)} x2={width - right} y2={y(plan.targetWeight)} /><text className="goal-label" textAnchor="end" x={width - right} y={Math.max(14, y(plan.targetWeight) - 7)}>目標 {plan.targetWeight.toFixed(1)} kg</text></>}
          <line className="cut-line" x1={x(startMs)} y1={y(idealStartWeight)} x2={x(endMs)} y2={y(idealEndWeight)} />
          {rangeMode === 'all' && fightMs >= startMs && fightMs <= endMs && <circle className="cut-end" cx={x(fightMs)} cy={y(plan.targetWeight)} r="5" />}
          {actualAreaPath && <path className="actual-area" d={actualAreaPath} />}
          {actualPath && <path className="actual-line" d={actualPath} />}
          {visible.map((record) => {
            const isLatest = latestVisible?.id === record.id
            return <circle key={record.id} className={`actual-point ${isLatest ? 'latest' : ''} ${selectedId === record.id ? 'selected' : ''}`} cx={x(dateAtNoon(record.recordedOn).getTime())} cy={y(record.weight)} r={isLatest ? 6 : 4.5} tabIndex={0} role="button" aria-label={`${formatShortDate(record.recordedOn)} ${record.weight.toFixed(1)}kg`} onClick={() => setSelectedId(record.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(record.id) }} />
          })}
          {selected && <g className="chart-tooltip" transform={`translate(${Math.max(90, Math.min(width - 100, x(dateAtNoon(selected.recordedOn).getTime())))},${Math.max(34, y(selected.weight) - 38)})`}><rect x="-82" y="-24" width="164" height="32" rx="9"/><text textAnchor="middle" y="-3">{formatShortDate(selected.recordedOn)}　{selected.weight.toFixed(1)}kg</text></g>}
          <text className="axis-date" x={left} y={height - 10}>{formatChartDate(new Date(startMs))}</text>
          {!shortRange && <text className="axis-date today-axis" textAnchor="middle" x={x(todayMs)} y={height - 10}>今日</text>}
          <text className="axis-date fight-axis" textAnchor="end" x={width - right} y={height - 10}>{shortRange ? '今日' : `計量 ${formatChartDate(new Date(fightMs))}`}</text>
        </svg>
        {visible.length === 0 && <p className="chart-empty">この期間の体重記録はまだありません。</p>}
      </div>
      <div className="graph-legend"><span><i className="actual-swatch"/>実測体重</span><span><i className="ideal-swatch"/>目標減量ライン</span>{rangeMode === 'all' && <span><i className="goal-swatch"/>水抜き前目標</span>}</div>
    </div>
  )
}

function ConditionPanel({ conditions, onSaved, onRemoved }: { conditions: ConditionEntry[]; onSaved: (condition: ConditionEntry) => void; onRemoved: (id: number) => void }) {
  const todayExisting = conditions.find((entry) => entry.recordedOn === isoToday())
  const [recordedOn, setRecordedOn] = useState(isoToday())
  const [sleepHours, setSleepHours] = useState(String(todayExisting?.sleepHours ?? 7.5))
  const [fatigue, setFatigue] = useState(todayExisting?.fatigue ?? 3)
  const [hunger, setHunger] = useState(todayExisting?.hunger ?? 3)
  const [trainingIntensity, setTrainingIntensity] = useState(todayExisting?.trainingIntensity ?? 3)
  const [bodyCondition, setBodyCondition] = useState(todayExisting?.bodyCondition ?? 3)
  const [restingHeartRate, setRestingHeartRate] = useState(todayExisting?.restingHeartRate ? String(todayExisting.restingHeartRate) : '')
  const [note, setNote] = useState(todayExisting?.note ?? '')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const existing = conditions.find((entry) => entry.recordedOn === recordedOn)
    setSleepHours(String(existing?.sleepHours ?? 7.5))
    setFatigue(existing?.fatigue ?? 3)
    setHunger(existing?.hunger ?? 3)
    setTrainingIntensity(existing?.trainingIntensity ?? 3)
    setBodyCondition(existing?.bodyCondition ?? 3)
    setRestingHeartRate(existing?.restingHeartRate ? String(existing.restingHeartRate) : '')
    setNote(existing?.note ?? '')
  }, [recordedOn, conditions])

  const previewScore = calculateConditionScore({ sleepHours: Number(sleepHours || 0), fatigue, hunger, bodyCondition })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const result = await api<{ condition: ConditionEntry }>('/conditions', {
        method: 'POST',
        body: JSON.stringify({ recordedOn, sleepHours: Number(sleepHours), fatigue, hunger, trainingIntensity, bodyCondition, restingHeartRate, note }),
      })
      onSaved(result.condition)
      setMessage('コンディションを保存しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('このコンディション記録を削除しますか？')) return
    try {
      await api(`/conditions/${id}`, { method: 'DELETE' })
      onRemoved(id)
      setMessage('コンディション記録を削除しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '削除できませんでした。')
    }
  }

  const recent = conditions.slice(0, 7)
  return <div className="panel condition-panel">
    <div className="condition-head"><div><small>DAILY CONDITION</small><h2>コンディション</h2><p>睡眠・疲労・空腹・体感から0〜100で表示します。</p></div><div className="condition-score"><span>今日</span><strong>{previewScore ?? '—'}</strong><small>/100</small></div></div>
    <form className="condition-form" onSubmit={save}>
      <label>日付<div className="metric-input"><CalendarDays size={18}/><input type="date" max={isoToday()} value={recordedOn} onChange={(event) => setRecordedOn(event.target.value)} required/></div></label>
      <label>睡眠時間<div className="metric-input"><HeartPulse size={18}/><input type="number" min="0" max="16" step="0.5" inputMode="decimal" value={sleepHours} onChange={(event) => setSleepHours(event.target.value)} required/><span>h</span></div></label>
      <RatingField label="疲労度" value={fatigue} onChange={setFatigue} low="少" high="強" />
      <RatingField label="空腹度" value={hunger} onChange={setHunger} low="少" high="強" />
      <RatingField label="練習強度" value={trainingIntensity} onChange={setTrainingIntensity} low="軽" high="高" />
      <RatingField label="体調" value={bodyCondition} onChange={setBodyCondition} low="悪" high="良" positive />
      <label>安静時心拍（任意）<div className="metric-input"><HeartPulse size={18}/><input type="number" min="30" max="220" inputMode="numeric" value={restingHeartRate} onChange={(event) => setRestingHeartRate(event.target.value)} placeholder="例 58"/><span>bpm</span></div></label>
      <label className="condition-note">メモ（任意）<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="例：スパー後で脚が重い"/></label>
      <button className="add-button condition-save" disabled={saving}><Save size={18}/>{saving ? '保存中…' : conditions.some((entry) => entry.recordedOn === recordedOn) ? 'この日を更新' : '記録する'}</button>
    </form>
    {message && <p className="record-message" role="status">{message}</p>}
    <p className="condition-formula-note">スコアは睡眠30%・疲労25%・空腹15%・自己評価30%で算出。練習強度と心拍は判断材料として記録します。</p>
    {recent.length > 0 && <div className="condition-history">{recent.map((entry) => <div key={entry.id}><time>{formatShortDate(entry.recordedOn)}</time><strong>{calculateConditionScore(entry)}/100</strong><span>睡眠 {entry.sleepHours.toFixed(1)}h</span><span>疲労 {entry.fatigue}/5</span><button onClick={() => remove(entry.id)} aria-label="削除"><Trash2 size={15}/></button></div>)}</div>}
  </div>
}

function RatingField({ label, value, onChange, low, high, positive = false }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string; positive?: boolean }) {
  return <fieldset className="rating-field"><legend>{label}</legend><div>{[1,2,3,4,5].map((number) => <button type="button" key={number} className={value === number ? 'active' : ''} onClick={() => onChange(number)}>{number}</button>)}</div><small>{positive ? `${low} ← → ${high}` : `${low} ← → ${high}`}</small></fieldset>
}

const mealTypeLabels: Record<MealType, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }

function MealPanel({ meals, templates, onMealSaved, onMealRemoved, onTemplateSaved, onTemplateRemoved }: { meals: MealEntry[]; templates: MealTemplate[]; onMealSaved: (meal: MealEntry) => void; onMealRemoved: (id: number) => void; onTemplateSaved: (template: MealTemplate) => void; onTemplateRemoved: (id: number) => void }) {
  const [eatenOn, setEatenOn] = useState(isoToday())
  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carbs, setCarbs] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [openMealType, setOpenMealType] = useState<MealType | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  function reset(closeForm = false) {
    setEditingId(null); setName(''); setCalories(''); setProtein(''); setFat(''); setCarbs('')
    if (closeForm) setFormOpen(false)
  }
  function focusForm(type?: MealType) {
    if (type) { setMealType(type); setOpenMealType(type) }
    setFormOpen(true)
    window.setTimeout(() => document.getElementById('meal-form-fields')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
  }
  function editMeal(meal: MealEntry) {
    setEditingId(meal.id); setEatenOn(meal.eatenOn); setMealType(meal.mealType || 'snack'); setOpenMealType(meal.mealType || 'snack'); setName(meal.name); setCalories(String(meal.calories)); setProtein(String(meal.protein)); setFat(String(meal.fat)); setCarbs(String(meal.carbs)); focusForm(meal.mealType || 'snack')
  }

  async function saveMeal(event: React.FormEvent) {
    event.preventDefault(); setMessage(''); setSaving(true)
    const body = JSON.stringify({ eatenOn, mealType, name, calories: Number(calories), protein: Number(protein || 0), fat: Number(fat || 0), carbs: Number(carbs || 0) })
    try {
      const result = await api<{ meal: MealEntry }>(editingId ? `/meals/${editingId}` : '/meals', { method: editingId ? 'PUT' : 'POST', body })
      onMealSaved(result.meal); setOpenMealType(result.meal.mealType || mealType); setMessage(editingId ? '食事記録を更新しました。' : '食事を記録しました。残りカロリーを更新しました。'); reset(true)
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : '記録できませんでした。') } finally { setSaving(false) }
  }

  async function removeMeal(id: number) {
    if (!window.confirm('この食事記録を削除しますか？')) return
    try { await api(`/meals/${id}`, { method: 'DELETE' }); onMealRemoved(id); setMessage('食事記録を削除しました。'); if (editingId === id) reset(true) } catch (caught) { setMessage(caught instanceof Error ? caught.message : '削除できませんでした。') }
  }

  async function useTemplate(template: MealTemplate) {
    setMessage('')
    try {
      const result = await api<{ meal: MealEntry }>('/meals', { method: 'POST', body: JSON.stringify({ eatenOn, mealType: template.mealType, name: template.name, calories: template.calories, protein: template.protein, fat: template.fat, carbs: template.carbs }) })
      onMealSaved(result.meal)
      setOpenMealType(template.mealType)
      setMessage(`${template.name}を記録しました。`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'テンプレートを登録できませんでした。')
    }
  }

  async function saveTemplate() {
    if (!name.trim() || calories === '') return setMessage('食事名とkcalを入力してからテンプレート保存してください。')
    try {
      const result = await api<{ template: MealTemplate }>('/templates', { method: 'POST', body: JSON.stringify({ mealType, name, calories: Number(calories), protein: Number(protein || 0), fat: Number(fat || 0), carbs: Number(carbs || 0) }) })
      onTemplateSaved(result.template)
      setMessage('食事テンプレートを保存しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'テンプレートを保存できませんでした。')
    }
  }

  async function removeTemplate(id: number) {
    if (!window.confirm('この食事テンプレートを削除しますか？')) return
    try {
      await api(`/templates/${id}`, { method: 'DELETE' })
      onTemplateRemoved(id)
      setMessage('テンプレートを削除しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'テンプレートを削除できませんでした。')
    }
  }

  const visibleMeals = meals.filter((meal) => meal.eatenOn === eatenOn)
  const dayTotal = visibleMeals.reduce((sum, meal) => sum + meal.calories, 0)
  const types: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
  return <div className="panel meal-panel redesigned-meal-panel" id="meal-record">
    <div className="meal-panel-head"><div><small>DAILY MEALS</small><h2>食事記録</h2></div><label>日付<input type="date" max={isoToday()} value={eatenOn} onChange={e=>{ setEatenOn(e.target.value); setOpenMealType(null); reset(true) }} /></label></div>
    <div className="meal-day-total"><span>{formatShortDate(eatenOn)} 合計</span><strong>{Math.round(dayTotal).toLocaleString()} kcal</strong></div>
    {templates.length > 0 && <section className="meal-template-strip"><div><small>MY TEMPLATES</small><strong>1タップ食事登録</strong></div><div className="meal-template-scroll">{templates.map((template) => <article key={template.id}><button className="template-use" onClick={() => useTemplate(template)}><span>{mealTypeLabels[template.mealType]}</span><strong>{template.name}</strong><small>{Math.round(template.calories)} kcal</small></button><button className="template-delete" onClick={() => removeTemplate(template.id)} aria-label={`${template.name}テンプレートを削除`}><X size={13}/></button></article>)}</div></section>}
    <div className="meal-type-grid">{types.map((type) => {
      const items = visibleMeals.filter((meal) => (meal.mealType || 'snack') === type)
      const total = items.reduce((sum, meal) => sum + meal.calories, 0)
      const isOpen = openMealType === type
      return <section className={`meal-type-card ${isOpen ? 'open' : ''}`} key={type}>
        <div className="meal-type-card-head">
          <button type="button" className="meal-type-toggle" onClick={() => setOpenMealType(isOpen ? null : type)} aria-expanded={isOpen}>
            <span><small>{mealTypeLabels[type]}</small><strong>{Math.round(total).toLocaleString()} kcal</strong></span>
            <span className="meal-type-count">{items.length}件</span>
            {isOpen ? <ChevronUp size={18}/> : <ChevronDown size={18}/>} 
          </button>
          <button type="button" className="meal-add-quick" onClick={() => focusForm(type)} aria-label={`${mealTypeLabels[type]}を追加`}><Plus size={18}/></button>
        </div>
        {isOpen && <div className="meal-type-body">{items.length === 0 ? <p>まだ記録がありません</p> : <div className="meal-card-items">{items.map((meal) => <div key={meal.id}><span><b>{meal.name}</b><small>P {meal.protein.toFixed(1)} / F {meal.fat.toFixed(1)} / C {meal.carbs.toFixed(1)} g</small></span><strong>{Math.round(meal.calories)} kcal</strong><div><button onClick={()=>editMeal(meal)} aria-label="編集"><Pencil size={16}/></button><button onClick={()=>removeMeal(meal.id)} aria-label="削除"><Trash2 size={16}/></button></div></div>)}</div>}</div>}
      </section>
    })}</div>
    {formOpen && <form className="meal-form redesigned-meal-form" id="meal-form-fields" onSubmit={saveMeal}>
      <label>区分<select value={mealType} onChange={e=>setMealType(e.target.value as MealType)}><option value="breakfast">朝食</option><option value="lunch">昼食</option><option value="dinner">夕食</option><option value="snack">間食</option></select></label>
      <label className="meal-name">食事名<div className="metric-input"><Utensils size={18}/><input value={name} onChange={e=>setName(e.target.value)} placeholder="例：鶏むね定食" maxLength={80} required/></div></label>
      <label>kcal<div className="metric-input"><Flame size={18}/><input type="number" inputMode="numeric" min="0" max="10000" value={calories} onChange={e=>setCalories(e.target.value)} required/></div></label>
      <label>P<div className="metric-input macro-input"><input type="number" inputMode="decimal" min="0" step="0.1" value={protein} onChange={e=>setProtein(e.target.value)} placeholder="0"/><span>g</span></div></label>
      <label>F<div className="metric-input macro-input"><input type="number" inputMode="decimal" min="0" step="0.1" value={fat} onChange={e=>setFat(e.target.value)} placeholder="0"/><span>g</span></div></label>
      <label>C<div className="metric-input macro-input"><input type="number" inputMode="decimal" min="0" step="0.1" value={carbs} onChange={e=>setCarbs(e.target.value)} placeholder="0"/><span>g</span></div></label>
      {!editingId && <button type="button" className="secondary-button meal-template-save" onClick={saveTemplate}><Save size={16}/>この内容をテンプレ保存</button>}
      <button className="add-button meal-add" disabled={saving}><Plus size={18}/>{saving?'保存中…':editingId?'変更を保存':'食事を記録'}</button>
      <button type="button" className="secondary-button meal-cancel" onClick={()=>reset(true)}>{editingId ? '編集をキャンセル' : '閉じる'}</button>
    </form>}
    {message && <p className="record-message" role="status">{message}</p>}
  </div>
}

function HealthPanel({ exercises, onExerciseAdded, onExerciseRemoved }: { exercises: ExerciseEntry[]; onExerciseAdded: (exercise: ExerciseEntry) => void; onExerciseRemoved: (id: number) => void }) {
  const [exercisedOn, setExercisedOn] = useState(isoToday())
  const [name, setName] = useState('MMA / トレーニング')
  const [calories, setCalories] = useState('')
  const [message, setMessage] = useState('')
  async function add(event: React.FormEvent) { event.preventDefault(); try { const result=await api<{exercise:ExerciseEntry}>('/exercises',{method:'POST',body:JSON.stringify({exercisedOn,name,calories:Number(calories)})}); onExerciseAdded(result.exercise); setCalories(''); setMessage('運動消費カロリーを追加しました。') } catch(caught){ setMessage(caught instanceof Error?caught.message:'保存できませんでした。') } }
  async function remove(id:number){ if(!window.confirm('この運動記録を削除しますか？'))return; await api(`/exercises/${id}`,{method:'DELETE'}); onExerciseRemoved(id) }
  const visible=exercises.filter(x=>x.exercisedOn===exercisedOn); const total=visible.reduce((s,x)=>s+x.calories,0)
  return <div className="panel health-panel" id="health-exercise"><PanelHeading number="09" title="Apple Health・運動消費" subtitle="Web版は手入力。将来HealthKit接続を想定" />
    <div className="health-status"><HeartPulse size={25}/><div><strong>現在Web版ではApple Health直接連携に未対応</strong><p>歩数・アクティブエネルギー・運動消費カロリーを同期したように見せる偽機能は使用していません。iPhoneアプリ化時にHealthKitへ接続できるデータ構造にしています。</p></div></div>
    <div className="health-metrics"><div><Footprints size={18}/><small>歩数</small><b>—</b><span>HealthKit接続後</span></div><div><Activity size={18}/><small>アクティブエネルギー</small><b>—</b><span>HealthKit接続後</span></div><div><Flame size={18}/><small>手入力の運動消費</small><b>{Math.round(total).toLocaleString()} kcal</b><span>{formatShortDate(exercisedOn)}</span></div></div>
    <form className="exercise-form" onSubmit={add}><label>日付<div className="metric-input"><CalendarDays size={18}/><input type="date" max={isoToday()} value={exercisedOn} onChange={e=>setExercisedOn(e.target.value)} required/></div></label><label>運動名<div className="metric-input"><Activity size={18}/><input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required/></div></label><label>消費kcal<div className="metric-input"><Flame size={18}/><input type="number" inputMode="numeric" min="1" max="10000" value={calories} onChange={e=>setCalories(e.target.value)} required/></div></label><button className="add-button"><Plus size={18}/>運動を追加</button></form>
    {message&&<p className="record-message">{message}</p>}<div className="exercise-list">{visible.map(x=><div className="exercise-row" key={x.id}><div><strong>{x.name}</strong><small>手入力</small></div><b>{Math.round(x.calories).toLocaleString()} kcal</b><button onClick={()=>remove(x.id)} aria-label="削除"><Trash2 size={17}/></button></div>)}</div>
  </div>
}

function PhotoEstimatePanel() {
  const [preview, setPreview] = useState('')
  function choose(event: React.ChangeEvent<HTMLInputElement>) { const file=event.target.files?.[0]; if(!file)return; if(preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file)) }
  useEffect(()=>()=>{ if(preview) URL.revokeObjectURL(preview) },[preview])
  return <div className="panel photo-panel"><PanelHeading number="10" title="食事写真からカロリー推定" subtitle="画像AI接続用の画面を先行実装" />
    <div className="photo-layout"><div className="photo-picker">{preview?<img src={preview} alt="選択した食事"/>:<Camera size={42}/>}<label className="photo-button"><Camera size={18}/>食事を撮影 / 写真を選択<input type="file" accept="image/*" capture="environment" onChange={choose}/></label></div><div className="ai-result"><span className="coming-badge">AI解析機能は準備中</span><h3>解析結果</h3><dl><div><dt>料理名</dt><dd>—</dd></div><div><dt>推定量</dt><dd>—</dd></div><div><dt>推定カロリー</dt><dd>—</dd></div></dl><p>現在のWeb環境では画像解析APIを接続していないため、偽の料理名やカロリーは表示しません。将来、解析結果をユーザーが修正してから食事記録へ登録できる構造にします。</p><small>※ 画像からのカロリーは推定値です。</small></div></div>
  </div>
}

function RecordPanel({ records, onRecordSaved, onRecordRemoved, suggestedWeight }: { records: RecordEntry[]; onRecordSaved: (record: RecordEntry) => void; onRecordRemoved: (id: number) => void; suggestedWeight: number }) {
  const [weight, setWeight] = useState(String(suggestedWeight))
  const [recordedOn, setRecordedOn] = useState(isoToday())
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)

  useEffect(() => setWeight(String(suggestedWeight)), [suggestedWeight])

  function editRecord(record: RecordEntry) {
    setWeight(String(record.weight)); setRecordedOn(record.recordedOn); setNote(record.note || '')
    document.getElementById('daily-record')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function addRecord(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      const result = await api<{ record: RecordEntry }>('/records', { method: 'POST', body: JSON.stringify({ weight: Number(weight), recordedOn, note }) })
      onRecordSaved(result.record)
      setNote('')
      setMessage(records.some((record) => record.recordedOn === recordedOn) ? 'この日の記録を更新しました。' : '体重を記録しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '記録できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  async function removeRecord(id: number) {
    if (!window.confirm('この体重記録を削除しますか？')) return
    try {
      await api(`/records/${id}`, { method: 'DELETE' })
      onRecordRemoved(id)
      setMessage('記録を削除しました。')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '削除できませんでした。')
    }
  }

  return (
    <div className="panel record-panel redesigned-record-panel" id="daily-record">
      <div className="section-title record-title"><div><small>DAILY RECORD</small><h2>今日の体重を記録</h2></div></div>
      <form className="record-form" onSubmit={addRecord}>
        <label>体重<div className="metric-input"><Weight size={18} /><input aria-label="記録する体重" type="number" inputMode="decimal" min="30" max="300" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} required /><span>kg</span></div></label>
        <label>日付<div className="metric-input"><CalendarDays size={18} /><input aria-label="記録日" type="date" max={isoToday()} value={recordedOn} onChange={(event) => setRecordedOn(event.target.value)} required /></div></label>
        <label className="note-field">メモ（任意）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例：朝・起床後、体調良好" maxLength={120} /></label>
        <button className="add-button" disabled={saving}><Plus size={18} />{saving ? '保存中…' : records.some((record) => record.recordedOn === recordedOn) ? 'この日を更新' : '記録する'}</button>
      </form>
      {message && <p className="record-message" role="status">{message}</p>}
      <button className="history-toggle" onClick={() => setHistoryOpen((open) => !open)}><span>体重履歴 <b>{records.length}件</b></span>{historyOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</button>
      {historyOpen && <div className="record-list">
        {records.length === 0 ? <div className="empty-record"><TrendingDown size={28} /><p>最初の体重を記録すると、ここに推移が表示されます。</p></div> : records.map((record, index) => {
          const previous = records[index + 1]
          const delta = previous ? record.weight - previous.weight : 0
          return <div className="record-row" key={record.id}><time>{formatShortDate(record.recordedOn)}</time><div><b>{record.weight.toFixed(1)} kg</b>{record.note && <small>{record.note}</small>}</div><span className={delta <= 0 ? 'down' : 'up'}>{previous ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'}</span><div className="record-actions"><button onClick={() => editRecord(record)} aria-label={`${formatShortDate(record.recordedOn)}の記録を編集`}><Pencil size={16}/></button><button onClick={() => removeRecord(record.id)} aria-label={`${formatShortDate(record.recordedOn)}の記録を削除`}><Trash2 size={16}/></button></div></div>
        })}
      </div>}
    </div>
  )
}

function FeedbackPanel() {
  const [category, setCategory] = useState('使いやすさ')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setNotice('')
    setSending(true)
    try {
      const result = await api<{ message: string }>('/feedback', { method: 'POST', body: JSON.stringify({ category, message }) })
      setMessage('')
      setNotice(result.message)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '送信できませんでした。')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="panel feedback-panel">
      <PanelHeading number="08" title="ご意見・ご要望" subtitle="テスト版の改善に活用します" />
      <form onSubmit={submit}>
        <label>種類<select value={category} onChange={(event) => setCategory(event.target.value)}><option>使いやすさ</option><option>機能の要望</option><option>不具合</option><option>その他</option></select></label>
        <label>内容<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="使いにくかった点や、欲しい機能を教えてください。" minLength={3} maxLength={1000} required /></label>
        <button className="feedback-button" disabled={sending}><MessageSquareText size={18} />{sending ? '送信中…' : '意見を送信'}</button>
      </form>
      {notice && <p className="feedback-notice" role="status">{notice}</p>}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(dateAtNoon(value))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit' }).format(dateAtNoon(value))
}

function formatChartDate(value: Date) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(value)
}
