import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { extractBaizeLocalSlots, mergeBaizeQuerySlots, localDateWindow } from '../src/lib/ai/assistant/slots'

const fixed = new Date('2026-09-30T04:00:00Z')
const cases: Array<[string, Partial<ReturnType<typeof extractBaizeLocalSlots>['args']>, string?]> = [
  ['3号楼的待处理报修', { location: '3号楼', status: 'pending' }],
  ['3 号楼的待处理报休', { location: '3号楼', status: 'pending' }],
  ['本地集成楼栋 101 的待处理报修', { location: '本地集成楼栋 101', status: 'pending' }],
  ['3栋已完成报修', { location: '3栋', status: 'completed' }],
  ['三号楼已完成报修', { location: '3号楼', status: 'completed' }],
  ['宿舍A区的待处理报修', { location: '宿舍A区', status: 'pending' }],
  ['教学楼3的报修', { location: '教学楼3' }],
  ['3号教学楼的报修', { location: '3号教学楼' }],
  ['不是3号楼的报修', { excludeLocations: ['3号楼'] }],
  ['排除3号楼和4号楼的报修', { excludeLocations: ['3号楼','4号楼'] }],
  ['3号楼和4号楼的报修', { locations: ['3号楼','4号楼'] }],
  ['上周完成的报修', { status: 'completed', dateFrom: '2026-09-21', dateTo: '2026-09-27' }],
  ['本周待处理报修', { status: 'pending', dateFrom: '2026-09-28', dateTo: '2026-09-30' }],
  ['本月我提交的报修', { ownerOnly: true, dateFrom: '2026-09-01', dateTo: '2026-09-30' }],
  ['上个月未完成的报修', { excludeCompleted: true, status: 'all', dateFrom: '2026-08-01', dateTo: '2026-08-31' }],
  ['昨日的待处理报修', { dateFrom: '2026-09-29', dateTo: '2026-09-29', status: 'pending' }],
  ['不要已完成的报修', { excludeCompleted: true, status: 'all' }],
  ['最近3条完成的报修用表格展示', { limit: 3, format: 'table', status: 'completed' }],
  ['3号楼到5号楼的报修', {}, 'clarification'],
  ['3号楼但不是3号楼的报修', {}, 'clarification'],
  ['去年待处理的报修', {}, 'clarification'],
  ['排除待处理的报修', {}, 'clarification'],
]
let checks = 0
for (const [text, expected, error] of cases) {
  const result = extractBaizeLocalSlots(text, fixed)
  for (const [key, value] of Object.entries(expected)) { assert.deepEqual(result.args[key as keyof typeof result.args], value, `${text}: ${key}`); checks += 1 }
  assert.equal(Boolean(result.clarification), Boolean(error), `${text}: clarification mismatch`); checks += 1
}
assert.deepEqual(localDateWindow('上周', fixed), { dateFrom: '2026-09-21', dateTo: '2026-09-27' }); checks += 1
const merged = mergeBaizeQuerySlots('3号楼待处理报修', { location: '3号楼', status: 'all' }, fixed)
assert.equal(merged.args.status, 'pending'); assert.deepEqual(merged.args.locations, ['3号楼']); checks += 2
const conflict = mergeBaizeQuerySlots('3号楼报修', { location: '4号楼' }, fixed)
assert.ok(conflict.clarification); checks += 1
console.log(`PASS Baize local slots: cases=${cases.length}, assertions=${checks}`)
