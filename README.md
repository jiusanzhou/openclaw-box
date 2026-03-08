<p align="center">
  <img src="docs/icon.png" width="128" height="128" alt="OpenClaw 安装助手" />
</p>

<h1 align="center">OpenClaw 安装助手</h1>

<p align="center">
  帮助中国用户一键安装配置 <a href="https://github.com/openclaw/openclaw">OpenClaw</a> 的桌面工具
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## ✨ 功能

- 🖥️ **一键安装** — 自动检测环境、下载 Node.js、安装 OpenClaw、生成配置、启动服务
- 🇨🇳 **中国优化** — npm/Node.js 使用国内镜像源，告别网络问题
- 🤖 **多模型支持** — DeepSeek、硅基流动、智谱AI、通义千问、OpenRouter 等
- 💬 **多渠道接入** — Web 界面、Telegram、飞书、QQ
- 🔄 **远程配置** — 模型列表、渠道配置、镜像源均从远程加载，无需更新客户端
- 🪟 **跨平台** — Windows（原生 + WSL2）、macOS、Linux

## 📦 安装

从 [Releases](https://github.com/jiusanzhou/openclaw-installer/releases) 下载对应平台安装包：

| 平台 | 文件 |
|------|------|
| Windows | `.exe` / `.msi` |
| macOS (Apple Silicon) | `_aarch64.dmg` |
| macOS (Intel) | `_x64.dmg` |
| Linux | `.deb` / `.AppImage` |

## 🚀 使用

1. 打开安装助手
2. **欢迎** — 自动检测系统环境（OS、Node.js、网络）
3. **配置** — 选择 LLM 服务商、填写 API Key、选择接入渠道
4. **安装** — 一键完成所有安装步骤

## 🔧 远程配置

所有可配置项存放在 [`config/remote.json`](config/remote.json)，修改后 push 即生效：

- 镜像源地址
- Node.js / OpenClaw 版本
- LLM 服务商及模型列表
- 接入渠道及配置字段
- 公告信息

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

MIT
