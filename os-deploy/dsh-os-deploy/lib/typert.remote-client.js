// Simplified typert remote-client bridge for @qinwei/dsh-os-deploy
// Client-side stubs that proxy @Remote calls to the host service.

export function createOsDeployRemote(ctx: any): any {
  const call = (method: string) => async (...args: any[]) => {
    return await ctx.remote.call('osDeploy', method, ...args)
  }
  return {
    listServers: call('listServers'),
    registerIso: call('registerIso'),
    extractImage: call('extractImage'),
    deleteImage: call('deleteImage'),
    listImages: call('listImages'),
    listComponents: call('listComponents'),
    probeDevice: call('probeDevice'),
    createTask: call('createTask'),
    listTasks: call('listTasks'),
    getTaskDetail: call('getTaskDetail'),
    cancelTask: call('cancelTask'),
    deleteTask: call('deleteTask'),
  }
}
