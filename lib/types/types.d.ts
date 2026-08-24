import { z } from "zod";
//#region src/types.d.ts
declare const ServerSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  role: z.ZodString;
  host: z.ZodString;
  sshUser: z.ZodString;
  sshPort: z.ZodNumber;
  bmcHost: z.ZodString;
  bmcUser: z.ZodString;
  bmcPassword: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  notes: z.ZodString;
  enabled: z.ZodBoolean;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
}, z.core.$strip>;
type Server = z.infer<typeof ServerSchema>;
declare const CheckSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  host: z.ZodString;
  online: z.ZodBoolean;
  checkedAt: z.ZodNumber;
  metrics: z.ZodRecord<z.ZodString, z.ZodString>;
  error: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type Check = z.infer<typeof CheckSchema>;
declare const AddServerRequestSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodString>;
  host: z.ZodString;
  name: z.ZodOptional<z.ZodString>;
  role: z.ZodOptional<z.ZodString>;
  sshUser: z.ZodOptional<z.ZodString>;
  sshPort: z.ZodOptional<z.ZodNumber>;
  bmcHost: z.ZodOptional<z.ZodString>;
  bmcUser: z.ZodOptional<z.ZodString>;
  bmcPassword: z.ZodOptional<z.ZodString>;
  tags: z.ZodOptional<z.ZodString>;
  notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type AddServerRequest = z.infer<typeof AddServerRequestSchema>;
declare const UpdateServerRequestSchema: z.ZodObject<{
  id: z.ZodString;
  patch: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    host: z.ZodOptional<z.ZodString>;
    sshUser: z.ZodOptional<z.ZodString>;
    sshPort: z.ZodOptional<z.ZodNumber>;
    bmcHost: z.ZodOptional<z.ZodString>;
    bmcUser: z.ZodOptional<z.ZodString>;
    bmcPassword: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>;
}, z.core.$strip>;
type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>;
declare const IdRequestSchema: z.ZodObject<{
  id: z.ZodString;
}, z.core.$strip>;
type IdRequest = z.infer<typeof IdRequestSchema>;
declare const InspectRequestSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type InspectRequest = z.infer<typeof InspectRequestSchema>;
declare const ExecRequestSchema: z.ZodObject<{
  id: z.ZodString;
  command: z.ZodString;
  timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type ExecRequest = z.infer<typeof ExecRequestSchema>;
declare const BmcPowerRequestSchema: z.ZodObject<{
  id: z.ZodString;
  action: z.ZodString;
}, z.core.$strip>;
type BmcPowerRequest = z.infer<typeof BmcPowerRequestSchema>;
declare const BmcBiosRequestSchema: z.ZodObject<{
  id: z.ZodString;
  attribute: z.ZodOptional<z.ZodString>;
  value: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type BmcBiosRequest = z.infer<typeof BmcBiosRequestSchema>;
declare const ListServersResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  servers: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodString;
    host: z.ZodString;
    sshUser: z.ZodString;
    sshPort: z.ZodNumber;
    bmcHost: z.ZodString;
    bmcUser: z.ZodString;
    bmcPassword: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    notes: z.ZodString;
    enabled: z.ZodBoolean;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
  }, z.core.$strip>>;
  checks: z.ZodRecord<z.ZodString, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    host: z.ZodString;
    online: z.ZodBoolean;
    checkedAt: z.ZodNumber;
    metrics: z.ZodRecord<z.ZodString, z.ZodString>;
    error: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>;
  lastInspectAt: z.ZodNullable<z.ZodNumber>;
  inspectIntervalMs: z.ZodNumber;
  hasIpmitool: z.ZodBoolean;
  bmcTransport: z.ZodString;
  running: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type ListServersResult = z.infer<typeof ListServersResultSchema>;
declare const AddServerResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  server: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodString;
    host: z.ZodString;
    sshUser: z.ZodString;
    sshPort: z.ZodNumber;
    bmcHost: z.ZodString;
    bmcUser: z.ZodString;
    bmcPassword: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    notes: z.ZodString;
    enabled: z.ZodBoolean;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type AddServerResult = z.infer<typeof AddServerResultSchema>;
declare const UpdateServerResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  server: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodString;
    host: z.ZodString;
    sshUser: z.ZodString;
    sshPort: z.ZodNumber;
    bmcHost: z.ZodString;
    bmcUser: z.ZodString;
    bmcPassword: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    notes: z.ZodString;
    enabled: z.ZodBoolean;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type UpdateServerResult = z.infer<typeof UpdateServerResultSchema>;
declare const DeleteServerResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type DeleteServerResult = z.infer<typeof DeleteServerResultSchema>;
declare const InspectResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  checkedAt: z.ZodNumber;
  results: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    host: z.ZodString;
    online: z.ZodBoolean;
    checkedAt: z.ZodNumber;
    metrics: z.ZodRecord<z.ZodString, z.ZodString>;
    error: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type InspectResult = z.infer<typeof InspectResultSchema>;
declare const ExecResultItemSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  host: z.ZodString;
  ok: z.ZodBoolean;
  exitCode: z.ZodNullable<z.ZodNumber>;
  stdout: z.ZodString;
  stderr: z.ZodString;
  error: z.ZodNullable<z.ZodString>;
  timedOut: z.ZodBoolean;
}, z.core.$strip>;
declare const ExecResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  results: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    host: z.ZodString;
    ok: z.ZodBoolean;
    exitCode: z.ZodNullable<z.ZodNumber>;
    stdout: z.ZodString;
    stderr: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
    timedOut: z.ZodBoolean;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type ExecResult = z.infer<typeof ExecResultSchema>;
declare const BmcStatusResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  model: z.ZodNullable<z.ZodString>;
  manufacturer: z.ZodNullable<z.ZodString>;
  serial: z.ZodNullable<z.ZodString>;
  powerState: z.ZodNullable<z.ZodString>;
  health: z.ZodNullable<z.ZodString>;
  severity: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  transport: z.ZodOptional<z.ZodString>;
  error: z.ZodString;
}, z.core.$strip>]>;
type BmcStatusResult = z.infer<typeof BmcStatusResultSchema>;
declare const BmcPowerResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  powerState: z.ZodNullable<z.ZodString>;
  health: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  requested: z.ZodString;
  note: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  transport: z.ZodOptional<z.ZodString>;
  error: z.ZodString;
}, z.core.$strip>]>;
type BmcPowerResult = z.infer<typeof BmcPowerResultSchema>;
declare const BmcBiosResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  attributeRegistry: z.ZodNullable<z.ZodString>;
  attributeCount: z.ZodNumber;
  attributes: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  attribute: z.ZodString;
  value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<true>;
  transport: z.ZodString;
  set: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
  note: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  transport: z.ZodOptional<z.ZodString>;
  error: z.ZodString;
  hint: z.ZodOptional<z.ZodString>;
}, z.core.$strip>]>;
type BmcBiosResult = z.infer<typeof BmcBiosResultSchema>;
declare const UpdateResultSchema: z.ZodUnion<readonly [z.ZodObject<{
  ok: z.ZodLiteral<true>;
  changed: z.ZodBoolean;
  beforeHash: z.ZodNullable<z.ZodString>;
  afterHash: z.ZodNullable<z.ZodString>;
  log: z.ZodString;
  pullOutput: z.ZodString;
  repoPath: z.ZodString;
  note: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>]>;
type UpdateResult = z.infer<typeof UpdateResultSchema>;
//#endregion
export { AddServerRequest, AddServerRequestSchema, AddServerResult, AddServerResultSchema, BmcBiosRequest, BmcBiosRequestSchema, BmcBiosResult, BmcBiosResultSchema, BmcPowerRequest, BmcPowerRequestSchema, BmcPowerResult, BmcPowerResultSchema, BmcStatusResult, BmcStatusResultSchema, Check, CheckSchema, DeleteServerResult, DeleteServerResultSchema, ExecRequest, ExecRequestSchema, ExecResult, ExecResultItemSchema, ExecResultSchema, IdRequest, IdRequestSchema, InspectRequest, InspectRequestSchema, InspectResult, InspectResultSchema, ListServersResult, ListServersResultSchema, Server, ServerSchema, UpdateResult, UpdateResultSchema, UpdateServerRequest, UpdateServerRequestSchema, UpdateServerResult, UpdateServerResultSchema };