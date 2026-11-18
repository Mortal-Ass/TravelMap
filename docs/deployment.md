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

### 复用已有数据库卷并跳过启动迁移

仅用于与当前应用版本结构兼容的 PostgreSQL 17 数据库。先查看原数据库容器挂载到数据目录的卷名，将其填入本地部署环境文件的 `TRAVELMAP_EXISTING_VOLUME`，并保留原 Compose 项目名、数据库凭据和服务端 `AMAP_WEB_SERVICE_KEY`。同一卷同一时间只能由一个 PostgreSQL 实例使用。

```powershell
docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' travelmap-acceptance-db-1
docker compose -p travelmap-acceptance --env-file deploy/production.env -f compose.yaml -f compose.recovery.yaml config --quiet
```

经确认后，用同一组参数执行 `up --build -d --wait`。覆盖文件要求指定的卷已经存在，拼错卷名时 Compose 会报错；API 直接启动。常规首次部署仍使用基础 Compose 文件。独立保存加密备份，以便原磁盘损坏时恢复。

### 固定体验地址

有自己的域名时，可在 Cloudflare 创建命名隧道，为 Web 服务添加固定子域名的 Published application 路由。若连接器与 Web 在同一 Docker 网络，可为 Caddy 设置 `SITE_ADDRESS=http://:80` 并将隧道源站设为 `http://web:80`，公网使用 HTTPS。仅在采用该拓扑时切换站点地址。连接器设置自动重启，令牌保存在部署机。电脑休眠时站点会离线；需要全天访问可将应用部署在常开服务器。详见 [Cloudflare 命名隧道指南](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)。

```powershell
$dbContainer = docker compose --env-file deploy/production.env ps -q db
./deploy/backup.ps1 -Container $dbContainer -OutputFile ./travelmap-backup.dump
./deploy/restore.ps1 -Container $dbContainer -Archive ./travelmap-backup.dump
```
备份包含账号、密码摘要、旅行、地点、成员和行程。将归档存放在受限、加密的备份目录，另行保管环境文件与证书。脚本排除会话、实时位置及邀请/分享令牌数据。恢复后需重新登录并生成链接。恢复脚本在同一 PostgreSQL 实例内创建一个全新 restore_ 开头的数据库并输出名称。核对账号与行程后，将 compose.yaml 中 API 的 PGDATABASE 设置为该数据库名并重建 API；后续备份应针对已切换的数据库。生产切换前暂停写入并保留原数据库。备份频率与保留期限由部署者按需要设置。

## 验收范围
本机 Compose 测试使用独立项目名、端口和数据库。公网 DNS、外部设备证书信任和手机主屏幕安装需在实际目标环境验收。
