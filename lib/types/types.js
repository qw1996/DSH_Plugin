import { z } from "zod";
//#region src/types.ts
const ServerSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.string(),
	host: z.string(),
	sshUser: z.string(),
	sshPort: z.number(),
	bmcHost: z.string(),
	bmcUser: z.string(),
	bmcPassword: z.string(),
	tags: z.array(z.string()),
	notes: z.string(),
	enabled: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number()
});
const CheckSchema = z.object({
	id: z.string(),
	name: z.string(),
	host: z.string(),
	online: z.boolean(),
	checkedAt: z.number(),
	metrics: z.record(z.string(), z.string()),
	error: z.string().nullable()
});
const Fail = z.object({
	ok: z.literal(false),
	error: z.string()
});
function result(okShape) {
	return z.union([z.object({
		ok: z.literal(true),
		...okShape
	}), Fail]);
}
const AddServerRequestSchema = z.object({
	id: z.string().optional(),
	host: z.string(),
	name: z.string().optional(),
	role: z.string().optional(),
	sshUser: z.string().optional(),
	sshPort: z.number().optional(),
	bmcHost: z.string().optional(),
	bmcUser: z.string().optional(),
	bmcPassword: z.string().optional(),
	tags: z.string().optional(),
	notes: z.string().optional()
});
const UpdateServerRequestSchema = z.object({
	id: z.string(),
	patch: z.object({
		name: z.string().optional(),
		role: z.string().optional(),
		host: z.string().optional(),
		sshUser: z.string().optional(),
		sshPort: z.number().optional(),
		bmcHost: z.string().optional(),
		bmcUser: z.string().optional(),
		bmcPassword: z.string().optional(),
		tags: z.string().optional(),
		notes: z.string().optional(),
		enabled: z.boolean().optional()
	})
});
const IdRequestSchema = z.object({ id: z.string() });
const InspectRequestSchema = z.object({ id: z.string().optional() });
const ExecRequestSchema = z.object({
	id: z.string(),
	command: z.string(),
	timeoutMs: z.number().optional()
});
const BmcPowerRequestSchema = z.object({
	id: z.string(),
	action: z.string()
});
const BmcBiosRequestSchema = z.object({
	id: z.string(),
	attribute: z.string().optional(),
	value: z.string().optional()
});
const ListServersResultSchema = result({
	servers: z.array(ServerSchema),
	checks: z.record(z.string(), CheckSchema),
	lastInspectAt: z.number().nullable(),
	inspectIntervalMs: z.number(),
	hasIpmitool: z.boolean(),
	bmcTransport: z.string(),
	running: z.boolean()
});
const AddServerResultSchema = result({ server: ServerSchema });
const UpdateServerResultSchema = result({ server: ServerSchema });
const DeleteServerResultSchema = result({});
const InspectResultSchema = result({
	checkedAt: z.number(),
	results: z.array(CheckSchema)
});
const ExecResultItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	host: z.string(),
	ok: z.boolean(),
	exitCode: z.number().nullable(),
	stdout: z.string(),
	stderr: z.string(),
	error: z.string().nullable(),
	timedOut: z.boolean()
});
const ExecResultSchema = result({ results: z.array(ExecResultItemSchema) });
const jsonScalar = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null()
]);
const BmcStatusResultSchema = z.union([z.object({
	ok: z.literal(true),
	transport: z.string(),
	model: z.string().nullable(),
	manufacturer: z.string().nullable(),
	serial: z.string().nullable(),
	powerState: z.string().nullable(),
	health: z.string().nullable(),
	severity: z.string().nullable()
}), z.object({
	ok: z.literal(false),
	transport: z.string().optional(),
	error: z.string()
})]);
const BmcPowerResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		transport: z.string(),
		powerState: z.string().nullable(),
		health: z.string().nullable()
	}),
	z.object({
		ok: z.literal(true),
		transport: z.string(),
		requested: z.string(),
		note: z.string()
	}),
	z.object({
		ok: z.literal(false),
		transport: z.string().optional(),
		error: z.string()
	})
]);
const BmcBiosResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		transport: z.string(),
		attributeRegistry: z.string().nullable(),
		attributeCount: z.number(),
		attributes: z.record(z.string(), jsonScalar)
	}),
	z.object({
		ok: z.literal(true),
		transport: z.string(),
		attribute: z.string(),
		value: jsonScalar.nullable()
	}),
	z.object({
		ok: z.literal(true),
		transport: z.string(),
		set: z.record(z.string(), jsonScalar),
		note: z.string()
	}),
	z.object({
		ok: z.literal(false),
		transport: z.string().optional(),
		error: z.string(),
		hint: z.string().optional()
	})
]);
const UpdateResultSchema = z.union([z.object({
	ok: z.literal(true),
	changed: z.boolean(),
	beforeHash: z.string().nullable(),
	afterHash: z.string().nullable(),
	log: z.string(),
	pullOutput: z.string(),
	repoPath: z.string(),
	note: z.string()
}), z.object({
	ok: z.literal(false),
	error: z.string()
})]);
//#endregion
export { AddServerRequestSchema, AddServerResultSchema, BmcBiosRequestSchema, BmcBiosResultSchema, BmcPowerRequestSchema, BmcPowerResultSchema, BmcStatusResultSchema, CheckSchema, DeleteServerResultSchema, ExecRequestSchema, ExecResultItemSchema, ExecResultSchema, IdRequestSchema, InspectRequestSchema, InspectResultSchema, ListServersResultSchema, ServerSchema, UpdateResultSchema, UpdateServerRequestSchema, UpdateServerResultSchema };
