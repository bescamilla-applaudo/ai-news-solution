/**
 * Server component: renders a syntax-highlighted code block using shiki.
 * Uses codeToHast + hast-util-to-jsx-runtime to avoid dangerouslySetInnerHTML.
 */
import { codeToHast } from 'shiki'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { Fragment, type JSX } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

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

  let content: JSX.Element
  try {
    const hast = await codeToHast(code, { lang, theme: 'github-dark' })
    content = toJsxRuntime(hast, {
      Fragment,
      jsx: jsx as Components extends never ? never : typeof jsx,
      jsxs: jsxs as Components extends never ? never : typeof jsxs,
    }) as JSX.Element
  } catch {
    // Fallback: plain pre block if shiki fails (unsupported language etc.)
    content = <pre className="shiki-fallback"><code>{code}</code></pre>
  }

  return (
    <div className="rounded-lg overflow-x-auto border border-zinc-800 text-xs [&>pre]:p-4 [&>pre]:bg-zinc-950! [&>pre]:m-0 [&>pre]:leading-relaxed">
      {content}
    </div>
  )
}
