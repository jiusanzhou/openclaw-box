# OpenClaw 安装助手

OpenClaw 一键安装桌面应用，帮助中文用户快速部署 OpenClaw 智能助手。

## 功能特性

- 自动检测系统环境（操作系统、Node.js、网络连接）
- 支持多家国内 LLM 服务商配置
- 一键安装部署
- 支持 Web 界面和 Telegram Bot 两种接入渠道

## 支持的 LLM 服务商

| 服务商 | 接口地址 |
|--------|---------|
| 硅基流动 (SiliconFlow) | `https://api.siliconflow.cn/v1` |
| 智谱AI (Zhipu) | `https://open.bigmodel.cn/api/paas/v4` |
| 通义千问 (Tongyi) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| 自定义 | 用户自行填写 |

## 技术栈

- [Tauri v2](https://v2.tauri.app/) — 桌面应用框架
- [React 19](https://react.dev/) — 前端框架
- [TypeScript](https://www.typescriptlang.org/) — 类型安全
- [Vite](https://vitejs.dev/) — 构建工具
- [TailwindCSS v3](https://tailwindcss.com/) — 样式框架

## 开发

### 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.70+
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run tauri dev
```

### 构建发布版本

```bash
npm run tauri build
```

## 项目结构

```
openclaw-installer/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── steps/          # 安装步骤页面
│   │   └── ui/             # 通用 UI 组件
│   ├── lib/                # 类型定义
│   └── styles/             # 样式文件
├── src-tauri/              # Rust 后端
│   ├── src/                # Rust 源码
│   ├── capabilities/       # Tauri 权限配置
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # Tauri 应用配置
├── index.html              # HTML 入口
├── package.json            # Node.js 依赖
└── vite.config.ts          # Vite 配置
```

## 许可证

MIT
