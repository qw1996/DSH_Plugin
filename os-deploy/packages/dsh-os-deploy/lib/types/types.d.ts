//#region src/types.d.ts
type DistroVendor = 'openEuler' | 'kylin' | 'debian';
interface IsoImage {
  id: string;
  name: string;
  vendor: DistroVendor;
  isoPath: string;
  distroId: string;
  extractedDir: string | null;
  extracted: boolean;
  sizeBytes: number;
  registeredAt: number;
}
interface RegisterIsoRequest {
  name: string;
  vendor: DistroVendor;
  isoPath: string;
}
interface RegisterIsoResult {
  ok: boolean;
  image?: IsoImage;
  error?: string;
}
interface TargetDevice {
  id: string;
  bmcHost: string;
  bmcUser: string;
  bmcPassword: string;
  nicMac: string;
  /** 目标网卡接口名（enp125s0f0 等）——Debian netcfg/choose_interface 用。
   *  原工具用显式接口名成功；auto 会让 netcfg 扫描四端口触发 hinic 问题
   *  导致网络断、choose-mirror 卡死（9/22 故障）。空则回退 auto。 */
  nicInterface?: string;
  hostname: string;
  osIp: string;
  osGateway: string;
  osPrefixLen: number;
  osDns: string[];
  rootPassword: string;
  diskSn?: string;
  /** 目标磁盘容量（字节，来自探测；Debian partman 容量指纹回退用） */
  diskCapacityBytes?: number;
  sshUser?: string;
  sshPort?: number;
  label?: string;
}
interface InstallComponent {
  id: string;
  name: string;
  description: string;
  packages: string[];
}
type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
interface DeployTask {
  id: string;
  imageId: string;
  device: TargetDevice;
  components: string[];
  status: TaskStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  progress: number;
  stage: string;
  logs: LogEntry[];
  error: string | null;
  queueKey: string;
}
interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
}
interface CreateTaskRequest {
  imageId: string;
  devices: TargetDevice[];
  components: string[];
}
interface CreateTaskResult {
  ok: boolean;
  taskIds?: string[];
  error?: string;
}
interface ListImagesResult {
  images: IsoImage[];
}
interface ListTasksResult {
  tasks: DeployTask[];
}
interface GetTaskDetailRequest {
  taskId: string;
}
interface GetTaskDetailResult {
  task: DeployTask | null;
  error?: string;
}
interface CancelTaskRequest {
  taskId: string;
}
interface CancelTaskResult {
  ok: boolean;
  error?: string;
}
interface DeleteTaskRequest {
  taskId: string;
}
interface DeleteTaskResult {
  ok: boolean;
  error?: string;
}
interface ListComponentsRequest {
  vendor: DistroVendor;
}
interface ListComponentsResult {
  components: InstallComponent[];
}
interface ProbeDeviceRequest {
  bmcHost: string;
  bmcUser: string;
  bmcPassword: string;
}
interface ProbeDeviceResult {
  ok: boolean;
  model?: string;
  serial?: string;
  powerState?: string;
  nicMac?: string;
  disks?: {
    id: string;
    name?: string;
    serial: string;
    capacityBytes: number;
    media: string;
    protocol?: string;
  }[];
  error?: string;
}
interface GetServerListResult {
  servers: {
    id: string;
    name: string;
    host: string;
    bmcHost: string;
    bmcUser: string;
    sshUser: string;
  }[];
}
interface ExtractImageRequest {
  imageId: string;
}
interface ExtractImageResult {
  ok: boolean;
  error?: string;
}
interface DeleteImageRequest {
  imageId: string;
}
interface DeleteImageResult {
  ok: boolean;
  error?: string;
}
interface ServiceStatusResult {
  running: boolean;
  port: number;
  startedAt: number | null;
  imageCount: number;
  taskCount: number;
  activeTaskCount: number;
}
interface ServiceControlResult {
  ok: boolean;
  status?: ServiceStatusResult;
  error?: string;
}
interface OsDeployConfig {
  /** 数据根目录：解包仓库/迷你ISO/任务目录/日志/状态文件都放这里 */
  storageRoot: string;
  /** 终态任务保留天数（到期自动删除任务及其目录） */
  taskRetentionDays: number;
}
interface GetConfigResult {
  config: OsDeployConfig;
  /** 升级前的旧数据位置（提示用户可手动迁移/清理） */
  legacyRoot: string | null;
}
interface SetConfigRequest {
  storageRoot?: string;
  taskRetentionDays?: number;
}
interface SetConfigResult {
  ok: boolean;
  config?: OsDeployConfig;
  error?: string;
}
interface BrowsePathRequest {
  path?: string | null;
}
interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number | null;
}
interface BrowsePathResult {
  path: string;
  parent: string | null;
  home: string;
  roots: string[];
  entries: FileEntry[];
  truncated: boolean;
  error?: string;
}
//#endregion
export { BrowsePathRequest, BrowsePathResult, CancelTaskRequest, CancelTaskResult, CreateTaskRequest, CreateTaskResult, DeleteImageRequest, DeleteImageResult, DeleteTaskRequest, DeleteTaskResult, DeployTask, DistroVendor, ExtractImageRequest, ExtractImageResult, FileEntry, GetConfigResult, GetServerListResult, GetTaskDetailRequest, GetTaskDetailResult, InstallComponent, IsoImage, ListComponentsRequest, ListComponentsResult, ListImagesResult, ListTasksResult, LogEntry, OsDeployConfig, ProbeDeviceRequest, ProbeDeviceResult, RegisterIsoRequest, RegisterIsoResult, ServiceControlResult, ServiceStatusResult, SetConfigRequest, SetConfigResult, TargetDevice, TaskStatus };