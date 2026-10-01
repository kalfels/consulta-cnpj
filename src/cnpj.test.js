import assert from 'node:assert/strict'
import test from 'node:test'
import { describeTaxRegime, formatCnpjInput, isValidCnpj, normalizeCnpj } from './cnpj.js'

test('validates CNPJ check digits', () => {
  assert.equal(isValidCnpj('27.865.757/0001-02'), true)
  assert.equal(isValidCnpj('27.865.757/0001-03'), false)
  assert.equal(isValidCnpj('00.000.000/0000-00'), false)
})

test('formats CNPJ digits', () => {
  assert.equal(formatCnpjInput('27865757000102'), '27.865.757/0001-02')
})

test('normalizes and formats an alphanumeric CNPJ', () => {
  assert.equal(normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35')
  assert.equal(formatCnpjInput('12abc34501de35'), '12.ABC.345/01DE-35')
})

test('validates alphanumeric CNPJ using ASCII-based check digits', () => {
  assert.equal(isValidCnpj('12.ABC.345/01DE-35'), true)
  assert.equal(isValidCnpj('12.ABC.345/01DE-36'), false)
  assert.equal(isValidCnpj('12.ABC.345/01DE-3A'), false)
})

test('reports missing Simples data without treating null as a negative', () => {
  const regime = describeTaxRegime(null)
  assert.equal(regime.simpleOptant, null)
  assert.equal(regime.label, 'Não informado pela API')
})

test('identifies Simples Nacional and MEI from the documented object', () => {
  assert.equal(describeTaxRegime({ simples: 'Sim', mei: 'Não' }).label, 'Simples Nacional')
  assert.equal(describeTaxRegime({ simples: 'Sim', mei: 'Sim' }).label, 'MEI')
})

test('does not infer a specific apuration regime from negative Simples and MEI flags', () => {
  const regime = describeTaxRegime({ simples: 'Não', mei: 'Não' })
  assert.equal(regime.simpleOptant, false)
  assert.equal(regime.label, 'Não optante por Simples Nacional ou MEI')
  assert.match(regime.detail, /não informa o regime tributário de apuração/i)
})