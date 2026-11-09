# AI 课程开发工作台

面向企业培训师的课程开发工作台，按需求分析、大纲、模块母版、课程材料和质量验收五个阶段逐步完成一门课程。授课 PPT 可预览、编辑并导出为 PPTX；学员手册、讲师手册和 Handout 可编辑并导出为 Markdown。

## 部署到 Cloudflare Workers

本仓库使用 Cloudflare Workers 运行后端。自定义域名部署前，需要将域名 DNS 托管到 Cloudflare。建议用 Cloudflare Access 限制只有获准的邮箱可以访问，避免未授权访客调用 AI API。

### 1. 安装并登录 Wrangler

需要 Node.js 20 或更高版本。

```bash
npx --yes wrangler login
```

### 2. 构建并部署 Worker

```bash
node scripts/build-worker.mjs
npx --yes wrangler deploy
```

配置将 Worker 绑定到 `dist/server/index.js`，并关闭公开的 `workers.dev` 地址。后端会从 Worker Secret 中读取 OpenAI API 密钥；密钥不会进入浏览器代码或 Git 仓库。

### 3. 配置 API 密钥

```bash
npx --yes wrangler secret put OPENAI_API_KEY
```

在命令提示中粘贴 OpenAI API key。不要把真实密钥写入 `.env.example`、`wrangler.jsonc`、GitHub Actions 明文变量或任何已提交文件。

### 4. 配置访问控制和域名

1. 在 Cloudflare Zero Trust 中为 `coursemaster.cloud` 建立 Access 应用，并添加只允许你本人邮箱的策略。
2. 在 Workers & Pages 中打开本 Worker 的 Settings → Domains & Routes，添加自定义域名 `coursemaster.cloud`。如需 `www.coursemaster.cloud`，再单独添加 `www`。
3. 确认 Access 应用覆盖该域名的所有路径。应用用 Access 注入的已验证邮箱识别请求；没有通过 Access 的请求不能生成课程内容。

### 5. 从 GitHub 持续部署

在 Cloudflare Workers Builds 中连接此 GitHub 仓库，构建命令设为：

```bash
node scripts/build-worker.mjs
```

部署命令设为：

```bash
npx --yes wrangler deploy
```

将 `OPENAI_API_KEY` 作为 Cloudflare Worker Secret 配置，不要作为公开的构建变量提交到仓库。

## 本地开发

```bash
npm install
npx --yes wrangler dev
```

本地需要调用 AI 时，可创建仅供本机使用的 `.dev.vars`，内容为 `OPENAI_API_KEY=...`；该文件已加入 `.gitignore`，不要提交。

## 数据与隐私

课程项目保存在当前浏览器的本地存储中，不会自动同步到其他设备或浏览器。生成课程内容时，相关课程资料会发送到 OpenAI API。API key 只在 Worker 的服务端 Secret 中使用。
