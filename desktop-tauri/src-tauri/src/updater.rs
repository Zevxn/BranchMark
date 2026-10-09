use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

// SECTION 更新检查与安装

#[derive(Default)]
pub struct UpdateState(Mutex<PendingUpdate>);

#[derive(Default)]
struct PendingUpdate {
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    downloading: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    notes: String,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub fn get_branchmark_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_branchmark_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| format!("检查更新失败：{error}"))?;
    let info = update.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    });
    let mut pending = state.0.lock().map_err(|_| "更新状态不可用")?;
    if pending.downloading {
        return Err("正在下载更新，请稍候".into());
    }
    pending.update = update;
    pending.bytes = None;
    Ok(info)
}

#[tauri::command]
pub async fn download_branchmark_update(
    version: String,
    on_progress: Channel<DownloadProgress>,
    state: State<'_, UpdateState>,
) -> Result<(), String> {
    let update = {
        let mut pending = state.0.lock().map_err(|_| "更新状态不可用")?;
        if pending.downloading {
            return Err("正在下载更新，请稍候".into());
        }
        let update = pending
            .update
            .as_ref()
            .filter(|update| update.version == version)
            .ok_or("更新信息已失效，请重新检查更新")?
            .clone();
        if pending.bytes.is_some() {
            return Ok(());
        }
        pending.downloading = true;
        update
    };
    let mut downloaded = 0;
    let mut last_progress = Instant::now() - Duration::from_secs(1);
    // 检查请求限时较短，下载允许更长时间；download 内部会验证包的签名。
    let mut update = update;
    update.timeout = Some(Duration::from_secs(30 * 60));
    let result = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if last_progress.elapsed() >= Duration::from_millis(100) || total == Some(downloaded) {
                    let _ = on_progress.send(DownloadProgress { downloaded, total });
                    last_progress = Instant::now();
                }
            },
            || {},
        )
        .await;
    let mut pending = state.0.lock().map_err(|_| "更新状态不可用")?;
    pending.downloading = false;
    pending.bytes = Some(result.map_err(|error| format!("下载或校验失败：{error}"))?);
    Ok(())
}

#[tauri::command]
pub async fn install_branchmark_update(
    version: String,
    state: State<'_, UpdateState>,
) -> Result<(), String> {
    let pending = state.0.lock().map_err(|_| "更新状态不可用")?;
    let update = pending
        .update
        .as_ref()
        .filter(|update| update.version == version)
        .ok_or("更新信息已失效，请重新检查更新")?;
    let bytes = pending.bytes.as_ref().ok_or("更新包尚未下载完成")?;
    // Windows 安装器会关闭当前应用，安装完成后重新启动。
    update
        .install(bytes)
        .map_err(|error| format!("启动安装失败：{error}"))
}

// !SECTION 更新检查与安装
