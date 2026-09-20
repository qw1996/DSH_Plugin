import { CancelTaskRequest, CancelTaskResult, CreateTaskRequest, CreateTaskResult, DeleteImageRequest, DeleteImageResult, DeleteTaskRequest, DeleteTaskResult, DeployTask, ExtractImageRequest, ExtractImageResult, GetServerListResult, GetTaskDetailRequest, GetTaskDetailResult, IsoImage, ListComponentsRequest, ListComponentsResult, ListImagesResult, ListTasksResult, ProbeDeviceRequest, ProbeDeviceResult, RegisterIsoRequest, RegisterIsoResult } from "./types/types.js";
import { Service } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.d.ts
declare class OsDeployService extends TypertRemoteService {
  [Service.dispose]: () => Promise<void>;
  static inject: string[];
  images: IsoImage[];
  tasks: Map<string, DeployTask>;
  private httpServer;
  private runners;
  private root;
  private dataFile;
  private queueRunning;
  constructor(ctx: any);
  [Service.init](): Promise<void>;
  private load;
  private save;
  listServers(): Promise<GetServerListResult>;
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