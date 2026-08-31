import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
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
const REPO_PATH = process.env.DSH_SERVER_MANAGER_REPO || "";
const GIT_PATH = "git";
let ServerManagerService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _listServers_decorators;
	let _addServer_decorators;
	let _updateServer_decorators;
	let _deleteServer_decorators;
	let _inspect_decorators;
	let _exec_decorators;
	let _bmcStatus_decorators;
	let _bmcPower_decorators;
	let _bmcBios_decorators;
	let _update_decorators;
	return class ServerManagerService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_listServers_decorators = [Remote("listServers")];
			_addServer_decorators = [Remote("addServer")];
			_updateServer_decorators = [Remote("updateServer")];
			_deleteServer_decorators = [Remote("deleteServer")];
			_inspect_decorators = [Remote("inspect")];
			_exec_decorators = [Remote("exec")];
			_bmcStatus_decorators = [Remote("bmcStatus")];
			_bmcPower_decorators = [Remote("bmcPower")];
			_bmcBios_decorators = [Remote("bmcBios")];
			_update_decorators = [Remote("update")];
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
			__esDecorate(this, null, _addServer_decorators, {
				kind: "method",
				name: "addServer",
				static: false,
				private: false,
				access: {
					has: (obj) => "addServer" in obj,
					get: (obj) => obj.addServer
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _updateServer_decorators, {
				kind: "method",
				name: "updateServer",
				static: false,
				private: false,
				access: {
					has: (obj) => "updateServer" in obj,
					get: (obj) => obj.updateServer
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _deleteServer_decorators, {
				kind: "method",
				name: "deleteServer",
				static: false,
				private: false,
				access: {
					has: (obj) => "deleteServer" in obj,
					get: (obj) => obj.deleteServer
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _inspect_decorators, {
				kind: "method",
				name: "inspect",
				static: false,
				private: false,
				access: {
					has: (obj) => "inspect" in obj,
					get: (obj) => obj.inspect
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _exec_decorators, {
				kind: "method",
				name: "exec",
				static: false,
				private: false,
				access: {
					has: (obj) => "exec" in obj,
					get: (obj) => obj.exec
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _bmcStatus_decorators, {
				kind: "method",
				name: "bmcStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "bmcStatus" in obj,
					get: (obj) => obj.bmcStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _bmcPower_decorators, {
				kind: "method",
				name: "bmcPower",
				static: false,
				private: false,
				access: {
					has: (obj) => "bmcPower" in obj,
					get: (obj) => obj.bmcPower
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _bmcBios_decorators, {
				kind: "method",
				name: "bmcBios",
				static: false,
				private: false,
				access: {
					has: (obj) => "bmcBios" in obj,
					get: (obj) => obj.bmcBios
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _update_decorators, {
				kind: "method",
				name: "update",
				static: false,
				private: false,
				access: {
					has: (obj) => "update" in obj,
					get: (obj) => obj.update
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
		servers = (__runInitializers(this, _instanceExtraInitializers), []);
		checks = {};
		running = false;
		lastInspectAt = null;
		inspectIntervalMs = 3e5;
		hasIpmitool = false;
		root = null;
		policy = null;
		dataFile = null;
		constructor(ctx) {
			super(ctx, "serverManager");
			const sp = ctx.get("sandboxPolicy");
			if (sp) {
				if (typeof sp.workspaceRoot === "string" && sp.workspaceRoot) this.root = sp.workspaceRoot.replace(/[\\/]+$/, "");
				if (typeof sp.resolve === "function") try {
					this.policy = sp.resolve();
				} catch (e) {
					this.policy = null;
				}
			}
			this.dataFile = this.root ? this.root + "\\dsh-server-inventory.json" : null;
			this.servers = this.seedServers();
		}
		async [Service.init]() {
			await this.load();
			this.hasIpmitool = await this.detectIpmitool().catch(() => false);
			this.ctx.setInterval(() => {
				this.inspectAll([]).catch((e) => console.error("[srvmg] inspect error:", e?.message));
			}, this.inspectIntervalMs);
			this.ctx.setTimeout(() => {
				this.inspectAll([]).catch((e) => console.error("[srvmg] initial inspect error:", e?.message));
			}, 2500);
		}
		seedServers() {
			return [];
		}
		normalize(s) {
			const t = Date.now();
			const tags = Array.isArray(s.tags) ? s.tags.map(String) : typeof s.tags === "string" ? s.tags.split(",").map((x) => x.trim()).filter(Boolean) : [];
			return {
				id: String(s.id || s.host || ""),
				name: String(s.name || s.host || ""),
				role: String(s.role || ""),
				host: String(s.host || ""),
				sshUser: String(s.sshUser || "root"),
				sshPort: Number(s.sshPort) || 22,
				bmcHost: String(s.bmcHost || ""),
				bmcUser: String(s.bmcUser || ""),
				bmcPassword: String(s.bmcPassword || ""),
				tags,
				notes: String(s.notes || ""),
				enabled: s.enabled !== false,
				createdAt: Number(s.createdAt) || t,
				updatedAt: t
			};
		}
		find(id) {
			return this.servers.find((s) => s.id === id);
		}
		runArgv(argv, timeoutMs) {
			const subprocess = this.ctx.get("subprocess");
			if (!subprocess) return Promise.resolve({
				ok: false,
				exitCode: null,
				stdout: "",
				stderr: "",
				timedOut: false,
				error: "subprocess service unavailable"
			});
			let handle;
			try {
				handle = subprocess.spawn({
					argv,
					cwd: this.root || "C:\\",
					stdio: {
						stdin: "ignore",
						stdout: { maxBytes: 4194304 },
						stderr: { maxBytes: 4194304 }
					},
					graceMs: 3e3
				});
			} catch (e) {
				return Promise.resolve({
					ok: false,
					exitCode: null,
					stdout: "",
					stderr: "",
					timedOut: false,
					error: String(e?.message || e)
				});
			}
			return new Promise((resolve) => {
				let settled = false;
				let timer = null;
				let timedOut = false;
				const finish = (r) => {
					if (settled) return;
					settled = true;
					if (timer) try {
						timer();
					} catch (e) {}
					resolve(r);
				};
				if (timeoutMs > 0) timer = this.ctx.timeout(() => {
					timedOut = true;
					try {
						handle.terminate();
					} catch (e) {}
				}, timeoutMs);
				handle.done.then((outcome) => {
					let stdout = "", stderr = "";
					try {
						if (handle.collected?.stdout) stdout = handle.collected.stdout.readFrom(0).text;
					} catch (e) {}
					try {
						if (handle.collected?.stderr) stderr = handle.collected.stderr.readFrom(0).text;
					} catch (e) {}
					finish({
						ok: true,
						exitCode: outcome.exitCode,
						stdout,
						stderr,
						timedOut
					});
				}, (err) => {
					finish({
						ok: false,
						exitCode: null,
						stdout: "",
						stderr: "",
						timedOut,
						error: String(err?.message || err)
					});
				});
			});
		}
		sshArgs(s, remote, connectSec) {
			return [
				"ssh",
				"-o",
				"BatchMode=yes",
				"-o",
				"ConnectTimeout=" + (connectSec || 10),
				"-o",
				"StrictHostKeyChecking=no",
				"-o",
				"LogLevel=ERROR",
				"-o",
				"ServerAliveInterval=10",
				"-o",
				"ServerAliveCountMax=3",
				"-p",
				String(s.sshPort || 22),
				(s.sshUser || "root") + "@" + s.host,
				remote
			];
		}
		async runSsh(s, remote, timeoutMs) {
			if (!this.ctx.get("subprocess")) return {
				ok: false,
				error: "subprocess service unavailable",
				exitCode: null,
				stdout: "",
				stderr: "",
				timedOut: false
			};
			const t = timeoutMs || 3e4;
			const r = await this.runArgv(this.sshArgs(s, remote, Math.min(10, Math.round(t / 1e3))), t);
			if (!r.ok) return {
				ok: false,
				error: r.error,
				exitCode: null,
				stdout: "",
				stderr: "",
				timedOut: !!r.timedOut
			};
			const timedOut = !!r.timedOut;
			return {
				ok: r.exitCode === 0 && !timedOut,
				exitCode: r.exitCode,
				stdout: r.stdout,
				stderr: r.stderr,
				error: timedOut ? "command timed out after " + t + "ms" : null,
				timedOut
			};
		}
		static PROBE = `echo "HOSTNAME=$(hostname)"; echo "OS=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2)"; echo "KERNEL=$(uname -r)"; echo "UPTIME=$(uptime -p 2>/dev/null)"; echo "LOAD=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"; echo "CPUS=$(nproc 2>/dev/null)"; echo "MEM=$(free -m 2>/dev/null | awk '/Mem:/{print $3\"MB_used_of_\"$2\"MB\"}')"; echo "DISK=$(df -h / 2>/dev/null | awk 'NR==2{print $3\"_used_of_\"$2\"_\"$5}')"`;
		parseProbe(stdout) {
			const out = {};
			for (const line of String(stdout || "").split(/\r?\n/)) {
				const i = line.indexOf("=");
				if (i <= 0) continue;
				const k = line.slice(0, i).trim();
				let v = line.slice(i + 1).trim();
				v = v.replace(/^"|"$/g, "");
				out[k] = v;
			}
			return out;
		}
		async inspectServer(s) {
			const startedAt = Date.now();
			const r = await this.runSsh(s, ServerManagerService.PROBE, 25e3);
			const info = this.parseProbe(String(r.stdout || ""));
			const online = !!r.ok && !!info.HOSTNAME;
			const result = {
				id: s.id,
				name: s.name,
				host: s.host,
				online,
				checkedAt: startedAt,
				metrics: info,
				error: online ? null : String(r.error || r.stderr || "ssh exit " + r.exitCode)
			};
			this.checks[s.id] = result;
			return result;
		}
		async inspectAll(ids) {
			if (this.running) return {
				ok: false,
				error: "inspection already running"
			};
			this.running = true;
			const startedAt = Date.now();
			const results = [];
			try {
				const idSet = (Array.isArray(ids) ? ids : []).map((x) => String(x).trim()).filter(Boolean);
				const all = idSet.length === 0 || idSet.indexOf("all") >= 0;
				const targets = this.servers.filter((s) => s.enabled && (all || idSet.indexOf(s.id) >= 0 || idSet.indexOf(s.name) >= 0 || idSet.indexOf(s.host) >= 0));
				for (const s of targets) results.push(await this.inspectServer(s));
				this.lastInspectAt = startedAt;
				return {
					ok: true,
					checkedAt: startedAt,
					results
				};
			} finally {
				this.running = false;
			}
		}
		async persist() {
			const fs = this.ctx.get("fs");
			if (!fs || !this.dataFile) return false;
			try {
				const target = await fs.resolve(this.dataFile);
				await fs.writeText(target, JSON.stringify({
					version: 1,
					servers: this.servers.map((s) => this.normalize(s))
				}, null, 2), void 0, void 0, this.policy || void 0);
				return true;
			} catch (e) {
				console.error("[srvmg] persist failed:", e?.message);
				return false;
			}
		}
		async load() {
			const fs = this.ctx.get("fs");
			if (!fs || !this.dataFile) return;
			try {
				const target = await fs.resolve(this.dataFile);
				const parsed = JSON.parse(await fs.readText(target));
				if (parsed && Array.isArray(parsed.servers) && parsed.servers.length) this.servers = parsed.servers.map((s) => this.normalize(s));
			} catch (e) {
				await this.persist();
			}
		}
		async detectIpmitool() {
			if (!this.ctx.get("subprocess")) return false;
			const r = await this.runArgv(["ipmitool", "-V"], 5e3);
			return !!(r.ok && r.exitCode === 0);
		}
		async redfishRequest(s, method, path, body, timeoutMs, etag) {
			const argv = [
				"curl",
				"-s",
				"-k",
				"--max-time",
				String(Math.max(5, Math.round((timeoutMs || 15e3) / 1e3))),
				"-u",
				(s.bmcUser || "Administrator") + ":" + (s.bmcPassword || ""),
				"-H",
				"Content-Type: application/json",
				"-w",
				"__RF_STATUS__%{http_code}"
			];
			if (etag) argv.push("-H", "If-Match: " + etag);
			argv.push("-X", method);
			if (body) argv.push("-d", JSON.stringify(body));
			argv.push("https://" + s.bmcHost + path);
			const r = await this.runArgv(argv, timeoutMs || 15e3);
			if (!r.ok) return {
				ok: false,
				error: r.error
			};
			if (r.exitCode !== 0) return {
				ok: false,
				error: (r.stderr || r.stdout || "curl exit " + r.exitCode).trim()
			};
			const out = String(r.stdout || "");
			const idx = out.lastIndexOf("__RF_STATUS__");
			let status = 0;
			let bodyText = out;
			if (idx >= 0) {
				status = parseInt(out.slice(idx + 13), 10) || 0;
				bodyText = out.slice(0, idx);
			}
			if (status >= 400) {
				let errMsg = "BMC Redfish HTTP " + status;
				try {
					const d = JSON.parse(bodyText);
					if (d?.error) {
						const ext = d.error["@Message.ExtendedInfo"];
						const msg = Array.isArray(ext) && ext[0]?.Message || d.error.message || "";
						if (msg) errMsg = msg;
					}
				} catch (e) {}
				return {
					ok: false,
					error: errMsg,
					httpStatus: status
				};
			}
			try {
				return {
					ok: true,
					data: JSON.parse(bodyText)
				};
			} catch (e) {
				return {
					ok: false,
					error: "non-JSON Redfish response (HTTP " + status + "): " + bodyText.slice(0, 200),
					httpStatus: status
				};
			}
		}
		async redfishEtag(s, path, timeoutMs) {
			const argv = [
				"curl",
				"-s",
				"-k",
				"--max-time",
				String(Math.max(5, Math.round((timeoutMs || 15e3) / 1e3))),
				"-u",
				(s.bmcUser || "Administrator") + ":" + (s.bmcPassword || ""),
				"-D",
				"-",
				"-o",
				"NUL",
				"https://" + s.bmcHost + path
			];
			const r = await this.runArgv(argv, timeoutMs || 15e3);
			if (!r.ok || r.exitCode !== 0) return null;
			const m = /ETag:\s*([^\r\n]+)/i.exec(r.stdout || "");
			return m ? m[1].trim() : null;
		}
		async redfishSystemId(s) {
			const r = await this.redfishRequest(s, "GET", "/redfish/v1/Systems");
			if (!r.ok) return r;
			const data = r.data || {};
			if (data.error) {
				const ext = data.error["@Message.ExtendedInfo"];
				return {
					ok: false,
					error: "BMC Redfish: " + (Array.isArray(ext) && ext[0]?.Message || data.error.message || "Redfish error")
				};
			}
			const members = data.Members || [];
			if (!members.length) return {
				ok: false,
				error: "no Systems members in Redfish response"
			};
			return {
				ok: true,
				id: members[0]["@odata.id"] || members[0].Id || "/redfish/v1/Systems/1"
			};
		}
		async doUpdate() {
			if (!REPO_PATH) return {
				ok: false,
				error: "自更新未配置：请设置环境变量 DSH_SERVER_MANAGER_REPO 后重启 DSH。"
			};
			const git = [
				GIT_PATH,
				"-c",
				"http.sslBackend=openssl",
				"-C",
				REPO_PATH
			];
			const before = await this.runArgv(git.concat(["rev-parse", "HEAD"]), 15e3);
			const beforeHash = before.ok && before.exitCode === 0 ? before.stdout.trim() : null;
			const r = await this.runArgv(git.concat(["pull", "--no-edit"]), 12e4);
			if (!r.ok) return {
				ok: false,
				error: r.error
			};
			if (r.exitCode !== 0) return {
				ok: false,
				error: (r.stderr || r.stdout || "git pull exit " + r.exitCode).trim()
			};
			const after = await this.runArgv(git.concat(["rev-parse", "HEAD"]), 15e3);
			const afterHash = after.ok && after.exitCode === 0 ? after.stdout.trim() : null;
			const log = await this.runArgv(git.concat([
				"log",
				"--oneline",
				"-3"
			]), 15e3);
			return {
				ok: true,
				changed: beforeHash !== afterHash,
				beforeHash,
				afterHash,
				log: (log.ok ? log.stdout : "").trim(),
				pullOutput: (r.stdout || "").trim(),
				repoPath: REPO_PATH,
				note: "若 changed=true，请重新构建并重启 DSH 以生效。"
			};
		}
		listServers() {
			return {
				ok: true,
				servers: this.servers.map((s) => ({ ...s })),
				checks: this.checks,
				lastInspectAt: this.lastInspectAt,
				inspectIntervalMs: this.inspectIntervalMs,
				hasIpmitool: this.hasIpmitool,
				bmcTransport: this.hasIpmitool ? "redfish+ipmitool" : "redfish",
				running: this.running
			};
		}
		async addServer(request) {
			if (!request?.host) return {
				ok: false,
				error: "host is required"
			};
			const host = String(request.host).trim();
			if (this.servers.some((s) => s.host === host)) return {
				ok: false,
				error: "server with host " + host + " already exists"
			};
			const rec = this.normalize({
				...request,
				id: request.id || host,
				host
			});
			this.servers.push(rec);
			await this.persist();
			return {
				ok: true,
				server: rec
			};
		}
		async updateServer(request) {
			const { id, patch } = request;
			const rec = this.find(id);
			if (!rec) return {
				ok: false,
				error: "server not found: " + id
			};
			if (patch?.host && patch.host !== rec.host && this.servers.some((s) => s.id !== id && s.host === patch.host)) return {
				ok: false,
				error: "host already used"
			};
			Object.assign(rec, this.normalize({
				...rec,
				...patch || {},
				id: rec.id
			}));
			await this.persist();
			return {
				ok: true,
				server: rec
			};
		}
		async deleteServer(request) {
			const id = request.id;
			const i = this.servers.findIndex((s) => s.id === id);
			if (i < 0) return {
				ok: false,
				error: "server not found: " + id
			};
			this.servers.splice(i, 1);
			delete this.checks[id];
			await this.persist();
			return { ok: true };
		}
		inspect(request) {
			const ids = request?.id ? String(request.id).split(",").map((x) => x.trim()).filter(Boolean) : [];
			return this.inspectAll(ids);
		}
		async exec(request) {
			const targets = this.resolveTargets(request.id);
			if (!targets.length) return {
				ok: false,
				error: "no matching servers"
			};
			const results = [];
			for (const s of targets) {
				const r = await this.runSsh(s, request.command || "", request.timeoutMs || 3e4);
				results.push({
					id: s.id,
					name: s.name,
					host: s.host,
					ok: r.ok,
					exitCode: r.exitCode,
					stdout: r.stdout,
					stderr: r.stderr,
					error: r.error || null,
					timedOut: !!r.timedOut
				});
			}
			return {
				ok: true,
				results
			};
		}
		async bmcStatus(request) {
			const s = this.find(request.id);
			if (!s) return {
				ok: false,
				error: "server not found"
			};
			if (!s.bmcHost) return {
				ok: false,
				error: "BMC host not configured for " + s.id
			};
			const sys = await this.redfishSystemId(s);
			if (sys.ok) {
				const r = await this.redfishRequest(s, "GET", String(sys.id));
				if (r.ok) {
					const d = r.data || {};
					return {
						ok: true,
						transport: "redfish",
						model: d.Model || null,
						manufacturer: d.Manufacturer || null,
						serial: d.SerialNumber || null,
						powerState: d.PowerState || null,
						health: d.Status?.Health || null,
						severity: d.Status?.Oem?.Huawei?.Severity || null
					};
				}
			}
			return {
				ok: false,
				transport: "redfish",
				error: String(sys.error || "BMC unreachable")
			};
		}
		async bmcPower(request) {
			const s = this.find(request.id);
			if (!s) return {
				ok: false,
				error: "server not found"
			};
			if (!s.bmcHost) return {
				ok: false,
				error: "BMC host not configured for " + s.id
			};
			const action = request.action;
			const sys = await this.redfishSystemId(s);
			if (!sys.ok) return sys;
			if (action === "status") {
				const r = await this.redfishRequest(s, "GET", String(sys.id));
				if (!r.ok) return r;
				const d = r.data || {};
				return {
					ok: true,
					transport: "redfish",
					powerState: d.PowerState || null,
					health: d.Status?.Health || null
				};
			}
			const rt = {
				on: "On",
				off: "ForceOff",
				cycle: "ForceRestart",
				reset: "ForceRestart",
				"graceful-off": "GracefulShutdown",
				"graceful-restart": "GracefulRestart"
			}[action];
			if (!rt) return {
				ok: false,
				error: "unknown action: " + action
			};
			const r = await this.redfishRequest(s, "POST", String(sys.id) + "/Actions/ComputerSystem.Reset", { ResetType: rt }, 4e4);
			return r.ok ? {
				ok: true,
				transport: "redfish",
				requested: rt,
				note: "Reset action submitted via Redfish."
			} : r;
		}
		async bmcBios(request) {
			const s = this.find(request.id);
			if (!s) return {
				ok: false,
				error: "server not found"
			};
			if (!s.bmcHost) return {
				ok: false,
				error: "BMC host not configured for " + s.id
			};
			const attribute = request.attribute;
			const value = request.value;
			const sys = await this.redfishSystemId(s);
			if (!sys.ok) return {
				...sys,
				transport: "redfish",
				hint: "BIOS read/write is Redfish-only."
			};
			const biosPath = String(sys.id) + "/Bios";
			const wantWrite = value !== void 0 && value !== null;
			if (!attribute) {
				const r = await this.redfishRequest(s, "GET", biosPath);
				if (!r.ok) return r;
				const d = r.data || {};
				const attrs = d.Attributes || {};
				return {
					ok: true,
					transport: "redfish",
					attributeRegistry: d.AttributeRegistry || null,
					attributeCount: Object.keys(attrs).length,
					attributes: attrs
				};
			}
			if (!wantWrite) {
				const r = await this.redfishRequest(s, "GET", biosPath);
				if (!r.ok) return r;
				const attrs = (r.data || {}).Attributes || {};
				return {
					ok: true,
					transport: "redfish",
					attribute,
					value: Object.prototype.hasOwnProperty.call(attrs, attribute) ? attrs[attribute] : null
				};
			}
			const etag = await this.redfishEtag(s, biosPath + "/Settings");
			if (!etag) return {
				ok: false,
				transport: "redfish",
				error: "could not obtain BIOS Settings ETag for write"
			};
			const attrs = {};
			attrs[attribute] = value;
			const r = await this.redfishRequest(s, "PATCH", biosPath + "/Settings", { Attributes: attrs }, 4e4, etag);
			if (!r.ok) return {
				...r,
				transport: "redfish"
			};
			return {
				ok: true,
				transport: "redfish",
				set: attrs,
				note: "Pending BIOS change staged via Redfish; reboot the server for it to take effect."
			};
		}
		update() {
			return this.doUpdate();
		}
		resolveTargets(expr) {
			const parts = String(expr || "").split(",").map((x) => x.trim()).filter(Boolean);
			if (parts.length === 0 || parts.indexOf("all") >= 0) return this.servers.slice();
			return this.servers.filter((s) => parts.indexOf(s.id) >= 0 || parts.indexOf(s.name) >= 0 || parts.indexOf(s.host) >= 0);
		}
	};
})();
//#endregion
export { ServerManagerService as default };
