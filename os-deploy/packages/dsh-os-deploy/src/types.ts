// types.ts — shared types for os-deploy plugin

// ---------- 镜像 ----------
export type DistroVendor = 'openEuler' | 'kylin' | 'debian'

export interface IsoImage {
  id: string
  name: string
  vendor: DistroVendor
  isoPath: string            // local path to the .iso file
  distroId: string           // e.g. 'oe2203sp4', 'kylinv10sp3', 'debian13'
  extractedDir: string | null // extracted repo dir (null = not yet extracted)
  extracted: boolean
  sizeBytes: number
  registeredAt: number
}

export interface RegisterIsoRequest {
  name: string
  vendor: DistroVendor
  isoPath: string
}
export interface RegisterIsoResult {
  ok: boolean
  image?: IsoImage
  error?: string
}

// ---------- 设备 ----------
export interface TargetDevice {
  id: string                 // unique per device
  bmcHost: string
  bmcUser: string
  bmcPassword: string
  nicMac: string             // business NIC MAC (for boot)
  hostname: string
  // OS network config
  osIp: string
  osGateway: string
  osPrefixLen: number        // e.g. 24 for /24
  osDns: string[]
  rootPassword: string
  // 目标磁盘 SN（探测设备后选定；空 = 安装期 %pre 自动选第一块盘）
  diskSn?: string
  // SSH info (optional, for verification after install)
  sshUser?: string
  sshPort?: number
  label?: string             // display name
}

// ---------- 安装组件 ----------
export interface InstallComponent {
  id: string                 // e.g. 'core', 'devel', 'ssh-server'
  name: string               // display name
  description: string
  packages: string[]         // package group names or explicit packages
}

// ---------- 安装任务 ----------
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export interface DeployTask {
  id: string
  imageId: string            // which registered ISO to use
  device: TargetDevice
  components: string[]       // selected component ids
  status: TaskStatus
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  progress: number           // 0-100
  stage: string              // current stage description
  logs: LogEntry[]           // recent log entries
  error: string | null
  queueKey: string           // bmcHost — tasks with same key run sequentially
}

export interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'success'
  msg: string
}

export interface CreateTaskRequest {
  imageId: string
  devices: TargetDevice[]    // one or more devices → one task per device
  components: string[]
}
export interface CreateTaskResult {
  ok: boolean
  taskIds?: string[]
  error?: string
}

// ---------- Remote API result types ----------
export interface ListImagesResult {
  images: IsoImage[]
}

export interface ListTasksResult {
  tasks: DeployTask[]
}

export interface GetTaskDetailRequest {
  taskId: string
}
export interface GetTaskDetailResult {
  task: DeployTask | null
  error?: string
}

export interface CancelTaskRequest {
  taskId: string
}
export interface CancelTaskResult {
  ok: boolean
  error?: string
}

export interface DeleteTaskRequest {
  taskId: string
}
export interface DeleteTaskResult {
  ok: boolean
  error?: string
}

export interface ListComponentsRequest {
  vendor: DistroVendor
}
export interface ListComponentsResult {
  components: InstallComponent[]
}

export interface ProbeDeviceRequest {
  bmcHost: string
  bmcUser: string
  bmcPassword: string
}
export interface ProbeDeviceResult {
  ok: boolean
  model?: string
  serial?: string
  powerState?: string
  nicMac?: string
  disks?: { id: string; name?: string; serial: string; capacityBytes: number; media: string; protocol?: string }[]
  error?: string
}

export interface GetServerListResult {
  servers: { id: string; name: string; host: string; bmcHost: string; bmcUser: string; sshUser: string }[]
}

export interface ExtractImageRequest {
  imageId: string
}
export interface ExtractImageResult {
  ok: boolean
  error?: string
}

export interface DeleteImageRequest {
  imageId: string
}
export interface DeleteImageResult {
  ok: boolean
  error?: string
}

// ---------- 服务控制 ----------
export interface ServiceStatusResult {
  running: boolean
  port: number
  startedAt: number | null
  imageCount: number
  taskCount: number
  activeTaskCount: number
}

export interface ServiceControlResult {
  ok: boolean
  status?: ServiceStatusResult
  error?: string
}

// ---------- 插件配置 ----------
export interface OsDeployConfig {
  /** 数据根目录：解包仓库/迷你ISO/任务目录/日志/状态文件都放这里 */
  storageRoot: string
  /** 终态任务保留天数（到期自动删除任务及其目录） */
  taskRetentionDays: number
}

export interface GetConfigResult {
  config: OsDeployConfig
  /** 升级前的旧数据位置（提示用户可手动迁移/清理） */
  legacyRoot: string | null
}

export interface SetConfigRequest {
  storageRoot?: string
  taskRetentionDays?: number
}
export interface SetConfigResult {
  ok: boolean
  config?: OsDeployConfig
  error?: string
}

// ---------- 文件浏览（镜像选择弹窗） ----------
export interface BrowsePathRequest {
  path?: string | null
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  sizeBytes: number | null
}

export interface BrowsePathResult {
  path: string
  parent: string | null
  home: string
  roots: string[]
  entries: FileEntry[]
  truncated: boolean
  error?: string
}
