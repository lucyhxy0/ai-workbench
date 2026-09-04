# AI 工作台（个人生活 + 交易管理助手）

一个免费、全云端、双端（iOS / Android）运行的 PWA。打开浏览器即可使用，可"添加到主屏幕"像原生 App 一样用。

## 功能

| 模块 | 说明 |
|------|------|
| 🌅 今日主页 | 一屏聚合：晨报、饮食打卡、操盘提醒、待办、日历事件 |
| 🌅 每日晨报 | 手动点生成，拉取美股夜盘 + 经济日历 + AI 摘要 |
| 🍱 饮食 | 三餐手动规划 + 维生素双款打卡 + 周复盘 |
| 📈 操盘 | 每日操作记录 + 复盘 + AI 辅助分析 + 周复盘 |
| 📅 日历 | 月视图记录重要事项（生日/旅行/体检等） |
| 📆 月度事务 | 水电费/信用卡/猫咪驱虫等，每月固定提醒 |
| 💬 AI 对话 | DeepSeek 流式对话，多会话历史 |
| 🔗 Notion 同步 | 今日数据一键同步到 Notion |

## 技术栈

- 前端：React + Vite + vite-plugin-pwa
- 后端：Vercel Serverless Functions（Node.js）
- 数据库：Supabase PostgreSQL（免费 500MB，RLS 行级安全）
- AI：DeepSeek API
- 金融数据：Finnhub API（美股 + 经济日历）
- 同步：Notion API

**全免费，电脑不需要开机。**

## 部署步骤

### 1. 创建 Supabase 项目
1. 打开 https://supabase.com 用 GitHub 登录，新建项目
2. 进入 `SQL Editor` → 新建查询 → 粘贴本仓库 `supabase/schema.sql` 全部内容 → 运行
3. 进入 `Authentication → Providers` 确认 Email 登录开启
4. 记下 `Project Settings → API` 中的 **Project URL** 和 **anon public key**

### 2. 申请 API Key
- **DeepSeek**：https://platform.deepseek.com → API Keys（充值后可用，约 ¥1/百万 token）
- **Finnhub**：https://finnhub.io → Dashboard → API Key（免费版每分钟 60 次）

### 3. 部署到 Vercel
1. 把本仓库推送到 GitHub
2. 打开 https://vercel.com → Import 该仓库
3. Framework 选 Vercel 会自动识别（见 vercel.json）
4. 在 `Settings → Environment Variables` 添加：
   - `VITE_SUPABASE_URL` = 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 Supabase anon key
   - `SUPABASE_URL` = 同上
   - `SUPABASE_ANON_KEY` = 同上
   - `DEEPSEEK_API_KEY` = DeepSeek Key
   - `FINNHUB_API_KEY` = Finnhub Key
   - `NOTION_TOKEN` = 你的 Notion Integration Token（也可在 App 设置里填，本设备生效）
5. Deploy → 获得域名（如 `xxx.vercel.app`）

> 建议开启 Vercel `Deployment Protection`（Settings → Deployment Protection），仅自己能访问。

### 4. 配置 Notion（可选）
1. https://www.notion.so/my-integrations → New integration → 复制 **Internal Integration Secret**（ntn_...）
2. 在 Notion 打开一个页面 → 右上角 `···` → `Connections` → 连接你的 Integration
3. 复制该页面 URL 末尾的 32 位 ID
4. App 内「设置」填入 Token 和父页面 ID → 保存 → 同步

### 5. 手机安装
- **iOS**：Safari 打开域名 → 分享 → 添加到主屏幕
- **Android**：Chrome 打开 → 菜单 → 安装应用

## 本地开发

```bash
cp .env.example .env.local   # 填入上方变量
npm install
npm run dev                  # 本地预览（前端）
```

Serverless 函数本地可用 `vercel dev` 调试。

## 目录结构

```
ai-workbench/
├── api/                 # Vercel Serverless Functions
│   ├── chat.js          # DeepSeek 流式代理
│   ├── briefing.js      # 美股+经济+AI 晨报
│   └── notion.js        # 同步到 Notion
├── src/
│   ├── pages/           # 各功能页
│   ├── components/      # 导航/顶栏
│   └── lib/             # supabase / api / date 工具
├── supabase/schema.sql  # 数据库建表 + RLS
├── public/              # PWA 图标
├── vercel.json
└── vite.config.js
```

## 安全说明
- Supabase 启用 RLS，每个用户只能访问自己的数据
- 所有密钥存于 Vercel 环境变量 / 本机 .env.local（已 gitignore），不进代码
- 传输全程 HTTPS，存储 AES-256 加密
- Supabase 免费版项目空闲 1 周会暂停，App 内数据仍可在本地缓存查看，恢复后自动同步

Last deploy trigger: 2026-09-04T15:20:33.561Z
