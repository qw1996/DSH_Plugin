// dsh-server-manager —— @Remote 契约类型（zod 派生）
// typert-generator 从这些类型生成 lib/typert.host.js 里的 zod schema 与 wire 契约。
import { z } from 'zod'

// ---------- 实体 ----------
export const ServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  host: z.string(),
  sshUser: z.string(),
  sshPort: z.number(),
  bmcHost: z.string(),
  bmcUser: z.string(),
  bmcPassword: z.string(),
  tags: z.array(z.string()),
  notes: z.string(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Server = z.infer<typeof ServerSchema>

export const CheckSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  online: z.boolean(),
  checkedAt: z.number(),
  metrics: z.record(z.string(), z.string()),
  error: z.string().nullable(),
})
export type Check = z.infer<typeof CheckSchema>

// ---------- 通用失败分支 ----------
const Fail = z.object({ ok: z.literal(false), error: z.string() })

function result<T extends z.ZodRawShape>(okShape: T) {
  return z.union([z.object({ ok: z.literal(true), ...okShape }), Fail])
}

// ---------- 请求 ----------
export const AddServerRequestSchema = z.object({
  id: z.string().optional(),
  host: z.string(),
  name: z.string().optional(),
  role: z.string().optional(),
  sshUser: z.string().optional(),
  sshPort: z.number().optional(),
  bmcHost: z.string().optional(),
  bmcUser: z.string().optional(),
  bmcPassword: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
})
export type AddServerRequest = z.infer<typeof AddServerRequestSchema>

export const UpdateServerRequestSchema = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    host: z.string().optional(),
    sshUser: z.string().optional(),
    sshPort: z.number().optional(),
    bmcHost: z.string().optional(),
    bmcUser: z.string().optional(),
    bmcPassword: z.string().optional(),
    tags: z.string().optional(),
    notes: z.string().optional(),
    enabled: z.boolean().optional(),
  }),
})
export type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>

export const IdRequestSchema = z.object({ id: z.string() })
export type IdRequest = z.infer<typeof IdRequestSchema>

export const InspectRequestSchema = z.object({ id: z.string().optional() })
export type InspectRequest = z.infer<typeof InspectRequestSchema>

export const ExecRequestSchema = z.object({
  id: z.string(),
  command: z.string(),
  timeoutMs: z.number().optional(),
})
export type ExecRequest = z.infer<typeof ExecRequestSchema>

export const BmcPowerRequestSchema = z.object({ id: z.string(), action: z.string() })
export type BmcPowerRequest = z.infer<typeof BmcPowerRequestSchema>

export const BmcBiosRequestSchema = z.object({
  id: z.string(),
  attribute: z.string().optional(),
  value: z.string().optional(),
})
export type BmcBiosRequest = z.infer<typeof BmcBiosRequestSchema>

// ---------- 结果 ----------
export const ListServersResultSchema = result({
  servers: z.array(ServerSchema),
  checks: z.record(z.string(), CheckSchema),
  lastInspectAt: z.number().nullable(),
  inspectIntervalMs: z.number(),
  hasIpmitool: z.boolean(),
  bmcTransport: z.string(),
  running: z.boolean(),
})
export type ListServersResult = z.infer<typeof ListServersResultSchema>

export const AddServerResultSchema = result({ server: ServerSchema })
export type AddServerResult = z.infer<typeof AddServerResultSchema>

export const UpdateServerResultSchema = result({ server: ServerSchema })
export type UpdateServerResult = z.infer<typeof UpdateServerResultSchema>

export const DeleteServerResultSchema = result({})
export type DeleteServerResult = z.infer<typeof DeleteServerResultSchema>

export const InspectResultSchema = result({
  checkedAt: z.number(),
  results: z.array(CheckSchema),
})
export type InspectResult = z.infer<typeof InspectResultSchema>

export const ExecResultItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  ok: z.boolean(),
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  error: z.string().nullable(),
  timedOut: z.boolean(),
})
export const ExecResultSchema = result({ results: z.array(ExecResultItemSchema) })
export type ExecResult = z.infer<typeof ExecResultSchema>

// 宽松 JSON 标量：typert 边界不允许裸 unknown/any，Redfish 字段用此联合收敛。
const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()])

// BMC 状态：字段可为 null（Redfish 可能缺失），error 分支带 transport/hint
export const BmcStatusResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    transport: z.string(),
    model: z.string().nullable(),
    manufacturer: z.string().nullable(),
    serial: z.string().nullable(),
    powerState: z.string().nullable(),
    health: z.string().nullable(),
    severity: z.string().nullable(),
  }),
  z.object({ ok: z.literal(false), transport: z.string().optional(), error: z.string() }),
])
export type BmcStatusResult = z.infer<typeof BmcStatusResultSchema>

export const BmcPowerResultSchema = z.union([
  z.object({ ok: z.literal(true), transport: z.string(), powerState: z.string().nullable(), health: z.string().nullable() }),
  z.object({ ok: z.literal(true), transport: z.string(), requested: z.string(), note: z.string() }),
  z.object({ ok: z.literal(false), transport: z.string().optional(), error: z.string() }),
])
export type BmcPowerResult = z.infer<typeof BmcPowerResultSchema>

export const BmcBiosResultSchema = z.union([
  z.object({ ok: z.literal(true), transport: z.string(), attributeRegistry: z.string().nullable(), attributeCount: z.number(), attributes: z.record(z.string(), jsonScalar) }),
  z.object({ ok: z.literal(true), transport: z.string(), attribute: z.string(), value: jsonScalar.nullable() }),
  z.object({ ok: z.literal(true), transport: z.string(), set: z.record(z.string(), jsonScalar), note: z.string() }),
  z.object({ ok: z.literal(false), transport: z.string().optional(), error: z.string(), hint: z.string().optional() }),
])
export type BmcBiosResult = z.infer<typeof BmcBiosResultSchema>

export const UpdateResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    changed: z.boolean(),
    beforeHash: z.string().nullable(),
    afterHash: z.string().nullable(),
    log: z.string(),
    pullOutput: z.string(),
    repoPath: z.string(),
    note: z.string(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
export type UpdateResult = z.infer<typeof UpdateResultSchema>
