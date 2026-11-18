# TravelMap 自托管部署

在项目根目录执行命令。需要 Docker Engine、Compose v2；示例脚本使用 PowerShell。生产栈使用 Caddy、Node API 和 PostgreSQL 17。数据库、API 仅绑定 Compose 内部网络，默认入口仅向本机发布。

## 首次启动
复制配置并填写随机数据库密码。示例使用 PowerShell：
```powershell
Copy-Item deploy/example.env deploy/production.env
```
编辑 deploy/production.env，填写 DB_PASSWORD 和服务端 AMAP_WEB_SERVICE_KEY。容器内 localhost 指向容器自己；需要宿主机代理时，在 Docker Desktop 使用 host.docker.internal 与代理实际开放的端口。地图瓦片和署名通过 VITE_TILE_URL、VITE_TILE_ATTRIBUTION 在构建时设置。路线和地理编码服务通过 compose.yaml 中对应变量在运行时设置。

```powershell
docker compose --env-file deploy/production.env up --build -d --wait
docker compose --env-file deploy/production.env ps
docker compose --env-file deploy/production.env logs --tail 80 api web
```

本机入口为 https://localhost:8443，Caddy 使用本地 CA。只向测试设备安装自己核实的 CA 公钥证书。正式部署设置 SITE_ADDRESS 为你的域名，DNS 指向服务器，BIND_IP 设置为服务器监听地址，HTTP_PORT=80、HTTPS_PORT=443，确保外部可访问这两个端口。Caddy 将申请和续期证书。保留 certs、caddyconfig 数据卷。PWA 安装、定位和 Secure 会话需要可信 HTTPS。域名及可信证书配置成功后，使用该域名生成邀请链接。

## 迁移、更新和健康检查
API 启动时按编号执行 database/migrations，使用数据库锁避免并行升级，每个文件在事务中提交。已存在的版本会跳过。首次部署创建独立数据卷，原本机开发数据库的数据需通过备份迁移。更新前备份数据库，保留此前部署的镜像和配置，重新构建并启动。API 健康检查访问 /api/health 并查询数据库。检查容器状态和同源 HTTPS 接口，也应测试登录、邀请和位置 WebSocket。日志使用 Docker 的大小限制及轮转。迁移失败查看 API 日志并处理失败原因。停止服务可用 docker compose --env-file deploy/production.env stop。

## 备份与恢复
```powershell
$dbContainer = docker compose --env-file deploy/production.env ps -q db
./deploy/backup.ps1 -Container $dbContainer -OutputFile ./travelmap-backup.dump
./deploy/restore.ps1 -Container $dbContainer -Archive ./travelmap-backup.dump
```
备份包含账号、密码摘要、旅行、地点、成员和行程。将归档存放在受限、加密的备份目录，另行保管环境文件与证书。脚本排除会话、实时位置及邀请/分享令牌数据。恢复后需重新登录并生成链接。恢复脚本在同一 PostgreSQL 实例内创建一个全新 restore_ 开头的数据库并输出名称。核对账号与行程后，将 compose.yaml 中 API 的 PGDATABASE 设置为该数据库名并重建 API；后续备份应针对已切换的数据库。生产切换前暂停写入并保留原数据库。备份频率与保留期限由部署者按需要设置。

## 验收范围
本机 Compose 测试使用独立项目名、端口和数据库。公网 DNS、外部设备证书信任和手机主屏幕安装需在实际目标环境验收。
