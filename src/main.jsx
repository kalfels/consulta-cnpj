import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describeTaxRegime, formatCnpjInput, isValidCnpj, normalizeCnpj, normalizeDigits, parseTaxRegimeFlag } from './cnpj.js'
import './index.css'

const API_BASE = 'https://publica.cnpj.ws/cnpj'

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6.6"/><path d="m16 16 4 4"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
    phone: <><path d="M6.7 3.5 9 3l2 4-2 1.8a14 14 0 0 0 5.2 5.2L16 12l4 2-.5 2.3A3 3 0 0 1 16.6 19C9.1 18.1 4 12.9 3 5.4a3 3 0 0 1 3.7-1.9Z"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17.2v.2"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    chevron: <path d="m7 9 5 5 5-5"/>,
    database: <><ellipse cx="12" cy="5" rx="7.5" ry="3"/><path d="M4.5 5v7c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5"/><path d="M4.5 12v7c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-7"/></>,
    file: <><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 13h5M10 17h5"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.file}
    </svg>
  )
}

function humanizeKey(key) {
  const aliases = {
    cnpj_raiz: 'CNPJ raiz',
    razao_social: 'Razão social',
    nome_fantasia: 'Nome fantasia',
    atualizado_em: 'Atualizado em',
    capital_social: 'Capital social',
    situacao_cadastral: 'Situação cadastral',
    data_situacao_cadastral: 'Data da situação cadastral',
    data_inicio_atividade: 'Início da atividade',
    atividade_principal: 'Atividade principal',
    atividades_secundarias: 'Atividades secundárias',
    inscricoes_estaduais: 'Inscrições estaduais',
    natureza_juridica: 'Natureza jurídica',
    qualificacao_do_responsavel: 'Qualificação do responsável',
    cpf_cnpj_socio: 'CPF/CNPJ do sócio',
    data_entrada: 'Data de entrada',
    cpf_representante_legal: 'CPF representante legal',
    nome_representante: 'Nome do representante',
    faixa_etaria: 'Faixa etária',
    simples: 'Optante pelo Simples Nacional',
    mei: 'Enquadramento como MEI',
    data_opcao_simples: 'Data de opção pelo Simples Nacional',
    data_exclusao_simples: 'Data de exclusão do Simples Nacional',
    data_opcao_mei: 'Data de opção pelo MEI',
    data_exclusao_mei: 'Data de exclusão do MEI',
  }
  if (aliases[key]) return aliases[key]
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

function formatDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const hasTime = /T\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat('pt-BR', hasTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' }
  ).format(d)
}

function formatCurrency(value) {
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric)
}

function formatTelephone(ddd, phone) {
  if (!phone) return ''
  const p = normalizeDigits(phone)
  if (p.length === 9) return `(${ddd || ''}) ${p.slice(0, 5)}-${p.slice(5)}`.replace('( ) ', '')
  if (p.length === 8) return `(${ddd || ''}) ${p.slice(0, 4)}-${p.slice(4)}`.replace('( ) ', '')
  return ddd ? `(${ddd}) ${phone}` : String(phone)
}

function looksLikeDate(key, value) {
  if (typeof value !== 'string') return false
  if (/data|date|atualizado|timestamp/i.test(key)) return /^\d{4}-\d{2}-\d{2}/.test(value)
  return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)
}

function formatPrimitive(value, key = '') {
  if (key === 'simples') {
    const flag = parseTaxRegimeFlag(value)
    return flag === null ? 'Não informado pela API' : flag ? 'SIM' : 'NÃO'
  }
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number' && /capital_social/i.test(key)) return formatCurrency(value)
  if (typeof value === 'string' && /capital_social/i.test(key)) return formatCurrency(value.replace(',', '.'))
  if (typeof value === 'string' && /cep/i.test(key)) {
    const d = normalizeDigits(value)
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : value
  }
  if (typeof value === 'string' && /cnpj/i.test(key)) {
    const d = normalizeCnpj(value)
    return d.length === 14 ? formatCnpjInput(d) : value
  }
  if (typeof value === 'string' && looksLikeDate(key, value)) return formatDate(value)
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value)
  return String(value)
}

function countFilled(value) {
  if (value === null || value === undefined || value === '') return 0
  if (Array.isArray(value)) return value.reduce((acc, item) => acc + countFilled(item), 0)
  if (typeof value === 'object') return Object.values(value).reduce((acc, item) => acc + countFilled(item), 0)
  return 1
}

function summarize(data) {
  const est = data?.estabelecimento || {}
  const principal = est?.atividade_principal || {}
  return {
    razaoSocial: data?.razao_social || 'Não informado',
    fantasia: est?.nome_fantasia || 'Sem nome fantasia',
    cnpj: est?.cnpj || data?.cnpj || data?.cnpj_raiz || '',
    situacao: est?.situacao_cadastral || 'Não informada',
    endereco: [est?.tipo_logradouro, est?.logradouro, est?.numero, est?.complemento].filter(Boolean).join(' '),
    bairro: est?.bairro || '',
    cidade: est?.cidade?.nome || '',
    uf: est?.estado?.sigla || '',
    cep: est?.cep || '',
    cnae: principal?.id || principal?.codigo || '',
    cnaeDescricao: principal?.descricao || '',
    telefone: formatTelephone(est?.ddd1, est?.telefone1),
    email: est?.email || '',
    inscricoes: Array.isArray(est?.inscricoes_estaduais) ? est.inscricoes_estaduais : [],
  }
}

function StatusPill({ value }) {
  const active = /ativa|ativo/i.test(String(value || ''))
  const tone = active ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20' : 'bg-amber-400/10 text-amber-300 ring-amber-400/20'
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value || 'Não informada'}</span>
}

function EmptyState() {
  return (
    <div className="glass flex min-h-[360px] items-center justify-center rounded-3xl p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
          <Icon name="database" size={28} />
        </div>
        <h2 className="text-xl font-semibold text-white">Pronto para consultar</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Digite um CNPJ válido. O painel vai apresentar um resumo executivo e, abaixo, todo o JSON retornado pela API em uma estrutura navegável.</p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-5 fade-up">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1,2,3,4].map((i) => <div key={i} className="glass rounded-2xl p-5"><div className="shimmer h-3 w-24 rounded"/><div className="shimmer mt-4 h-7 w-40 rounded"/></div>)}
      </div>
      <div className="glass rounded-3xl p-6"><div className="shimmer h-7 w-72 rounded"/><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="shimmer h-20 rounded-2xl"/><div className="shimmer h-20 rounded-2xl"/><div className="shimmer h-20 rounded-2xl"/><div className="shimmer h-20 rounded-2xl"/></div></div>
    </div>
  )
}

function SummaryCard({ icon, label, value, secondary, className = '' }) {
  return <div className={`glass rounded-2xl p-5 ${className}`}>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value || '—'}</p>{secondary && <p className="mt-1 text-xs text-slate-400">{secondary}</p>}</div>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10"><Icon name={icon} /></div>
    </div>
  </div>
}

function JsonTree({ value, label, path = '', depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)

  if (value === null || value === undefined || value === '') {
    return <div className="flex items-center justify-between gap-4 rounded-xl border soft-border bg-white/[0.025] px-4 py-3"><span className="min-w-0 truncate text-sm text-slate-300">{humanizeKey(label)}</span><span className="text-sm text-slate-500">{formatPrimitive(value, label)}</span></div>
  }

  if (Array.isArray(value)) {
    const title = humanizeKey(label)
    return (
      <div className="overflow-hidden rounded-2xl border soft-border bg-white/[0.018]">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.035]">
          <div className="flex min-w-0 items-center gap-3"><span className="text-xs text-blue-300">{open ? '−' : '+'}</span><span className="truncate text-sm font-semibold text-slate-200">{title}</span><span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">{value.length} {value.length === 1 ? 'item' : 'itens'}</span></div>
          <Icon name="chevron" size={16} />
        </button>
        {open && <div className="space-y-3 border-t soft-border p-3 md:p-4">{value.length ? value.map((item, index) => <JsonTree key={`${path}.${index}`} value={item} label={`Item ${index + 1}`} path={`${path}.${index}`} depth={depth + 1} />) : <p className="px-2 py-1 text-sm text-slate-500">Lista vazia.</p>}</div>}
      </div>
    )
  }

  if (typeof value === 'object') {
    const title = label === 'simples' ? 'Regime Tributário' : humanizeKey(label)
    const regime = label === 'simples' ? describeTaxRegime(value) : null
    return (
      <div className="overflow-hidden rounded-2xl border soft-border bg-white/[0.018]">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.035]">
          <div className="flex min-w-0 items-center gap-3"><span className="text-xs text-blue-300">{open ? '−' : '+'}</span><span className="truncate text-sm font-semibold text-slate-200">{title}</span></div>
          <Icon name="chevron" size={16} />
        </button>
        {open && <div className="grid gap-3 border-t soft-border p-3 md:grid-cols-2 md:p-4">
          {regime && <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-3 md:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200/70">Enquadramento identificado</p><p className="mt-1 text-sm font-semibold text-white">{regime.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{regime.detail}</p></div>}
          {Object.entries(value).map(([key, val]) => {
          const primitive = val === null || val === undefined || typeof val !== 'object'
          if (primitive) return <div key={key} className="rounded-xl border soft-border bg-white/[0.025] px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{humanizeKey(key)}</p><p className="mt-1 break-words text-sm text-slate-200">{formatPrimitive(val, key)}</p></div>
          return <div key={key} className="md:col-span-2"><JsonTree value={val} label={key} path={`${path}.${key}`} depth={depth + 1} /></div>
        })}</div>}
      </div>
    )
  }

  return <div className="flex items-center justify-between gap-4 rounded-xl border soft-border bg-white/[0.025] px-4 py-3"><span className="min-w-0 truncate text-sm text-slate-300">{humanizeKey(label)}</span><span className="max-w-[60%] break-words text-right text-sm text-slate-200">{formatPrimitive(value, label)}</span></div>
}

function RawJsonModal({ data, onClose }) {
  const [copied, setCopied] = useState(false)
  const raw = useMemo(() => JSON.stringify(data, null, 2), [data])

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = raw
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-4 border-b soft-border px-5 py-4 md:px-6">
          <div><p className="text-sm font-semibold text-white">JSON bruto</p><p className="text-xs text-slate-500">Resposta original retornada pela API</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl border soft-border bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar JSON'}</button><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Fechar"><Icon name="x" size={18} /></button></div>
        </div>
        <pre className="scrollbar-thin overflow-auto p-5 text-xs leading-6 text-slate-300 md:p-6">{raw}</pre>
      </div>
    </div>
  )
}

function ErrorBox({ message, onClose }) {
  return <div className="fade-up rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-100"><div className="flex gap-3"><div className="mt-0.5 text-rose-300"><Icon name="alert" size={19} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Não foi possível consultar o CNPJ</p><p className="mt-1 text-sm leading-6 text-rose-100/70">{message}</p></div><button type="button" onClick={onClose} aria-label="Fechar erro" className="text-rose-200/70 hover:text-white"><Icon name="x" size={18} /></button></div></div>
}

function App() {
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const requestInFlight = useRef(false)

  const filledCount = useMemo(() => countFilled(data), [data])
  const summary = useMemo(() => summarize(data || {}), [data])
  const taxData = data?.simples
  const taxRegime = describeTaxRegime(taxData)

  async function handleSubmit(event) {
    event?.preventDefault()
    if (requestInFlight.current) return

    const digits = normalizeCnpj(cnpj)
    setError('')
    setData(null)
    setCopied(false)

    if (digits.length !== 14) {
      setError('Informe um CNPJ completo com 14 caracteres.')
      return
    }
    if (!isValidCnpj(digits)) {
      setError('O CNPJ informado não passou na validação dos dígitos verificadores.')
      return
    }

    requestInFlight.current = true
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/${digits}`, { headers: { Accept: 'application/json' } })
      let payload = null
      try { payload = await response.json() } catch { payload = null }

      if (!response.ok) {
        const apiMessage = [payload?.titulo, payload?.detalhes].filter(Boolean).join(': ')
        if (response.status === 404) throw new Error(apiMessage || 'CNPJ não encontrado na base pública do CNPJ.ws.')
        if (response.status === 429) throw new Error(apiMessage || 'Limite de consultas atingido. Aguarde antes de tentar novamente.')
        throw new Error(apiMessage || payload?.message || `A API retornou HTTP ${response.status}.`)
      }
      setData(payload)
    } catch (err) {
      setError(err?.message || 'Falha de comunicação com a API. Verifique sua conexão e tente novamente.')
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  async function copyJson() {
    if (!data) return
    const raw = JSON.stringify(data, null, 2)
    try { await navigator.clipboard.writeText(raw) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = raw; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="app-shell">
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border soft-border bg-white/[0.035] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> CNPJ.ws • API pública</div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">Consulta CNPJ</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">Consulta cadastral com visão executiva, informações de contato e exploração completa da resposta JSON.</p>
          </div>
          {data && <div className="glass rounded-2xl px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-300"><Icon name="database" size={18} /></div><div><p className="text-xs text-slate-500">Campos preenchidos</p><p className="text-lg font-semibold text-white">{filledCount}</p></div></div></div>}
        </header>

        <form onSubmit={handleSubmit} className="glass mb-6 rounded-3xl p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <label htmlFor="cnpj" className="sr-only">CNPJ</label>
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="building" size={19} /></span>
              <input id="cnpj" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={loading} value={cnpj} onChange={(e) => setCnpj(formatCnpjInput(e.target.value))} placeholder="Digite o CNPJ — ex.: 12.ABC.345/01DE-35" className="h-14 w-full rounded-2xl border soft-border bg-slate-950/40 pl-12 pr-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50 focus:ring-4 focus:ring-blue-400/10 disabled:cursor-wait disabled:opacity-60" />
            </div>
            <button disabled={loading} type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 text-sm font-bold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"><Icon name="search" size={18} />{loading ? 'Consultando…' : 'Consultar'}</button>
          </div>
          <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>O envio para a API é feito sem pontuação.</span><span>API pública: até 3 consultas/minuto.</span></div>
        </form>

        {error && <div className="mb-6"><ErrorBox message={error} onClose={() => setError('')} /></div>}

        {loading && <LoadingState />}

        {!loading && !data && !error && <EmptyState />}

        {!loading && data && (
          <div className="space-y-6 fade-up">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon="building" label="Razão social" value={summary.razaoSocial} className="md:col-span-2 xl:col-span-2" />
              <SummaryCard icon="activity" label="Situação" value={<StatusPill value={summary.situacao} />} />
              <SummaryCard icon="database" label="Capital social" value={formatCurrency(data?.capital_social)} />
            </section>

            <section className="glass rounded-3xl p-5 md:p-6">
              <div className="flex flex-col gap-4 border-b soft-border pb-5 md:flex-row md:items-start md:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300/80">Resumo da empresa</p><h2 className="mt-1 text-2xl font-bold text-white">{summary.fantasia}</h2><p className="mt-1 font-mono text-sm text-slate-400">{summary.cnpj ? formatCnpjInput(summary.cnpj) : 'CNPJ não informado'}</p></div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowRaw(true)} className="inline-flex items-center gap-2 rounded-xl border soft-border bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"><Icon name="code" size={15} />Ver JSON bruto</button><button type="button" onClick={copyJson} className="inline-flex items-center gap-2 rounded-xl border soft-border bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar JSON'}</button></div>
              </div>

              <div className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border soft-border bg-white/[0.025] p-4 xl:col-span-2"><div className="mb-2 flex items-center gap-2 text-slate-500"><Icon name="map" size={16} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Endereço</span></div><p className="text-sm font-medium leading-6 text-slate-200">{summary.endereco || 'Não informado'}</p><p className="text-xs text-slate-400">{summary.bairro}{summary.bairro && (summary.cidade || summary.uf) ? ' • ' : ''}{summary.cidade}{summary.uf ? `/${summary.uf}` : ''}{summary.cep ? ` • ${formatPrimitive(summary.cep, 'cep')}` : ''}</p></div>
                <div className="rounded-2xl border soft-border bg-white/[0.025] p-4"><div className="mb-2 flex items-center gap-2 text-slate-500"><Icon name="activity" size={16} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">CNAE</span></div><p className="text-sm font-semibold text-white">{summary.cnae || 'Não informado'}</p><p className="mt-1 text-xs leading-5 text-slate-400">{summary.cnaeDescricao || 'Descrição não informada'}</p></div>
                <div className="rounded-2xl border soft-border bg-white/[0.025] p-4"><div className="mb-2 flex items-center gap-2 text-slate-500"><Icon name="phone" size={16} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Telefone</span></div><p className="text-sm font-medium text-slate-200">{summary.telefone || 'Não informado'}</p></div>
                <div className="rounded-2xl border soft-border bg-white/[0.025] p-4 xl:col-span-2"><div className="mb-2 flex items-center gap-2 text-slate-500"><Icon name="mail" size={16} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">E-mail</span></div><p className="break-all text-sm font-medium text-slate-200">{summary.email || 'Não informado'}</p></div>
              </div>

              <div className="mt-4 rounded-2xl border soft-border bg-white/[0.025] p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Inscrições estaduais</p><p className="mt-1 text-xs text-slate-400">{summary.inscricoes.length} registro(s) encontrado(s)</p></div></div>
                {summary.inscricoes.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{summary.inscricoes.map((insc, index) => <div key={`${insc.inscricao_estadual}-${index}`} className="rounded-xl border soft-border bg-slate-950/30 p-3"><div className="flex items-center justify-between gap-3"><p className="font-mono text-sm font-semibold text-white">{insc.inscricao_estadual || '—'}</p><StatusPill value={insc.ativo ? 'Ativa' : 'Inativa'} /></div><p className="mt-1 text-xs text-slate-400">{insc.estado?.nome || ''}{insc.estado?.sigla ? ` / ${insc.estado.sigla}` : ''}</p></div>)}</div> : <p className="text-sm text-slate-500">Nenhuma inscrição estadual informada.</p>}
              </div>

              <div className="mt-4 rounded-2xl border soft-border bg-white/[0.025] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Regime tributário</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border soft-border bg-slate-950/30 p-3"><p className="text-xs text-slate-500">Optante pelo Simples Nacional</p><p className="mt-1 text-sm font-semibold text-white">{taxRegime.simpleOptant === null ? 'Não informado pela API' : taxRegime.simpleOptant ? 'SIM' : 'NÃO'}</p></div>
                  <div className="rounded-xl border soft-border bg-slate-950/30 p-3"><p className="text-xs text-slate-500">Enquadramento</p><p className="mt-1 text-sm font-semibold text-white">{taxRegime.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{taxRegime.detail}</p></div>
                </div>
              </div>
            </section>

            <section className="glass rounded-3xl p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300/80">Explorador de dados</p><h2 className="mt-1 text-xl font-bold text-white">Todos os campos retornados</h2><p className="mt-1 text-sm text-slate-400">Objetos, arrays e listas de objetos são renderizados automaticamente.</p></div><div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">{Object.keys(data || {}).length} seções de topo</div></div>
              <div className="space-y-3">{Object.entries(data).map(([key, value]) => <JsonTree key={key} value={value} label={key} path={key} />)}</div>
            </section>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-slate-600">Dados consultados via CNPJ.ws • Interface React + Tailwind CSS</footer>
      </main>
      {showRaw && data && <RawJsonModal data={data} onClose={() => setShowRaw(false)} />}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
