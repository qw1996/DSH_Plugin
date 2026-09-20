// Simplified typert bridge for @qinwei/dsh-os-deploy
// The full typert-generator requires a workspace setup; this is a manual bridge.
// It registers the @Remote method schemas so TypertRemoteService can expose them.

export const remoteMethods = {
  listServers: { params: [], result: 'any' },
  registerIso: { params: ['any'], result: 'any' },
  extractImage: { params: ['any'], result: 'any' },
  deleteImage: { params: ['any'], result: 'any' },
  listImages: { params: [], result: 'any' },
  listComponents: { params: ['any'], result: 'any' },
  probeDevice: { params: ['any'], result: 'any' },
  createTask: { params: ['any'], result: 'any' },
  listTasks: { params: [], result: 'any' },
  getTaskDetail: { params: ['any'], result: 'any' },
  cancelTask: { params: ['any'], result: 'any' },
  deleteTask: { params: ['any'], result: 'any' },
}
