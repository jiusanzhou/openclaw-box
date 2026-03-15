<p align="center">
  <img src="docs/icon.png" width="128" height="128" alt="OpenClaw Box" />
</p>

<h1 align="center">OpenClaw Box</h1>

<p align="center">
  安装、配置、管理你的 <a href="https://github.com/openclaw/openclaw">OpenClaw</a> AI 智能助手 — 一个桌面应用搞定
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

<p align="center">
  <a href="./README_EN.md">English</a>
</p>

---

## ✨ 功能

### 🤖 智能体管理中心
- 一览所有 Agent 及实时状态（工作中 / 空闲 / 离线）
- Agent 详情页包含 6 个子标签：
  - **💬 对话** — 内嵌聊天界面
  - **⏰ 定时任务** — 查看和手动触发 Cron 任务
  - **🧠 记忆** — 浏览和编辑 Agent 记忆文件
  - **📡 渠道** — 查看渠道绑定关系（Telegram、Kim 等）
  - **📊 用量** — Token 用量统计和每日趋势
  - **⚙️ 配置** — 模型切换和 Agent 配置
- 直接在界面创建新的智能体

### 🧩 模型管理
- 查看已配置的供应商及其模型列表
- 新增 LLM 供应商（DeepSeek、硅基流动、智谱 AI、通义千问、OpenRouter 等）
- 保存前可测试 API 连接
- 一键切换 Agent 使用的模型

### 🔗 渠道管理
- 查看已接入的渠道及其 Agent 绑定关系
- 支持 Telegram、Kim、飞书、QQ 等多种渠道
- 清晰展示每个渠道绑定了哪些 Agent

### 🖥️ 一键安装
- 自动检测系统环境（OS、Node.js、网络）
- 自动下载 Node.js 并安装 OpenClaw
- 🇨🇳 国内优化：npm 和 Node.js 使用国内镜像源
- 引导式配置向导：选择 LLM 服务商 → 填写 API Key → 选择接入渠道

### 📊 仪表盘
- Gateway 状态和健康监控
- Token 用量和费用追踪
- Agent 活动概览
- 系统健康检查

### 🔧 设置
- OpenClaw 配置编辑器
- 版本更新检查和安装
- 配置备份和恢复
- 系统诊断

## 📦 安装

从 [Releases](https://github.com/jiusanzhou/openclaw-box/releases) 下载对应平台安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `_aarch64.dmg` |
| macOS (Intel) | `_x64.dmg` |
| Windows | `.exe` / `.msi` |
| Linux | `.deb` / `.AppImage` |

## 🚀 快速开始

1. 打开 OpenClaw Box
2. 按照安装向导完成配置（环境检测 → 模型配置 → 渠道配置 → 安装）
3. 开始管理你的 AI 智能体！

## 🛠️ 开发

```bash
# 安装依赖
pnpm install

# 启动开发环境
pnpm tauri dev

# 构建发布版本
pnpm tauri build
```

### 前置要求

- Node.js 18+
- Rust 1.70+
- pnpm

## 📐 技术栈

- [Tauri v2](https://v2.tauri.app/) — 桌面应用框架
- [React 19](https://react.dev/) — 前端
- [TypeScript](https://www.typescriptlang.org/) — 类型安全
- [TailwindCSS](https://tailwindcss.com/) — 样式
- [Rust](https://www.rust-lang.org/) — 后端

## License

[MIT](LICENSE)
