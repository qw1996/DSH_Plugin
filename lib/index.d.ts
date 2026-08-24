import { AddServerRequest, AddServerResult, BmcBiosRequest, BmcBiosResult, BmcPowerRequest, BmcPowerResult, BmcStatusResult, DeleteServerResult, ExecRequest, ExecResult, IdRequest, InspectRequest, InspectResult, ListServersResult, UpdateResult, UpdateServerRequest, UpdateServerResult } from "./types/types.js";
import { Service } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.d.ts
interface ServerRecord {
  id: string;
  name: string;
  role: string;
  host: string;
  sshUser: string;
  sshPort: number;
  bmcHost: string;
  bmcUser: string;
  bmcPassword: string;
  tags: string[];
  notes: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
interface CheckResult {
  id: string;
  name: string;
  host: string;
  online: boolean;
  checkedAt: number;
  metrics: Record<string, string>;
  error: string | null;
}
type Json = any;
declare class ServerManagerService extends TypertRemoteService {
  static inject: string[];
  servers: ServerRecord[];
  checks: Record<string, CheckResult>;
  running: boolean;
  lastInspectAt: number | null;
  inspectIntervalMs: number;
  hasIpmitool: boolean;
  private root;
  private policy;
  private dataFile;
  constructor(ctx: any);
  [Service.init](): Promise<void>;
  private seedServers;
  private normalize;
  private find;
  private runArgv;
  private sshArgs;
  private runSsh;
  private static readonly PROBE;
  private parseProbe;
  private inspectServer;
  inspectAll(ids: string[]): Promise<Json>;
  private persist;
  private load;
  private detectIpmitool;
  private redfishRequest;
  private redfishEtag;
  private redfishSystemId;
  doUpdate(): Promise<Json>;
  listServers(): ListServersResult;
  addServer(request: AddServerRequest): Promise<AddServerResult>;
  updateServer(request: UpdateServerRequest): Promise<UpdateServerResult>;
  deleteServer(request: IdRequest): Promise<DeleteServerResult>;
  inspect(request: InspectRequest): Promise<InspectResult>;
  exec(request: ExecRequest): Promise<ExecResult>;
  bmcStatus(request: IdRequest): Promise<BmcStatusResult>;
  bmcPower(request: BmcPowerRequest): Promise<BmcPowerResult>;
  bmcBios(request: BmcBiosRequest): Promise<BmcBiosResult>;
  update(): Promise<UpdateResult>;
  private resolveTargets;
}
//#endregion
export { ServerManagerService as default };