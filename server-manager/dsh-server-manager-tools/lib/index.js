import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/index.ts
function renderText(value) {
	try {
		const j = JSON.stringify(value, null, 2);
		return j.length > 6e3 ? j.slice(0, 6e3) + "\n...(truncated)" : j;
	} catch (e) {
		return String(value);
	}
}
var src_default = {
	name: "server-manager-tools",
	inject: ["serverManager", "tools"],
	apply(ctx) {
		const sm = ctx.serverManager;
		function tool(name, description, parameters, execute) {
			return defineTool({
				name,
				description,
				parameters,
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
				execute
			});
		}
		ctx.tools.register(tool("server_list", "List all managed servers and their latest inspection status.", {}, async () => sm.listServers()));
		ctx.tools.register(tool("server_add", "Add a server to the managed inventory.", {
			host: {
				type: "string",
				required: true,
				description: "SSH IP/hostname (unique)"
			},
			name: {
				type: "string",
				description: "Display name"
			},
			role: {
				type: "string",
				description: "Role label (e.g. master/worker)"
			},
			sshUser: {
				type: "string",
				description: "SSH user (default root)"
			},
			sshPort: {
				type: "integer",
				description: "SSH port (default 22)"
			},
			bmcHost: {
				type: "string",
				description: "BMC/IPMI IP"
			},
			bmcUser: {
				type: "string",
				description: "BMC user"
			},
			bmcPassword: {
				type: "string",
				description: "BMC password"
			},
			tags: {
				type: "string",
				description: "Comma-separated tags"
			},
			notes: {
				type: "string",
				description: "Free-text notes"
			}
		}, async (args) => sm.addServer(args)));
		ctx.tools.register(tool("server_update", "Update fields of an existing server.", {
			id: {
				type: "string",
				required: true,
				description: "Server id (= host IP)"
			},
			name: { type: "string" },
			role: { type: "string" },
			host: { type: "string" },
			sshUser: { type: "string" },
			sshPort: { type: "integer" },
			bmcHost: { type: "string" },
			bmcUser: { type: "string" },
			bmcPassword: { type: "string" },
			tags: { type: "string" },
			notes: { type: "string" },
			enabled: { type: "boolean" }
		}, async (args) => {
			const { id, ...patch } = args;
			return sm.updateServer({
				id,
				patch
			});
		}));
		ctx.tools.register(tool("server_delete", "Remove a server from the managed inventory.", { id: {
			type: "string",
			required: true,
			description: "Server id"
		} }, async (args) => sm.deleteServer({ id: args.id })));
		ctx.tools.register(tool("server_exec", "Run a shell command on one or more servers over passwordless SSH.", {
			id: {
				type: "string",
				required: true,
				description: "Server id, comma list, or \"all\""
			},
			command: {
				type: "string",
				required: true,
				description: "Command to run on the remote shell"
			},
			timeoutMs: {
				type: "integer",
				description: "Per-server timeout (default 30000)"
			}
		}, async (args) => sm.exec({
			id: args.id,
			command: args.command,
			timeoutMs: args.timeoutMs
		})));
		ctx.tools.register(tool("server_inspect", "Inspect server health now (omit id to inspect all enabled servers).", { id: {
			type: "string",
			description: "Optional server id / comma list / \"all\""
		} }, async (args) => sm.inspect(args.id ? { id: args.id } : {})));
		ctx.tools.register(tool("server_bmc_power", "Query or change server power state via BMC (Redfish).", {
			id: {
				type: "string",
				required: true,
				description: "Server id"
			},
			action: {
				type: "string",
				required: true,
				enum: [
					"status",
					"on",
					"off",
					"cycle",
					"reset"
				],
				description: "Power action"
			}
		}, async (args) => sm.bmcPower({
			id: args.id,
			action: args.action
		})));
		ctx.tools.register(tool("server_bmc_bios", "Read or set BIOS attributes via Redfish. Omit attribute to read ALL; attribute only to read ONE; attribute+value to SET.", {
			id: {
				type: "string",
				required: true,
				description: "Server id"
			},
			attribute: {
				type: "string",
				description: "BIOS attribute name (omit = read all)"
			},
			value: {
				type: "string",
				description: "New value (with attribute = set)"
			}
		}, async (args) => sm.bmcBios({
			id: args.id,
			attribute: args.attribute,
			value: args.value
		})));
	}
};
//#endregion
export { src_default as default };
