import { BrowsePathRequest, BrowsePathResult, CancelTaskRequest, CancelTaskResult, CreateTaskRequest, CreateTaskResult, DeleteImageRequest, DeleteImageResult, DeleteTaskRequest, DeleteTaskResult, DeployTask, ExtractImageRequest, ExtractImageResult, GetServerListResult, GetTaskDetailRequest, GetTaskDetailResult, IsoImage, ListComponentsRequest, ListComponentsResult, ListImagesResult, ListTasksResult, ProbeDeviceRequest, ProbeDeviceResult, RegisterIsoRequest, RegisterIsoResult, ServiceControlResult, ServiceStatusResult } from "./types/types.js";
import { Service } from "@deepseek-ai/cordis";
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
  private root;
  private dataFile;
  private queueRunning;
  constructor(ctx: any);
  [Service.init](): Promise<void>;
  serviceStatus(): Promise<ServiceStatusResult>;
  serviceStart(): Promise<ServiceControlResult>;
  serviceStop(): Promise<ServiceControlResult>;
  serviceRestart(): Promise<ServiceControlResult>;
  private load;
  private save;
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
  private getLocalIp;
}
//#endregion
export { OsDeployService as default };