# TravelMap

TravelMap 是自托管的多人旅行规划应用，支持旅行地图、地点筛选、每日行程、路线查询、攻略导入、邀请协作和位置共享。

## 本地运行

需要 Node.js（具体依赖兼容性以安装检查为准）、npm、PostgreSQL。

1. `npm install`
2. 复制 `.env.example` 为 `.env`，设置独立开发数据库凭据。
3. 在独立开发数据库中按编号依次应用 database/migrations 下的 SQL 文件。Docker 部署流程见文末指南。
4. 分别运行 `npm run dev:api` 和 `npm run dev:web`，打开 Vite 提供的地址。

后端只监听本机，前端通过 Vite 同源代理访问 API。生产环境需要 HTTPS 和反向代理，并设置 NODE_ENV=production。不要直接用于公网部署；生产多实例限流和部署加固仍需完成。阶段实际验收见 docs/phase-1.md。

## 检查

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。

数据库脚本不创建数据库和数据库用户。不要将真实密码提交到仓库。当前不提供自动模拟数据库，数据库不可用时应明确报错。

Docker 自托管、升级、备份与恢复见 [部署指南](docs/deployment.md)。
