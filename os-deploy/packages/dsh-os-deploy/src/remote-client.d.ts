// 构建期类型垫片：src/client.ts 通过包自引用导入 '@qinwei/dsh-os-deploy/remote'
// （即 host 构建生成的 lib/typert.remote-client.js）。host 构建的 clean 步骤
// 会先清空 lib/，而 typert-generator 的 checkProject 在重新生成该文件之前
// 运行——环境模块声明让类型检查不依赖产物存在。
// client 构建（tsdown.client.config.ts）在 host 之后运行，此时真实文件已在，
// 会内联其真实内容（zod schema 等）；本垫片只提供宽松的类型形状。
declare module '@qinwei/dsh-os-deploy/remote' {
  /** Host 构建生成的 Client Remote 贡献（描述符 + zod 编解码）。 */
  export const TYPERT_REMOTE: {
    package: string
    descriptors: ReadonlyArray<Record<string, unknown>>
  }
  export default typeof TYPERT_REMOTE
}
