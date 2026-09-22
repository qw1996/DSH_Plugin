//#region src/miniiso.d.ts
declare class FatImage {
  buf: Buffer;
  bps: number;
  spc: number;
  rsvd: number;
  nfats: number;
  rootEntries: number;
  totSec16: number;
  fatSz16: number;
  totSec32: number;
  totalSectors: number;
  fatStart: number;
  rootStart: number;
  rootSectors: number;
  dataStart: number;
  clusterCount: number;
  fatType: number;
  constructor(buf: Buffer);
  clusterOffset(n: number): number;
  nextCluster(n: number): number;
  readChain(first: number, size: number): Buffer;
  readDir(cluster: number): {
    short: string;
    attr: number;
    isDir: boolean;
    firstClus: number;
    size: number;
  }[];
  listAll(): {
    path: string;
    dir: boolean;
    firstClus?: number;
    data?: Buffer;
    size?: number;
  }[];
}
/** 就地覆写 FAT 镜像内的一个文件（保持簇链/目录项不变，新内容不得大于原文件）。 */
declare function patchFatFile(buf: Buffer, pathUpper: string, newData: Buffer): Buffer;
interface MiniIsoOpts {
  repoDir: string;
  label: string;
  ks: string;
  grubCfg: string;
  grubCfgPath?: string;
  out: string;
  slim?: boolean;
}
/** 组装每机迷你启动 ISO：原厂 efiboot.img 内 grub.cfg 就地替换 + kernel/initrd/ks。 */
declare function buildMiniIso(o: MiniIsoOpts): Promise<{
  size: number;
  bootImageSize: number;
}>;
/** Debian HTTP 引导迷你 ISO（~4MB）：仅 grub(grub.cfg)，kernel/initrd 由 grub 经 HTTP 拉取。 */
declare function buildDebianHttpIso(o: {
  repoDir: string;
  label: string;
  grubCfg: string;
  out: string;
  grubBootImage?: Buffer;
}): Promise<{
  size: number;
}>;
//#endregion
//#region src/certs.d.ts
declare const DEFAULT_TLS_CERT = "-----BEGIN CERTIFICATE-----\nMIIDMzCCAhugAwIBAgIUPI2wSOXPiZA31mvAZXAvgn728WowDQYJKoZIhvcNAQEL\nBQAwEzERMA8GA1UEAwwIb3NkZXBsb3kwHhcNMjYwOTE3MDM1NzMwWhcNMzYwOTE0\nMDM1NzMwWjATMREwDwYDVQQDDAhvc2RlcGxveTCCASIwDQYJKoZIhvcNAQEBBQAD\nggEPADCCAQoCggEBALUCENvXntt5mMIZ4g7BpDCOQo4fhGi+lHQJbEukp1L2mWVr\n9XoY3cyxF+GuPRAEKQKYgYRu/82HJrw+d27I7cjesamsShPBTq6K2bB9QhTK9eOd\neNsHQlPda2UTyi7PcP0hq+wH17Rhk5Mmb3W0MmPGYTH2L3SSf8yLeJMqvc+FWwIb\nQVlojUpPIV6xWAf4HkwKNaymoOic/z+ecjeG1aboncISvK+AJWrK5anmSE15IIqd\nNIbxk5stIFQxv8rdFg165in19Zzby5v/onbguaW7jzYqjx76sXkN5TqlMZSdgDns\nAzuGYwJlXaYfDHBQvE3VKmACxNzE4i3zNSf5GbcCAwEAAaN/MH0wHQYDVR0OBBYE\nFHmhdGtFnvfm0wXezJcfvLdsBx+8MB8GA1UdIwQYMBaAFHmhdGtFnvfm0wXezJcf\nvLdsBx+8MA8GA1UdEwEB/wQFMAMBAf8wKgYDVR0RBCMwIYcEwKgCiYIIb3NkZXBs\nb3mCCWxvY2FsaG9zdIcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEAF+sx6xbSJkXe\nXfBkfWXdR6KdnBHJXq+EKOWl1pV0rS3MPlhwI3e9i/WYSEC0oiWjI1ZMHQ+44EL6\nu+k64ICtdnlRtde/L5riamxVliW8OKeLlTFWzhmI04lLw17rw4SBQP4wMJSyolAE\nIRD1P8X/lKQA8n6zSY/W/lgjnVnZoHxa2I7iYimB6+UgJORyHDvFCpL1RcPxfoSO\nYgFxf5cZBE6GE5bcytaTqtT0NoIUpA32EDUMgGb/xYPlZYxabWhT5zy2u8XF/JbC\nDoC2RTlSu/L54EdBiB6EqpIKoAe9NzsIKAubn1O6sKnQNDlNI5Ch8Rdlz9J79vqN\nzc2vju5ieA==\n-----END CERTIFICATE-----\n";
declare const DEFAULT_TLS_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC1AhDb157beZjC\nGeIOwaQwjkKOH4RovpR0CWxLpKdS9plla/V6GN3MsRfhrj0QBCkCmIGEbv/Nhya8\nPnduyO3I3rGprEoTwU6uitmwfUIUyvXjnXjbB0JT3WtlE8ouz3D9IavsB9e0YZOT\nJm91tDJjxmEx9i90kn/Mi3iTKr3PhVsCG0FZaI1KTyFesVgH+B5MCjWspqDonP8/\nnnI3htWm6J3CEryvgCVqyuWp5khNeSCKnTSG8ZObLSBUMb/K3RYNeuYp9fWc28ub\n/6J24Lmlu482Ko8e+rF5DeU6pTGUnYA57AM7hmMCZV2mHwxwULxN1SpgAsTcxOIt\n8zUn+Rm3AgMBAAECggEAL2tgIUfmnRbI9yiyuSzvp6zNMNB+7rXmzFNfpJ15HFnw\nK8rRn2/+Q06ts/jilFySpdRwMdKmfyCF/FDdFw/ag4IbxxiUu4Ir67wCdaMK+cmG\nC2BIthC7xp6+MNezYvoDXr1AffA8CUx6zdUG5C4V+V+SPPWCzyZGBr8PEnbjDQcw\nbk3Hl/p/YXYvYs/6+xhp62PItmO6If3auepqtlb8aezTwPve9KbAjy8d1Xtvt4wj\npGSgLkwzJw42e71HY116yZIa+Fj7bVWp+AHLJBO4ExlBaXxGbFANoDD+8zDgG9Vr\nvsiw/iHWgNSrlduz+tlmWwuBi/+uHImp3l5hb0jzmQKBgQDq01KcDUonrHVEcO+G\nG5NHV5Rh1OwqWrm9n8Y+arNJL0U0azomkMyg2qmF9vq9xbqDIt9VEuIBIBXD+Rix\nfS8IE/Lp5myRmds51vaR7Zv/Dctl2bEEri+b3lhtWzCvq4sfjTxFVuNdjrkBUxn7\ny2K1DVAOg22VuaPnT/87EHwZswKBgQDFVG4M6iefCbSxcxE41dA5vZQrRpymJy8J\nRAmyNzudCMoUVjXiBaBADL431X5kgiuQUho4dLJBRh+VWEiHgIbpeQxWtGkc0uY3\nxjO06ZugJROvlxuezLmUjKsxV80WOv9jR+Y2qBoxNFhsNgtQod4SKPLIR73nP//E\nm1vNZQ/17QKBgQDmOKB5Fh5pnw6pNv/dvxM5koeLErEnJSOM4SP+9aUoTwvORIIS\nZUv5D+eTy3wwqbYd8wZ55bVl3Qr5wzGOcWi2xrgU0TAH34uqvTGoCAg0mlWbWT3P\nlOZgLjELpaep0sjm+hTo9jKa+t4uikajMddoIdEnKXs6m3IxyaA1TAgfOQKBgQCh\nvkCuSUfMrhHz2VNmeKtCiMfoaOqBrmB5gdFIyMkOQGQTI07rQp1FoqxP66i8DY5T\nr1haqhxqMGY27bQVjR4IRPX+I8Z8n8mgMc+0HD85lup55Kv5D+mVf2/a9BLgg99N\nq2NhrYw6hKNtnybLIsJ5tCK8U0GvSOAGcSlgQ9Q/SQKBgQDSb4qYm7a8veOc+ACm\nrx/Vf4ybcawziBS/QDhdOM4NCiCDa/nfMn4tnw+VDdjDOtq0GC0AffvMigbXr54o\npKWhaq4iMDkV0ySH9616f/+D4+vyptYEJsRVeNeRXfffvI7drnNj7yDfdo8ttj7P\nj3uyk/Lpy9B3Grfbha2sWA/CdQ==\n-----END PRIVATE KEY-----\n";
//#endregion
//#region src/engine.d.ts
interface EngineConfig {
  workDir: string;
  httpPort: number;
}
interface BmcInfo {
  host: string;
  user: string;
  pass: string;
}
interface DeploySpec {
  bmc: BmcInfo;
  nicMac: string;
  /** 目标网卡接口名（如 enp125s0f0）——Debian grub kargs 的
   *  netcfg/choose_interface 用接口名（非 MAC、非 auto）：
   *  auto 会让 netcfg 扫描全部端口找链路，Hi1822 四端口扫描时 down/up
   *  易触发 hinic 驱动问题导致网络断、choose-mirror fetch 失败卡死
   *  （9/22 故障）；显式接口名让 netcfg 直连该口、不扫描，网络保持
   *  通畅（原工具实证）。空则回退 auto。 */
  nicInterface?: string;
  hostname: string;
  osIp: string;
  osGateway: string;
  osPrefixLen: number;
  osDns: string[];
  rootPassword: string;
  diskSn: string;
  /** 目标磁盘容量（字节，来自 Redfish 探测）——partman 容量指纹回退用 */
  diskCapacityBytes?: number;
  distroId: string;
  vendor: string;
  repoDir: string;
  components: string[];
  taskId: string;
  isoOutDir: string;
  /** preseed 输出目录（Debian：/ks HTTP 根） */
  ksDir?: string;
  /** Debian 引导镜像来源：任一已解包 anaconda 系镜像的 efiboot.img 路径
   *  （Debian 自家 grub 未编译 http/efinet 模块，须借用 openEuler/麒麟的） */
  efiBootSrc?: string;
}
interface ProgressCallback {
  (stage: string, progress: number, log?: string): void;
}
declare class RedfishClient {
  private host;
  private user;
  private pass;
  private token;
  constructor(bmc: BmcInfo);
  req(method: string, uri: string, body?: any, extraHeaders?: Record<string, string>): Promise<{
    status: number;
    headers: any;
    json: any;
    raw: string;
  }>;
  get(u: string): Promise<{
    status: number;
    headers: any;
    json: any;
    raw: string;
  }>;
  post(u: string, b?: any): Promise<{
    status: number;
    headers: any;
    json: any;
    raw: string;
  }>;
  patch(u: string, b?: any, extra?: Record<string, string>): Promise<{
    status: number;
    headers: any;
    json: any;
    raw: string;
  }>;
  getSystem(): Promise<any>;
  getStorage(): Promise<any>;
  /**
   * 从 Chassis/Drives 枚举物理盘。鲲鹏 iBMC 等固件不实现
   * Systems/1/Storage（404），磁盘挂在 Chassis 下：
   *   /redfish/v1/Chassis/{id} → Drives → /redfish/v1/Chassis/{id}/Drives/{disk}
   */
  getChassisDrives(): Promise<any[]>;
  patchSystem(body: any): Promise<void>;
  setBootOnce(target: string): Promise<void>;
  power(action: string): Promise<void>;
  vmediaConnect(imageUrl: string): Promise<void>;
  vmediaDisconnect(): Promise<void>;
  vmediaStatus(): Promise<any>;
}
declare function generateSelfSignedCert(): {
  cert: string;
  key: string;
};
declare function genKickstart(spec: DeploySpec, serverIp: string, httpPort: number): string;
declare function genPreseed(spec: DeploySpec, serverIp: string, httpPort: number): string;
/**
 * 固化进迷你 ISO（efiboot.img 内 /EFI/BOOT/GRUB.CFG + ISO9660 /EFI/BOOT/grub.cfg）
 * 的引导配置。两种模式（原 osdeploy 工具实证）：
 *  - full：inst.stage2=hd:LABEL=<label>（stage2 install.img 在光盘上，
 *    ISO ~800-980MB；openEuler 验证可行）
 *  - slim：inst.stage2=http://<ip>:<port>/repo/<distroId>/（stage2 走 HTTP 仓库，
 *    ISO 仅 ~70MB；麒麟实证可行——大 ISO 的虚拟光驱引导链路撑不住）。
 *    slim 需要 dracut 期网络：ifname= 把业务网卡 MAC 绑定自定义名
 *    （绕开 openEuler 系 dracut 055 的 enx<MAC> off-by-one 缺陷），ip= 静态配置。
 */
declare function genVmediaGrubCfg(spec: DeploySpec, isoLabel: string, opts: {
  slim?: boolean;
  serverIp: string;
  httpPort?: number;
}): string;
/** Debian HTTP 引导 grub.cfg：kernel/initrd 由 grub 自身网络栈经 HTTP 拉取。 */
declare function genDebianHttpGrubCfg(spec: DeploySpec, serverIp: string, httpPort: number): string;
/**
 * 极简 RFC3164 syslog 收集器（UDP 514 + TCP 514）。
 * 引导参数 rd.syslog=<ip>（dracut 阶段，UDP）与 inst.remotelog=<ip>:514
 * （anaconda，TCP 明文行）都会推到这里——安装器的每一条日志（软件包
 * 安装、存储配置、网络配置、错误）实时到达，是安装过程观测的王牌通道。
 * 原始 osdeploy 工具实证此机制在鲲鹏 iBMC + openEuler/麒麟上可用。
 */
declare class SyslogCollector {
  private sock;
  private tcp;
  private port;
  private stream;
  lines: number;
  onLine: ((info: {
    ip: string;
    severity: number;
    msg: string;
  }) => void) | null;
  constructor(port?: number, logFile?: string);
  start(): Promise<void>;
  stop(): void;
  private onMessage;
}
declare class DeployHttpServer {
  private server;
  private tlsServer;
  private port;
  private tlsPort;
  private roots;
  private reportHandler;
  private accessHandler;
  /** HTTPS 443 是否成功监听（iBMC 虚拟光驱要求 https:// 镜像 URL） */
  httpsUp: boolean;
  httpsError: string;
  constructor(port: number, tlsPort?: number);
  setRoot(prefix: string, dir: string): void;
  removeRoot(prefix: string): void;
  onReport(handler: (query: URLSearchParams, ip: string) => void): void;
  /** 所有静态文件访问回调（/iso 的 BMC 拉取、/repo 的安装器取包都经此观测） */
  onAccess(handler: (info: {
    path: string;
    method: string;
    status: number;
    bytes: number;
    ip: string;
  }) => void): void;
  start(tls?: {
    cert: string;
    key: string;
  }): Promise<void>;
  stop(): void;
  private handle;
}
declare function extractIso(isoPath: string, outDir: string): {
  ok: boolean;
  error?: string;
};
/**
 * Debian 仓库资产校验（幂等、只读）。
 *
 * 关键事实（原 osdeploy 工具 9/18-9/20 实证）：Debian DVD 的 install.a64/
 * initrd.gz 含 cdrom-detect，期望在虚拟光驱上找到安装媒体——而我们的小
 * 迷你 ISO 只有 grub，没有 dists/pool → d-i 卡死在"检测安装媒体"。
 * 必须用真正的 netboot initrd（deb.debian.org 的 netboot/gtk/cdrom 之外的
 * 纯网络启动 initrd，无 cdrom-detect）+ 匹配版本的内核 udeb。
 *
 * 因此本函数不再从 install.a64 拷贝（那会制造"看起来有、实则必死"的资产），
 * 而是校验：netboot 资产存在且不是 install.a64 的逐字节副本（即不是 DVD
 * cdrom initrd）；dists 签名元数据存在（缺失则告警，未签名靠 99osdeploy.conf
 * 放行亦可，但签名更稳）。
 */
declare function ensureDebianRepoAssets(repoDir: string): {
  ok: boolean;
  error?: string;
  warning?: string;
};
declare class DeployRunner {
  private rf;
  private spec;
  private serverIp;
  private httpPort;
  private progress;
  private cancelled;
  /** 本任务收到的安装器回报阶段（成功判定的证据；见 markReport） */
  private stages;
  constructor(spec: DeploySpec, serverIp: string, httpPort: number, progress: ProgressCallback);
  cancel(): void;
  /**
   * 安装器回报入口（由 service 的 /report 处理器调用）。
   * 回报 URL 携带 task=<id>，因此旧系统开机自报（带上一个任务的 id）
   * 不会计入本任务——这是"安装是否真的发生"的判据。
   */
  markReport(stage: string): void;
  run(): Promise<{
    ok: boolean;
    error?: string;
  }>;
  private trySsh;
}
/**
 * 探测"通往目标（BMC）的本机源 IP"——用 UDP connect 让系统路由栈选路，
 * 不实际发包。多网卡/VPN 场景下比"第一个非内网 IPv4"可靠：BMC 必须能
 * 回连到我们选的地址（虚拟光驱 HTTPS 与安装期 HTTP 仓库都依赖它）。
 * 探测失败时退化为任意非内网 IPv4。
 */
declare function getRouteIp(target: string): Promise<string>;
//#endregion
export { patchFatFile as S, DEFAULT_TLS_CERT as _, EngineConfig as a, buildDebianHttpIso as b, SyslogCollector as c, genDebianHttpGrubCfg as d, genKickstart as f, getRouteIp as g, generateSelfSignedCert as h, DeploySpec as i, ensureDebianRepoAssets as l, genVmediaGrubCfg as m, DeployHttpServer as n, ProgressCallback as o, genPreseed as p, DeployRunner as r, RedfishClient as s, BmcInfo as t, extractIso as u, DEFAULT_TLS_KEY as v, buildMiniIso as x, FatImage as y };