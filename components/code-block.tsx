/**
 * Server component: renders a syntax-highlighted code block using shiki.
 * Safe to use with pipeline-generated code — shiki escapes all content internally.
 */
import { codeToHtml } from 'shiki'

function detectLanguage(code: string): string {
  const s = code.trim()
  if (/^[\[\{]/.test(s) && (s.includes('":') || s.includes("':"))) return 'json'
  if (/^\s*(import |from |def |class |pip install|python )/.test(s)) return 'python'
  if (/\bnpm (install|run|i )\b|\bpnpm \b|\byarn \b/.test(s)) return 'bash'
  if (/\bconst |let |=>|interface |type |\.tsx?['"]/.test(s)) return 'typescript'
  if (/\bfunction |var |document\.|console\./.test(s)) return 'javascript'
  if (/^(curl |wget |git |docker |kubectl |helm )/.test(s)) return 'bash'
  if (/^\s*SELECT |INSERT |CREATE |ALTER |DROP /i.test(s)) return 'sql'
  return 'bash'
}

interface CodeBlockProps {
  code: string
  language?: string
}

export async function CodeBlock({ code, language }: CodeBlockProps) {
  const lang = language ?? detectLanguage(code)

  let html: string
  try {
    html = await codeToHtml(code, {
      lang,
      theme: 'github-dark',
    })
  } catch {
    // Fallback: plain pre block if shiki fails (unsupported language etc.)
    html = `<pre class="shiki-fallback"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  }

  return (
    <div
      className="rounded-lg overflow-x-auto border border-zinc-800 text-xs [&>pre]:p-4 [&>pre]:bg-zinc-950! [&>pre]:m-0 [&>pre]:leading-relaxed"
      // shiki output is sanitized: escapes all code content, only adds its own spans
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
