import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface ModelBreakdown {
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
}

interface Day {
  date: string
  models: ModelBreakdown[]
  total_cost_usd: number
}

interface UsageResponse {
  days: Day[]
  grand_total_usd: number
}

async function getUsage(): Promise<UsageResponse> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${base}/api/admin/usage`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Usage API error: ${res.status}`)
  return res.json()
}

function fmt(n: number, digits = 2) {
  return n.toFixed(digits)
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${fmt(n / 1_000_000, 1)}M`
  if (n >= 1_000) return `${fmt(n / 1_000, 1)}K`
  return String(n)
}

export default async function AdminUsagePage() {
  const data = await getUsage()

  // Compute the max daily cost for Progress bar scaling
  const maxDayCost = Math.max(...data.days.map((d) => d.total_cost_usd), 0.001)

  const allModels = Array.from(
    new Set(data.days.flatMap((d) => d.models.map((m) => m.model)))
  )

  // Aggregate per-model over 30 days
  const modelTotals: Record<string, { input: number; output: number; cost: number }> = {}
  for (const day of data.days) {
    for (const m of day.models) {
      if (!modelTotals[m.model]) modelTotals[m.model] = { input: 0, output: 0, cost: 0 }
      modelTotals[m.model].input += m.input_tokens
      modelTotals[m.model].output += m.output_tokens
      modelTotals[m.model].cost += m.estimated_cost_usd
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">LLM Cost Monitor</h1>
            <p className="text-zinc-400 text-sm mt-1">Rolling 30-day window</p>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 text-center px-6 py-3">
            <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">30-day total</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">
              ${fmt(data.grand_total_usd, 4)}
            </p>
          </Card>
        </div>

        {/* Per-model totals */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">
            Model Summary
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(modelTotals).map(([model, totals]) => (
              <Card key={model} className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-zinc-300">{model}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span>Input</span>
                    <span className="font-mono text-zinc-200">{fmtTokens(totals.input)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Output</span>
                    <span className="font-mono text-zinc-200">{fmtTokens(totals.output)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-zinc-800">
                    <span>Cost</span>
                    <span className="font-mono text-emerald-400">${fmt(totals.cost, 4)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Daily breakdown */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">
            Daily Breakdown
          </h2>
          {data.days.length === 0 ? (
            <p className="text-zinc-500 text-sm">No usage data in the last 30 days.</p>
          ) : (
            <div className="space-y-3">
              {[...data.days].reverse().map((day) => (
                <Card key={day.date} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-3 space-y-3">
                    {/* Date row */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-zinc-300">{day.date}</span>
                      <span className="font-mono text-xs text-emerald-400">
                        ${fmt(day.total_cost_usd, 4)}
                      </span>
                    </div>
                    {/* Cost bar */}
                    <Progress
                      value={(day.total_cost_usd / maxDayCost) * 100}
                      className="h-1.5 bg-zinc-800"
                    />
                    {/* Per-model breakdown */}
                    <div className="flex flex-wrap gap-2">
                      {allModels.map((model) => {
                        const m = day.models.find((x) => x.model === model)
                        if (!m) return null
                        return (
                          <Badge
                            key={model}
                            variant="outline"
                            className="font-mono text-xs border-zinc-700 text-zinc-400 gap-1"
                          >
                            <span className="text-zinc-500">{model.split('-')[1]}</span>
                            {fmtTokens(m.input_tokens + m.output_tokens)} tok
                          </Badge>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
