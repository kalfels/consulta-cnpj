export function normalizeDigits(value = '') {
  return value.replace(/\D/g, '')
}

export function normalizeCnpj(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatCnpjInput(value = '') {
  const cnpj = normalizeCnpj(value).slice(0, 14)
  return cnpj
    .replace(/^([A-Z0-9]{2})([A-Z0-9])/, '$1.$2')
    .replace(/^([A-Z0-9]{2})\.([A-Z0-9]{3})([A-Z0-9])/, '$1.$2.$3')
    .replace(/^([A-Z0-9]{2})\.([A-Z0-9]{3})\.([A-Z0-9]{3})([A-Z0-9])/, '$1.$2.$3/$4')
    .replace(/^([A-Z0-9]{2})\.([A-Z0-9]{3})\.([A-Z0-9]{3})\/([A-Z0-9]{4})([A-Z0-9])/, '$1.$2.$3/$4-$5')
}

export function isValidCnpj(cnpj) {
  const normalizedCnpj = normalizeCnpj(cnpj)
  if (normalizedCnpj.length !== 14 || !/^[A-Z0-9]{12}\d{2}$/.test(normalizedCnpj) || /^(.)\1{13}$/.test(normalizedCnpj)) return false
  const calculateDigit = (base) => {
    let factor = base.length - 7
    let sum = 0
    for (const digit of base) {
      sum += (digit.charCodeAt(0) - 48) * factor
      factor = factor === 2 ? 9 : factor - 1
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }
  const first = calculateDigit(normalizedCnpj.slice(0, 12))
  const second = calculateDigit(normalizedCnpj.slice(0, 12) + first)
  return first === Number(normalizedCnpj[12]) && second === Number(normalizedCnpj[13])
}

export function parseTaxRegimeFlag(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['sim', 'true', '1'].includes(normalized)) return true
  if (['não', 'nao', 'false', '0'].includes(normalized)) return false
  return null
}

export function describeTaxRegime(value) {
  if (value === null || value === undefined) {
    return {
      simpleOptant: null,
      label: 'Não informado pela API',
      detail: 'A API Pública não retornou dados de Simples Nacional ou MEI para este CNPJ.',
    }
  }

  const simple = parseTaxRegimeFlag(value?.simples ?? value)
  const mei = parseTaxRegimeFlag(value?.mei)
  const simpleOptant = simple ?? (mei === true ? true : null)

  if (mei === true) {
    return { simpleOptant, label: 'MEI', detail: 'Enquadramento detalhado informado pela API.' }
  }
  if (simple === true) {
    return { simpleOptant, label: 'Simples Nacional', detail: 'Enquadramento informado pela API; a situação como MEI não foi confirmada.' }
  }
  if (simple === false && mei === false) {
    return {
      simpleOptant,
      label: 'Não optante por Simples Nacional ou MEI',
      detail: 'A API Pública não informa o regime tributário de apuração, como Lucro Real ou Lucro Presumido.',
    }
  }
  if (simple === false) {
    return {
      simpleOptant,
      label: 'Não optante pelo Simples Nacional',
      detail: 'A resposta não confirma a situação como MEI nem informa o regime tributário de apuração.',
    }
  }
  return {
    simpleOptant,
    label: 'Não identificado',
    detail: 'A resposta da API não contém dados suficientes para determinar o regime tributário.',
  }
}