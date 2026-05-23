use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct AiCorpusEntry {
    pub id: String,
    pub title: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RagRequest {
    pub query: String,
    pub corpus: Vec<AiCorpusEntry>,
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RagResponse {
    pub answer: String,
    pub citations: Vec<Citation>,
}

#[derive(Debug, Serialize)]
pub struct Citation {
    pub id: String,
    pub title: String,
}

fn tokens(s: &str) -> std::collections::HashSet<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() > 2)
        .map(|w| w.to_string())
        .collect()
}

fn rank(req: &RagRequest) -> Vec<(AiCorpusEntry, usize)> {
    let query_tokens = tokens(&req.query);
    let mut scored: Vec<(AiCorpusEntry, usize)> = req
        .corpus
        .iter()
        .filter_map(|c| {
            let title_overlap = tokens(&c.title).intersection(&query_tokens).count() * 3;
            let text_overlap = tokens(&c.text).intersection(&query_tokens).count();
            let score = title_overlap + text_overlap;
            if score > 0 {
                Some((
                    AiCorpusEntry {
                        id: c.id.clone(),
                        title: c.title.clone(),
                        text: c.text.clone(),
                    },
                    score,
                ))
            } else {
                None
            }
        })
        .collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored.into_iter().take(4).collect()
}

#[tauri::command]
async fn ai_rag(req: RagRequest) -> Result<RagResponse, String> {
    let ranked = rank(&req);
    let citations: Vec<Citation> = ranked
        .iter()
        .map(|(c, _)| Citation {
            id: c.id.clone(),
            title: c.title.clone(),
        })
        .collect();

    let api_key = req
        .api_key
        .clone()
        .or_else(|| std::env::var("AI_GATEWAY_API_KEY").ok())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok());

    if let Some(key) = api_key {
        if !ranked.is_empty() {
            let context = ranked
                .iter()
                .enumerate()
                .map(|(i, (c, _))| {
                    format!(
                        "[{}] {}\n{}",
                        i + 1,
                        c.title,
                        c.text.chars().take(1200).collect::<String>()
                    )
                })
                .collect::<Vec<_>>()
                .join("\n\n---\n\n");

            let provider = req.provider.as_deref().unwrap_or("anthropic");
            match call_llm(provider, &key, &req.query, &context, req.model.as_deref()).await {
                Ok(answer) => return Ok(RagResponse { answer, citations }),
                Err(err) => log::warn!("LLM call failed: {err}; falling back to local"),
            }
        }
    }

    if ranked.is_empty() {
        return Ok(RagResponse {
            answer: "Я не нашёл ничего релевантного в вашей базе знаний. Попробуйте перефразировать запрос или добавьте больше заметок по теме.".into(),
            citations,
        });
    }

    let summary = ranked
        .iter()
        .enumerate()
        .map(|(i, (c, _))| {
            let snippet: String = c.text.chars().take(280).collect::<String>().replace('\n', " ");
            format!("[{}] «{}» — {}", i + 1, c.title, snippet)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(RagResponse {
        answer: format!(
            "На основе вашей базы знаний нашёл {} релевантных заметок:\n\n{}\n\n(Локальный fallback. Укажите API-ключ в Settings → AI для полного RAG.)",
            ranked.len(),
            summary
        ),
        citations,
    })
}

async fn call_llm(
    provider: &str,
    api_key: &str,
    query: &str,
    context: &str,
    model: Option<&str>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let system = "Ты — AI-ассистент CoffeeStation. Отвечай кратко (2-4 абзаца), на языке вопроса, на основе предоставленного контекста. В конце укажи номера источников в квадратных скобках, например [1][3]. Если контекста недостаточно — скажи об этом честно.";

    let prompt = format!("Контекст:\n{context}\n\nВопрос: {query}");

    match provider {
        "anthropic" => {
            let model = model.unwrap_or("claude-haiku-4-5");
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 1024,
                "system": system,
                "messages": [{"role": "user", "content": prompt}]
            });
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json::<serde_json::Value>()
                .await
                .map_err(|e| e.to_string())?;
            let text = resp["content"][0]["text"]
                .as_str()
                .ok_or_else(|| format!("unexpected response: {resp}"))?
                .to_string();
            Ok(text)
        }
        "openai" | "gateway" => {
            let model = model.unwrap_or("gpt-4o-mini");
            let url = if provider == "gateway" {
                "https://gateway.ai.vercel.com/v1/chat/completions"
            } else {
                "https://api.openai.com/v1/chat/completions"
            };
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ]
            });
            let resp = client
                .post(url)
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json::<serde_json::Value>()
                .await
                .map_err(|e| e.to_string())?;
            let text = resp["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| format!("unexpected response: {resp}"))?
                .to_string();
            Ok(text)
        }
        other => Err(format!("unknown provider: {other}")),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransformRequest {
    pub kind: String,
    pub text: String,
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
async fn ai_transform(req: TransformRequest) -> Result<String, String> {
    let prompt = match req.kind.as_str() {
        "summarize" => "Дай краткую суммаризацию следующего текста в 5 буллетах. Сохрани смысл и ключевые цифры.",
        "improve" => "Перепиши следующий текст, сделав стиль яснее, точнее и легче для чтения. Не меняй смысл.",
        "translate" => "Переведи следующий текст: если он на русском — на английский, если на английском — на русский.",
        "todos" => "Извлеки из текста все action items и to-do. Верни их одним маркированным списком.",
        _ => "Преобразуй следующий текст.",
    };

    let api_key = req
        .api_key
        .clone()
        .or_else(|| std::env::var("AI_GATEWAY_API_KEY").ok())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok());

    if let Some(key) = api_key {
        let provider = req.provider.as_deref().unwrap_or("anthropic");
        let context = format!("{prompt}\n\n---\n\n{}", req.text);
        match call_llm(provider, &key, &context, "", req.model.as_deref()).await {
            Ok(answer) => return Ok(answer),
            Err(err) => log::warn!("LLM call failed: {err}; using local fallback"),
        }
    }

    Ok(local_transform(&req.kind, &req.text))
}

fn local_transform(kind: &str, text: &str) -> String {
    match kind {
        "summarize" => {
            let sentences: Vec<&str> = text
                .split(|c: char| matches!(c, '.' | '!' | '?'))
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect();
            let top: Vec<String> = sentences
                .iter()
                .take(5)
                .enumerate()
                .map(|(i, s)| format!("  {}. {}", i + 1, s.chars().take(200).collect::<String>()))
                .collect();
            format!("Краткая суммаризация (демо без LLM):\n{}", top.join("\n"))
        }
        "todos" => {
            let todos: Vec<String> = text
                .lines()
                .filter(|l| {
                    let lc = l.to_lowercase();
                    lc.contains("todo")
                        || lc.contains("задач")
                        || lc.contains("сделать")
                        || l.trim_start().starts_with('-')
                        || l.trim_start().starts_with('*')
                })
                .map(|l| format!("• {}", l.trim()))
                .collect();
            if todos.is_empty() {
                "Action items не найдены.".into()
            } else {
                todos.join("\n")
            }
        }
        "translate" => "Демо-перевод недоступен без API-ключа. Откройте Settings → AI и укажите ключ.".into(),
        _ => text.to_string(),
    }
}

#[tauri::command]
async fn save_published(path: String, html: String) -> Result<(), String> {
    tokio::fs::write(&path, html.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_in_finder(path: String) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    if !target.exists() {
        // create the directory so the reveal still works for new vault paths
        tokio::fs::create_dir_all(&target)
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&path).status();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&path).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&path).status();

    match result {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("exit {s}")),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub relative: String,
    pub folder: String,
    pub name: String,
    pub content: String,
    pub modified: u64,
}

#[tauri::command]
async fn scan_vault(root: String) -> Result<Vec<ScannedFile>, String> {
    let root_path = std::path::PathBuf::from(&root);
    if !root_path.exists() {
        return Err(format!("Папка не найдена: {root}"));
    }
    let mut out: Vec<ScannedFile> = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = vec![root_path.clone()];
    while let Some(dir) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(e) => {
                log::warn!("read_dir failed for {dir:?}: {e}");
                continue;
            }
        };
        loop {
            let entry = match entries.next_entry().await {
                Ok(Some(e)) => e,
                Ok(None) => break,
                Err(e) => {
                    log::warn!("entry error in {dir:?}: {e}");
                    break;
                }
            };
            let path = entry.path();
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy().to_string();
            // Skip hidden + Obsidian/other tooling folders
            if name.starts_with('.') {
                continue;
            }
            if matches!(name.as_str(), "node_modules" | "target") {
                continue;
            }
            let ft = match entry.file_type().await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                stack.push(path);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            if ext != "md" && ext != "markdown" && ext != "txt" {
                continue;
            }
            let content = match tokio::fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("read failed {path:?}: {e}");
                    continue;
                }
            };
            let modified = entry
                .metadata()
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let relative = path
                .strip_prefix(&root_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string());
            let folder = path
                .parent()
                .and_then(|p| p.strip_prefix(&root_path).ok())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let title = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| name.clone());
            out.push(ScannedFile {
                path: path.to_string_lossy().to_string(),
                relative,
                folder,
                name: title,
                content,
                modified,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn mirror_note_to_disk(
    path: String,
    title: String,
    markdown: String,
) -> Result<String, String> {
    let folder = std::path::PathBuf::from(&path);
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|e| e.to_string())?;
    let safe_title = title
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>();
    let file = folder.join(format!("{safe_title}.md"));
    tokio::fs::write(&file, markdown.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

// ─────────────────────────── GitHub OAuth (Device Flow) ───────────────────────────

#[derive(Debug, Serialize)]
pub struct DeviceStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[tauri::command]
async fn github_device_start(client_id: String) -> Result<DeviceStart, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", "CoffeeStation")
        .form(&[("client_id", client_id.as_str()), ("scope", "repo")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = res["error"].as_str() {
        return Err(format!(
            "{}: {}",
            err,
            res["error_description"].as_str().unwrap_or("")
        ));
    }

    Ok(DeviceStart {
        device_code: res["device_code"].as_str().unwrap_or("").into(),
        user_code: res["user_code"].as_str().unwrap_or("").into(),
        verification_uri: res["verification_uri"].as_str().unwrap_or("").into(),
        interval: res["interval"].as_u64().unwrap_or(5),
        expires_in: res["expires_in"].as_u64().unwrap_or(900),
    })
}

#[derive(Debug, Serialize)]
pub struct DevicePollResult {
    /// "pending" | "slow_down" | "ok" | "error"
    pub status: String,
    pub token: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
async fn github_device_poll(
    client_id: String,
    device_code: String,
) -> Result<DevicePollResult, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("User-Agent", "CoffeeStation")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(token) = res["access_token"].as_str() {
        return Ok(DevicePollResult {
            status: "ok".into(),
            token: Some(token.into()),
            message: None,
        });
    }
    let err = res["error"].as_str().unwrap_or("unknown");
    let status = match err {
        "authorization_pending" => "pending",
        "slow_down" => "slow_down",
        "expired_token" | "access_denied" | "incorrect_device_code" => "error",
        _ => "error",
    };
    Ok(DevicePollResult {
        status: status.into(),
        token: None,
        message: res["error_description"].as_str().map(String::from).or(Some(err.into())),
    })
}

#[derive(Debug, Serialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[tauri::command]
async fn github_user(token: String) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/user")
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "CoffeeStation")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let txt = res.text().await.unwrap_or_default();
        return Err(format!("GitHub user fetch failed: {txt}"));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(GitHubUser {
        login: body["login"].as_str().unwrap_or("").into(),
        name: body["name"].as_str().map(String::from),
        email: body["email"].as_str().map(String::from),
        avatar_url: body["avatar_url"].as_str().map(String::from),
    })
}

#[derive(Debug, Serialize)]
pub struct EnsureRepoResult {
    pub clone_url: String,
    pub html_url: String,
    pub created: bool,
}

#[tauri::command]
async fn github_ensure_repo(
    token: String,
    name: String,
    private: bool,
) -> Result<EnsureRepoResult, String> {
    let client = reqwest::Client::new();
    // 1. Get authenticated user
    let user_res = client
        .get("https://api.github.com/user")
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "CoffeeStation")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    let username = user_res["login"]
        .as_str()
        .ok_or_else(|| "Could not read GitHub username".to_string())?;

    // 2. Try GET — does repo exist?
    let probe = client
        .get(format!("https://api.github.com/repos/{}/{}", username, name))
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "CoffeeStation")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if probe.status().is_success() {
        let body: serde_json::Value = probe.json().await.map_err(|e| e.to_string())?;
        return Ok(EnsureRepoResult {
            clone_url: body["clone_url"].as_str().unwrap_or("").into(),
            html_url: body["html_url"].as_str().unwrap_or("").into(),
            created: false,
        });
    }

    // 3. Create new private repo
    let create = client
        .post("https://api.github.com/user/repos")
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "CoffeeStation")
        .json(&serde_json::json!({
            "name": name,
            "private": private,
            "auto_init": true,
            "description": "CoffeeStation vault — auto-synced knowledge base"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !create.status().is_success() {
        let txt = create.text().await.unwrap_or_default();
        return Err(format!("Failed to create repo: {txt}"));
    }
    let body: serde_json::Value = create.json().await.map_err(|e| e.to_string())?;
    Ok(EnsureRepoResult {
        clone_url: body["clone_url"].as_str().unwrap_or("").into(),
        html_url: body["html_url"].as_str().unwrap_or("").into(),
        created: true,
    })
}

// ─────────────────────────── Git LFS ───────────────────────────

#[tauri::command]
async fn git_lfs_check() -> bool {
    let out = std::process::Command::new("git").args(["lfs", "version"]).output();
    matches!(out, Ok(o) if o.status.success())
}

#[tauri::command]
async fn git_lfs_setup(local_path: String, patterns: Vec<String>) -> Result<GitResult, String> {
    let path = std::path::PathBuf::from(&local_path);
    if !path.exists() {
        return Err(format!("Repo dir not found: {local_path}"));
    }
    // Install hooks
    let install = run_git(&["lfs", "install", "--local"], &path);
    if !install.success {
        return Ok(install);
    }
    // Write .gitattributes
    let attrs = path.join(".gitattributes");
    let mut content = if attrs.exists() {
        tokio::fs::read_to_string(&attrs).await.unwrap_or_default()
    } else {
        String::new()
    };
    let mut changed = false;
    for pat in &patterns {
        let line = format!("{} filter=lfs diff=lfs merge=lfs -text", pat);
        if !content.contains(&line) {
            if !content.is_empty() && !content.ends_with('\n') {
                content.push('\n');
            }
            content.push_str(&line);
            content.push('\n');
            changed = true;
        }
    }
    if changed {
        tokio::fs::write(&attrs, content.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(GitResult {
        success: true,
        stdout: format!("LFS configured for {} patterns", patterns.len()),
        stderr: String::new(),
        command: "lfs setup".into(),
    })
}

// ─────────────────────────── GitHub sync (git CLI) ───────────────────────────
//
// Drives a thin shell over the system `git` binary. Authentication uses an
// embedded Personal Access Token in the HTTPS URL — Tauri keeps the token in
// IndexedDB on the JS side, we only see it for the duration of one call.

#[derive(Debug, Serialize, Deserialize)]
pub struct GitConfig {
    pub repo_url: String, // https://github.com/<owner>/<repo>.git
    pub token: String,    // ghp_… personal access token
    pub local_path: String, // absolute path to working dir
    pub author_name: Option<String>,
    pub author_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GitResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub command: String,
}

fn embed_token(url: &str, token: &str) -> String {
    if token.is_empty() {
        return url.to_string();
    }
    if let Some(rest) = url.strip_prefix("https://") {
        return format!("https://x-access-token:{token}@{rest}");
    }
    url.to_string()
}

fn run_git(args: &[&str], cwd: &std::path::Path) -> GitResult {
    let mut cmd = std::process::Command::new("git");
    cmd.args(args).current_dir(cwd);
    // Avoid interactive prompts (askpass)
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_ASKPASS", "/bin/echo");
    let command = format!("git {}", args.join(" "));
    match cmd.output() {
        Ok(out) => GitResult {
            success: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            command,
        },
        Err(e) => GitResult {
            success: false,
            stdout: String::new(),
            stderr: format!("failed to spawn git: {e}"),
            command,
        },
    }
}

#[tauri::command]
async fn git_check() -> Result<bool, String> {
    let out = std::process::Command::new("git").arg("--version").output();
    Ok(matches!(out, Ok(o) if o.status.success()))
}

#[tauri::command]
async fn git_init_or_clone(config: GitConfig) -> Result<GitResult, String> {
    let path = std::path::PathBuf::from(&config.local_path);
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| e.to_string())?;
    let dot_git = path.join(".git");
    if dot_git.exists() {
        return Ok(GitResult {
            success: true,
            stdout: format!("already initialised: {}", config.local_path),
            stderr: String::new(),
            command: "noop".into(),
        });
    }
    // Clone if URL provided, else init empty
    if !config.repo_url.is_empty() {
        let url = embed_token(&config.repo_url, &config.token);
        let init = run_git(&["clone", &url, "."], &path);
        if init.success {
            // strip the embedded token from remote
            let _ = run_git(&["remote", "set-url", "origin", &config.repo_url], &path);
            return Ok(init);
        }
        // Cloning into a non-empty dir fails — initialise + add remote instead
        let _ = run_git(&["init"], &path);
        let _ = run_git(&["remote", "add", "origin", &config.repo_url], &path);
        let _ = run_git(&["branch", "-M", "main"], &path);
        return Ok(GitResult {
            success: true,
            stdout: "initialised + remote configured".into(),
            stderr: init.stderr,
            command: "init+remote".into(),
        });
    }
    let init = run_git(&["init"], &path);
    Ok(init)
}

/// Safe pull: never lose user data.
///
/// Standard `git pull` blows up with:
///   * "untracked working tree files would be overwritten by merge"
///   * "Pulling is not possible because you have unmerged files"
///   * conflicting hunks during rebase
///
/// Strategy:
///   1. Abort any in-progress merge/rebase so the working tree is clean.
///   2. `git fetch origin main` to know the remote tree without touching local.
///   3. For every untracked file in the working tree that also exists in
///      `origin/main`, move it aside to `<stem> (конфликт <ISO date>).<ext>`.
///   4. `git pull --rebase --autostash origin main`. With the conflicting
///      untracked files out of the way, the merge succeeds.
///   5. If rebase still hits a conflict on tracked files, abort and try a
///      plain merge with `-X theirs` — last-writer-wins, but the user's
///      pre-pull version is preserved in the renamed file we created.
///
/// Returns the list of renamed files in `stdout` so the UI can toast them.
#[tauri::command]
async fn git_pull(config: GitConfig) -> Result<GitResult, String> {
    let path = std::path::PathBuf::from(&config.local_path);
    let url = embed_token(&config.repo_url, &config.token);
    let _ = run_git(&["remote", "set-url", "origin", &url], &path);

    // 1. Clean any half-finished merge/rebase from a previous failed pull.
    //    We only `reset --mixed HEAD` when HEAD exists — otherwise that fails
    //    on a brand-new local repo with no commits yet.
    let _ = run_git(&["rebase", "--abort"], &path);
    let _ = run_git(&["merge", "--abort"], &path);
    let has_head = run_git(&["rev-parse", "--verify", "HEAD"], &path).success;
    if has_head {
        let _ = run_git(&["reset", "--mixed", "HEAD"], &path);
    }

    // 2. Fetch first so we can inspect remote without merging.
    let fetch = run_git(&["fetch", "origin", "main"], &path);
    if !fetch.success {
        let _ = run_git(&["remote", "set-url", "origin", &config.repo_url], &path);
        return Ok(fetch);
    }

    // 2a. Special case: brand-new local repo (no commits yet) but the remote
    //     has history. `git pull --rebase --autostash` blows up with
    //     "stash failed" because there's no HEAD to bounce off. Resolve by
    //     renaming local files that would clobber remote ones, then
    //     hard-resetting to origin/main so the working tree is initialised
    //     from the remote.
    if !has_head {
        let untracked = run_git(&["ls-files", "--others", "--exclude-standard", "-z"], &path);
        let remote_tree = run_git(&["ls-tree", "-r", "--name-only", "-z", "origin/main"], &path);
        let mut renamed: Vec<String> = Vec::new();
        if untracked.success && remote_tree.success {
            let remote_files: std::collections::HashSet<String> = remote_tree
                .stdout
                .split('\0')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            let ts = chrono_like_now();
            for f in untracked.stdout.split('\0').filter(|s| !s.is_empty()) {
                if !remote_files.contains(f) { continue; }
                let src = path.join(f);
                let conflict_name = sidecar_name(f, &ts);
                let dst = path.join(&conflict_name);
                if let Some(parent) = dst.parent() {
                    let _ = tokio::fs::create_dir_all(parent).await;
                }
                if tokio::fs::rename(&src, &dst).await.is_ok() {
                    renamed.push(format!("{f} → {conflict_name}"));
                }
            }
        }
        // Materialise the remote history as our local main.
        let checkout = run_git(&["checkout", "-B", "main", "origin/main"], &path);
        let _ = run_git(&["branch", "--set-upstream-to=origin/main", "main"], &path);
        let _ = run_git(&["remote", "set-url", "origin", &config.repo_url], &path);
        let mut res = checkout;
        if !renamed.is_empty() {
            let suffix = format!(
                "\n[safe-pull] no local history; bootstrapped from origin/main and renamed {} pre-existing file(s):\n  {}",
                renamed.len(),
                renamed.join("\n  "),
            );
            res.stdout.push_str(&suffix);
        }
        return Ok(res);
    }

    // 3. Stage and commit any pending local work so the upcoming pull is a
    //    proper 3-way merge. Without this, untracked files that have the
    //    same name as remote files cause "would be overwritten by merge"
    //    even when contents are identical — and our old fallback was to
    //    blindly rename every such file (the 1761-rename bug). Letting git
    //    do the content-aware comparison makes identical files a no-op and
    //    only treats real diffs as conflicts.
    //
    //    We need a committer identity to make this work; fall back to
    //    placeholders for repos that haven't been configured yet.
    let name = config.author_name.as_deref().unwrap_or("CoffeeStation");
    let email = config
        .author_email
        .as_deref()
        .unwrap_or("sync@coffeestation.local");
    let _ = run_git(&["config", "user.name", name], &path);
    let _ = run_git(&["config", "user.email", email], &path);
    let _ = run_git(&["add", "-A"], &path);
    // `git commit` exits non-zero when there's nothing staged — ignore.
    let _ = run_git(
        &["commit", "-m", "CoffeeStation sync: pre-pull snapshot"],
        &path,
    );

    // 4. Pull with `-X theirs` (remote wins on real conflicts). The user's
    //    pre-pull state stays as the previous commit on the local branch,
    //    so nothing is lost — they can recover with `git reset HEAD~` if
    //    they ever want to.
    let mut res = run_git(
        &["pull", "--no-rebase", "-X", "theirs", "origin", "main"],
        &path,
    );

    // 5. Unrelated histories fallback (local was `git init`-ed independently
    //    from the remote that already had history).
    if !res.success && res.stderr.contains("refusing to merge unrelated histories") {
        let _ = run_git(&["merge", "--abort"], &path);
        res = run_git(
            &[
                "pull",
                "--no-rebase",
                "--allow-unrelated-histories",
                "-X",
                "theirs",
                "origin",
                "main",
            ],
            &path,
        );
    }

    if !res.success {
        let _ = run_git(&["merge", "--abort"], &path);
    }

    let _ = run_git(&["remote", "set-url", "origin", &config.repo_url], &path);
    Ok(res)
}

/// Build a "<stem> (конфликт YYYY-MM-DD HHMM).<ext>" sibling filename.
fn sidecar_name(relpath: &str, timestamp: &str) -> String {
    let p = std::path::Path::new(relpath);
    let parent = p.parent().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    let stem = p.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    let base = if ext.is_empty() {
        format!("{stem} (конфликт {timestamp})")
    } else {
        format!("{stem} (конфликт {timestamp}).{ext}")
    };
    if parent.is_empty() {
        base
    } else {
        format!("{parent}/{base}")
    }
}

/// Quick-and-dirty local timestamp for the conflict suffix — avoids adding a
/// `chrono` dependency just for one format string.
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // YYYY-MM-DD HHMM (UTC). Good enough for filenames.
    let days = secs / 86_400;
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    let hour = (secs % 86_400) / 3_600;
    let minute = (secs % 3_600) / 60;
    format!("{:04}-{:02}-{:02} {:02}{:02}", y, m, d, hour, minute)
}

#[tauri::command]
async fn git_commit_and_push(
    config: GitConfig,
    message: String,
) -> Result<GitResult, String> {
    let path = std::path::PathBuf::from(&config.local_path);

    if let Some(name) = config.author_name.as_deref() {
        let _ = run_git(&["config", "user.name", name], &path);
    }
    if let Some(email) = config.author_email.as_deref() {
        let _ = run_git(&["config", "user.email", email], &path);
    }

    let add = run_git(&["add", "-A"], &path);
    if !add.success {
        return Ok(add);
    }
    let status = run_git(&["status", "--porcelain"], &path);
    if status.stdout.trim().is_empty() {
        return Ok(GitResult {
            success: true,
            stdout: "nothing to commit".into(),
            stderr: String::new(),
            command: "noop".into(),
        });
    }
    let commit = run_git(&["commit", "-m", &message], &path);
    if !commit.success {
        return Ok(commit);
    }
    let url = embed_token(&config.repo_url, &config.token);
    let _ = run_git(&["remote", "set-url", "origin", &url], &path);
    let _ = run_git(&["branch", "-M", "main"], &path);
    let push = run_git(&["push", "-u", "origin", "main"], &path);
    let _ = run_git(&["remote", "set-url", "origin", &config.repo_url], &path);
    Ok(push)
}

#[tauri::command]
async fn git_status_summary(config: GitConfig) -> Result<GitResult, String> {
    let path = std::path::PathBuf::from(&config.local_path);
    Ok(run_git(&["status", "--porcelain", "-b"], &path))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListedFile {
    pub path: String,
    pub relative: String,
    pub content: String,
    pub modified: u64,
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    tokio::fs::read(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&p, &content)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct VaultFileEntry {
    pub path: String,
    pub relative: String,
    pub name: String,
    pub ext: String,
    pub size: u64,
    pub modified: u64,
    pub kind: String, // image | video | audio | pdf | doc | sheet | text | code | other | note
}

fn classify_extension(ext: &str) -> &'static str {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "heic" | "psd" => "image",
        "mp4" | "mov" | "webm" | "mkv" | "avi" | "m4v" => "video",
        "mp3" | "wav" | "m4a" | "flac" | "ogg" | "aac" => "audio",
        "pdf" => "pdf",
        "doc" | "docx" | "rtf" | "odt" => "doc",
        "xls" | "xlsx" | "csv" | "ods" => "sheet",
        "txt" | "log" | "json" | "yaml" | "yml" | "toml" => "text",
        "md" | "markdown" => "note",
        "html" | "htm" | "xml" | "css" | "scss" | "js" | "jsx" | "ts" | "tsx" | "py" | "rs"
        | "go" | "java" | "kt" | "swift" | "rb" | "sh" | "zsh" | "bash" => "code",
        _ => "other",
    }
}

/// Scans a vault root recursively and returns metadata for ALL files (not
/// just .md). Used by the FilesView's "Vault files" section so users can see
/// every standalone file in their vault.
#[tauri::command]
async fn scan_vault_files(root: String) -> Result<Vec<VaultFileEntry>, String> {
    let root_path = std::path::PathBuf::from(&root);
    if !root_path.exists() {
        return Err(format!("Папка не найдена: {root}"));
    }
    let mut out: Vec<VaultFileEntry> = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = vec![root_path.clone()];
    while let Some(dir) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(_) => continue,
        };
        loop {
            let entry = match entries.next_entry().await {
                Ok(Some(e)) => e,
                Ok(None) => break,
                Err(_) => break,
            };
            let path = entry.path();
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if matches!(name.as_str(), "node_modules" | "target" | ".git") {
                continue;
            }
            let ft = match entry.file_type().await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                stack.push(path);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let meta = match entry.metadata().await {
                Ok(m) => m,
                Err(_) => continue,
            };
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            let kind = classify_extension(&ext).to_string();
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let relative = path
                .strip_prefix(&root_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string());
            out.push(VaultFileEntry {
                path: path.to_string_lossy().to_string(),
                relative,
                name,
                ext,
                size: meta.len(),
                modified,
                kind,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn write_text_file_at(path: String, content: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&p, content.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

/// Best-effort file removal — used when a note moves between folders so the
/// stale `.md` from the previous location does not linger in the vault.
/// Silently succeeds if the file is already gone (idempotent).
#[tauri::command]
async fn delete_file_at(path: String) -> Result<(), String> {
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "version": env!("CARGO_PKG_VERSION"),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            ai_rag,
            ai_transform,
            save_published,
            platform_info,
            open_in_finder,
            mirror_note_to_disk,
            delete_file_at,
            scan_vault,
            git_check,
            git_init_or_clone,
            git_pull,
            git_commit_and_push,
            git_status_summary,
            read_text_file,
            write_text_file_at,
            read_binary_file,
            write_binary_file,
            scan_vault_files,
            github_device_start,
            github_device_poll,
            github_user,
            github_ensure_repo,
            git_lfs_check,
            git_lfs_setup
        ]);

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("ready", ());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
