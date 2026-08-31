import { createRequire } from "node:module";
import { defineTool } from "@deepseek-ai/dsh-tools";
import os from "node:os";
import path from "node:path";
//#region \0rolldown/runtime.js
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region src/index.ts
process.env.DSH_EXPERIENCE_REPO;
function slugify(s) {
	return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
}
function isSkillName(n) {
	return /^[a-z0-9][a-z0-9-]*$/.test(n);
}
function yamlStr(s) {
	return "\"" + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, " ") + "\"";
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function dshHome() {
	return process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
}
function findProjectRoot(ctx) {
	const sp = ctx.get("sandboxPolicy");
	let dir = sp && typeof sp.workspaceRoot === "string" && sp.workspaceRoot ? sp.workspaceRoot : process.cwd();
	dir = path.resolve(dir);
	let cur = dir;
	for (let i = 0; i < 40; i++) {
		try {
			if (__require("node:fs").existsSync(path.join(cur, ".git"))) return cur;
		} catch (e) {}
		const parent = path.dirname(cur);
		if (parent === cur) break;
		cur = parent;
	}
	return dir;
}
var src_default = {
	inject: ["skills"],
	async apply(ctx) {
		const skills = ctx.skills;
		async function capture(input) {
			const title = String(input?.title || "").trim();
			const problem = String(input?.problem || "").trim();
			const solution = String(input?.solution || "").trim();
			if (!title || !problem || !solution) return {
				ok: false,
				error: "title / problem / solution 三者必填"
			};
			const scope = input.scope === "project" ? "project" : "user";
			const baseSlug = "exp-" + slugify(title);
			if (!isSkillName(baseSlug)) return {
				ok: false,
				error: "生成的技能名不合法: " + baseSlug
			};
			let slug = baseSlug, version = 1;
			try {
				const existing = {};
				const all = await skills.list();
				for (const s of all) existing[s.name] = true;
				if (existing[baseSlug]) {
					let v = 2;
					while (existing[baseSlug + "-v" + v]) v++;
					version = v;
					slug = baseSlug + "-v" + v;
				}
			} catch (e) {}
			const tags = Array.isArray(input.tags) ? input.tags.map(String) : typeof input.tags === "string" ? input.tags.split(",").map((x) => x.trim()).filter(Boolean) : [];
			const whenToUse = String(input.whenToUse || "当遇到与「" + title + "」相似的任务时使用").slice(0, 480);
			const context = String(input.context || "").trim();
			const sessionRef = String(input.sessionRef || "").trim();
			const created = nowIso();
			const lines = [
				"---",
				"name: " + yamlStr(slug),
				"description: " + yamlStr(whenToUse),
				"whenToUse: " + yamlStr(whenToUse),
				"metadata:",
				"  experience: true",
				"  scope: " + scope,
				"  version: " + version,
				"  created: " + yamlStr(created)
			];
			if (tags.length) lines.push("  tags: " + yamlStr(tags.join(", ")));
			if (sessionRef) lines.push("  sessionRef: " + yamlStr(sessionRef));
			lines.push("---", "", "# " + title, "", "## 问题", "", problem, "", "## 解决方案", "", solution, "");
			if (context) lines.push("## 上下文与关键细节", "", context, "");
			lines.push("## 标签", "", tags.length ? tags.map((t) => "- " + t).join("\n") : "（无）", "");
			lines.push("## 元数据", "", "- scope: " + scope, "- version: " + version, "- created: " + created, sessionRef ? "- sessionRef: " + sessionRef : null, "");
			lines.push("> 本经验由 `experience_capture` 计算生成，由模型的 `write` 工具落盘；经 dsh-skill-filesystem 热重载后跨会话/项目继承，可被 `experience_recall` 召回。");
			const content = lines.filter((x) => x !== null).join("\n") + "\n";
			const filePath = scope === "project" ? path.join(findProjectRoot(ctx), ".dsh", "skills", slug, "SKILL.md") : path.join(dshHome(), "skills", slug, "SKILL.md");
			return {
				ok: true,
				skillName: slug,
				scope,
				version,
				path: filePath,
				content,
				nextAction: "用 `write` 工具在以上 `path` 落盘 `content`。`write` 触发 fs/observed，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。"
			};
		}
		async function recall(input) {
			const query = String(input?.query || "").trim();
			const limit = Math.max(1, Math.min(50, Number(input?.limit) || 10));
			const out = {
				query,
				skills: [],
				sessions: [],
				totalSkills: 0,
				sessionQueryAvailable: null
			};
			try {
				const exps = (await skills.list()).filter((s) => s.name && /^exp-/.test(s.name) || s.metadata && (s.metadata.experience === true || s.metadata.experience === "true"));
				out.totalSkills = exps.length;
				const q = query.toLowerCase();
				const words = q ? q.split(/\s+/).filter(Boolean) : [];
				out.skills = (words.length === 0 ? exps : exps.filter((s) => {
					const hay = ((s.name || "") + " " + (s.description || "") + " " + (s.whenToUse || "")).toLowerCase();
					return words.some((w) => hay.indexOf(w) >= 0);
				})).slice(0, limit).map((s) => ({
					name: s.name,
					description: s.description,
					whenToUse: s.whenToUse,
					source: s.source
				}));
			} catch (e) {
				out.skillError = String(e?.message || e);
			}
			if (query) try {
				const sq = ctx.get("sessionQuery");
				if (sq && typeof sq.searchSessions === "function") {
					out.sessionQueryAvailable = true;
					const page = await sq.searchSessions({
						query,
						limit
					});
					out.sessions = (page && page.hits || []).slice(0, limit).map((h) => {
						const bm = h.bestMatch || {};
						return {
							sessionId: h.sessionId,
							title: h.title,
							cwd: h.cwd,
							snippet: bm.snippet || h.snippet || ""
						};
					});
				} else out.sessionQueryAvailable = false;
			} catch (e) {
				out.sessionError = String(e?.message || e);
			}
			out.note = out.sessions.length || out.skills.length ? "已检索历史会话与既有经验技能。若要把某条历史会话蒸馏为技能，调用 experience_capture 并把 sessionRef 传入。" : "无匹配经验。可先用 experience_capture 沉淀当前任务的经验。";
			return out;
		}
		async function listExperiences() {
			const result = {
				ok: true,
				user: [],
				project: [],
				totalCount: 0
			};
			try {
				const exps = (await skills.list()).filter((s) => s.name && /^exp-/.test(s.name) || s.metadata && (s.metadata.experience === true || s.metadata.experience === "true"));
				for (const s of exps) {
					const bucket = s.metadata && s.metadata.scope === "project" ? "project" : "user";
					result[bucket].push({
						name: s.name,
						description: s.description,
						whenToUse: s.whenToUse,
						source: s.source,
						scope: bucket
					});
				}
				result.totalCount = exps.length;
			} catch (e) {
				result.error = String(e?.message || e);
			}
			return result;
		}
		function renderText(value) {
			try {
				const j = JSON.stringify(value, null, 2);
				return j.length > 8e3 ? j.slice(0, 8e3) + "\n...(truncated)" : j;
			} catch (e) {
				return String(value);
			}
		}
		ctx.effect(() => ctx.tools.register(defineTool({
			name: "experience_capture",
			description: "Distill a reusable experience into a durable skill file that is inherited across sessions and projects. This tool COMPUTES the skill name, full SKILL.md content, and target path; you then write the file with your `write` tool (which hot-reloads the skill provider). Call this when you have just completed a goal, solved a hard problem, or found a workaround worth remembering.",
			parameters: {
				title: {
					type: "string",
					required: true,
					description: "Short title of the experience (becomes part of the skill name, kebab-cased, exp- prefixed)"
				},
				problem: {
					type: "string",
					required: true,
					description: "What problem/symptom was encountered; enough context to recognize it again"
				},
				solution: {
					type: "string",
					required: true,
					description: "What worked — the concrete steps, command, or reasoning that solved it"
				},
				context: {
					type: "string",
					description: "Optional: key details, gotchas, environment facts, error messages"
				},
				tags: {
					type: "string",
					description: "Comma-separated tags for later recall"
				},
				whenToUse: {
					type: "string",
					description: "Optional: when future tasks should reuse this"
				},
				scope: {
					type: "string",
					enum: ["user", "project"],
					description: "user = global (default, ~/.dsh/skills); project = current project only"
				},
				sessionRef: {
					type: "string",
					description: "Optional: a dsh-session:<id> reference"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: true
				},
				render: (_a, v) => [{
					type: "text",
					text: renderText(v)
				}]
			},
			async execute(args) {
				return capture(args);
			}
		})));
		ctx.effect(() => ctx.tools.register(defineTool({
			name: "experience_recall",
			description: "Search past sessions (full-text) and existing experience skills for lessons relevant to the current task, BEFORE acting on a non-trivial task.",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "Whitespace-separated literal phrases describing the current task/problem"
				},
				limit: {
					type: "integer",
					description: "Max results per category (default 10, max 50)"
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: true
				},
				render: (_a, v) => [{
					type: "text",
					text: renderText(v)
				}]
			},
			async execute(args) {
				return recall(args);
			}
		})));
		ctx.effect(() => ctx.tools.register(defineTool({
			name: "experience_list",
			description: "List all distilled experience skills currently visible to this session (global + project).",
			parameters: {},
			output: {
				schema: {
					type: "object",
					additionalProperties: true
				},
				render: (_a, v) => [{
					type: "text",
					text: renderText(v)
				}]
			},
			async execute() {
				return listExperiences();
			}
		})));
		const learnSkill = {
			name: "learn-experience",
			description: "Self-evolution: use when you have just completed a goal, solved a non-trivial problem, discovered a reusable workaround, or learned something about this codebase/tooling that future sessions would benefit from. Distills the experience into a durable skill that is inherited across all sessions and projects.",
			whenToUse: "After completing a goal; after solving a hard problem; after finding a non-obvious fix, workaround, or root cause; or when the user asks to \"remember this\".",
			content: LEARN_CONTENT
		};
		const recallSkill = {
			name: "recall-experience",
			description: "Self-evolution: use at the start of a non-trivial task that resembles past work — searches past sessions (full-text) and existing experience skills for relevant lessons, so you can apply prior solutions instead of rediscovering them.",
			whenToUse: "Before acting on a non-trivial task that resembles something you or a past session may have solved; before debugging a recurring symptom; when a task “feels familiar”.",
			content: RECALL_CONTENT
		};
		ctx.effect(() => skills.register(learnSkill));
		ctx.effect(() => skills.register(recallSkill));
		console.log("[experience] ready. dshHome=" + dshHome() + " projectRoot=" + findProjectRoot(ctx) + " sessionQuery=" + !!ctx.get("sessionQuery"));
	}
};
const LEARN_CONTENT = [
	"# learn-experience — 经验沉淀（自我进化）",
	"",
	"本技能是 agent 自我进化闭环的“捕获触发器”。DSH 已把技能文件系统作为持久记忆：任何写入 `~/.dsh/skills/<name>/SKILL.md`（全局继承）或 `<projectRoot>/.dsh/skills/<name>/SKILL.md`（项目级）的技能，都会被 `dsh-skill-filesystem` 热重载，在下一个 pre-step 进入技能目录，被未来所有会话继承。",
	"",
	"## 何时沉淀",
	"",
	"- 刚完成一个目标（goal）且过程中有非平凡的决策或绕行；",
	"- 解决了一个难题、找到一个非显然的修复或根因；",
	"- 发现了一条关于本代码库/工具链/部署的、下次会再次踩到的经验；",
	"- 用户明确要求“记住这个/存为经验”。",
	"",
	"## 如何沉淀（两步）",
	"",
	"**第 1 步：计算。** 调用 `experience_capture`，填写 title / problem / solution / context / tags / scope / sessionRef。",
	"工具返回 `{ skillName, scope, path, content, nextAction }`。同名经验自动版本递增（`exp-foo` → `exp-foo-v2`）。",
	"",
	"**第 2 步：落盘。** 用你的 `write` 工具，在 `path` 处写入 `content`。这一步触发 `fs/observed`，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。",
	"",
	"## scope 判据",
	"",
	"- `user`（默认，全局继承）：通用经验——与具体仓库无关的命令、流程、坑；",
	"- `project`（仅当前项目继承）：只对本仓库/本部署成立的经验。",
	"",
	"## 策展原则",
	"",
	"- 沉淀前先用 `experience_recall` 查是否已有相似经验，优先补充而非重复；",
	"- 经验是“写给未来的自己”的指令：用祈使句、给可复制的命令、标明前提条件；",
	"- 用 `experience_list` 审视已积累的经验，对过时的用 `edit`/删除其 SKILL.md 维护。"
].join("\n");
const RECALL_CONTENT = [
	"# recall-experience — 经验召回",
	"",
	"在做非平凡任务之前先召回，避免重复踩坑。本技能是 agent 自我进化闭环的“召回触发器”。",
	"",
	"## 如何召回",
	"",
	"调用 `experience_recall`，参数：",
	"",
	"- `query`：用空格分隔的字面短语描述当前任务/问题（同时用于匹配已有经验技能与历史会话全文检索）；",
	"- `limit`：每个类别的最大条数（默认 10）。",
	"",
	"返回两类结果：",
	"",
	"1. **既有经验技能**（`exp-*`）：匹配上的、已沉淀的可复用经验，用 `skill` 工具加载其完整正文并遵循；",
	"2. **历史会话片段**：来自 `ctx.sessionQuery`（若组合了 `@deepseek-ai/dsh-session-query-sqlite`）的相关会话摘录；可用 `@[标题](dsh-session:<id>)` 注入快照细读。",
	"",
	"## 召回后做什么",
	"",
	"- 对匹配的经验技能，用 `skill` 工具加载其完整正文并遵循；",
	"- 对相关历史会话，用会话引用注入快照细读；",
	"- 若当前任务解决了新问题，事后用 `learn-experience` 沉淀，闭环自我进化。",
	"",
	"> 若 `sessionQueryAvailable: false`，说明部署未组合全文检索后端，此时仅召回已沉淀的经验技能。"
].join("\n");
//#endregion
export { src_default as default };
