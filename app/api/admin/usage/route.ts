import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'

// Cost per 1M tokens (USD) — OpenRouter free models are $0, kept for future paid models
const MODEL_COST: Record<string, { input: number; output: number }> = {
  'google/gemma-4-31b-it:free':              { input: 0, output: 0 },
  'nvidia/nemotron-3-super-120b-a12b:free':  { input: 0, output: 0 },
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_COST[model] ?? { input: 0, output: 0 }
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output
}

/**
 * GET /api/admin/usage
 * Returns daily token aggregates and estimated cost per model for the last 30 days.
 * Protected: requires valid session cookie (single-user — if you're logged in, you're the admin).
 */
export async function GET() {
  const guard = requireSupabase()
  if (guard) return guard

  const { data, error } = await supabase
    .from('llm_usage_log')
    .select('timestamp, model, input_tokens, output_tokens')
    .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('[/api/admin/usage] Supabase error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 })
  }

  // Aggregate by day + model
  const byDayModel: Record<string, Record<string, { input: number; output: number }>> = {}

  for (const row of data ?? []) {
    const day = row.timestamp.slice(0, 10) // YYYY-MM-DD
    const model = row.model
    if (!byDayModel[day]) byDayModel[day] = {}
    if (!byDayModel[day][model]) byDayModel[day][model] = { input: 0, output: 0 }
    byDayModel[day][model].input += row.input_tokens ?? 0
    byDayModel[day][model].output += row.output_tokens ?? 0
  }

  // Shape for the UI: array of { date, models: [{model, input, output, cost}], totalCost }
  const days = Object.entries(byDayModel).map(([date, models]) => {
    const modelBreakdown = Object.entries(models).map(([model, tokens]) => ({
      model,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      estimated_cost_usd: estimateCost(model, tokens.input, tokens.output),
    }))
    const totalCost = modelBreakdown.reduce((s, m) => s + m.estimated_cost_usd, 0)
    return { date, models: modelBreakdown, total_cost_usd: totalCost }
  })

  const grandTotal = days.reduce((s, d) => s + d.total_cost_usd, 0)

  return NextResponse.json({ days, grand_total_usd: grandTotal }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
