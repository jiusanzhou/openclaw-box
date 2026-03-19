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

fn path_separator() -> &'static str {
    if cfg!(target_os = "windows") { ";" } else { ":" }
}

fn get_home_or_userprofile() -> String {
    if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default()
    } else {
        std::env::var("HOME").unwrap_or_default()
    }
}

/// On Windows, read the current system+user PATH from the registry so that
/// newly installed programs (e.g. Node.js MSI) are visible without restarting
/// the Tauri process.
#[cfg(target_os = "windows")]
fn refresh_windows_path() -> Option<String> {
    fn reg_query(key: &str, value: &str) -> Option<String> {
        Command::new("reg")
            .args(["query", key, "/v", value])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    let out = String::from_utf8_lossy(&o.stdout).to_string();
                    // Format: "    Path    REG_EXPAND_SZ    <value>"
                    out.lines()
                        .find(|l| l.contains("REG_"))
                        .and_then(|l| l.splitn(3, "    ").nth(2))
                        .map(|v| {
                            // strip the type prefix (REG_EXPAND_SZ  or REG_SZ  )
                            v.split_once("    ").map(|(_, p)| p).unwrap_or(v).trim().to_string()
                        })
                } else {
                    None
                }
            })
    }
    let sys = reg_query(
        r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        "Path",
    ).unwrap_or_default();
    let usr = reg_query(r"HKCU\Environment", "Path").unwrap_or_default();
    if sys.is_empty() && usr.is_empty() {
        None
    } else {
        Some(format!("{};{}", usr, sys))
    }
}

fn get_enriched_path() -> String {
    let home = get_home_or_userprofile();
    let system_path = std::env::var("PATH").unwrap_or_default();
    let sep = path_separator();

    let mut extra: Vec<String> = vec![];

    if cfg!(target_os = "windows") {
        // On Windows, pull fresh PATH from registry (picks up MSI installs)
        #[cfg(target_os = "windows")]
        if let Some(reg_path) = refresh_windows_path() {
            for dir in reg_path.split(';') {
                let d = dir.trim().to_string();
                if !d.is_empty() {
                    extra.push(d);
                }
            }
        }

        // Common Windows Node.js locations
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        extra.push(format!(r"{}\nodejs", program_files));
        if !appdata.is_empty() {
            extra.push(format!(r"{}\npm", appdata));
        }
        // User --prefix install directory for openclaw
        extra.push(format!(r"{}\openclaw-global", home));
        // nvm-windows
        let nvm_home = std::env::var("NVM_HOME").unwrap_or_default();
        let nvm_symlink = std::env::var("NVM_SYMLINK").unwrap_or_default();
        if !nvm_symlink.is_empty() {
            extra.push(nvm_symlink);
        }
        if !nvm_home.is_empty() {
            extra.push(nvm_home);
        }
    } else {
        // Unix: nvm, fnm, homebrew, usr/local, cargo
        let nvm_dir = format!("{home}/.nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            let mut versions: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| format!("{}/bin", e.path().display()))
                .collect();
            versions.sort_by(|a, b| b.cmp(a));
            extra.extend(versions);
        }

        let fnm_dir = format!("{home}/.fnm/current/bin");
        if std::path::Path::new(&fnm_dir).exists() {
            extra.push(fnm_dir);
        }

        extra.extend([
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
            format!("{home}/.cargo/bin"),
        ]);
    }

    let mut parts: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
    parts.push(&system_path);
    parts.join(sep)
}

fn run_cmd(cmd: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(cmd);
    command.env("PATH", get_enriched_path());
    if cfg!(target_os = "windows") {
        command.env("USERPROFILE", get_home_or_userprofile());
    } else {
        command.env("HOME", get_home_or_userprofile());
    }
    command
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
    let mut command = Command::new(cmd);
    command.env("PATH", get_enriched_path());
    if cfg!(target_os = "windows") {
        command.env("USERPROFILE", get_home_or_userprofile());
    } else {
        command.env("HOME", get_home_or_userprofile());
    }
    command
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
    let home = get_home_or_userprofile();
    if home.is_empty() {
        Err("无法确定用户主目录".to_string())
    } else {
        Ok(home)
    }
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
async fn install_step_check_env(config: InstallConfig, state: State<'_, AppState>) -> Result<StepResult, String> {
    let result = tokio::task::spawn_blocking(move || {
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

        StepResult {
            success: true,
            message: "环境检查完成".to_string(),
            logs,
        }
    }).await.map_err(|e| format!("任务执行失败: {}", e))?;

    state.logs.lock().unwrap().extend(result.logs.clone());
    Ok(result)
}

#[tauri::command]
async fn install_step_node(config: InstallConfig, state: State<'_, AppState>) -> Result<StepResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        install_step_node_sync(config)
    }).await.map_err(|e| format!("任务执行失败: {}", e))?;

    state.logs.lock().unwrap().extend(result.logs.clone());
    Ok(result)
}

fn install_step_node_sync(config: InstallConfig) -> StepResult {
    let mut logs = Vec::new();

    // Check if Node.js is already sufficient
    if let Ok(v) = run_cmd("node", &["--version"]) {
        let installed = v.trim_start_matches('v');
        if compare_versions(installed, &config.node_version) >= 0 {
            logs.push(format!("Node.js {} 已安装，跳过安装步骤", v));
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
            StepResult {
                success: true,
                message: format!("Node.js {} 安装成功", v),
                logs,
            }
        }
        Err(_) => {
            logs.push("安装后无法验证 Node.js，可能需要重启终端".to_string());
            StepResult {
                success: true,
                message: "Node.js 已安装（可能需要重启终端生效）".to_string(),
                logs,
            }
        }
    }
}

#[tauri::command]
async fn install_step_openclaw(config: InstallConfig, state: State<'_, AppState>) -> Result<StepResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        install_step_openclaw_sync(config)
    }).await.map_err(|e| format!("任务执行失败: {}", e))?;

    state.logs.lock().unwrap().extend(result.logs.clone());
    Ok(result)
}

fn install_step_openclaw_sync(config: InstallConfig) -> StepResult {
    let mut logs = Vec::new();
    let npm = find_npm();

    // Set npm registry
    logs.push(format!("设置 npm 镜像: {}", config.npm_registry));
    match run_cmd(&npm, &["config", "set", "registry", &config.npm_registry]) {
        Ok(_) => logs.push("npm 镜像设置完成".to_string()),
        Err(e) => logs.push(format!("设置镜像失败（继续安装）: {}", e)),
    }

    // Install openclaw
    let version_arg = if config.openclaw_version == "latest" {
        "openclaw".to_string()
    } else {
        format!("openclaw@{}", config.openclaw_version)
    };

    logs.push(format!("安装 {} (npm={})...", version_arg, npm));
    let global_install_ok = match run_cmd_combined(&npm, &["install", "-g", &version_arg]) {
        Ok(output) => {
            if !output.is_empty() {
                for line in output.lines() {
                    logs.push(line.to_string());
                }
            }
            true
        }
        Err(e) => {
            logs.push(format!("全局安装失败: {}", e));
            false
        }
    };

    // On Windows, if global install failed, try --prefix to user directory
    if !global_install_ok && cfg!(target_os = "windows") {
        let home = get_home_or_userprofile();
        let prefix_dir = format!("{}\\openclaw-global", home);
        logs.push(format!("尝试使用 --prefix 安装到用户目录: {}", prefix_dir));
        let _ = std::fs::create_dir_all(&prefix_dir);
        match run_cmd_combined(&npm, &["install", "-g", &version_arg, "--prefix", &prefix_dir]) {
            Ok(output) => {
                if !output.is_empty() {
                    for line in output.lines() {
                        logs.push(line.to_string());
                    }
                }
                logs.push("用户目录安装完成".to_string());
            }
            Err(e2) => {
                logs.push(format!("用户目录安装也失败: {}", e2));
                logs.push("可能的原因:".to_string());
                logs.push("  1. npm 未正确安装或不在 PATH 中".to_string());
                logs.push("  2. 网络连接问题，无法下载包".to_string());
                logs.push("  3. 权限不足，请尝试以管理员身份运行".to_string());
                logs.push("建议: 手动打开终端执行 npm install -g openclaw".to_string());
                return StepResult {
                    success: false,
                    message: format!("安装 OpenClaw 失败: {}。请尝试手动安装: npm install -g openclaw", e2),
                    logs,
                };
            }
        }
    } else if !global_install_ok {
        logs.push("建议: 手动打开终端执行 sudo npm install -g openclaw".to_string());
        return StepResult {
            success: false,
            message: "安装 OpenClaw 失败。请尝试手动安装: sudo npm install -g openclaw".to_string(),
            logs,
        };
    }

    // Verify
    logs.push("验证 OpenClaw 安装...".to_string());
    let openclaw_path = find_openclaw();
    match run_cmd(&openclaw_path, &["--version"]) {
        Ok(v) => {
            logs.push(format!("OpenClaw {} 安装成功", v));
            StepResult {
                success: true,
                message: format!("OpenClaw {} 安装成功", v),
                logs,
            }
        }
        Err(_) => {
            // Try npx as fallback
            let npx = if cfg!(target_os = "windows") { "npx.cmd" } else { "npx" };
            match run_cmd(npx, &["openclaw", "--version"]) {
                Ok(v) => {
                    logs.push(format!("OpenClaw {} 可通过 npx 使用", v));
                    StepResult {
                        success: true,
                        message: format!("OpenClaw {} 安装成功", v),
                        logs,
                    }
                }
                Err(e) => {
                    logs.push(format!("验证失败: {}", e));
                    if cfg!(target_os = "windows") {
                        logs.push("Windows 提示: 可能需要重新打开终端或重启应用以刷新 PATH".to_string());
                        logs.push("也可尝试手动运行: npx openclaw --version".to_string());
                    }
                    StepResult {
                        success: false,
                        message: "OpenClaw 安装验证失败，请尝试重启应用后重试".to_string(),
                        logs,
                    }
                }
            }
        }
    }
}

#[tauri::command]
async fn install_step_configure(config: InstallConfig, state: State<'_, AppState>) -> Result<StepResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        install_step_configure_sync(config)
    }).await.map_err(|e| format!("任务执行失败: {}", e))?;

    state.logs.lock().unwrap().extend(result.logs.clone());
    Ok(result)
}

fn install_step_configure_sync(config: InstallConfig) -> StepResult {
    let mut logs = Vec::new();

    let home = match get_home_dir() {
        Ok(h) => h,
        Err(e) => {
            logs.push(format!("错误: {}", e));
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
            return StepResult {
                success: false,
                message: format!("写入配置文件失败: {}", e),
                logs,
            };
        }
    }

    StepResult {
        success: true,
        message: "配置文件已写入".to_string(),
        logs,
    }
}

#[tauri::command]
async fn install_step_start(config: InstallConfig, state: State<'_, AppState>) -> Result<StepResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        install_step_start_sync(config)
    }).await.map_err(|e| format!("任务执行失败: {}", e))?;

    state.logs.lock().unwrap().extend(result.logs.clone());
    Ok(result)
}

fn install_step_start_sync(config: InstallConfig) -> StepResult {
    let mut logs = Vec::new();

    logs.push("启动 OpenClaw Gateway...".to_string());

    // Try to start the gateway
    let start_result = Command::new(&find_openclaw())
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

// --- Management Panel Commands ---

#[derive(Serialize, Deserialize)]
struct AgentInfo {
    id: String,
    name: Option<String>,
    workspace: Option<String>,
}

#[derive(Serialize)]
struct GatewayStatus {
    running: bool,
    version: Option<String>,
    port: Option<u16>,
    url: Option<String>,
    pid: Option<u32>,
}

#[derive(Serialize)]
struct UpdateInfo {
    current_version: String,
    latest_version: String,
    has_update: bool,
}


fn find_openclaw() -> String {
    let enriched = get_enriched_path();
    let sep = path_separator();

    // On Windows, also check user --prefix install directory
    if cfg!(target_os = "windows") {
        let home = get_home_or_userprofile();
        let prefix_bin = format!(r"{}\openclaw-global", home);
        let candidate = format!(r"{}\openclaw.cmd", prefix_bin);
        if std::path::Path::new(&candidate).exists() {
            return candidate;
        }
        let candidate_exe = format!(r"{}\openclaw.exe", prefix_bin);
        if std::path::Path::new(&candidate_exe).exists() {
            return candidate_exe;
        }
    }

    // Scan enriched PATH for openclaw binary
    for dir in enriched.split(sep) {
        if cfg!(target_os = "windows") {
            for ext in &["openclaw.cmd", "openclaw.exe"] {
                let candidate = format!(r"{}\{}", dir, ext);
                if std::path::Path::new(&candidate).exists() {
                    return candidate;
                }
            }
        } else {
            let candidate = format!("{}/openclaw", dir);
            if std::path::Path::new(&candidate).exists() {
                return candidate;
            }
        }
    }

    // Try `which`/`where`
    let (which_cmd, which_args) = if cfg!(target_os = "windows") {
        ("where", vec!["openclaw"])
    } else {
        ("which", vec!["openclaw"])
    };
    if let Ok(output) = Command::new(which_cmd)
        .args(&which_args)
        .env("PATH", &enriched)
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    // Also try npx
    let npx = if cfg!(target_os = "windows") { "npx.cmd" } else { "npx" };
    if let Ok(output) = Command::new(npx)
        .args(["which", "openclaw"])
        .env("PATH", &enriched)
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    if cfg!(target_os = "windows") {
        "openclaw.cmd".to_string()
    } else {
        "openclaw".to_string()
    }
}

fn find_npm() -> String {
    let enriched = get_enriched_path();
    let sep = path_separator();

    for dir in enriched.split(sep) {
        if cfg!(target_os = "windows") {
            for ext in &["npm.cmd", "npm.exe"] {
                let candidate = format!(r"{}\{}", dir, ext);
                if std::path::Path::new(&candidate).exists() {
                    return candidate;
                }
            }
        } else {
            let candidate = format!("{}/npm", dir);
            if std::path::Path::new(&candidate).exists() {
                return candidate;
            }
        }
    }

    // Fallback: try `which`/`where`
    let (which_cmd, which_args) = if cfg!(target_os = "windows") {
        ("where", vec!["npm"])
    } else {
        ("which", vec!["npm"])
    };
    if let Ok(output) = Command::new(which_cmd)
        .args(&which_args)
        .env("PATH", &enriched)
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    if cfg!(target_os = "windows") {
        "npm.cmd".to_string()
    } else {
        "npm".to_string()
    }
}

fn run_openclaw_cmd(cmd: &str, subcmd: &str) -> StepResult {
    match Command::new(&find_openclaw()).args([cmd, subcmd]).output() {
        Ok(o) => StepResult {
            success: o.status.success(),
            message: String::from_utf8_lossy(&o.stdout).trim().to_string(),
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: e.to_string(),
            logs: vec![],
        },
    }
}

#[tauri::command]
fn get_gateway_status() -> GatewayStatus {
    let version = run_cmd("openclaw", &["--version"]).ok();
    let running = check_network("127.0.0.1", 18789);

    // Try to detect PID from lsof
    let pid = if running {
        run_cmd("lsof", &["-ti", "tcp:18789"])
            .ok()
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .and_then(|s| s.parse::<u32>().ok())
    } else {
        None
    };

    GatewayStatus {
        running,
        version,
        port: Some(18789),
        url: Some("http://localhost:18789".into()),
        pid,
    }
}

#[tauri::command]
fn gateway_start() -> StepResult {
    // Use spawn so the gateway runs as a daemon
    match Command::new(&find_openclaw())
        .args(["gateway", "start"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(_) => {
            std::thread::sleep(Duration::from_secs(2));
            StepResult {
                success: true,
                message: "Gateway 启动命令已执行".to_string(),
                logs: vec![],
            }
        }
        Err(e) => StepResult {
            success: false,
            message: format!("启动失败: {}", e),
            logs: vec![],
        },
    }
}

#[tauri::command]
fn gateway_stop() -> StepResult {
    run_openclaw_cmd("gateway", "stop")
}

#[tauri::command]
fn gateway_restart() -> StepResult {
    let stop = run_openclaw_cmd("gateway", "stop");
    if !stop.success {
        // Try to continue even if stop fails
    }
    std::thread::sleep(Duration::from_secs(1));
    match Command::new(&find_openclaw())
        .args(["gateway", "start"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(_) => {
            std::thread::sleep(Duration::from_secs(2));
            StepResult {
                success: true,
                message: "Gateway 已重启".to_string(),
                logs: vec![],
            }
        }
        Err(e) => StepResult {
            success: false,
            message: format!("重启失败: {}", e),
            logs: vec![],
        },
    }
}

#[tauri::command]
fn get_gateway_logs() -> Vec<String> {
    let home = match get_home_dir() {
        Ok(h) => h,
        Err(_) => return vec!["无法确定主目录".to_string()],
    };

    // Try reading log file
    let log_path = format!("{}/.openclaw/logs/gateway.log", home);
    if let Ok(content) = std::fs::read_to_string(&log_path) {
        let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
        let start = if lines.len() > 200 { lines.len() - 200 } else { 0 };
        return lines[start..].to_vec();
    }

    // Fallback: try openclaw gateway logs command
    match run_cmd_combined("openclaw", &["gateway", "logs"]) {
        Ok(output) => {
            let lines: Vec<String> = output.lines().map(|l| l.to_string()).collect();
            let start = if lines.len() > 200 { lines.len() - 200 } else { 0 };
            lines[start..].to_vec()
        }
        Err(_) => vec!["无法获取日志".to_string()],
    }
}

#[tauri::command]
fn read_openclaw_config() -> Result<String, String> {
    let home = get_home_dir()?;
    let config_path = format!("{}/.openclaw/config.yaml", home);
    std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))
}

#[tauri::command]
fn write_openclaw_config(content: String) -> StepResult {
    let home = match get_home_dir() {
        Ok(h) => h,
        Err(e) => return StepResult { success: false, message: e, logs: vec![] },
    };
    let config_path = format!("{}/.openclaw/config.yaml", home);
    match std::fs::write(&config_path, &content) {
        Ok(_) => StepResult {
            success: true,
            message: "配置已保存".to_string(),
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: format!("写入配置失败: {}", e),
            logs: vec![],
        },
    }
}

#[tauri::command]
fn check_openclaw_update(npm_registry: String) -> UpdateInfo {
    let raw_version = run_cmd(&find_openclaw(), &["--version"])
        .unwrap_or_else(|_| "unknown".to_string());
    
    // Parse version from output like "OpenClaw 2026.3.13 (61d171a)"
    let current_version = raw_version
        .strip_prefix("OpenClaw ")
        .unwrap_or(&raw_version)
        .split_whitespace()
        .next()
        .unwrap_or(&raw_version)
        .trim()
        .to_string();

    let npm = find_npm();
    let latest_version = run_cmd(
        &npm,
        &["view", "openclaw", "version", "--registry", &npm_registry],
    )
    .unwrap_or_else(|e| {
        eprintln!("npm view 失败 (npm={}): {}", npm, e);
        current_version.clone()
    })
    .trim()
    .to_string();

    let has_update = current_version != "unknown"
        && latest_version != current_version
        && compare_versions(
            latest_version.trim_start_matches('v'),
            current_version.trim_start_matches('v'),
        ) > 0;

    UpdateInfo {
        current_version,
        latest_version,
        has_update,
    }
}

#[tauri::command]
fn run_openclaw_update(npm_registry: String, version: String) -> StepResult {
    let npm = find_npm();
    let pkg = format!("openclaw@{}", version);
    match run_cmd_combined(&npm, &["install", "-g", &pkg, "--registry", &npm_registry]) {
        Ok(output) => {
            let success = run_cmd(&find_openclaw(), &["--version"]).is_ok();
            StepResult {
                success,
                message: if success {
                    format!("已更新到 {}", version)
                } else {
                    format!("更新命令执行完成但验证失败 (npm={})", npm)
                },
                logs: output.lines().map(|l| l.to_string()).collect(),
            }
        }
        Err(e) => StepResult {
            success: false,
            message: format!("更新失败 (npm={}): {}", npm, e),
            logs: vec![],
        },
    }
}


fn read_openclaw_json_config() -> Option<serde_json::Value> {
    let home = std::env::var("HOME").ok()?;
    let config_path = format!("{home}/.openclaw/openclaw.json");
    let content = std::fs::read_to_string(&config_path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
fn list_agents() -> Vec<AgentInfo> {
    // Fast path: read config file directly instead of spawning CLI (~0ms vs ~5s)
    if let Some(config) = read_openclaw_json_config() {
        if let Some(agents) = config.get("agents").and_then(|a| a.get("list")).and_then(|l| l.as_array()) {
            return agents.iter().filter_map(|a| {
                let id = a.get("id")?.as_str()?.to_string();
                let name = a.get("name").and_then(|n| n.as_str()).map(String::from);
                let workspace = a.get("workspace").and_then(|w| w.as_str()).map(String::from);
                Some(AgentInfo { id, name, workspace })
            }).collect();
        }
    }
    // Fallback to CLI
    let output = Command::new(&find_openclaw())
        .args(["config", "get", "agents.list"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            serde_json::from_str::<Vec<AgentInfo>>(&stdout).unwrap_or_default()
        }
        _ => vec![],
    }
}

#[tauri::command]
fn get_dashboard_url() -> String {
    // Fast path: read config file directly instead of spawning CLI (~0ms vs ~6s)
    if let Some(config) = read_openclaw_json_config() {
        let port = config.get("gateway")
            .and_then(|g| g.get("port"))
            .and_then(|p| p.as_u64())
            .unwrap_or(18789);
        let base_path = config.get("gateway")
            .and_then(|g| g.get("controlUi"))
            .and_then(|c| c.get("basePath"))
            .and_then(|b| b.as_str())
            .unwrap_or("");
        let path = if base_path.is_empty() { "/".to_string() } else {
            let p = base_path.trim_matches('/');
            format!("/{p}/")
        };
        return format!("http://127.0.0.1:{port}{path}");
    }
    // Fallback to CLI
    let output = Command::new(&find_openclaw()).args(["status"]).output();
    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            for line in stdout.lines() {
                if line.contains("Dashboard") || line.contains("http") {
                    if let Some(start) = line.find("http") {
                        let url_part = &line[start..];
                        let end = url_part
                            .find(|c: char| c.is_whitespace() || c == '│')
                            .unwrap_or(url_part.len());
                        return url_part[..end].trim().to_string();
                    }
                }
            }
            "http://localhost:18789/".to_string()
        }
        _ => "http://localhost:18789/".to_string(),
    }
}

// --- Agent Status ---

#[derive(Serialize)]
struct AgentStatus {
    id: String,
    name: String,
    emoji: String,
    status: String,         // "working" | "idle" | "offline"
    last_active_ms: Option<u64>,
    last_session_key: String,
    minutes_ago: Option<u64>,
}

#[tauri::command]
fn get_agent_statuses() -> Vec<AgentStatus> {
    let Some(config) = read_openclaw_json_config() else { return vec![] };
    let Some(agents) = config.get("agents").and_then(|a| a.get("list")).and_then(|l| l.as_array()) else {
        return vec![];
    };

    let home = std::env::var("HOME").unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    agents.iter().filter_map(|a| {
        let id = a.get("id")?.as_str()?.to_string();
        let name = a.get("name").or_else(|| a.get("identity").and_then(|i| i.get("name")))
            .and_then(|n| n.as_str()).unwrap_or(&id).to_string();
        let emoji = a.get("identity").and_then(|i| i.get("emoji")).and_then(|e| e.as_str())
            .unwrap_or("🤖").to_string();

        let sessions_file = format!("{home}/.openclaw/agents/{id}/sessions/sessions.json");
        let mut last_active_ms: Option<u64> = None;
        let mut last_session_key = String::new();

        if let Ok(content) = std::fs::read_to_string(&sessions_file) {
            if let Ok(sessions_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(map) = sessions_val.as_object() {
                    for (key, session) in map {
                        let updated = session.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
                        if updated > last_active_ms.unwrap_or(0) {
                            last_active_ms = Some(updated);
                            last_session_key = key.clone();
                        }
                    }
                }
            }
        }

        let (status, minutes_ago) = match last_active_ms {
            None => ("offline".to_string(), None),
            Some(t) => {
                let mins = (now_ms.saturating_sub(t)) / 60_000;
                let s = if mins < 5 { "working" } else if mins < 120 { "idle" } else { "offline" };
                (s.to_string(), Some(mins))
            }
        };

        Some(AgentStatus { id, name, emoji, status, last_active_ms, last_session_key, minutes_ago })
    }).collect()
}

// --- Usage Stats ---

fn ms_to_date_utc(ts_ms: u64) -> String {
    let secs = ts_ms / 1000;
    let day_num = secs / 86400;
    let jdn = day_num as i64 + 2440588; // Julian Day Number
    let a = jdn + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - (146097 * b) / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - (1461 * d) / 4;
    let m = (5 * e + 2) / 153;
    let dom = e - (153 * m + 2) / 5 + 1;
    let month = m + 3 - 12 * (m / 10);
    let year = 100 * b + d - 4800 + m / 10;
    format!("{:04}-{:02}-{:02}", year, month, dom)
}

#[derive(Serialize)]
struct DayUsage {
    date: String,
    tokens: u64,
}

#[derive(Serialize)]
struct ContextPressure {
    session_key: String,
    agent_id: String,
    ratio: f64,
    context_window: u64,
    estimated_tokens: u64,
}

#[derive(Serialize)]
struct UsageStats {
    available: bool,
    today_input: u64,
    today_output: u64,
    today_total: u64,
    daily: Vec<DayUsage>,
    hot_sessions: Vec<ContextPressure>,
}

#[tauri::command]
fn get_usage_stats() -> UsageStats {
    let empty = UsageStats {
        available: false,
        today_input: 0,
        today_output: 0,
        today_total: 0,
        daily: vec![],
        hot_sessions: vec![],
    };

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return empty,
    };

    let agents_dir = std::path::Path::new(&home).join(".openclaw/agents");

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let today_start_ms = (now_ms / 86_400_000) * 86_400_000;
    let today_date = ms_to_date_utc(today_start_ms);

    // Last 7 days including today, oldest first
    let day_dates: Vec<String> = (0..7u64).rev().map(|i| {
        ms_to_date_utc(today_start_ms - i * 86_400_000)
    }).collect();

    let mut daily_tokens: std::collections::HashMap<String, u64> = day_dates.iter()
        .map(|d| (d.clone(), 0u64))
        .collect();

    let mut today_input: u64 = 0;
    let mut today_output: u64 = 0;
    let mut hot_sessions: Vec<ContextPressure> = vec![];
    let mut any_data = false;

    let Ok(agent_entries) = std::fs::read_dir(&agents_dir) else {
        return empty;
    };

    for agent_entry in agent_entries.filter_map(|e| e.ok()) {
        let agent_id = agent_entry.file_name().to_string_lossy().to_string();
        let sessions_file = agent_entry.path().join("sessions/sessions.json");

        let Ok(content) = std::fs::read_to_string(&sessions_file) else { continue };
        let Ok(sessions_val) = serde_json::from_str::<serde_json::Value>(&content) else { continue };
        let Some(sessions_map) = sessions_val.as_object() else { continue };

        for (session_key, session) in sessions_map {
            let input = session.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = session.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let updated = session.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);

            if updated == 0 || (input == 0 && output == 0) { continue }
            any_data = true;

            let date = ms_to_date_utc(updated);

            if let Some(day_total) = daily_tokens.get_mut(&date) {
                *day_total += input + output;
            }

            if date == today_date {
                today_input += input;
                today_output += output;
            }

            // Context pressure: estimate from transcript file size (4 chars ≈ 1 token)
            let session_file = session.get("sessionFile").and_then(|v| v.as_str()).unwrap_or("");
            let context_window = session.get("contextTokens").and_then(|v| v.as_u64())
                .filter(|&v| v > 0)
                .unwrap_or(200_000);

            if !session_file.is_empty() {
                if let Ok(meta) = std::fs::metadata(session_file) {
                    let estimated_tokens = meta.len() / 4;
                    let ratio = (estimated_tokens as f64 / context_window as f64).min(1.0);
                    if ratio > 0.5 {
                        hot_sessions.push(ContextPressure {
                            session_key: session_key.clone(),
                            agent_id: agent_id.clone(),
                            ratio,
                            context_window,
                            estimated_tokens,
                        });
                    }
                }
            }
        }
    }

    if !any_data {
        return empty;
    }

    hot_sessions.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap_or(std::cmp::Ordering::Equal));
    hot_sessions.truncate(5);

    let daily: Vec<DayUsage> = day_dates.into_iter()
        .map(|d| DayUsage { tokens: daily_tokens.get(&d).copied().unwrap_or(0), date: d })
        .collect();

    UsageStats {
        available: true,
        today_input,
        today_output,
        today_total: today_input + today_output,
        daily,
        hot_sessions,
    }
}

// --- Memory File Commands ---

#[derive(Serialize)]
struct MemoryFileInfo {
    path: String,
    name: String,
    size: u64,
    last_modified: Option<u64>,
    available: bool,
}

#[tauri::command]
fn list_agent_memory_files(workspace: String) -> Vec<MemoryFileInfo> {
    let mut files: Vec<MemoryFileInfo> = Vec::new();

    // MEMORY.md in workspace root
    let memory_md = format!("{workspace}/MEMORY.md");
    let memory_path = std::path::Path::new(&memory_md);
    let (size, last_modified, available) = if let Ok(meta) = std::fs::metadata(memory_path) {
        let lm = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        (meta.len(), lm, true)
    } else {
        (0, None, false)
    };
    files.push(MemoryFileInfo {
        path: memory_md,
        name: "MEMORY.md".to_string(),
        size,
        last_modified,
        available,
    });

    // memory/*.md files
    let memory_dir = format!("{workspace}/memory");
    if let Ok(entries) = std::fs::read_dir(&memory_dir) {
        let mut sub: Vec<MemoryFileInfo> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().and_then(|x| x.to_str()) == Some("md")
            })
            .map(|e| {
                let path = e.path().to_string_lossy().to_string();
                let name = format!("memory/{}", e.file_name().to_string_lossy());
                let (sz, lm, av) = if let Ok(meta) = e.metadata() {
                    let lm = meta.modified().ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    (meta.len(), lm, true)
                } else {
                    (0, None, false)
                };
                MemoryFileInfo { path, name, size: sz, last_modified: lm, available: av }
            })
            .collect();
        sub.sort_by(|a, b| a.name.cmp(&b.name));
        files.extend(sub);
    }

    files
}

#[tauri::command]
fn read_memory_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
fn write_memory_file(path: String, content: String) -> StepResult {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return StepResult { success: false, message: format!("创建目录失败: {e}"), logs: vec![] };
        }
    }
    match std::fs::write(&path, &content) {
        Ok(_) => StepResult { success: true, message: "已保存".to_string(), logs: vec![] },
        Err(e) => StepResult { success: false, message: format!("写入失败: {e}"), logs: vec![] },
    }
}

// --- Cron / Sessions Commands ---

#[derive(Serialize)]
struct CronJobInfo {
    id: String,
    agent_id: String,
    name: String,
    enabled: bool,
    schedule_kind: String,
    schedule_expr: String,
    last_run_at_ms: Option<u64>,
    next_run_at_ms: Option<u64>,
    last_run_status: String,
    last_duration_ms: Option<u64>,
    consecutive_errors: u64,
}

#[tauri::command]
fn list_cron_jobs() -> Vec<CronJobInfo> {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return vec![],
    };
    let path = format!("{home}/.openclaw/cron/jobs.json");
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let val: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let jobs = match val.get("jobs").and_then(|j| j.as_array()) {
        Some(j) => j.clone(),
        None => return vec![],
    };

    jobs.iter().filter_map(|j| {
        let id = j.get("id")?.as_str()?.to_string();
        let agent_id = j.get("agentId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = j.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
        let enabled = j.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

        let schedule = j.get("schedule").unwrap_or(&serde_json::Value::Null);
        let schedule_kind = schedule.get("kind").and_then(|v| v.as_str()).unwrap_or("cron").to_string();
        let schedule_expr = schedule.get("expr")
            .or_else(|| schedule.get("at"))
            .and_then(|v| v.as_str()).unwrap_or("").to_string();

        let state = j.get("state").unwrap_or(&serde_json::Value::Null);
        let last_run_at_ms = state.get("lastRunAtMs").and_then(|v| v.as_u64());
        let next_run_at_ms = state.get("nextRunAtMs").and_then(|v| v.as_u64());
        let last_run_status = state.get("lastRunStatus").or_else(|| state.get("lastStatus"))
            .and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
        let last_duration_ms = state.get("lastDurationMs").and_then(|v| v.as_u64());
        let consecutive_errors = state.get("consecutiveErrors").and_then(|v| v.as_u64()).unwrap_or(0);

        Some(CronJobInfo {
            id, agent_id, name, enabled,
            schedule_kind, schedule_expr,
            last_run_at_ms, next_run_at_ms, last_run_status,
            last_duration_ms, consecutive_errors,
        })
    }).collect()
}

#[tauri::command]
fn trigger_cron_job(job_id: String) -> StepResult {
    match Command::new(&find_openclaw())
        .args(["cron", "trigger", &job_id])
        .env("PATH", get_enriched_path())
        .output()
    {
        Ok(o) => StepResult {
            success: o.status.success(),
            message: if o.status.success() {
                "已触发".to_string()
            } else {
                String::from_utf8_lossy(&o.stderr).trim().to_string()
            },
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: format!("触发失败: {e}"),
            logs: vec![],
        },
    }
}

#[derive(Serialize)]
struct SessionSummary {
    session_key: String,
    agent_id: String,
    agent_name: String,
    status: String,
    last_active_ms: Option<u64>,
    last_channel: String,
    session_id: String,
}

#[tauri::command]
fn list_all_sessions() -> Vec<SessionSummary> {
    let Some(config) = read_openclaw_json_config() else { return vec![] };
    let Some(agents) = config.get("agents").and_then(|a| a.get("list")).and_then(|l| l.as_array()) else {
        return vec![];
    };

    let home = std::env::var("HOME").unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut result = Vec::new();

    for agent in agents {
        let id = match agent.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let name = agent.get("name").or_else(|| agent.get("identity").and_then(|i| i.get("name")))
            .and_then(|n| n.as_str()).unwrap_or(&id).to_string();

        let sessions_file = format!("{home}/.openclaw/agents/{id}/sessions/sessions.json");
        if let Ok(content) = std::fs::read_to_string(&sessions_file) {
            if let Ok(sessions_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(map) = sessions_val.as_object() {
                    for (key, session) in map {
                        let updated = session.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
                        let session_id = session.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let last_channel = session.get("lastChannel").and_then(|v| v.as_str())
                            .or_else(|| session.get("origin").and_then(|o| o.get("provider")).and_then(|v| v.as_str()))
                            .unwrap_or("unknown").to_string();

                        let diff_ms = now_ms.saturating_sub(updated);
                        let status = if updated == 0 {
                            "unknown".to_string()
                        } else if diff_ms < 5 * 60 * 1000 {
                            "active".to_string()
                        } else if diff_ms < 60 * 60 * 1000 {
                            "idle".to_string()
                        } else {
                            "offline".to_string()
                        };

                        result.push(SessionSummary {
                            session_key: key.clone(),
                            agent_id: id.clone(),
                            agent_name: name.clone(),
                            status,
                            last_active_ms: if updated > 0 { Some(updated) } else { None },
                            last_channel,
                            session_id,
                        });
                    }
                }
            }
        }
    }

    // Sort by last_active descending
    result.sort_by(|a, b| {
        b.last_active_ms.unwrap_or(0).cmp(&a.last_active_ms.unwrap_or(0))
    });
    result
}

// --- Health Check ---

#[derive(Serialize)]
struct HealthItem {
    key: String,
    label: String,
    status: String,    // "ok" | "warn" | "error"
    value: String,     // current value or description
    suggestion: String, // fix suggestion when not ok
}

#[tauri::command]
fn health_check() -> Vec<HealthItem> {
    let mut items = Vec::new();

    let home = std::env::var("HOME").unwrap_or_default();

    // 1. OpenClaw 版本
    match run_cmd("openclaw", &["--version"]) {
        Ok(v) => items.push(HealthItem {
            key: "openclaw_version".into(),
            label: "OpenClaw 版本".into(),
            status: "ok".into(),
            value: v.trim().to_string(),
            suggestion: String::new(),
        }),
        Err(_) => items.push(HealthItem {
            key: "openclaw_version".into(),
            label: "OpenClaw 版本".into(),
            status: "error".into(),
            value: "未找到".into(),
            suggestion: "运行 npm install -g openclaw 安装".into(),
        }),
    }

    // 2. Node.js 版本
    match run_cmd("node", &["--version"]) {
        Ok(v) => {
            let ver = v.trim().to_string();
            let major: u32 = ver.trim_start_matches('v').split('.').next()
                .and_then(|s| s.parse().ok()).unwrap_or(0);
            items.push(HealthItem {
                key: "node_version".into(),
                label: "Node.js 版本".into(),
                status: if major >= 18 { "ok".into() } else { "warn".into() },
                value: ver,
                suggestion: if major >= 18 { String::new() } else { "建议升级到 Node.js 18+".into() },
            });
        }
        Err(_) => items.push(HealthItem {
            key: "node_version".into(),
            label: "Node.js 版本".into(),
            status: "error".into(),
            value: "未找到".into(),
            suggestion: "安装 Node.js 18+".into(),
        }),
    }

    // 3. 配置文件可读性
    let config_yaml = format!("{home}/.openclaw/config.yaml");
    let config_json = format!("{home}/.openclaw/openclaw.json");
    let yaml_ok = std::fs::metadata(&config_yaml).is_ok();
    let json_ok = std::fs::metadata(&config_json).is_ok();
    items.push(HealthItem {
        key: "config_files".into(),
        label: "配置文件".into(),
        status: if yaml_ok && json_ok { "ok".into() } else if yaml_ok || json_ok { "warn".into() } else { "error".into() },
        value: format!("config.yaml {}, openclaw.json {}",
            if yaml_ok { "✓" } else { "✗" },
            if json_ok { "✓" } else { "✗" }),
        suggestion: if !yaml_ok || !json_ok { format!("检查 {home}/.openclaw/ 目录") } else { String::new() },
    });

    // 4. Gateway 连接
    let gw_running = check_network("127.0.0.1", 18789);
    items.push(HealthItem {
        key: "gateway".into(),
        label: "Gateway 连接".into(),
        status: if gw_running { "ok".into() } else { "error".into() },
        value: if gw_running { "http://localhost:18789 运行中".into() } else { "未运行".into() },
        suggestion: if gw_running { String::new() } else { "前往总览页面启动 Gateway".into() },
    });

    // 5. 模型可用性（从配置中读取 provider）
    let model_status = if let Ok(content) = std::fs::read_to_string(&config_yaml) {
        let provider = content.lines()
            .find(|l| l.trim().starts_with("provider:"))
            .map(|l| l.trim().trim_start_matches("provider:").trim().trim_matches('"').to_string())
            .unwrap_or_default();
        let base_url = content.lines()
            .find(|l| l.trim().starts_with("base_url:") || l.trim().starts_with("baseUrl:"))
            .map(|l| l.trim().split(':').skip(1).collect::<Vec<_>>().join(":").trim().trim_matches('"').to_string())
            .unwrap_or_default();

        if provider.is_empty() {
            HealthItem {
                key: "model".into(), label: "模型配置".into(), status: "warn".into(),
                value: "未配置 provider".into(),
                suggestion: "在设置中配置 provider".into(),
            }
        } else {
            // Check if API endpoint is reachable
            let host = if base_url.contains("://") {
                base_url.split("://").nth(1).unwrap_or("").split('/').next().unwrap_or("").to_string()
            } else {
                match provider.as_str() {
                    "openai" => "api.openai.com".to_string(),
                    "anthropic" => "api.anthropic.com".to_string(),
                    _ => String::new(),
                }
            };
            let reachable = !host.is_empty() && check_network(&host, 443);
            HealthItem {
                key: "model".into(), label: "模型可用性".into(),
                status: if reachable { "ok".into() } else { "warn".into() },
                value: if reachable { format!("{provider} 可访问") } else { format!("{provider} 网络未验证") },
                suggestion: if reachable { String::new() } else { format!("检查 {provider} API 连通性") },
            }
        }
    } else {
        HealthItem {
            key: "model".into(), label: "模型可用性".into(), status: "warn".into(),
            value: "无法读取配置".into(), suggestion: "检查配置文件".into(),
        }
    };
    items.push(model_status);

    // 6. 渠道连接状态
    let channel_status = if let Some(config) = read_openclaw_json_config() {
        let channels = config.get("channels").and_then(|c| c.as_array()).cloned().unwrap_or_default();
        if channels.is_empty() {
            HealthItem {
                key: "channels".into(), label: "渠道状态".into(), status: "warn".into(),
                value: "未配置渠道".into(), suggestion: "前往渠道页面添加渠道".into(),
            }
        } else {
            let enabled_count = channels.iter()
                .filter(|c| c.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true))
                .count();
            let names: Vec<String> = channels.iter()
                .filter(|c| c.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true))
                .filter_map(|c| c.get("type").or_else(|| c.get("name")).and_then(|v| v.as_str()))
                .map(String::from).collect();
            HealthItem {
                key: "channels".into(), label: "渠道状态".into(),
                status: if enabled_count > 0 { "ok".into() } else { "warn".into() },
                value: if enabled_count > 0 { format!("{} 个已启用: {}", enabled_count, names.join(", ")) } else { "所有渠道已禁用".into() },
                suggestion: if enabled_count == 0 { "在渠道页面启用至少一个渠道".into() } else { String::new() },
            }
        }
    } else {
        HealthItem {
            key: "channels".into(), label: "渠道状态".into(), status: "warn".into(),
            value: "无法读取渠道配置".into(), suggestion: String::new(),
        }
    };
    items.push(channel_status);

    items
}

// --- Backup / Restore ---

#[derive(Serialize, Deserialize)]
struct ConfigBackup {
    version: u32,
    created_at: u64,
    config_yaml: String,
    openclaw_json: String,
}

#[derive(Serialize)]
struct RestorePreview {
    success: bool,
    message: String,
    config_yaml_diff: String,   // simple before/after summary
    openclaw_json_diff: String,
}

#[tauri::command]
fn backup_config() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    let config_yaml = std::fs::read_to_string(format!("{home}/.openclaw/config.yaml"))
        .unwrap_or_default();
    let openclaw_json = std::fs::read_to_string(format!("{home}/.openclaw/openclaw.json"))
        .unwrap_or_default();

    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let backup = ConfigBackup { version: 1, created_at, config_yaml, openclaw_json };
    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
fn preview_restore(backup_json: String) -> RestorePreview {
    let backup: ConfigBackup = match serde_json::from_str(&backup_json) {
        Ok(b) => b,
        Err(e) => return RestorePreview {
            success: false,
            message: format!("无效的备份文件: {e}"),
            config_yaml_diff: String::new(),
            openclaw_json_diff: String::new(),
        },
    };

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return RestorePreview {
            success: false, message: "无法获取 HOME 目录".into(),
            config_yaml_diff: String::new(), openclaw_json_diff: String::new(),
        },
    };

    let cur_yaml = std::fs::read_to_string(format!("{home}/.openclaw/config.yaml")).unwrap_or_default();
    let cur_json = std::fs::read_to_string(format!("{home}/.openclaw/openclaw.json")).unwrap_or_default();

    let yaml_changed = cur_yaml.trim() != backup.config_yaml.trim();
    let json_changed = cur_json.trim() != backup.openclaw_json.trim();

    RestorePreview {
        success: true,
        message: if !yaml_changed && !json_changed {
            "备份内容与当前配置相同，无需恢复".into()
        } else {
            format!("将覆盖: {}{}",
                if yaml_changed { "config.yaml " } else { "" },
                if json_changed { "openclaw.json" } else { "" })
        },
        config_yaml_diff: if yaml_changed {
            format!("当前 {} 字节 → 备份 {} 字节", cur_yaml.len(), backup.config_yaml.len())
        } else { "无变化".into() },
        openclaw_json_diff: if json_changed {
            format!("当前 {} 字节 → 备份 {} 字节", cur_json.len(), backup.openclaw_json.len())
        } else { "无变化".into() },
    }
}

#[tauri::command]
fn restore_config(backup_json: String) -> StepResult {
    let backup: ConfigBackup = match serde_json::from_str(&backup_json) {
        Ok(b) => b,
        Err(e) => return StepResult { success: false, message: format!("解析失败: {e}"), logs: vec![] },
    };

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(e) => return StepResult { success: false, message: format!("获取 HOME 失败: {e}"), logs: vec![] },
    };

    let mut restored = Vec::new();

    if !backup.config_yaml.is_empty() {
        if let Err(e) = std::fs::write(format!("{home}/.openclaw/config.yaml"), &backup.config_yaml) {
            return StepResult { success: false, message: format!("写入 config.yaml 失败: {e}"), logs: vec![] };
        }
        restored.push("config.yaml".to_string());
    }

    if !backup.openclaw_json.is_empty() {
        if let Err(e) = std::fs::write(format!("{home}/.openclaw/openclaw.json"), &backup.openclaw_json) {
            return StepResult { success: false, message: format!("写入 openclaw.json 失败: {e}"), logs: vec![] };
        }
        restored.push("openclaw.json".to_string());
    }

    StepResult {
        success: true,
        message: format!("已恢复: {}", restored.join(", ")),
        logs: restored,
    }
}

// --- Write openclaw.json helper ---

fn write_openclaw_json_config(config: &serde_json::Value) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "无法获取 HOME".to_string())?;
    let path = format!("{home}/.openclaw/openclaw.json");
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&path, &content)
        .map_err(|e| format!("写入 openclaw.json 失败: {e}"))
}

// --- Create Agent ---

#[tauri::command]
fn create_agent(id: String, name: String, emoji: String, workspace: String) -> StepResult {
    let mut config = match read_openclaw_json_config() {
        Some(c) => c,
        None => return StepResult {
            success: false,
            message: "无法读取 openclaw.json".to_string(),
            logs: vec![],
        },
    };

    let home = std::env::var("HOME").unwrap_or_default();
    let actual_workspace = if workspace.is_empty() {
        format!("{home}/.openclaw/agents/{id}/workspace")
    } else {
        workspace
    };

    // Build new agent object
    let new_agent = serde_json::json!({
        "id": id,
        "name": name,
        "workspace": actual_workspace,
        "identity": {
            "name": name,
            "emoji": if emoji.is_empty() { "🤖" } else { &emoji }
        }
    });

    // Ensure agents.list exists
    if config.get("agents").is_none() {
        config["agents"] = serde_json::json!({"list": [], "defaults": {}});
    }
    if config["agents"].get("list").is_none() {
        config["agents"]["list"] = serde_json::json!([]);
    }

    // Check for duplicate ID
    if let Some(list) = config["agents"]["list"].as_array() {
        if list.iter().any(|a| a.get("id").and_then(|v| v.as_str()) == Some(&id)) {
            return StepResult {
                success: false,
                message: format!("Agent ID '{}' 已存在", id),
                logs: vec![],
            };
        }
    }

    config["agents"]["list"].as_array_mut().unwrap().push(new_agent);

    // Create workspace directory
    let _ = std::fs::create_dir_all(&actual_workspace);

    match write_openclaw_json_config(&config) {
        Ok(_) => StepResult {
            success: true,
            message: format!("Agent '{}' 已创建。请重启 Gateway 使其生效。", name),
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: e,
            logs: vec![],
        },
    }
}

// --- Agent Usage Stats (per agent) ---

#[tauri::command]
fn get_agent_usage_stats(agent_id: String) -> UsageStats {
    let empty = UsageStats {
        available: false,
        today_input: 0,
        today_output: 0,
        today_total: 0,
        daily: vec![],
        hot_sessions: vec![],
    };

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return empty,
    };

    let sessions_file = format!("{home}/.openclaw/agents/{agent_id}/sessions/sessions.json");
    let content = match std::fs::read_to_string(&sessions_file) {
        Ok(c) => c,
        Err(_) => return empty,
    };
    let sessions_val: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return empty,
    };
    let sessions_map = match sessions_val.as_object() {
        Some(m) => m,
        None => return empty,
    };

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let today_start_ms = (now_ms / 86_400_000) * 86_400_000;
    let today_date = ms_to_date_utc(today_start_ms);

    let day_dates: Vec<String> = (0..7u64).rev().map(|i| {
        ms_to_date_utc(today_start_ms - i * 86_400_000)
    }).collect();

    let mut daily_tokens: std::collections::HashMap<String, u64> = day_dates.iter()
        .map(|d| (d.clone(), 0u64)).collect();

    let mut today_input: u64 = 0;
    let mut today_output: u64 = 0;
    let mut hot_sessions: Vec<ContextPressure> = vec![];
    let mut any_data = false;

    for (session_key, session) in sessions_map {
        let input = session.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = session.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let updated = session.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);

        if updated == 0 || (input == 0 && output == 0) { continue }
        any_data = true;

        let date = ms_to_date_utc(updated);
        if let Some(day_total) = daily_tokens.get_mut(&date) {
            *day_total += input + output;
        }
        if date == today_date {
            today_input += input;
            today_output += output;
        }

        let session_file = session.get("sessionFile").and_then(|v| v.as_str()).unwrap_or("");
        let context_window = session.get("contextTokens").and_then(|v| v.as_u64())
            .filter(|&v| v > 0).unwrap_or(200_000);

        if !session_file.is_empty() {
            if let Ok(meta) = std::fs::metadata(session_file) {
                let estimated_tokens = meta.len() / 4;
                let ratio = (estimated_tokens as f64 / context_window as f64).min(1.0);
                if ratio > 0.5 {
                    hot_sessions.push(ContextPressure {
                        session_key: session_key.clone(),
                        agent_id: agent_id.clone(),
                        ratio,
                        context_window,
                        estimated_tokens,
                    });
                }
            }
        }
    }

    if !any_data { return empty; }

    hot_sessions.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap_or(std::cmp::Ordering::Equal));
    hot_sessions.truncate(5);

    let daily: Vec<DayUsage> = day_dates.into_iter()
        .map(|d| DayUsage { tokens: daily_tokens.get(&d).copied().unwrap_or(0), date: d })
        .collect();

    UsageStats {
        available: true,
        today_input,
        today_output,
        today_total: today_input + today_output,
        daily,
        hot_sessions,
    }
}

// --- Channels Config ---

#[derive(Serialize, Clone)]
struct ChannelAccountInfo {
    account_key: String,
    agent_id: String,
    bot_token_preview: String,
}

#[derive(Serialize)]
struct ChannelTypeInfo {
    channel_type: String,
    accounts: Vec<ChannelAccountInfo>,
    bindings: Vec<ChannelBindingInfo>,
    extra: serde_json::Value,
}

#[derive(Serialize, Clone)]
struct ChannelBindingInfo {
    agent_id: String,
    account_id: String,
    match_details: String,
}

#[tauri::command]
fn get_channels_config() -> Vec<ChannelTypeInfo> {
    let Some(config) = read_openclaw_json_config() else { return vec![] };
    let Some(channels) = config.get("channels").and_then(|c| c.as_object()) else {
        return vec![];
    };

    // Read bindings array
    let bindings_arr = config.get("bindings").and_then(|b| b.as_array());

    channels.iter().map(|(ch_type, ch_val)| {
        let mut accounts = Vec::new();

        // For telegram-like channels with accounts map
        if let Some(accts) = ch_val.get("accounts").and_then(|a| a.as_object()) {
            for (key, acct) in accts {
                let token = acct.get("botToken").and_then(|v| v.as_str()).unwrap_or("");
                let preview = if token.len() > 10 {
                    format!("{}...{}", &token[..5], &token[token.len()-4..])
                } else if !token.is_empty() {
                    "***".to_string()
                } else {
                    String::new()
                };
                accounts.push(ChannelAccountInfo {
                    account_key: key.clone(),
                    agent_id: key.clone(),
                    bot_token_preview: preview,
                });
            }
        }

        // Find bindings for this channel type
        let mut channel_bindings = Vec::new();
        if let Some(bindings) = bindings_arr {
            for binding in bindings {
                let match_obj = binding.get("match");
                let match_channel = match_obj
                    .and_then(|m| m.get("channel"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("");
                
                if match_channel == ch_type.as_str() {
                    let agent_id = binding.get("agentId")
                        .and_then(|a| a.as_str())
                        .unwrap_or("")
                        .to_string();
                    let account_id = match_obj
                        .and_then(|m| m.get("accountId"))
                        .and_then(|a| a.as_str())
                        .unwrap_or("")
                        .to_string();
                    
                    // Build match details string
                    let details = if !account_id.is_empty() {
                        format!("account: {}", account_id)
                    } else if let Some(peer) = match_obj.and_then(|m| m.get("peer")) {
                        format!("peer: {}", serde_json::to_string(peer).unwrap_or_default())
                    } else {
                        "全部消息".to_string()
                    };

                    channel_bindings.push(ChannelBindingInfo {
                        agent_id,
                        account_id,
                        match_details: details,
                    });
                }
            }
        }

        // Clone the channel value but remove accounts for extra
        let mut extra = ch_val.clone();
        if let Some(obj) = extra.as_object_mut() {
            obj.remove("accounts");
        }

        ChannelTypeInfo {
            channel_type: ch_type.clone(),
            accounts,
            bindings: channel_bindings,
            extra,
        }
    }).collect()
}

// --- Agent Channel Binding ---

#[tauri::command]
fn update_agent_channel_binding(
    agent_id: String,
    channel_type: String,
    account_key: String,
    action: String,
) -> StepResult {
    let mut config = match read_openclaw_json_config() {
        Some(c) => c,
        None => return StepResult {
            success: false,
            message: "无法读取 openclaw.json".to_string(),
            logs: vec![],
        },
    };

    if action == "bind" {
        // For telegram: channels.telegram.accounts.<agent_id> = account config
        // Binding means copying/moving the account under the agent_id key
        // Actually the data structure says the key IS the agent id
        // So "bind" means: ensure channels.<type>.accounts.<agent_id> exists
        // For now we just create a placeholder entry if it doesn't exist
        if config.get("channels").is_none() {
            config["channels"] = serde_json::json!({});
        }
        if config["channels"].get(&channel_type).is_none() {
            config["channels"][&channel_type] = serde_json::json!({"accounts": {}});
        }
        if config["channels"][&channel_type].get("accounts").is_none() {
            config["channels"][&channel_type]["accounts"] = serde_json::json!({});
        }

        // If binding from an existing account_key to agent_id
        if account_key != agent_id {
            // Copy the account config from account_key to agent_id
            let existing = config["channels"][&channel_type]["accounts"]
                .get(&account_key).cloned();
            if let Some(acct) = existing {
                config["channels"][&channel_type]["accounts"][&agent_id] = acct;
            } else {
                return StepResult {
                    success: false,
                    message: format!("账号 '{}' 不存在", account_key),
                    logs: vec![],
                };
            }
        }
    } else if action == "unbind" {
        // Remove the account entry for this agent
        if let Some(accounts) = config
            .get_mut("channels")
            .and_then(|c| c.get_mut(&channel_type))
            .and_then(|t| t.get_mut("accounts"))
            .and_then(|a| a.as_object_mut())
        {
            accounts.remove(&agent_id);
        }
    } else {
        return StepResult {
            success: false,
            message: format!("未知操作: {}", action),
            logs: vec![],
        };
    }

    match write_openclaw_json_config(&config) {
        Ok(_) => StepResult {
            success: true,
            message: format!("渠道绑定已更新。请重启 Gateway 使其生效。"),
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: e,
            logs: vec![],
        },
    }
}

// --- Available Models ---

#[derive(Serialize)]
struct ModelOption {
    provider: String,
    model_id: String,
    display_name: String,
    full_id: String,  // "provider/model_id"
}

#[tauri::command]
fn get_available_models() -> Vec<ModelOption> {
    let Some(config) = read_openclaw_json_config() else { return vec![] };
    let Some(providers) = config.get("models")
        .and_then(|m| m.get("providers"))
        .and_then(|p| p.as_object()) else {
        return vec![];
    };

    let mut result = Vec::new();
    for (provider_name, provider_val) in providers {
        if let Some(models) = provider_val.get("models").and_then(|m| m.as_array()) {
            for model in models {
                let model_id = model.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let display_name = model.get("name").and_then(|v| v.as_str())
                    .unwrap_or(&model_id).to_string();
                let full_id = format!("{}/{}", provider_name, model_id);
                result.push(ModelOption {
                    provider: provider_name.clone(),
                    model_id,
                    display_name,
                    full_id,
                });
            }
        }
    }
    result
}

// --- Update Agent Model ---

#[tauri::command]
fn update_agent_model(agent_id: String, model_id: String) -> StepResult {
    let mut config = match read_openclaw_json_config() {
        Some(c) => c,
        None => return StepResult {
            success: false,
            message: "无法读取 openclaw.json".to_string(),
            logs: vec![],
        },
    };

    let agents_list = match config.get_mut("agents")
        .and_then(|a| a.get_mut("list"))
        .and_then(|l| l.as_array_mut()) {
        Some(l) => l,
        None => return StepResult {
            success: false,
            message: "agents.list 不存在".to_string(),
            logs: vec![],
        },
    };

    let agent = match agents_list.iter_mut().find(|a| {
        a.get("id").and_then(|v| v.as_str()) == Some(&agent_id)
    }) {
        Some(a) => a,
        None => return StepResult {
            success: false,
            message: format!("未找到 agent '{}'", agent_id),
            logs: vec![],
        },
    };

    // Set model.primary
    if agent.get("model").is_none() {
        agent["model"] = serde_json::json!({});
    }
    agent["model"]["primary"] = serde_json::Value::String(model_id.clone());

    match write_openclaw_json_config(&config) {
        Ok(_) => StepResult {
            success: true,
            message: format!("模型已切换为 {}。请重启 Gateway 使其生效。", model_id),
            logs: vec![],
        },
        Err(e) => StepResult {
            success: false,
            message: e,
            logs: vec![],
        },
    }
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
            get_gateway_status,
            gateway_start,
            gateway_stop,
            gateway_restart,
            get_gateway_logs,
            read_openclaw_config,
            write_openclaw_config,
            check_openclaw_update,
            run_openclaw_update,
            list_agents,
            get_dashboard_url,
            get_usage_stats,
            get_agent_statuses,
            list_agent_memory_files,
            read_memory_file,
            write_memory_file,
            list_cron_jobs,
            trigger_cron_job,
            list_all_sessions,
            health_check,
            backup_config,
            preview_restore,
            restore_config,
            create_agent,
            get_agent_usage_stats,
            get_channels_config,
            update_agent_channel_binding,
            get_available_models,
            update_agent_model,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
