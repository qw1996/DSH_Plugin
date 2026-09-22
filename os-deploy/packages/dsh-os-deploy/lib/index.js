import { a as ensureDebianRepoAssets, c as genKickstart, f as getRouteIp, i as SyslogCollector, l as genPreseed, m as DEFAULT_TLS_KEY, n as DeployRunner, o as extractIso, p as DEFAULT_TLS_CERT, r as RedfishClient, s as genDebianHttpGrubCfg, t as DeployHttpServer } from "./engine-CgH8ly3X.js";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
//#region src/index.ts
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* 仓库 / preseed / report 的 HTTP 端口。用 80（d-i 的 choose-mirror 没有
* mirror/http/port 模板——hostname 只接受纯主机名，端口只能靠默认 80；
* 原工具即用 80 成功安装 Debian。本机防火墙关闭、80 空闲、已能绑 443，
* 故绑 80 无碍。）
*/
const HTTP_PORT = 80;
/** 虚拟光驱 HTTPS 端口（iBMC 要求 https:// 镜像 URL；443 免端口后缀） */
const HTTPS_PORT = 443;
/** 安装器 syslog 接收端口（rd.syslog/inst.remotelog 推送） */
const SYSLOG_PORT = 514;
const COMPONENTS = {
	openEuler: [
		{
			id: "core",
			name: "最小化安装",
			description: "@core + SSH + 基本工具",
			packages: [
				"@core",
				"openssh-server",
				"curl",
				"wget",
				"tar"
			]
		},
		{
			id: "ssh-server",
			name: "SSH 服务器",
			description: "openssh-server（最小化已含）",
			packages: ["openssh-server"]
		},
		{
			id: "devel",
			name: "开发工具",
			description: "GCC / G++ / Make / GDB / Git",
			packages: [
				"@development",
				"gcc",
				"gcc-c++",
				"make",
				"gdb",
				"git"
			]
		},
		{
			id: "minimal-extra",
			name: "常用工具",
			description: "vim / net-tools / bind-utils",
			packages: [
				"vim",
				"net-tools",
				"bind-utils"
			]
		}
	],
	kylin: [
		{
			id: "core",
			name: "最小化安装",
			description: "@core + SSH + 基本工具",
			packages: [
				"@core",
				"openssh-server",
				"curl",
				"wget",
				"tar"
			]
		},
		{
			id: "ssh-server",
			name: "SSH 服务器",
			description: "openssh-server（最小化已含）",
			packages: ["openssh-server"]
		},
		{
			id: "devel",
			name: "开发工具",
			description: "GCC / G++ / Make / GDB / Git",
			packages: [
				"@development",
				"gcc",
				"gcc-c++",
				"make",
				"gdb",
				"git"
			]
		},
		{
			id: "minimal-extra",
			name: "常用工具",
			description: "vim / net-tools / bind-utils",
			packages: [
				"vim",
				"net-tools",
				"bind-utils"
			]
		}
	],
	debian: [
		{
			id: "core",
			name: "最小化安装",
			description: "base + SSH + curl",
			packages: ["openssh-server", "curl"]
		},
		{
			id: "ssh-server",
			name: "SSH 服务器",
			description: "openssh-server",
			packages: ["openssh-server"]
		},
		{
			id: "devel",
			name: "开发工具",
			description: "build-essential / GCC / Make / GDB / Git",
			packages: [
				"build-essential",
				"gcc",
				"make",
				"gdb",
				"git"
			]
		}
	]
};
let OsDeployService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _getConfig_decorators;
	let _setConfig_decorators;
	let _serviceStatus_decorators;
	let _serviceStart_decorators;
	let _serviceStop_decorators;
	let _serviceRestart_decorators;
	let _listServers_decorators;
	let _browsePath_decorators;
	let _registerIso_decorators;
	let _extractImage_decorators;
	let _deleteImage_decorators;
	let _listImages_decorators;
	let _listComponents_decorators;
	let _probeDevice_decorators;
	let _createTask_decorators;
	let _listTasks_decorators;
	let _getTaskDetail_decorators;
	let _cancelTask_decorators;
	let _deleteTask_decorators;
	return class OsDeployService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_getConfig_decorators = [Remote("getConfig")];
			_setConfig_decorators = [Remote("setConfig")];
			_serviceStatus_decorators = [Remote("serviceStatus")];
			_serviceStart_decorators = [Remote("serviceStart")];
			_serviceStop_decorators = [Remote("serviceStop")];
			_serviceRestart_decorators = [Remote("serviceRestart")];
			_listServers_decorators = [Remote("listServers")];
			_browsePath_decorators = [Remote("browsePath")];
			_registerIso_decorators = [Remote("registerIso")];
			_extractImage_decorators = [Remote("extractImage")];
			_deleteImage_decorators = [Remote("deleteImage")];
			_listImages_decorators = [Remote("listImages")];
			_listComponents_decorators = [Remote("listComponents")];
			_probeDevice_decorators = [Remote("probeDevice")];
			_createTask_decorators = [Remote("createTask")];
			_listTasks_decorators = [Remote("listTasks")];
			_getTaskDetail_decorators = [Remote("getTaskDetail")];
			_cancelTask_decorators = [Remote("cancelTask")];
			_deleteTask_decorators = [Remote("deleteTask")];
			__esDecorate(this, null, _getConfig_decorators, {
				kind: "method",
				name: "getConfig",
				static: false,
				private: false,
				access: {
					has: (obj) => "getConfig" in obj,
					get: (obj) => obj.getConfig
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setConfig_decorators, {
				kind: "method",
				name: "setConfig",
				static: false,
				private: false,
				access: {
					has: (obj) => "setConfig" in obj,
					get: (obj) => obj.setConfig
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _serviceStatus_decorators, {
				kind: "method",
				name: "serviceStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "serviceStatus" in obj,
					get: (obj) => obj.serviceStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _serviceStart_decorators, {
				kind: "method",
				name: "serviceStart",
				static: false,
				private: false,
				access: {
					has: (obj) => "serviceStart" in obj,
					get: (obj) => obj.serviceStart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _serviceStop_decorators, {
				kind: "method",
				name: "serviceStop",
				static: false,
				private: false,
				access: {
					has: (obj) => "serviceStop" in obj,
					get: (obj) => obj.serviceStop
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _serviceRestart_decorators, {
				kind: "method",
				name: "serviceRestart",
				static: false,
				private: false,
				access: {
					has: (obj) => "serviceRestart" in obj,
					get: (obj) => obj.serviceRestart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listServers_decorators, {
				kind: "method",
				name: "listServers",
				static: false,
				private: false,
				access: {
					has: (obj) => "listServers" in obj,
					get: (obj) => obj.listServers
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _browsePath_decorators, {
				kind: "method",
				name: "browsePath",
				static: false,
				private: false,
				access: {
					has: (obj) => "browsePath" in obj,
					get: (obj) => obj.browsePath
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _registerIso_decorators, {
				kind: "method",
				name: "registerIso",
				static: false,
				private: false,
				access: {
					has: (obj) => "registerIso" in obj,
					get: (obj) => obj.registerIso
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _extractImage_decorators, {
				kind: "method",
				name: "extractImage",
				static: false,
				private: false,
				access: {
					has: (obj) => "extractImage" in obj,
					get: (obj) => obj.extractImage
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _deleteImage_decorators, {
				kind: "method",
				name: "deleteImage",
				static: false,
				private: false,
				access: {
					has: (obj) => "deleteImage" in obj,
					get: (obj) => obj.deleteImage
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listImages_decorators, {
				kind: "method",
				name: "listImages",
				static: false,
				private: false,
				access: {
					has: (obj) => "listImages" in obj,
					get: (obj) => obj.listImages
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listComponents_decorators, {
				kind: "method",
				name: "listComponents",
				static: false,
				private: false,
				access: {
					has: (obj) => "listComponents" in obj,
					get: (obj) => obj.listComponents
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _probeDevice_decorators, {
				kind: "method",
				name: "probeDevice",
				static: false,
				private: false,
				access: {
					has: (obj) => "probeDevice" in obj,
					get: (obj) => obj.probeDevice
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _createTask_decorators, {
				kind: "method",
				name: "createTask",
				static: false,
				private: false,
				access: {
					has: (obj) => "createTask" in obj,
					get: (obj) => obj.createTask
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listTasks_decorators, {
				kind: "method",
				name: "listTasks",
				static: false,
				private: false,
				access: {
					has: (obj) => "listTasks" in obj,
					get: (obj) => obj.listTasks
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getTaskDetail_decorators, {
				kind: "method",
				name: "getTaskDetail",
				static: false,
				private: false,
				access: {
					has: (obj) => "getTaskDetail" in obj,
					get: (obj) => obj.getTaskDetail
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _cancelTask_decorators, {
				kind: "method",
				name: "cancelTask",
				static: false,
				private: false,
				access: {
					has: (obj) => "cancelTask" in obj,
					get: (obj) => obj.cancelTask
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _deleteTask_decorators, {
				kind: "method",
				name: "deleteTask",
				static: false,
				private: false,
				access: {
					has: (obj) => "deleteTask" in obj,
					get: (obj) => obj.deleteTask
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = [
			"timer",
			"subprocess",
			"fs",
			"sandboxPolicy"
		];
		images = (__runInitializers(this, _instanceExtraInitializers), []);
		tasks = /* @__PURE__ */ new Map();
		/** 部署服务（HTTP 仓库 + 任务队列）是否处于运行态；默认 false，避免拖慢 DSH 启动 */
		serverRunning = false;
		serverStartedAt = null;
		httpServer = null;
		runners = /* @__PURE__ */ new Map();
		/** 安装器 syslog 收集（rd.syslog/inst.remotelog → 实时安装日志） */
		syslog = null;
		/** BMC 拉盘请求计数（节流日志用） */
		isoFetchCount = 0;
		/** 每任务已装 RPM 计数（逐包日志 + 进度映射） */
		rpmCounts = /* @__PURE__ */ new Map();
		/** 每任务已记录过的仓库元数据/install.img（去重） */
		repoSeen = /* @__PURE__ */ new Map();
		/** syslog 入任务日志的节流时间戳 */
		lastSyslogAt = 0;
		root = null;
		/** 状态懒加载：DSH web 启动阶段零读盘零日志，首次实际使用才加载 */
		stateLoaded = false;
		/** 任务保留期清扫定时器（服务运行期间每小时一次） */
		sweepTimer = null;
		cfg = {
			storageRoot: "",
			taskRetentionDays: 7
		};
		cfgFile = null;
		queueRunning = false;
		constructor(ctx) {
			super(ctx, "osDeploy");
			const sp = ctx.get("sandboxPolicy");
			if (sp && typeof sp.workspaceRoot === "string" && sp.workspaceRoot) this.root = sp.workspaceRoot.replace(/[\\/]+$/, "");
			this.cfgFile = this.root ? path.join(this.root, "dsh-os-deploy-config.json") : null;
			this.loadConfig();
			ctx.on("dispose", () => {
				if (this.httpServer) this.httpServer.stop();
				if (this.syslog) this.syslog.stop();
				if (this.sweepTimer) clearInterval(this.sweepTimer);
				for (const [, r] of this.runners) r.cancel();
			});
		}
		get storageRoot() {
			return this.cfg.storageRoot || path.join(this.root || process.cwd(), "osdeploy-data");
		}
		repoDirOf(distroId) {
			return path.join(this.storageRoot, "repo", distroId);
		}
		isoDirPath() {
			return path.join(this.storageRoot, "iso");
		}
		taskDirOf(taskId) {
			return path.join(this.storageRoot, "tasks", taskId);
		}
		logsDirPath() {
			return path.join(this.storageRoot, "logs");
		}
		statePath() {
			return path.join(this.storageRoot, "state.json");
		}
		/** 升级前的旧数据根（存在则提示可迁移/清理） */
		legacyRoot() {
			const legacy = this.root ? path.join(this.root, "os-deploy-repo") : null;
			return legacy && fs.existsSync(legacy) ? this.root : null;
		}
		loadConfig() {
			if (!this.cfgFile || !fs.existsSync(this.cfgFile)) return;
			try {
				const raw = JSON.parse(fs.readFileSync(this.cfgFile, "utf8"));
				if (typeof raw.storageRoot === "string" && raw.storageRoot) this.cfg.storageRoot = raw.storageRoot;
				if (typeof raw.taskRetentionDays === "number" && raw.taskRetentionDays >= 0) this.cfg.taskRetentionDays = raw.taskRetentionDays;
			} catch {}
		}
		saveConfig() {
			if (!this.cfgFile) return;
			try {
				fs.writeFileSync(this.cfgFile, JSON.stringify(this.cfg, null, 2), "utf8");
			} catch {}
		}
		/** 状态懒加载（含旧版 state.json 迁移到 storageRoot） */
		ensureState() {
			if (this.stateLoaded) return;
			this.stateLoaded = true;
			const readState = (file) => {
				const data = JSON.parse(fs.readFileSync(file, "utf8"));
				this.images = data.images || [];
				this.tasks = /* @__PURE__ */ new Map();
				for (const t of data.tasks || []) this.tasks.set(t.id, t);
			};
			try {
				const p = this.statePath();
				if (fs.existsSync(p)) {
					readState(p);
					return;
				}
				const legacy = this.root ? path.join(this.root, "dsh-os-deploy-state.json") : null;
				if (legacy && fs.existsSync(legacy)) {
					readState(legacy);
					this.save();
					try {
						fs.renameSync(legacy, legacy + ".migrated");
					} catch {}
				}
			} catch {}
		}
		async getConfig() {
			return {
				config: {
					storageRoot: this.storageRoot,
					taskRetentionDays: this.cfg.taskRetentionDays
				},
				legacyRoot: this.legacyRoot()
			};
		}
		async setConfig(req) {
			try {
				if (req.storageRoot !== void 0) {
					const p = req.storageRoot.trim();
					if (!p) return {
						ok: false,
						error: "存储路径不能为空"
					};
					fs.mkdirSync(p, { recursive: true });
					this.cfg.storageRoot = p;
				}
				if (req.taskRetentionDays !== void 0) {
					const d = Math.floor(Number(req.taskRetentionDays));
					if (!Number.isFinite(d) || d < 0 || d > 3650) return {
						ok: false,
						error: "保留天数需为 0-3650（0 = 不自动删除）"
					};
					this.cfg.taskRetentionDays = d;
				}
				this.saveConfig();
				if (this.stateLoaded) this.save();
				return {
					ok: true,
					config: {
						storageRoot: this.storageRoot,
						taskRetentionDays: this.cfg.taskRetentionDays
					}
				};
			} catch (e) {
				return {
					ok: false,
					error: String(e?.message || e)
				};
			}
		}
		async serviceStatus() {
			this.ensureState();
			return {
				running: this.serverRunning,
				port: HTTP_PORT,
				startedAt: this.serverStartedAt,
				imageCount: this.images.length,
				taskCount: this.tasks.size,
				activeTaskCount: Array.from(this.tasks.values()).filter((t) => t.status === "running" || t.status === "queued").length
			};
		}
		async serviceStart() {
			try {
				if (this.serverRunning) return {
					ok: true,
					status: await this.serviceStatus()
				};
				this.ensureState();
				this.httpServer = new DeployHttpServer(HTTP_PORT, HTTPS_PORT);
				this.httpServer.onReport((query, ip) => this.handleReport(query, ip));
				this.isoFetchCount = 0;
				this.httpServer.onAccess(({ path: p, method, status, bytes, ip }) => this.onRepoAccess(p, method, status, bytes, ip));
				fs.mkdirSync(this.isoDirPath(), { recursive: true });
				this.httpServer.setRoot("/iso", this.isoDirPath());
				fs.mkdirSync(path.join(this.storageRoot, "ks"), { recursive: true });
				this.httpServer.setRoot("/ks", path.join(this.storageRoot, "ks"));
				const tls = this.ensureTls();
				await this.httpServer.start(tls);
				fs.mkdirSync(this.logsDirPath(), { recursive: true });
				this.syslog = new SyslogCollector(SYSLOG_PORT, path.join(this.logsDirPath(), "syslog.log"));
				this.syslog.onLine = ({ ip, msg }) => this.onSyslogLine(ip, msg);
				try {
					await this.syslog.start();
				} catch (e) {
					this.syslog = null;
					this.addSvcNote(`syslog :${SYSLOG_PORT} 监听失败（${e?.message || e}）——安装器实时日志不可用`);
				}
				for (const img of this.images) if (img.extracted && img.extractedDir) this.httpServer.setRoot(`/repo/${img.distroId}`, img.extractedDir);
				if (!this.httpServer.httpsUp) this.addSvcNote(`HTTPS :${HTTPS_PORT} 未就绪（${this.httpServer.httpsError}）——虚拟光驱挂载将失败`);
				this.serverRunning = true;
				this.serverStartedAt = Date.now();
				console.log(`[osdeploy] service started: storage=${this.storageRoot} HTTP:${HTTP_PORT} HTTPS:${HTTPS_PORT}`);
				this.sweepExpiredTasks();
				if (this.sweepTimer) clearInterval(this.sweepTimer);
				this.sweepTimer = setInterval(() => this.sweepExpiredTasks(), 36e5);
				this.processQueue();
				return {
					ok: true,
					status: await this.serviceStatus()
				};
			} catch (e) {
				this.httpServer = null;
				return {
					ok: false,
					error: String(e?.message || e)
				};
			}
		}
		/** /iso 与 /repo 访问观测——安装过程的关键遥测 */
		onRepoAccess(p, method, status, bytes, ip) {
			try {
				if (p.startsWith("/iso/")) {
					this.isoFetchCount++;
					if (this.isoFetchCount === 1 || this.isoFetchCount % 100 === 0) {
						console.log(`[osdeploy] virtual CD fetch #${this.isoFetchCount}: ${method} ${status} from ${ip}`);
						const task = this.runningTaskBy(ip, "bmcHost");
						if (task) this.addLog(task, "info", `虚拟光驱被 BMC 拉取 (req #${this.isoFetchCount}: ${method} ${status})`);
					}
					return;
				}
				if (!p.startsWith("/repo/")) return;
				const task = this.runningTaskBy(ip, "osIp");
				if (!task) return;
				if (/install\.img$/i.test(p)) {
					if (!this.repoSeen.get(task.id + ":install.img")) {
						this.repoSeen.set(task.id + ":install.img", 1);
						this.addLog(task, "info", "正在加载安装器 stage2 (install.img)");
						task.stage = "stage2-loading";
					}
					return;
				}
				if (/\.rpm$/i.test(p) || /\.deb$/i.test(p)) {
					const n = (this.rpmCounts.get(task.id) || 0) + 1;
					this.rpmCounts.set(task.id, n);
					const pkg = (p.split("/").pop() || "").replace(/\.(rpm|deb)$/i, "");
					this.addLog(task, "info", `安装软件包 #${n}: ${pkg}`);
					task.stage = "installing-rpms";
					task.progress = Math.max(task.progress, Math.min(45 + Math.floor(n * .12), 85));
					return;
				}
				const key = task.id + ":meta:" + p;
				if (!this.repoSeen.has(key)) {
					this.repoSeen.set(key, 1);
					const meta = p.split("/").pop() || p;
					this.addLog(task, "info", `加载仓库元数据: ${meta}`);
					task.stage = "repo-metadata";
				}
			} catch {}
		}
		/** 安装器 syslog 行 → 过滤关键事件入任务日志（全量原文已落盘 syslog.log） */
		onSyslogLine(ip, msg) {
			try {
				const l = msg.replace(/\s+/g, " ").trim();
				if (!l) return;
				const task = this.runningTaskBy(ip, "osIp");
				if (!task) return;
				try {
					fs.appendFileSync(path.join(this.taskDirOf(task.id), "anaconda.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${l}\n`, "utf8");
				} catch {}
				if (!/error|traceback|terminate|fatal|fail|exception|storage|kickstart|payload|metadata|partition|mounting|installing|transaction|bootload|multipath|blivet|started|finished|anaconda|network|dhcp|addr|dnf|rpm/i.test(l)) return;
				const now = Date.now();
				if (now - this.lastSyslogAt < 1500) return;
				this.lastSyslogAt = now;
				this.addLog(task, "info", `[anaconda] ${l.slice(0, 260)}`);
			} catch {}
		}
		runningTaskBy(ip, field) {
			for (const [, t] of this.tasks) if (t.status === "running" && t.device[field] === ip) return t;
			return null;
		}
		/** 确保 <root>/certs/ 下有 TLS 证书（虚拟光驱 HTTPS 用）；缺失则落盘内嵌默认自签对。 */
		ensureTls() {
			try {
				const dir = path.join(this.root || process.cwd(), "certs");
				const crt = path.join(dir, "server.crt");
				const key = path.join(dir, "server.key");
				if (!fs.existsSync(crt) || !fs.existsSync(key)) {
					fs.mkdirSync(dir, { recursive: true });
					fs.writeFileSync(crt, DEFAULT_TLS_CERT, "utf8");
					fs.writeFileSync(key, DEFAULT_TLS_KEY, "utf8");
					console.log("[osdeploy] wrote default self-signed TLS cert for virtual media HTTPS");
				}
				return {
					cert: fs.readFileSync(crt, "utf8"),
					key: fs.readFileSync(key, "utf8")
				};
			} catch (e) {
				console.error("[osdeploy] TLS cert setup failed:", e?.message || e);
				return;
			}
		}
		addSvcNote(note) {
			console.warn(`[osdeploy] ${note}`);
		}
		async serviceStop() {
			try {
				for (const [, r] of this.runners) r.cancel();
				this.runners.clear();
				for (const [, t] of this.tasks) if (t.status === "queued") {
					t.status = "cancelled";
					t.finishedAt = Date.now();
				} else if (t.status === "running") {
					t.status = "failed";
					t.error = "服务已停止";
					t.finishedAt = Date.now();
				}
				this.queueRunning = false;
				if (this.httpServer) {
					this.httpServer.stop();
					this.httpServer = null;
				}
				if (this.syslog) {
					this.syslog.stop();
					this.syslog = null;
				}
				if (this.sweepTimer) {
					clearInterval(this.sweepTimer);
					this.sweepTimer = null;
				}
				this.serverRunning = false;
				this.serverStartedAt = null;
				this.rpmCounts.clear();
				this.repoSeen.clear();
				this.save();
				console.log("[osdeploy] service stopped");
				return {
					ok: true,
					status: await this.serviceStatus()
				};
			} catch (e) {
				return {
					ok: false,
					error: String(e?.message || e)
				};
			}
		}
		async serviceRestart() {
			await this.serviceStop();
			return this.serviceStart();
		}
		save() {
			try {
				fs.mkdirSync(this.storageRoot, { recursive: true });
				fs.writeFileSync(this.statePath(), JSON.stringify({
					images: this.images,
					tasks: Array.from(this.tasks.values())
				}, null, 2));
			} catch (e) {
				console.error("[osdeploy] save state error:", e);
			}
		}
		/** 终态任务保留期清扫：到期任务连同任务目录一起删除 */
		sweepExpiredTasks() {
			if (this.cfg.taskRetentionDays <= 0) return;
			const cutoff = Date.now() - this.cfg.taskRetentionDays * 864e5;
			const expired = [];
			for (const [id, t] of this.tasks) {
				if (t.status === "queued" || t.status === "running") continue;
				const end = t.finishedAt || t.createdAt;
				if (end && end < cutoff) expired.push(id);
			}
			for (const id of expired) {
				const t = this.tasks.get(id);
				this.tasks.delete(id);
				this.removeTaskDir(id);
				if (t) console.log(`[osdeploy] task ${id} expired after ${this.cfg.taskRetentionDays}d (auto-removed)`);
			}
			if (expired.length) this.save();
		}
		/** 删除任务目录（详细安装日志等）与迷你 ISO 残留 */
		removeTaskDir(taskId) {
			try {
				const dir = this.taskDirOf(taskId);
				if (fs.existsSync(dir)) fs.rmSync(dir, {
					recursive: true,
					force: true
				});
				const iso = path.join(this.isoDirPath(), `${taskId}.iso`);
				if (fs.existsSync(iso)) fs.rmSync(iso, { force: true });
				this.rpmCounts.delete(taskId);
				for (const k of Array.from(this.repoSeen.keys())) if (k.startsWith(taskId + ":")) this.repoSeen.delete(k);
			} catch {}
		}
		/**
		* 找任一已解包 anaconda 系镜像（openEuler/麒麟）的 efiboot.img，
		* 供 Debian 的 HTTP-boot 迷你 ISO 借用 grub 引导镜像
		* （Debian 自家 grub 未编译 http/efinet 模块，无法经网络拉取 kernel/initrd）。
		*/
		findAnacondaEfiBoot() {
			for (const img of this.images) {
				if (img.vendor !== "openEuler" && img.vendor !== "kylin") continue;
				if (!img.extracted || !img.extractedDir) continue;
				const p = path.join(img.extractedDir, "images", "efiboot.img");
				if (fs.existsSync(p)) return p;
			}
		}
		async listServers() {
			try {
				const invFile = this.root ? path.join(this.root, "dsh-server-inventory.json") : null;
				if (invFile && fs.existsSync(invFile)) {
					const data = JSON.parse(fs.readFileSync(invFile, "utf8"));
					return { servers: (data.servers || data || []).map((s) => ({
						id: s.id || s.host,
						name: s.name || s.host,
						host: s.host || s.sshHost || "",
						bmcHost: s.bmcHost || s.bmc_host || "",
						bmcUser: s.bmcUser || s.bmc_user || "",
						sshUser: s.sshUser || "root"
					})) };
				}
			} catch (e) {}
			return { servers: [] };
		}
		/** 列出可用根：win32 枚举存在的盘符，其余平台返回 '/'。 */
		listRoots() {
			if (process.platform === "win32") {
				const out = [];
				for (let c = 65; c <= 90; c++) {
					const drive = String.fromCharCode(c) + ":\\";
					try {
						fs.accessSync(drive);
						out.push(drive);
					} catch {}
				}
				return out;
			}
			return ["/"];
		}
		/**
		* 浏览目录：返回子目录与文件（含大小），供面板「选择 ISO」弹窗使用。
		* 无 path 时从用户主目录开始；不可读目录返回 error（面包屑仍可回退）。
		* 单层最多返回 2000 条（truncated 标记），防御超大目录拖慢 UI。
		*/
		async browsePath(req) {
			const home = os.homedir();
			const roots = this.listRoots();
			const empty = (p, err) => ({
				path: p,
				parent: null,
				home,
				roots,
				entries: [],
				truncated: false,
				error: err
			});
			try {
				let target = req.path && req.path.trim() ? path.resolve(req.path.trim()) : home;
				if (!fs.statSync(target).isDirectory()) target = path.dirname(target);
				const parent = path.dirname(target) === target ? null : path.dirname(target);
				const dirents = fs.readdirSync(target, { withFileTypes: true });
				const entries = [];
				for (const d of dirents) {
					const full = path.join(target, d.name);
					let isDir = d.isDirectory();
					let sizeBytes = null;
					try {
						const s2 = fs.statSync(full);
						isDir = s2.isDirectory();
						if (!isDir) sizeBytes = s2.size;
					} catch {}
					entries.push({
						name: d.name,
						path: full,
						isDir,
						sizeBytes
					});
					if (entries.length >= 2e3) break;
				}
				const truncated = entries.length >= 2e3 && dirents.length > entries.length;
				entries.sort((a, b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1);
				return {
					path: target,
					parent,
					home,
					roots,
					entries,
					truncated
				};
			} catch (e) {
				return empty(home, String(e?.message || e));
			}
		}
		async registerIso(req) {
			this.ensureState();
			try {
				if (!req.isoPath || !fs.existsSync(req.isoPath)) return {
					ok: false,
					error: `ISO file not found: ${req.isoPath}`
				};
				if (![
					"openEuler",
					"kylin",
					"debian"
				].includes(req.vendor)) return {
					ok: false,
					error: `Unsupported vendor: ${req.vendor} (openEuler/kylin/debian)`
				};
				const stat = fs.statSync(req.isoPath);
				const id = "img_" + crypto.randomBytes(6).toString("hex");
				const distroId = path.basename(req.isoPath, ".iso").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
				const image = {
					id,
					name: req.name || path.basename(req.isoPath),
					vendor: req.vendor,
					isoPath: req.isoPath,
					distroId,
					extractedDir: null,
					extracted: false,
					sizeBytes: stat.size,
					registeredAt: Date.now()
				};
				this.images.push(image);
				this.save();
				return {
					ok: true,
					image
				};
			} catch (e) {
				return {
					ok: false,
					error: String(e.message || e)
				};
			}
		}
		async extractImage(req) {
			this.ensureState();
			const img = this.images.find((i) => i.id === req.imageId);
			if (!img) return {
				ok: false,
				error: "image not found"
			};
			if (img.extracted && img.extractedDir) return { ok: true };
			const outDir = this.repoDirOf(img.distroId);
			const result = extractIso(img.isoPath, outDir);
			if (result.ok) {
				img.extracted = true;
				img.extractedDir = outDir;
				if (this.httpServer) this.httpServer.setRoot(`/repo/${img.distroId}`, outDir);
				this.save();
				return { ok: true };
			}
			return {
				ok: false,
				error: result.error || "extraction failed"
			};
		}
		async deleteImage(req) {
			this.ensureState();
			const idx = this.images.findIndex((i) => i.id === req.imageId);
			if (idx < 0) return {
				ok: false,
				error: "image not found"
			};
			const img = this.images[idx];
			if (Array.from(this.tasks.values()).some((t) => t.status === "running" && t.imageId === img.id)) return {
				ok: false,
				error: "该镜像有正在运行的安装任务，请先等任务结束"
			};
			if (this.httpServer) this.httpServer.removeRoot(`/repo/${img.distroId}`);
			if (img.extractedDir && fs.existsSync(img.extractedDir)) try {
				fs.rmSync(img.extractedDir, {
					recursive: true,
					force: true
				});
				console.log(`[osdeploy] removed extracted repo: ${img.extractedDir}`);
			} catch (e) {
				console.error(`[osdeploy] failed to remove extracted repo: ${e?.message || e}`);
			}
			this.images.splice(idx, 1);
			this.save();
			return { ok: true };
		}
		async listImages() {
			this.ensureState();
			return { images: this.images };
		}
		async listComponents(req) {
			return { components: COMPONENTS[req.vendor] || [] };
		}
		async probeDevice(req) {
			try {
				const rf = new RedfishClient({
					host: req.bmcHost,
					user: req.bmcUser,
					pass: req.bmcPassword
				});
				const sys = await rf.getSystem();
				const storages = await rf.getStorage();
				const disks = [];
				let nicMac = "";
				if (storages) for (const s of storages) for (const d of s.driveDetails || []) disks.push({
					id: d.Id || "",
					name: d.Name || d.Id || "",
					serial: (d.SerialNumber || "").trim(),
					capacityBytes: d.CapacityBytes || 0,
					media: d.MediaType || "HDD",
					protocol: d.Protocol || ""
				});
				if (disks.length === 0) {
					const drives = await rf.getChassisDrives();
					for (const d of drives) disks.push({
						id: d.Id || "",
						name: d.Name || d.Id || "",
						serial: (d.SerialNumber || "").trim(),
						capacityBytes: d.CapacityBytes || 0,
						media: d.MediaType || "HDD",
						protocol: d.Protocol || ""
					});
				}
				try {
					const eth = await rf.get("/redfish/v1/Systems/1/EthernetInterfaces");
					if (eth.status === 200 && eth.json.Members) {
						const first = await rf.get(eth.json.Members[0]["@odata.id"]);
						if (first.status === 200) nicMac = first.json.MACAddress || "";
					}
				} catch (e) {}
				return {
					ok: true,
					model: sys.Model || "",
					serial: sys.SerialNumber || "",
					powerState: sys.PowerState || "",
					nicMac,
					disks
				};
			} catch (e) {
				return {
					ok: false,
					error: String(e.message || e)
				};
			}
		}
		async createTask(req) {
			this.ensureState();
			try {
				if (!this.serverRunning) return {
					ok: false,
					error: "部署服务未启动，请先在面板点击「启动」"
				};
				if (!this.images.find((i) => i.id === req.imageId)) return {
					ok: false,
					error: "image not found"
				};
				if (!req.devices || req.devices.length === 0) return {
					ok: false,
					error: "no devices"
				};
				const taskIds = [];
				for (const device of req.devices) {
					const id = "task_" + crypto.randomBytes(6).toString("hex");
					const task = {
						id,
						imageId: req.imageId,
						device,
						components: req.components || ["core"],
						status: "queued",
						createdAt: Date.now(),
						startedAt: null,
						finishedAt: null,
						progress: 0,
						stage: "queued",
						logs: [],
						error: null,
						queueKey: device.bmcHost
					};
					this.tasks.set(id, task);
					taskIds.push(id);
				}
				this.save();
				this.processQueue();
				return {
					ok: true,
					taskIds
				};
			} catch (e) {
				return {
					ok: false,
					error: String(e.message || e)
				};
			}
		}
		async listTasks() {
			this.ensureState();
			return { tasks: Array.from(this.tasks.values()) };
		}
		async getTaskDetail(req) {
			this.ensureState();
			const task = this.tasks.get(req.taskId);
			if (!task) return {
				task: null,
				error: "task not found"
			};
			return { task };
		}
		async cancelTask(req) {
			this.ensureState();
			const task = this.tasks.get(req.taskId);
			if (!task) return {
				ok: false,
				error: "task not found"
			};
			if (task.status === "running") {
				const runner = this.runners.get(req.taskId);
				if (runner) runner.cancel();
				task.status = "cancelled";
				task.finishedAt = Date.now();
			} else if (task.status === "queued") {
				task.status = "cancelled";
				task.finishedAt = Date.now();
			}
			this.save();
			return { ok: true };
		}
		async deleteTask(req) {
			this.ensureState();
			const task = this.tasks.get(req.taskId);
			if (!task) return {
				ok: false,
				error: "task not found"
			};
			if (task.status === "running") return {
				ok: false,
				error: "cannot delete running task (cancel first)"
			};
			this.tasks.delete(req.taskId);
			this.removeTaskDir(req.taskId);
			this.save();
			return { ok: true };
		}
		processQueue() {
			if (this.queueRunning) return;
			this.queueRunning = true;
			this.runNextFromQueue();
		}
		runNextFromQueue() {
			const runningKeys = new Set(Array.from(this.tasks.values()).filter((t) => t.status === "running").map((t) => t.queueKey));
			const next = Array.from(this.tasks.values()).filter((t) => t.status === "queued" && !runningKeys.has(t.queueKey)).sort((a, b) => a.createdAt - b.createdAt)[0];
			if (!next) {
				this.queueRunning = false;
				return;
			}
			this.runTask(next).then(() => {
				this.runNextFromQueue();
			}).catch((e) => {
				console.error("[osdeploy] task error:", e);
				this.runNextFromQueue();
			});
		}
		async runTask(task) {
			const img = this.images.find((i) => i.id === task.imageId);
			if (!img) {
				task.status = "failed";
				task.error = "image not found";
				this.save();
				return;
			}
			try {
				fs.mkdirSync(this.taskDirOf(task.id), { recursive: true });
			} catch {}
			if (!img.extracted) {
				task.status = "running";
				task.startedAt = Date.now();
				this.addLog(task, "info", `Extracting ISO: ${img.name}...`);
				const outDir = this.repoDirOf(img.distroId);
				const result = extractIso(img.isoPath, outDir);
				if (result.ok) {
					img.extracted = true;
					img.extractedDir = outDir;
					if (this.httpServer) this.httpServer.setRoot(`/repo/${img.distroId}`, outDir);
					this.save();
					this.addLog(task, "info", "ISO extracted successfully");
				} else {
					task.status = "failed";
					task.error = `ISO extraction failed: ${result.error}`;
					task.finishedAt = Date.now();
					this.addLog(task, "error", task.error);
					this.save();
					return;
				}
			}
			if (img.vendor === "debian" && img.extractedDir) {
				const assets = ensureDebianRepoAssets(img.extractedDir);
				if (!assets.ok) {
					task.status = "failed";
					task.error = assets.error;
					task.finishedAt = Date.now();
					this.addLog(task, "error", task.error);
					this.save();
					return;
				}
				if (assets.warning) this.addLog(task, "info", assets.warning);
				this.addLog(task, "info", "Debian netboot assets ready (netboot-kernel / netboot-initrd.gz)");
			}
			task.status = "running";
			task.startedAt = Date.now();
			this.addLog(task, "info", `Starting deployment to ${task.device.bmcHost}...`);
			this.rpmCounts.delete(task.id);
			for (const k of Array.from(this.repoSeen.keys())) if (k.startsWith(task.id + ":")) this.repoSeen.delete(k);
			const serverIp = await getRouteIp(task.device.bmcHost);
			this.addLog(task, "info", `Server IP (routed to ${task.device.bmcHost}): ${serverIp}`);
			const spec = {
				bmc: {
					host: task.device.bmcHost,
					user: task.device.bmcUser,
					pass: task.device.bmcPassword
				},
				nicMac: task.device.nicMac,
				nicInterface: task.device.nicInterface || "",
				hostname: task.device.hostname,
				osIp: task.device.osIp,
				osGateway: task.device.osGateway,
				osPrefixLen: task.device.osPrefixLen,
				osDns: task.device.osDns,
				rootPassword: task.device.rootPassword,
				diskSn: task.device.diskSn || "",
				diskCapacityBytes: task.device.diskCapacityBytes || 0,
				distroId: img.distroId,
				vendor: img.vendor,
				repoDir: img.extractedDir || "",
				components: task.components,
				taskId: task.id,
				isoOutDir: this.isoDirPath(),
				ksDir: path.join(this.storageRoot, "ks"),
				efiBootSrc: img.vendor === "debian" ? this.findAnacondaEfiBoot() : void 0
			};
			const runner = new DeployRunner(spec, serverIp, HTTP_PORT, (stage, progress, log) => {
				task.stage = stage;
				if (progress >= 0) task.progress = Math.max(task.progress, progress);
				if (log) this.addLog(task, "info", log);
			});
			this.runners.set(task.id, runner);
			const result = await runner.run();
			this.runners.delete(task.id);
			if (result.ok) {
				task.status = "success";
				task.progress = 100;
				this.addLog(task, "success", "OS installation completed successfully!");
			} else {
				task.status = "failed";
				task.error = result.error || "unknown error";
				this.addLog(task, "error", `Deployment failed: ${task.error}`);
			}
			task.finishedAt = Date.now();
			const taskIso = path.join(spec.isoOutDir, `${task.id}.iso`);
			try {
				if (fs.existsSync(taskIso)) {
					fs.rmSync(taskIso, { force: true });
					console.log(`[osdeploy] cleaned mini-ISO: ${taskIso}`);
				}
			} catch {}
			this.save();
		}
		handleReport(query, ip) {
			const stage = query.get("stage") || "";
			const data = query.get("d") || "";
			const taskTag = query.get("task") || "";
			console.log(`[osdeploy] report from ${ip}: stage=${stage} task=${taskTag} d=${data.slice(0, 100)}`);
			for (const [, task] of this.tasks) {
				if (task.status !== "running") continue;
				const byTag = taskTag && taskTag === task.id;
				const byIp = !taskTag && task.device.osIp === ip;
				if (!byTag && !byIp) continue;
				if (byTag) this.runners.get(task.id)?.markReport(stage);
				this.addLog(task, "info", `[installer] ${stage}: ${data}${byTag ? "" : "（未带任务标识）"}`);
				const stageProgress = {
					"pre-start": 30,
					"cmdline": 32,
					"disks": 34,
					"disk-resolved": 36,
					"pre-done": 38,
					"include-uploaded": 40,
					"post-install": 85,
					"firstboot": 95,
					"early-apt-config": 27
				};
				if (stage in stageProgress) {
					task.progress = stageProgress[stage];
					task.stage = stage;
				}
				this.save();
				break;
			}
		}
		addLog(task, level, msg) {
			const ts = Date.now();
			task.logs.push({
				ts,
				level,
				msg
			});
			if (task.logs.length > 2e3) task.logs.splice(0, task.logs.length - 2e3);
			try {
				const dir = this.taskDirOf(task.id);
				const line = `${new Date(ts).toISOString()} [${level}] ${msg}\n`;
				fs.appendFileSync(path.join(dir, "install.log"), line, "utf8");
			} catch {}
		}
	};
})();
//#endregion
export { OsDeployService as default, ensureDebianRepoAssets, genDebianHttpGrubCfg, genKickstart, genPreseed };
