import { BrowsePathRequest, BrowsePathResult, CancelTaskRequest, CancelTaskResult, CreateTaskRequest, CreateTaskResult, DeleteImageRequest, DeleteImageResult, DeleteTaskRequest, DeleteTaskResult, DeployTask, ExtractImageRequest, ExtractImageResult, GetConfigResult, GetServerListResult, GetTaskDetailRequest, GetTaskDetailResult, IsoImage, ListComponentsRequest, ListComponentsResult, ListImagesResult, ListTasksResult, ProbeDeviceRequest, ProbeDeviceResult, RegisterIsoRequest, RegisterIsoResult, ServiceControlResult, ServiceStatusResult, SetConfigRequest, SetConfigResult } from "./types/types.js";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.d.ts
declare class OsDeployService extends TypertRemoteService {
  static inject: string[];
  images: IsoImage[];
  tasks: Map<string, DeployTask>;
  /** 部署服务（HTTP 仓库 + 任务队列）是否处于运行态；默认 false，避免拖慢 DSH 启动 */
  serverRunning: boolean;
  serverStartedAt: number | null;
  private httpServer;
  private runners;
  /** 安装器 syslog 收集（rd.syslog/inst.remotelog → 实时安装日志） */
  private syslog;
  /** BMC 拉盘请求计数（节流日志用） */
  private isoFetchCount;
  /** 每任务已装 RPM 计数（逐包日志 + 进度映射） */
  private rpmCounts;
  /** 每任务已记录过的仓库元数据/install.img（去重） */
  private repoSeen;
  /** syslog 入任务日志的节流时间戳 */
  private lastSyslogAt;
  private root;
  /** 状态懒加载：DSH web 启动阶段零读盘零日志，首次实际使用才加载 */
  private stateLoaded;
  /** 任务保留期清扫定时器（服务运行期间每小时一次） */
  private sweepTimer;
  private cfg;
  private cfgFile;
  private queueRunning;
  constructor(ctx: any);
  private get storageRoot();
  private repoDirOf;
  private isoDirPath;
  taskDirOf(taskId: string): string;
  private logsDirPath;
  private statePath;
  /** 升级前的旧数据根（存在则提示可迁移/清理） */
  private legacyRoot;
  private loadConfig;
  private saveConfig;
  /** 状态懒加载（含旧版 state.json 迁移到 storageRoot） */
  private ensureState;
  getConfig(): Promise<GetConfigResult>;
  setConfig(req: SetConfigRequest): Promise<SetConfigResult>;
  serviceStatus(): Promise<ServiceStatusResult>;
  serviceStart(): Promise<ServiceControlResult>;
  /** /iso 与 /repo 访问观测——安装过程的关键遥测 */
  private onRepoAccess;
  /** 安装器 syslog 行 → 过滤关键事件入任务日志（全量原文已落盘 syslog.log） */
  private onSyslogLine;
  private runningTaskBy;
  /** 确保 <root>/certs/ 下有 TLS 证书（虚拟光驱 HTTPS 用）；缺失则落盘内嵌默认自签对。 */
  private ensureTls;
  private addSvcNote;
  serviceStop(): Promise<ServiceControlResult>;
  serviceRestart(): Promise<ServiceControlResult>;
  private save;
  /** 终态任务保留期清扫：到期任务连同任务目录一起删除 */
  private sweepExpiredTasks;
  /** 删除任务目录（详细安装日志等）与迷你 ISO 残留 */
  private removeTaskDir;
  listServers(): Promise<GetServerListResult>;
  /** 列出可用根：win32 枚举存在的盘符，其余平台返回 '/'。 */
  private listRoots;
  /**
   * 浏览目录：返回子目录与文件（含大小），供面板「选择 ISO」弹窗使用。
   * 无 path 时从用户主目录开始；不可读目录返回 error（面包屑仍可回退）。
   * 单层最多返回 2000 条（truncated 标记），防御超大目录拖慢 UI。
   */
  browsePath(req: BrowsePathRequest): Promise<BrowsePathResult>;
  registerIso(req: RegisterIsoRequest): Promise<RegisterIsoResult>;
  extractImage(req: ExtractImageRequest): Promise<ExtractImageResult>;
  deleteImage(req: DeleteImageRequest): Promise<DeleteImageResult>;
  listImages(): Promise<ListImagesResult>;
  listComponents(req: ListComponentsRequest): Promise<ListComponentsResult>;
  probeDevice(req: ProbeDeviceRequest): Promise<ProbeDeviceResult>;
  createTask(req: CreateTaskRequest): Promise<CreateTaskResult>;
  listTasks(): Promise<ListTasksResult>;
  getTaskDetail(req: GetTaskDetailRequest): Promise<GetTaskDetailResult>;
  cancelTask(req: CancelTaskRequest): Promise<CancelTaskResult>;
  deleteTask(req: DeleteTaskRequest): Promise<DeleteTaskResult>;
  private processQueue;
  private runNextFromQueue;
  private runTask;
  private handleReport;
  private addLog;
}
//#endregion
export { OsDeployService as default };