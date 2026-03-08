use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

struct AppState {
    logs: Mutex<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct SystemInfo {
    os: String,
    arch: String,
    node_version: Option<String>,
    node_path: Option<String>,
    npm_version: Option<String>,
    network_ok: bool,
    has_wsl: bool,
    wsl_distros: Vec<String>,
    has_openclaw: bool,
    openclaw_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct InstallConfig {
    node_download_mirror: String,
    npm_registry: String,
    node_version: String,
    openclaw_version: String,
    provider_base_url: String,
    provider_name: String,
    api_key: String,
    model: String,
    channel_type: String,
    channel_config: HashMap<String, String>,
    install_mode: String,
}

#[derive(Serialize)]
struct StepResult {
    success: bool,
    message: String,
    logs: Vec<String>,
}

fn run_cmd(cmd: &str, args: &[&str]) -> Result<String, String> {
    Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("执行命令失败: {} - {}", cmd, e))
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    format!("命令 {} 返回非零退出码", cmd)
                } else {
                    stderr
                })
            }
        })
}

fn run_cmd_combined(cmd: &str, args: &[&str]) -> Result<String, String> {
    Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("执行命令失败: {} - {}", cmd, e))
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if stdout.is_empty() {
                stderr
            } else if stderr.is_empty() {
                stdout
            } else {
                format!("{}\n{}", stdout, stderr)
            }
        })
}

fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法确定用户主目录".to_string())
}

fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "x86",
        other => other,
    }
}

fn compare_versions(a: &str, b: &str) -> i32 {
    let pa: Vec<u32> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let pb: Vec<u32> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    let len = std::cmp::max(pa.len(), pb.len());
    for i in 0..len {
        let va = pa.get(i).copied().unwrap_or(0);
        let vb = pb.get(i).copied().unwrap_or(0);
        if va > vb {
            return 1;
        }
        if va < vb {
            return -1;
        }
    }
    0
}

fn check_network(host: &str, port: u16) -> bool {
    let addr_str = format!("{}:{}", host, port);
    addr_str
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .map(|addr| std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3)).is_ok())
        .unwrap_or(false)
}

#[tauri::command]
fn check_system() -> SystemInfo {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let node_version = run_cmd("node", &["--version"]).ok();

    let node_path = if cfg!(target_os = "windows") {
        run_cmd("where", &["node"]).ok()
    } else {
        run_cmd("which", &["node"]).ok()
    };

    let npm_version = run_cmd("npm", &["--version"]).ok();

    let network_ok = check_network("registry.npmmirror.com", 443);

    let (has_wsl, wsl_distros) = if cfg!(target_os = "windows") {
        match run_cmd("wsl", &["--list", "--quiet"]) {
            Ok(output) => {
                let distros: Vec<String> = output
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                (!distros.is_empty(), distros)
            }
            Err(_) => (false, vec![]),
        }
    } else {
        (false, vec![])
    };

    let openclaw_version = run_cmd("openclaw", &["--version"])
        .ok()
        .or_else(|| run_cmd("npx", &["openclaw", "--version"]).ok());
    let has_openclaw = openclaw_version.is_some();

    SystemInfo {
        os,
        arch,
        node_version,
        node_path,
        npm_version,
        network_ok,
        has_wsl,
        wsl_distros,
        has_openclaw,
        openclaw_version,
    }
}

#[tauri::command]
fn install_step_check_env(config: InstallConfig, state: State<AppState>) -> StepResult {
    let mut logs = Vec::new();

    // Check Node.js
    logs.push("检查 Node.js...".to_string());
    match run_cmd("node", &["--version"]) {
        Ok(v) => {
            logs.push(format!("Node.js 版本: {}", v));
            let installed = v.trim_start_matches('v');
            if compare_versions(installed, &config.node_version) >= 0 {
                logs.push(format!(
                    "Node.js 版本满足要求 (≥{})",
                    config.node_version
                ));
            } else {
                logs.push(format!(
                    "Node.js 版本过低，需要 ≥{}，将在下一步安装",
                    config.node_version
                ));
            }
        }
        Err(_) => {
            logs.push("未检测到 Node.js，将在下一步安装".to_string());
        }
    }

    // Check npm
    logs.push("检查 npm...".to_string());
    match run_cmd("npm", &["--version"]) {
        Ok(v) => logs.push(format!("npm 版本: {}", v)),
        Err(_) => logs.push("未检测到 npm（将随 Node.js 一起安装）".to_string()),
    }

    // Check network
    let registry_host = config
        .npm_registry
        .replace("https://", "")
        .replace("http://", "")
        .trim_end_matches('/')
        .to_string();
    logs.push(format!("检查网络连接 ({})...", registry_host));
    if check_network(&registry_host, 443) {
        logs.push("网络连接正常".to_string());
    } else {
        logs.push("警告：无法连接到镜像站，安装可能会失败".to_string());
    }

    state.logs.lock().unwrap().extend(logs.clone());

    StepResult {
        success: true,
        message: "环境检查完成".to_string(),
        logs,
    }
}

#[tauri::command]
fn install_step_node(config: InstallConfig, state: State<AppState>) -> StepResult {
    let mut logs = Vec::new();

    // Check if Node.js is already sufficient
    if let Ok(v) = run_cmd("node", &["--version"]) {
        let installed = v.trim_start_matches('v');
        if compare_versions(installed, &config.node_version) >= 0 {
            logs.push(format!("Node.js {} 已安装，跳过安装步骤", v));
            state.logs.lock().unwrap().extend(logs.clone());
            return StepResult {
                success: true,
                message: format!("Node.js {} 已满足要求", v),
                logs,
            };
        }
    }

    let version = &config.node_version;
    let mirror = config.node_download_mirror.trim_end_matches('/');
    let os_name = std::env::consts::OS;
    let arch = node_arch();

    logs.push(format!("开始安装 Node.js v{}...", version));

    match os_name {
        "macos" => {
            let url = format!("{}/v{}/node-v{}.pkg", mirror, version, version);
            let tmp_path = "/tmp/node_installer.pkg";

            logs.push(format!("下载: {}", url));
            match run_cmd("curl", &["-fSL", "--progress-bar", "-o", tmp_path, &url]) {
                Ok(_) => logs.push("下载完成".to_string()),
                Err(e) => {
                    logs.push(format!("下载失败: {}", e));
                    state.logs.lock().unwrap().extend(logs.clone());
                    return StepResult {
                        success: false,
                        message: format!("下载 Node.js 失败: {}", e),
                        logs,
                    };
                }
            }

            logs.push("安装 Node.js（可能需要输入管理员密码）...".to_string());
            let install_script = format!(
                "installer -pkg {} -target /",
                tmp_path
            );
            match run_cmd(
                "osascript",
                &[
                    "-e",
                    &format!(
                        "do shell script \"{}\" with administrator privileges",
                        install_script
                    ),
                ],
            ) {
                Ok(_) => logs.push("Node.js 安装完成".to_string()),
                Err(e) => {
                    logs.push(format!("安装失败: {}", e));
                    state.logs.lock().unwrap().extend(logs.clone());
                    return StepResult {
                        success: false,
                        message: format!("安装 Node.js 失败: {}", e),
                        logs,
                    };
                }
            }

            let _ = std::fs::remove_file(tmp_path);
        }
        "linux" => {
            let filename = format!("node-v{}-linux-{}.tar.xz", version, arch);
            let url = format!("{}/v{}/{}", mirror, version, filename);
            let tmp_path = format!("/tmp/{}", filename);

            logs.push(format!("下载: {}", url));
            match run_cmd("curl", &["-fSL", "--progress-bar", "-o", &tmp_path, &url]) {
                Ok(_) => logs.push("下载完成".to_string()),
                Err(e) => {
                    logs.push(format!("下载失败: {}", e));
                    state.logs.lock().unwrap().extend(logs.clone());
                    return StepResult {
                        success: false,
                        message: format!("下载 Node.js 失败: {}", e),
                        logs,
                    };
                }
            }

            let home = match get_home_dir() {
                Ok(h) => h,
                Err(e) => {
                    logs.push(format!("错误: {}", e));
                    state.logs.lock().unwrap().extend(logs.clone());
                    return StepResult {
                        success: false,
                        message: e,
                        logs,
                    };
                }
            };

            let local_dir = format!("{}/.local", home);
            let _ = std::fs::create_dir_all(&local_dir);

            logs.push(format!("解压到 {}...", local_dir));
            match run_cmd(
                "tar",
                &["-xf", &tmp_path, "-C", &local_dir, "--strip-components=1"],
            ) {
                Ok(_) => logs.push("解压完成".to_string()),
                Err(e) => {
                    logs.push(format!(
                        "解压到用户目录失败 ({}), 尝试 /usr/local...",
                        e
                    ));
                    match run_cmd(
                        "sudo",
                        &[
                            "tar",
                            "-xf",
                            &tmp_path,
                            "-C",
                            "/usr/local",
                            "--strip-components=1",
                        ],
                    ) {
                        Ok(_) => logs.push("解压到 /usr/local 完成".to_string()),
                        Err(e2) => {
                            logs.push(format!("安装失败: {}", e2));
                            state.logs.lock().unwrap().extend(logs.clone());
                            return StepResult {
                                success: false,
                                message: format!("安装 Node.js 失败: {}", e2),
                                logs,
                            };
                        }
                    }
                }
            }

            let _ = std::fs::remove_file(&tmp_path);
        }
        "windows" => {
            if config.install_mode == "wsl" {
                let filename = format!("node-v{}-linux-{}.tar.xz", version, arch);
                let url = format!("{}/v{}/{}", mirror, version, filename);
                let script = format!(
                    "curl -fSL -o /tmp/{fn} {url} && mkdir -p ~/.local && tar -xf /tmp/{fn} -C ~/.local --strip-components=1 && rm /tmp/{fn}",
                    fn = filename,
                    url = url,
                );

                logs.push("在 WSL 中安装 Node.js...".to_string());
                match run_cmd_combined("wsl", &["--", "bash", "-c", &script]) {
                    Ok(out) => {
                        if !out.is_empty() {
                            logs.push(out);
                        }
                        logs.push("WSL 中 Node.js 安装完成".to_string());
                    }
                    Err(e) => {
                        logs.push(format!("WSL 安装失败: {}", e));
                        state.logs.lock().unwrap().extend(logs.clone());
                        return StepResult {
                            success: false,
                            message: format!("WSL 安装 Node.js 失败: {}", e),
                            logs,
                        };
                    }
                }
            } else {
                let url = format!(
                    "{}/v{}/node-v{}-{}.msi",
                    mirror, version, version, arch
                );
                let tmp_path =
                    format!("{}\\node_installer.msi", std::env::temp_dir().display());

                logs.push(format!("下载: {}", url));
                match run_cmd("curl", &["-fSL", "-o", &tmp_path, &url]) {
                    Ok(_) => logs.push("下载完成".to_string()),
                    Err(e) => {
                        logs.push(format!("下载失败: {}", e));
                        state.logs.lock().unwrap().extend(logs.clone());
                        return StepResult {
                            success: false,
                            message: format!("下载 Node.js 失败: {}", e),
                            logs,
                        };
                    }
                }

                logs.push("安装 Node.js（可能需要管理员权限）...".to_string());
                match run_cmd("msiexec", &["/i", &tmp_path, "/qn", "/norestart"]) {
                    Ok(_) => logs.push("Node.js 安装完成".to_string()),
                    Err(e) => {
                        logs.push(format!("安装失败: {}", e));
                        state.logs.lock().unwrap().extend(logs.clone());
                        return StepResult {
                            success: false,
                            message: format!("安装 Node.js 失败: {}", e),
                            logs,
                        };
                    }
                }

                let _ = std::fs::remove_file(&tmp_path);
            }
        }
        _ => {
            logs.push(format!("不支持的操作系统: {}", os_name));
            state.logs.lock().unwrap().extend(logs.clone());
            return StepResult {
                success: false,
                message: format!("不支持的操作系统: {}", os_name),
                logs,
            };
        }
    }

    // Verify installation
    logs.push("验证 Node.js 安装...".to_string());
    match run_cmd("node", &["--version"]) {
        Ok(v) => {
            logs.push(format!("Node.js {} 安装成功", v));
            state.logs.lock().unwrap().extend(logs.clone());
            StepResult {
                success: true,
                message: format!("Node.js {} 安装成功", v),
                logs,
            }
        }
        Err(_) => {
            logs.push("安装后无法验证 Node.js，可能需要重启终端".to_string());
            state.logs.lock().unwrap().extend(logs.clone());
            StepResult {
                success: true,
                message: "Node.js 已安装（可能需要重启终端生效）".to_string(),
                logs,
            }
        }
    }
}

#[tauri::command]
fn install_step_openclaw(config: InstallConfig, state: State<AppState>) -> StepResult {
    let mut logs = Vec::new();

    // Set npm registry
    logs.push(format!("设置 npm 镜像: {}", config.npm_registry));
    match run_cmd("npm", &["config", "set", "registry", &config.npm_registry]) {
        Ok(_) => logs.push("npm 镜像设置完成".to_string()),
        Err(e) => logs.push(format!("设置镜像失败（继续安装）: {}", e)),
    }

    // Install openclaw
    let version_arg = if config.openclaw_version == "latest" {
        "openclaw".to_string()
    } else {
        format!("openclaw@{}", config.openclaw_version)
    };

    logs.push(format!("安装 {}...", version_arg));
    match run_cmd_combined("npm", &["install", "-g", &version_arg]) {
        Ok(output) => {
            if !output.is_empty() {
                for line in output.lines() {
                    logs.push(line.to_string());
                }
            }
        }
        Err(e) => {
            logs.push(format!("安装失败: {}", e));
            state.logs.lock().unwrap().extend(logs.clone());
            return StepResult {
                success: false,
                message: format!("安装 OpenClaw 失败: {}", e),
                logs,
            };
        }
    }

    // Verify
    logs.push("验证 OpenClaw 安装...".to_string());
    match run_cmd("openclaw", &["--version"]) {
        Ok(v) => {
            logs.push(format!("OpenClaw {} 安装成功", v));
            state.logs.lock().unwrap().extend(logs.clone());
            StepResult {
                success: true,
                message: format!("OpenClaw {} 安装成功", v),
                logs,
            }
        }
        Err(_) => match run_cmd("npx", &["openclaw", "--version"]) {
            Ok(v) => {
                logs.push(format!("OpenClaw {} 可通过 npx 使用", v));
                state.logs.lock().unwrap().extend(logs.clone());
                StepResult {
                    success: true,
                    message: format!("OpenClaw {} 安装成功", v),
                    logs,
                }
            }
            Err(e) => {
                logs.push(format!("验证失败: {}", e));
                state.logs.lock().unwrap().extend(logs.clone());
                StepResult {
                    success: false,
                    message: "OpenClaw 安装验证失败".to_string(),
                    logs,
                }
            }
        },
    }
}

#[tauri::command]
fn install_step_configure(config: InstallConfig, state: State<AppState>) -> StepResult {
    let mut logs = Vec::new();

    let home = match get_home_dir() {
        Ok(h) => h,
        Err(e) => {
            logs.push(format!("错误: {}", e));
            state.logs.lock().unwrap().extend(logs.clone());
            return StepResult {
                success: false,
                message: e,
                logs,
            };
        }
    };

    let config_dir = format!("{}/.openclaw", home);
    logs.push(format!("创建配置目录: {}", config_dir));
    if let Err(e) = std::fs::create_dir_all(&config_dir) {
        logs.push(format!("创建目录失败: {}", e));
        state.logs.lock().unwrap().extend(logs.clone());
        return StepResult {
            success: false,
            message: format!("创建配置目录失败: {}", e),
            logs,
        };
    }

    // Build config YAML
    let mut yaml = String::new();
    yaml.push_str("# OpenClaw Configuration\n");
    yaml.push_str("# Generated by OpenClaw Box\n\n");

    // LLM configuration
    yaml.push_str("llm:\n");
    yaml.push_str(&format!("  base_url: \"{}\"\n", config.provider_base_url));
    yaml.push_str(&format!("  api_key: \"{}\"\n", config.api_key));
    yaml.push_str(&format!("  model: \"{}\"\n", config.model));
    if !config.provider_name.is_empty() {
        yaml.push_str(&format!("  provider: \"{}\"\n", config.provider_name));
    }
    yaml.push('\n');

    // Channel configuration
    yaml.push_str("channel:\n");
    yaml.push_str(&format!("  type: \"{}\"\n", config.channel_type));
    for (key, value) in &config.channel_config {
        yaml.push_str(&format!("  {}: \"{}\"\n", key, value));
    }
    yaml.push('\n');

    // Gateway
    yaml.push_str("gateway:\n");
    yaml.push_str("  host: \"0.0.0.0\"\n");
    yaml.push_str("  port: 18789\n");

    let config_path = format!("{}/config.yaml", config_dir);
    logs.push(format!("写入配置: {}", config_path));
    match std::fs::write(&config_path, &yaml) {
        Ok(_) => {
            logs.push("配置文件写入成功".to_string());
            logs.push(format!("配置路径: {}", config_path));
        }
        Err(e) => {
            logs.push(format!("写入配置失败: {}", e));
            state.logs.lock().unwrap().extend(logs.clone());
            return StepResult {
                success: false,
                message: format!("写入配置文件失败: {}", e),
                logs,
            };
        }
    }

    state.logs.lock().unwrap().extend(logs.clone());
    StepResult {
        success: true,
        message: "配置文件已写入".to_string(),
        logs,
    }
}

#[tauri::command]
fn install_step_start(config: InstallConfig, state: State<AppState>) -> StepResult {
    let mut logs = Vec::new();

    logs.push("启动 OpenClaw Gateway...".to_string());

    // Try to start the gateway
    let start_result = Command::new("openclaw")
        .args(["gateway", "start"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match start_result {
        Ok(mut child) => {
            // Wait briefly for startup
            std::thread::sleep(Duration::from_secs(3));

            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        let output = child.wait_with_output().unwrap_or_else(|_| {
                            std::process::Output {
                                status,
                                stdout: vec![],
                                stderr: vec![],
                            }
                        });
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        logs.push(format!("Gateway 启动失败: {}", stderr));
                        state.logs.lock().unwrap().extend(logs.clone());
                        return StepResult {
                            success: false,
                            message: "Gateway 启动失败".to_string(),
                            logs,
                        };
                    }
                    logs.push("Gateway 已启动".to_string());
                }
                Ok(None) => {
                    // Process still running - it's a daemon, this is good
                    logs.push("Gateway 正在运行".to_string());
                }
                Err(e) => {
                    logs.push(format!("检查进程状态失败: {}", e));
                }
            }
        }
        Err(e) => {
            // Try npx fallback
            logs.push(format!("直接启动失败 ({}), 尝试 npx...", e));
            match Command::new("npx")
                .args(["openclaw", "gateway", "start"])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
            {
                Ok(_) => {
                    std::thread::sleep(Duration::from_secs(3));
                    logs.push("Gateway 已通过 npx 启动".to_string());
                }
                Err(e2) => {
                    logs.push(format!("npx 启动也失败: {}", e2));
                    state.logs.lock().unwrap().extend(logs.clone());
                    return StepResult {
                        success: false,
                        message: format!("启动 Gateway 失败: {}", e2),
                        logs,
                    };
                }
            }
        }
    }

    let port = 18789;
    let gateway_url = format!("http://localhost:{}", port);
    logs.push(format!("Gateway 地址: {}", gateway_url));
    logs.push(format!("渠道类型: {}", config.channel_type));
    logs.push("服务启动成功！".to_string());

    state.logs.lock().unwrap().extend(logs.clone());
    StepResult {
        success: true,
        message: format!("服务已启动: {}", gateway_url),
        logs,
    }
}

#[tauri::command]
fn test_api_connection(base_url: String, api_key: String) -> StepResult {
    let mut logs = Vec::new();
    let url = format!(
        "{}/models",
        base_url.trim_end_matches('/')
    );
    logs.push(format!("测试连接: {}", url));

    let result = Command::new("curl")
        .args([
            "-sS",
            "-o", "/dev/null",
            "-w", "%{http_code}",
            "-m", "10",
            "-H", &format!("Authorization: Bearer {}", api_key),
            &url,
        ])
        .output();

    match result {
        Ok(output) => {
            let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
            logs.push(format!("HTTP 状态码: {}", code));
            if code == "200" {
                StepResult {
                    success: true,
                    message: "连接成功".to_string(),
                    logs,
                }
            } else {
                StepResult {
                    success: false,
                    message: format!("连接失败，HTTP {}", code),
                    logs,
                }
            }
        }
        Err(e) => {
            logs.push(format!("请求失败: {}", e));
            StepResult {
                success: false,
                message: format!("连接失败: {}", e),
                logs,
            }
        }
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_logs(state: State<AppState>) -> Vec<String> {
    state.logs.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            logs: Mutex::new(Vec::new()),
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_system,
            install_step_check_env,
            install_step_node,
            install_step_openclaw,
            install_step_configure,
            install_step_start,
            test_api_connection,
            open_url,
            get_logs,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
