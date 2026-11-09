# AI 课程开发工作台

面向企业培训师的课程开发工作台，按需求分析、大纲、模块母版、课程材料和质量验收五个阶段逐步完成一门课程。授课 PPT 可预览、编辑并导出为 PPTX；学员手册、讲师手册和 Handout 可编辑并导出为 Markdown。

本仓库可部署到腾讯云轻量应用服务器，也包含 SCF Web 函数启动文件。推荐轻量服务器：它更适合当前最长 90 秒的 AI 生成请求，也方便直接绑定 `coursemaster.cloud`。

## 部署前准备

- OpenAI API key。只设置在服务器或 SCF 的环境变量中，不能提交到 GitHub。
- `SITE_USERNAME` 和至少 16 个字符的唯一 `SITE_PASSWORD`。网站通过 HTTPS Basic Auth 做访问保护；用户名建议填写你的邮箱。
- 若使用中国大陆地域的服务器，先确认服务器可访问 `api.openai.com`，并按腾讯云及域名服务商要求完成 ICP 备案。无法访问 OpenAI API 时，选择具有可用出站网络的地域。

## 方案 A：腾讯云轻量应用服务器（推荐）

以下命令以 Ubuntu 22.04/24.04 为例。先在轻量应用服务器控制台开放 TCP 80 和 443 端口，并把 `coursemaster.cloud` 的 DNS A 记录指向服务器公网 IP。

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo git clone https://github.com/jim2880318-cell/ai-course.git /opt/course-workbench
cd /opt/course-workbench
npm run build
```

创建 `/etc/course-workbench.env`，填入自己的值：

```ini
OPENAI_API_KEY=你的OpenAI_API_Key
SITE_USERNAME=你的邮箱
SITE_PASSWORD=一段至少16位的唯一强密码
PORT=3000
```

限制环境文件权限：

```bash
sudo chmod 600 /etc/course-workbench.env
```

创建 `/etc/systemd/system/course-workbench.service`：

```ini
[Unit]
Description=AI Course Workbench
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/course-workbench
EnvironmentFile=/etc/course-workbench.env
ExecStart=/usr/bin/node /opt/course-workbench/server-node.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动应用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now course-workbench
```

把 Nginx 配置到本机 `127.0.0.1:3000`，再用 Certbot 为 `coursemaster.cloud` 配置 HTTPS。Basic Auth 凭证会随浏览器请求发给服务器，因此必须启用 HTTPS。Nginx 反向代理需要保留 `Authorization` 请求头，并设置 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`。

以后从 GitHub 更新：

```bash
cd /opt/course-workbench
sudo git pull
npm run build
sudo systemctl restart course-workbench
```

## 方案 B：腾讯云 SCF Web 函数

在腾讯云云函数控制台创建 **Web 函数**，运行时选择 Node.js 20.19，上传本仓库代码包并创建函数 URL。仓库中的 `scf_bootstrap` 会在 9000 端口启动 Node 服务。创建后在函数环境变量中配置 `OPENAI_API_KEY`、`SITE_USERNAME`、`SITE_PASSWORD`，并把函数超时调到至少 120 秒。

在 API 网关或函数 URL 的域名配置中添加 `coursemaster.cloud`，按腾讯云控制台给出的 CNAME/DNS 配置域名和 HTTPS。Web 函数的后端仍会要求 Basic Auth。SCF 的地域需能连到 OpenAI API；域名在大陆访问时还要满足备案要求。

腾讯云文档：[Web 函数说明](https://cloud.tencent.com/document/product/583/56124)、[启动文件说明](https://cloud.tencent.com/document/product/583/56126)、[Node.js 环境说明](https://cloud.tencent.com/document/api/583/11060)。

## 本地运行

需要 Node.js 20 或更高版本：

```bash
npm run build
OPENAI_API_KEY=... SITE_USERNAME=you@example.com SITE_PASSWORD='至少16位的本机强密码' npm start
```

访问 `http://localhost:3000`，浏览器会提示 Basic Auth 用户名和密码。生产环境只能通过 HTTPS 访问。

## 数据与隐私

课程项目保存在当前浏览器的本地存储中，不会自动同步到其他设备或浏览器。生成课程内容时，相关课程资料会发送到 OpenAI API。API key 只在服务端使用。
