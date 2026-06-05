import { useMemo, useState } from 'react'
import { Check, Clipboard } from 'lucide-react'

interface SceneMaxCodeBlockProps {
  caption: string
  code: string
}

const keywordPattern =
  /\b(when|When|do|end|if|else|var|shared|run|async|Async|wait|in|for|seconds|second|loop|while|return|once|pressed|released|is|at|speed|protected|then|empty|true|false|and|or|from|to|on|with)\b/g

const builtinPattern =
  /\b(Camera|camera|UI|audio|effects|Lights|Screen|Canvas|skybox|Object|Pool|Minimap|minimap|debug|sys|header|TextEffect)\b/g

function tokenize(line: string) {
  if (line.trim().startsWith('//')) {
    return [{ className: 'text-slate-500 italic', value: line }]
  }

  const parts = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*|\b\d+(?:\.\d+)?\b|=>|==|!=|<=|>=|&&|\|\||[()[\]{}.,:+\-*/=])/g)

  return parts.filter(Boolean).map((part) => {
    if (part.startsWith('//')) return { className: 'text-slate-500 italic', value: part }
    if (/^["']/.test(part)) return { className: 'text-emerald-200', value: part }
    if (/^\d/.test(part)) return { className: 'text-fuchsia-200', value: part }
    if (/^(=>|==|!=|<=|>=|&&|\|\||[()[\]{}.,:+\-*/=])$/.test(part)) {
      return { className: 'text-cyan-200', value: part }
    }
    if (builtinPattern.test(part)) {
      builtinPattern.lastIndex = 0
      return { className: 'text-sky-200 font-semibold', value: part }
    }
    builtinPattern.lastIndex = 0
    if (keywordPattern.test(part)) {
      keywordPattern.lastIndex = 0
      return { className: 'text-violet-200 font-semibold', value: part }
    }
    keywordPattern.lastIndex = 0
    return { className: 'text-slate-200', value: part }
  })
}

export function SceneMaxCodeBlock({ caption, code }: SceneMaxCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const lines = useMemo(() => code.split('\n'), [code])
  const CopyIcon = copied ? Check : Clipboard

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-cyan-300/20 bg-[#050b14] shadow-2xl shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/90 px-4 py-3">
        <div>
          <h2 className="text-lg font-black text-white">SceneMax3D sample code</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{caption}</p>
        </div>
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          onClick={copyCode}
          title={copied ? 'Copied' : 'Copy code'}
          type="button"
        >
          <CopyIcon aria-hidden="true" size={18} />
          <span className="sr-only">{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <pre className="min-w-full p-0 text-[13px] leading-6 md:text-sm">
          <code className="block py-4">
            {lines.map((line, index) => (
              <span className="grid grid-cols-[3rem_1fr] px-4" key={`${line}-${index}`}>
                <span className="select-none pr-4 text-right text-slate-600">{index + 1}</span>
                <span className="whitespace-pre">
                  {tokenize(line).map((token, tokenIndex) => (
                    <span className={token.className} key={`${token.value}-${tokenIndex}`}>
                      {token.value}
                    </span>
                  ))}
                  {'\n'}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </section>
  )
}
