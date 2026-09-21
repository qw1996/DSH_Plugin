import { createRequire } from "node:module";
import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as http from "http";
import * as https from "https";
import { execFileSync } from "child_process";
//#region \0rolldown/runtime.js
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region src/engine.ts
var RedfishClient = class {
	host;
	user;
	pass;
	token = null;
	constructor(bmc) {
		this.host = bmc.host;
		this.user = bmc.user;
		this.pass = bmc.pass;
	}
	req(method, uri, body, extraHeaders) {
		return new Promise((resolve, reject) => {
			const data = body !== void 0 ? JSON.stringify(body) : null;
			const headers = {
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Content-Length": data ? String(Buffer.byteLength(data)) : "0",
				...extraHeaders
			};
			if (this.token) headers["X-Auth-Token"] = this.token;
			else headers["Authorization"] = "Basic " + Buffer.from(`${this.user}:${this.pass}`).toString("base64");
			const r = https.request({
				host: this.host,
				path: uri,
				method,
				headers,
				rejectUnauthorized: false,
				timeout: 3e4
			}, (res) => {
				let buf = "";
				res.on("data", (c) => {
					buf += c;
				});
				res.on("end", () => {
					let json = null;
					try {
						json = buf ? JSON.parse(buf) : null;
					} catch (e) {}
					resolve({
						status: res.statusCode,
						headers: res.headers,
						json,
						raw: buf
					});
				});
			});
			r.on("error", reject);
			r.on("timeout", () => r.destroy(/* @__PURE__ */ new Error("request timeout")));
			if (data) r.write(data);
			r.end();
		});
	}
	get(u) {
		return this.req("GET", u);
	}
	post(u, b) {
		return this.req("POST", u, b);
	}
	patch(u, b, extra) {
		return this.req("PATCH", u, b, extra);
	}
	async getSystem() {
		const r = await this.get("/redfish/v1/Systems/1");
		if (r.status !== 200) throw new Error(`getSystem -> HTTP ${r.status}`);
		return r.json;
	}
	async getStorage() {
		try {
			const r = await this.get("/redfish/v1/Systems/1/Storage");
			if (r.status !== 200) return null;
			const storages = [];
			for (const m of r.json.Members || []) {
				const sr = await this.get(m["@odata.id"]);
				if (sr.status === 200) storages.push(sr.json);
			}
			for (const s of storages) {
				if (s.Drives) {
					s.driveDetails = [];
					for (const d of s.Drives) {
						const dr = await this.get(d["@odata.id"]);
						if (dr.status === 200) s.driveDetails.push(dr.json);
					}
				}
				if (s.Volumes) {
					const vr = await this.get(s.Volumes["@odata.id"]);
					if (vr.status === 200) {
						s.volumeDetails = [];
						for (const v of (vr.json.Members || []).slice(0, 5)) {
							const vm = await this.get(v["@odata.id"]);
							if (vm.status === 200) s.volumeDetails.push(vm.json);
						}
					}
				}
			}
			return storages;
		} catch (e) {
			return null;
		}
	}
	async patchSystem(body) {
		const g = await this.get("/redfish/v1/Systems/1");
		const etag = g.headers && g.headers["etag"];
		const extra = {};
		if (etag) extra["If-Match"] = etag;
		const r = await this.patch("/redfish/v1/Systems/1", body, extra);
		if (r.status !== 200 && r.status !== 204) throw new Error(`patchSystem -> HTTP ${r.status} ${r.raw ? r.raw.slice(0, 200) : ""}`);
	}
	async setBootOnce(target) {
		await this.patchSystem({ Boot: {
			BootSourceOverrideEnabled: "Once",
			BootSourceOverrideTarget: target
		} });
	}
	async power(action) {
		const r = await this.post("/redfish/v1/Systems/1/Actions/ComputerSystem.Reset", { ResetType: action });
		if (r.status !== 200 && r.status !== 204) throw new Error(`power ${action} -> HTTP ${r.status}`);
	}
	async vmediaConnect(imageUrl) {
		const r = await this.post("/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl", {
			VmmControlType: "Connect",
			Image: imageUrl
		});
		if (r.status >= 400) throw new Error(`vmediaConnect -> HTTP ${r.status}`);
	}
	async vmediaDisconnect() {
		const r = await this.post("/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl", { VmmControlType: "Disconnect" });
		if (r.status >= 400) throw new Error(`vmediaDisconnect -> HTTP ${r.status}`);
	}
	async vmediaStatus() {
		const r = await this.get("/redfish/v1/Managers/1/VirtualMedia/CD");
		if (r.status !== 200) throw new Error(`vmediaStatus -> HTTP ${r.status}`);
		return r.json;
	}
};
var DeployHttpServer = class {
	server = null;
	port;
	roots = /* @__PURE__ */ new Map();
	reportHandler = null;
	constructor(port) {
		this.port = port;
	}
	setRoot(prefix, dir) {
		this.roots.set(prefix, dir);
	}
	removeRoot(prefix) {
		this.roots.delete(prefix);
	}
	onReport(handler) {
		this.reportHandler = handler;
	}
	start() {
		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				try {
					this.handle(req, res);
				} catch (e) {
					res.writeHead(500);
					res.end("error");
				}
			});
			this.server.on("error", reject);
			this.server.listen(this.port, "0.0.0.0", () => resolve());
		});
	}
	stop() {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
	handle(req, res) {
		const u = new URL(req.url || "/", "http://localhost");
		const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
		if (u.pathname === "/report" || u.pathname === "/report/") {
			const q = u.searchParams;
			if (this.reportHandler) this.reportHandler(q, ip);
			res.writeHead(200);
			res.end("ok");
			return;
		}
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405);
			res.end();
			return;
		}
		let pathname = u.pathname;
		try {
			pathname = decodeURIComponent(u.pathname);
		} catch (e) {}
		const prefix = Array.from(this.roots.keys()).filter((p) => pathname === p || pathname.startsWith(p + "/") || p === "/").sort((a, b) => b.length - a.length)[0];
		if (!prefix) {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		const rel = pathname.slice(prefix === "/" ? 0 : prefix.length).replace(/^\/+/, "");
		const fp = path.join(this.roots.get(prefix), rel);
		const rootAbs = path.resolve(this.roots.get(prefix));
		if (!path.resolve(fp).startsWith(rootAbs)) {
			res.writeHead(403);
			res.end();
			return;
		}
		fs.stat(fp, (e, st) => {
			if (e || !st.isFile()) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			const total = st.size;
			let start = 0, end = total - 1, code = 200;
			const range = req.headers["range"];
			if (range) {
				const m = /^bytes=(\d*)-(\d*)$/.exec(String(range));
				if (m) {
					if (m[1]) start = parseInt(m[1]);
					if (m[2]) end = Math.min(parseInt(m[2]), total - 1);
					else end = total - 1;
					code = 206;
				}
			}
			const len = end - start + 1;
			res.writeHead(code, {
				"Content-Length": len,
				"Accept-Ranges": "bytes",
				...code === 206 ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}
			});
			if (req.method === "HEAD") {
				res.end();
				return;
			}
			const stream = fs.createReadStream(fp, {
				start,
				end
			});
			stream.on("error", () => {
				try {
					res.destroy();
				} catch (e) {}
			});
			stream.pipe(res);
		});
	}
};
function extractIso(isoPath, outDir) {
	try {
		fs.mkdirSync(outDir, { recursive: true });
		execFileSync("tar", [
			"-xf",
			isoPath,
			"-C",
			outDir
		], {
			timeout: 6e5,
			stdio: "pipe"
		});
		return { ok: true };
	} catch (e) {
		const hasPackages = fs.existsSync(path.join(outDir, "Packages")) || fs.existsSync(path.join(outDir, "pool"));
		const hasDists = fs.existsSync(path.join(outDir, "dists")) || fs.existsSync(path.join(outDir, ".treeinfo"));
		if (hasPackages || hasDists) return { ok: true };
		return {
			ok: false,
			error: String(e.message || e)
		};
	}
}
var DeployRunner = class {
	rf;
	spec;
	serverIp;
	httpPort;
	progress;
	cancelled = false;
	constructor(spec, serverIp, httpPort, progress) {
		this.spec = spec;
		this.serverIp = serverIp;
		this.httpPort = httpPort;
		this.progress = progress;
		this.rf = new RedfishClient(spec.bmc);
	}
	cancel() {
		this.cancelled = true;
	}
	async run() {
		try {
			this.progress("preflight", 2, "Probing BMC...");
			const sys = await this.rf.getSystem();
			this.progress("preflight", 5, `BMC ok: ${sys.Model || "unknown"} power=${sys.PowerState}`);
			if (this.cancelled) return {
				ok: false,
				error: "cancelled"
			};
			this.progress("building", 8, "Preparing boot image...");
			this.progress("mounting", 12, "Mounting virtual CD...");
			const imageUrl = `https://${this.serverIp}/iso/deploy.iso`;
			await this.rf.vmediaConnect(imageUrl);
			let inserted = false;
			for (let i = 0; i < 24; i++) {
				if (this.cancelled) {
					await this.rf.vmediaDisconnect().catch(() => {});
					return {
						ok: false,
						error: "cancelled"
					};
				}
				await sleep(1e4);
				if ((await this.rf.vmediaStatus()).Inserted) {
					inserted = true;
					break;
				}
				this.progress("mounting", 12 + i, `Waiting for VCD insert (${(i + 1) * 10}s)...`);
			}
			if (!inserted) throw new Error("virtual media did not insert within 4 min");
			this.progress("booting", 20, "Setting boot override + restarting...");
			await this.rf.setBootOnce("Cd");
			const powerState = sys.PowerState;
			await this.rf.power(powerState === "On" ? "ForceRestart" : "On");
			this.progress("installing", 25, "Machine booting... waiting for installer reports...");
			const startTime = Date.now();
			const timeoutMs = 18e5;
			while (Date.now() - startTime < timeoutMs) {
				if (this.cancelled) {
					await this.rf.vmediaDisconnect().catch(() => {});
					return {
						ok: false,
						error: "cancelled"
					};
				}
				await sleep(3e4);
				const elapsed = Math.floor((Date.now() - startTime) / 1e3);
				const pct = Math.min(25 + Math.floor(elapsed / 1800 * 65), 90);
				this.progress("installing", pct, `Waiting for OS to boot (${Math.floor(elapsed / 60)}min)...`);
				if (await this.trySsh(this.spec.osIp)) {
					this.progress("verifying", 95, "SSH is up! Verifying installation...");
					await this.rf.vmediaDisconnect().catch(() => {});
					this.progress("done", 100, "Installation complete!");
					return { ok: true };
				}
			}
			await this.rf.vmediaDisconnect().catch(() => {});
			return {
				ok: false,
				error: "timeout waiting for SSH (30 min)"
			};
		} catch (e) {
			await this.rf.vmediaDisconnect().catch(() => {});
			return {
				ok: false,
				error: String(e.message || e)
			};
		}
	}
	async trySsh(ip) {
		return new Promise((resolve) => {
			const s = new (__require("net")).Socket();
			s.setTimeout(5e3);
			s.on("connect", () => {
				s.destroy();
				resolve(true);
			});
			s.on("error", () => resolve(false));
			s.on("timeout", () => {
				s.destroy();
				resolve(false);
			});
			s.connect(22, ip);
		});
	}
};
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
//#endregion
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
const HTTP_PORT = 8080;
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
		root = null;
		dataFile = null;
		queueRunning = false;
		constructor(ctx) {
			super(ctx, "osDeploy");
			const sp = ctx.get("sandboxPolicy");
			if (sp && typeof sp.workspaceRoot === "string" && sp.workspaceRoot) this.root = sp.workspaceRoot.replace(/[\\/]+$/, "");
			this.dataFile = this.root ? path.join(this.root, "dsh-os-deploy-state.json") : null;
			this.load();
			ctx.on("dispose", () => {
				if (this.httpServer) this.httpServer.stop();
				for (const [, r] of this.runners) r.cancel();
			});
		}
		async [Service.init]() {
			console.log("[osdeploy] service loaded (idle) — 在面板点击「启动」后才会开启部署服务");
		}
		async serviceStatus() {
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
				this.httpServer = new DeployHttpServer(HTTP_PORT);
				this.httpServer.onReport((query, ip) => this.handleReport(query, ip));
				await this.httpServer.start();
				for (const img of this.images) if (img.extracted && img.extractedDir) this.httpServer.setRoot(`/repo/${img.distroId}`, img.extractedDir);
				this.serverRunning = true;
				this.serverStartedAt = Date.now();
				console.log(`[osdeploy] HTTP server listening on 0.0.0.0:${HTTP_PORT}`);
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
				this.serverRunning = false;
				this.serverStartedAt = null;
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
		load() {
			if (!this.dataFile || !fs.existsSync(this.dataFile)) return;
			try {
				const data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
				this.images = data.images || [];
				for (const t of data.tasks || []) this.tasks.set(t.id, t);
			} catch (e) {
				console.error("[osdeploy] load state error:", e);
			}
		}
		save() {
			if (!this.dataFile) return;
			try {
				fs.writeFileSync(this.dataFile, JSON.stringify({
					images: this.images,
					tasks: Array.from(this.tasks.values())
				}, null, 2));
			} catch (e) {
				console.error("[osdeploy] save state error:", e);
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
			const img = this.images.find((i) => i.id === req.imageId);
			if (!img) return {
				ok: false,
				error: "image not found"
			};
			if (img.extracted && img.extractedDir) return { ok: true };
			const outDir = path.join(this.root || os.tmpdir(), "os-deploy-repo", img.distroId);
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
			const idx = this.images.findIndex((i) => i.id === req.imageId);
			if (idx < 0) return {
				ok: false,
				error: "image not found"
			};
			const img = this.images[idx];
			if (this.httpServer) this.httpServer.removeRoot(`/repo/${img.distroId}`);
			this.images.splice(idx, 1);
			this.save();
			return { ok: true };
		}
		async listImages() {
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
					serial: (d.SerialNumber || "").trim(),
					capacityBytes: d.CapacityBytes || 0,
					media: d.MediaType || "HDD"
				});
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
			return { tasks: Array.from(this.tasks.values()) };
		}
		async getTaskDetail(req) {
			const task = this.tasks.get(req.taskId);
			if (!task) return {
				task: null,
				error: "task not found"
			};
			return { task };
		}
		async cancelTask(req) {
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
			if (!img.extracted) {
				task.status = "running";
				task.startedAt = Date.now();
				this.addLog(task, "info", `Extracting ISO: ${img.name}...`);
				const outDir = path.join(this.root || process.cwd(), "os-deploy-repo", img.distroId);
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
			task.status = "running";
			task.startedAt = Date.now();
			this.addLog(task, "info", `Starting deployment to ${task.device.bmcHost}...`);
			const serverIp = await this.getLocalIp();
			const runner = new DeployRunner({
				bmc: {
					host: task.device.bmcHost,
					user: task.device.bmcUser,
					pass: task.device.bmcPassword
				},
				nicMac: task.device.nicMac,
				hostname: task.device.hostname,
				osIp: task.device.osIp,
				osGateway: task.device.osGateway,
				osPrefixLen: task.device.osPrefixLen,
				osDns: task.device.osDns,
				rootPassword: task.device.rootPassword,
				diskSn: "",
				distroId: img.distroId,
				vendor: img.vendor,
				repoDir: img.extractedDir || "",
				components: task.components
			}, serverIp, HTTP_PORT, (stage, progress, log) => {
				task.stage = stage;
				task.progress = progress;
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
			this.save();
		}
		handleReport(query, ip) {
			const stage = query.get("stage") || "";
			const data = query.get("d") || "";
			console.log(`[osdeploy] report from ${ip}: stage=${stage} d=${data.slice(0, 100)}`);
			for (const [, task] of this.tasks) if (task.status === "running" && task.device.osIp === ip) {
				this.addLog(task, "info", `[installer] ${stage}: ${data}`);
				const stageProgress = {
					"pre-start": 30,
					"cmdline": 32,
					"disks": 34,
					"disk-resolved": 36,
					"pre-done": 38,
					"include-uploaded": 40,
					"post-install": 85,
					"firstboot": 95
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
			task.logs.push({
				ts: Date.now(),
				level,
				msg
			});
			if (task.logs.length > 200) task.logs.splice(0, task.logs.length - 200);
		}
		async getLocalIp() {
			return new Promise((resolve) => {
				const ifs = os.networkInterfaces();
				for (const name of Object.keys(ifs)) {
					const list = ifs[name];
					if (!list) continue;
					for (const i of list) if (i.family === "IPv4" && !i.internal) {
						resolve(i.address);
						return;
					}
				}
				resolve("127.0.0.1");
			});
		}
	};
})();
//#endregion
export { OsDeployService as default };
