# Phase 1 验收记录

2026-11-18：完成 React/Vite/TypeScript 前端、NestJS API、PostgreSQL 初始迁移。

实现注册、登录、会话恢复、退出、旅行创建、列表、详情、编辑。密码使用带随机盐的 scrypt；会话只存令牌摘要；写操作校验 CSRF。创建旅行与 owner 成员关系在同一事务写入。成员隔离和乐观版本冲突校验已验证。

## 实际验证

- npm run typecheck：通过。
- npm run lint：通过。
- npm run build：通过。
- npm test：密码/令牌两项通过。
- TEST_API_URL=http://127.0.0.1:3001/api npm test：全部三项通过，包含真实 PostgreSQL 集成测试，无跳过。
- Playwright + 本机 Edge：两项通过，包含注册、创建旅行、刷新后持久化、退出、明暗主题和 390px 宽度检查。

历史验收使用独立测试数据库和合成数据。复测时请自行生成测试凭据。

PowerShell 复现集成测试：设置 $env:TEST_API_URL='http://127.0.0.1:3001/api'，然后 npm test。必须先启动已迁移的测试数据库和 API。测试会保留带唯一邮箱的测试记录，仅针对独立测试数据库执行。

Playwright Chromium 下载起初超时，重试后已完成下载；本次验收使用已安装 Edge。设置 $env:BROWSER_CHANNEL='msedge' 后运行 npx playwright test；可通过 WEB_TEST_URL 指定已运行前端地址。

## 范围与限制

地图、路线、导入、邀请、共享位置、附件、删除归档、PWA 尚未实现。PostGIS 空间字段到地图阶段加入；当前模型不需要空间运算。前端采用普通 CSS 和主题变量，尚未安装 Tailwind，避免本阶段增加无必要依赖。

认证限流目前是单进程内存计数，生产多实例部署需共享限流。尚无邮件验证、密码重置、完整审计和生产部署加固。当前服务只监听本机。

不得将此阶段结果作为生产环境最终安全验收。等待用户确认后再进入 Phase 2。
