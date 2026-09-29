use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{path::BaseDirectory, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const APP_IDENTIFIER: &str = "com.deepconvo.mindmap.tauri";
const STORAGE_CONFIG_FILE: &str = "storage-location.json";
const STORAGE_DATA_FILE: &str = "deepconvo-mindmap-data.json";
const STORAGE_DOCUMENT_VERSION: u32 = 1;
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

// SECTION 存储配置与业务数据文件

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct StorageConfig {
    #[serde(default)]
    active_directory: Option<PathBuf>,
    #[serde(default)]
    pending_directory: Option<PendingStorageDirectory>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", content = "path", rename_all = "snake_case")]
enum PendingStorageDirectory {
    Custom(PathBuf),
    Default,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct StorageDocument {
    version: u32,
    #[serde(default)]
    chrome: BTreeMap<String, Value>,
    #[serde(default)]
    idb: BTreeMap<String, Value>,
}

#[derive(Serialize)]
struct StorageLocationStatus {
    current_directory: String,
    pending_directory: Option<String>,
    pending_default: bool,
    is_default: bool,
}

fn validate_storage_document(document: StorageDocument) -> Result<StorageDocument, String> {
    if document.version != STORAGE_DOCUMENT_VERSION {
        return Err(format!(
            "数据文件版本 {} 不受支持；原文件已保留。",
            document.version
        ));
    }
    Ok(document)
}

fn storage_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(STORAGE_CONFIG_FILE))
        .map_err(|error| format!("无法获取应用配置目录：{error}"))
}

fn read_regular_file(path: &Path, description: &str) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(format!("{description}不是普通文件：{}", path.display()))
        }
        Ok(_) => fs::read(path)
            .map(Some)
            .map_err(|error| format!("读取{description}失败：{error}")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("检查{description}失败：{error}")),
    }
}

fn load_storage_config(app: &AppHandle) -> Result<StorageConfig, String> {
    let path = storage_config_path(app)?;
    let Some(contents) = read_regular_file(&path, "存储位置配置文件")? else {
        return Ok(StorageConfig::default());
    };
    serde_json::from_slice(&contents).map_err(|error| format!("存储位置配置文件无法解析：{error}"))
}

fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "目标文件路径无效"))?;
    fs::create_dir_all(parent)?;

    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "目标路径不是普通文件",
            ));
        }
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("storage.json");
    let (temporary_path, mut file) = loop {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{file_name}.{}.{}.tmp", process::id(), sequence));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => break (candidate, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    };

    let write_result = file.write_all(contents).and_then(|()| file.sync_all());
    drop(file);
    let result = write_result.and_then(|()| fs::rename(&temporary_path, path));

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn save_storage_config(app: &AppHandle, config: &StorageConfig) -> Result<(), String> {
    let path = storage_config_path(app)?;
    let contents = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("序列化存储位置配置失败：{error}"))?;
    atomic_write(&path, &contents).map_err(|error| format!("保存存储位置配置失败：{error}"))
}

fn default_storage_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法获取默认业务数据目录：{error}"))
}

fn default_webview_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(APP_IDENTIFIER, BaseDirectory::LocalData)
        .map_err(|error| format!("无法识别默认 WebView2 用户数据目录：{error}"))
}

fn active_storage_directory(
    app: &AppHandle,
    active_directory: Option<&Path>,
) -> Result<PathBuf, String> {
    match active_directory {
        Some(directory) => Ok(directory.to_path_buf()),
        None => default_storage_directory(app),
    }
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    normalize_path(left) == normalize_path(right)
}

fn paths_overlap(left: &Path, right: &Path) -> bool {
    let left = normalize_path(left);
    let right = normalize_path(right);
    left == right
        || left.starts_with(&format!("{right}\\"))
        || right.starts_with(&format!("{left}\\"))
}

#[cfg(test)]
#[test]
fn storage_directory_path_comparison() {
    let parent = Path::new(r"D:\Mindmap");
    let child = Path::new(r"D:\Mindmap\Data");
    assert!(paths_equal(parent, Path::new("d:/mindmap/")));
    assert!(!paths_equal(parent, child));
    assert!(!paths_equal(child, parent));
    assert!(paths_overlap(parent, child));
    assert!(paths_overlap(child, parent));
}

fn validate_custom_directory(app: &AppHandle, directory: &Path) -> Result<(), String> {
    let webview_directory = default_webview_profile_path(app)?;
    if paths_overlap(directory, &webview_directory) {
        return Err(
            "所选目录与默认 WebView2 用户数据目录重叠；请选择其他目录，避免把缓存和导图数据放在一起。"
                .to_string(),
        );
    }
    Ok(())
}

fn storage_data_path(directory: &Path) -> PathBuf {
    directory.join(STORAGE_DATA_FILE)
}

fn read_storage_document(path: &Path) -> Result<Option<StorageDocument>, String> {
    let Some(contents) = read_regular_file(path, "导图业务数据文件")? else {
        return Ok(None);
    };
    let document: StorageDocument = serde_json::from_slice(&contents)
        .map_err(|error| format!("导图业务数据文件无法解析，原文件已保留：{error}"))?;
    validate_storage_document(document).map(Some)
}

fn save_storage_document_at(
    directory: &Path,
    document: StorageDocument,
    only_if_missing: bool,
) -> Result<StorageDocument, String> {
    let document = validate_storage_document(document)?;
    let path = storage_data_path(directory);
    if only_if_missing {
        if let Some(existing) = read_storage_document(&path)? {
            return Ok(existing);
        }
    }

    let contents = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("序列化导图业务数据失败：{error}"))?;
    atomic_write(&path, &contents).map_err(|error| format!("写入导图业务数据失败：{error}"))?;
    Ok(document)
}

enum StorageCopyOutcome {
    Existing,
    Copied,
    SourceUnavailable,
}

fn copy_storage_document_if_missing(
    source_directory: &Path,
    destination_directory: &Path,
    allow_missing_source: bool,
) -> Result<StorageCopyOutcome, String> {
    if paths_equal(source_directory, destination_directory) {
        return Ok(StorageCopyOutcome::Existing);
    }

    let destination_path = storage_data_path(destination_directory);
    if read_storage_document(&destination_path)?.is_some() {
        return Ok(StorageCopyOutcome::Existing);
    }

    let source_path = storage_data_path(source_directory);
    let document = match read_storage_document(&source_path) {
        Ok(Some(document)) => document,
        Ok(None) | Err(_) if allow_missing_source => {
            return Ok(StorageCopyOutcome::SourceUnavailable)
        }
        Ok(None) => {
            return Err(format!(
                "当前数据文件不存在：{}。存储位置保持不变，原数据未删除。",
                source_path.display()
            ));
        }
        Err(error) => return Err(error),
    };
    save_storage_document_at(destination_directory, document.clone(), true)?;
    if read_storage_document(&destination_path)?.as_ref() != Some(&document) {
        return Err("目标数据文件校验失败；存储位置保持不变，原文件已保留。".to_string());
    }
    Ok(StorageCopyOutcome::Copied)
}

fn apply_pending_storage_directory(app: &AppHandle) -> Result<Option<String>, String> {
    let mut config = load_storage_config(app)?;
    let Some(pending) = config.pending_directory.clone() else {
        return Ok(None);
    };

    let current_directory = active_storage_directory(app, config.active_directory.as_deref())?;
    let (destination_directory, next_active_directory, allow_missing_source) = match pending {
        PendingStorageDirectory::Custom(directory) => {
            validate_custom_directory(app, &directory)?;
            (directory.clone(), Some(directory), false)
        }
        PendingStorageDirectory::Default => (default_storage_directory(app)?, None, true),
    };

    let copy_outcome = copy_storage_document_if_missing(
        &current_directory,
        &destination_directory,
        allow_missing_source,
    )?;

    config.active_directory = next_active_directory;
    config.pending_directory = None;
    save_storage_config(app, &config)?;
    Ok(match copy_outcome {
        StorageCopyOutcome::Copied => {
            // 目标数据校验和目录配置保存成功后，只删除原位置的业务数据文件。
            let source_path = storage_data_path(&current_directory);
            fs::remove_file(&source_path).err().map(|error| {
                format!(
                    "存储位置已切换，但原数据文件删除失败，仍保留在 {}：{error}",
                    source_path.display()
                )
            })
        }
        StorageCopyOutcome::SourceUnavailable => Some(
            "恢复默认时无法读取原位置的数据文件；原文件仍保留，默认位置会读取其中现有的数据。"
                .to_string(),
        ),
        StorageCopyOutcome::Existing => None,
    })
}

// !SECTION 存储配置与业务数据文件

// SECTION Tauri 存储位置与文件命令

#[cfg(target_os = "windows")]
#[tauri::command]
fn choose_storage_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择思维导图数据存储位置")
        .pick_folder()
        .map(|directory| directory.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn choose_storage_directory() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn show_storage_notice(notice: String) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Warning)
        .set_title("思维导图存储位置")
        .set_description(notice)
        .show();
}

#[cfg(not(target_os = "windows"))]
fn show_storage_notice(notice: String) {
    eprintln!("思维导图存储位置：{notice}");
}

#[tauri::command]
fn get_storage_location(app: AppHandle) -> Result<StorageLocationStatus, String> {
    let config = load_storage_config(&app)?;
    let current_directory = active_storage_directory(&app, config.active_directory.as_deref())?;
    let pending_directory = match &config.pending_directory {
        Some(PendingStorageDirectory::Custom(directory)) => {
            Some(directory.to_string_lossy().into_owned())
        }
        _ => None,
    };
    let pending_default = matches!(
        config.pending_directory,
        Some(PendingStorageDirectory::Default)
    );

    Ok(StorageLocationStatus {
        current_directory: current_directory.to_string_lossy().into_owned(),
        pending_directory,
        pending_default,
        is_default: config.active_directory.is_none(),
    })
}

#[tauri::command]
fn read_storage_data(app: AppHandle) -> Result<Option<StorageDocument>, String> {
    let config = load_storage_config(&app)?;
    let directory = active_storage_directory(&app, config.active_directory.as_deref())?;
    if config.active_directory.is_some() && !directory.is_dir() {
        return Err(format!(
            "自定义导图数据目录不可用：{}。没有切换到其他位置。",
            directory.display()
        ));
    }
    read_storage_document(&storage_data_path(&directory))
}

#[tauri::command]
fn write_storage_data(
    app: AppHandle,
    data: StorageDocument,
    if_missing: bool,
) -> Result<StorageDocument, String> {
    let config = load_storage_config(&app)?;
    let directory = active_storage_directory(&app, config.active_directory.as_deref())?;
    if config.active_directory.is_some() && !directory.is_dir() {
        return Err(format!(
            "自定义导图数据目录不可用：{}。没有写入其他位置。",
            directory.display()
        ));
    }
    save_storage_document_at(&directory, data, if_missing)
}

#[tauri::command]
fn schedule_storage_directory(app: AppHandle, path: String) -> Result<(), String> {
    let selected_directory = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("无法访问所选目录：{error}"))?;
    if !selected_directory.is_dir() {
        return Err("所选路径不是文件夹".to_string());
    }
    validate_custom_directory(&app, &selected_directory)?;

    let mut config = load_storage_config(&app)?;
    let current_directory = active_storage_directory(&app, config.active_directory.as_deref())?;
    read_storage_document(&storage_data_path(&selected_directory))?;

    if paths_equal(&selected_directory, &current_directory) {
        config.pending_directory = None;
    } else {
        config.pending_directory = Some(PendingStorageDirectory::Custom(selected_directory));
    }
    save_storage_config(&app, &config)
}

#[tauri::command]
fn schedule_default_storage_directory(app: AppHandle) -> Result<(), String> {
    let default_directory = default_storage_directory(&app)?;
    let mut config = load_storage_config(&app)?;
    let current_directory = active_storage_directory(&app, config.active_directory.as_deref())?;
    read_storage_document(&storage_data_path(&default_directory))?;

    if paths_equal(&current_directory, &default_directory) {
        config.pending_directory = None;
    } else {
        config.pending_directory = Some(PendingStorageDirectory::Default);
    }
    save_storage_config(&app, &config)
}

// !SECTION Tauri 存储位置与文件命令

// SECTION JSON 脑图文件导出

#[cfg(target_os = "windows")]
#[tauri::command]
fn choose_json_export_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 JSON 脑图导出目录")
        .pick_folder()
        .map(|directory| directory.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn choose_json_export_directory() -> Option<String> {
    None
}

#[tauri::command]
fn write_mindmap_json(
    directory_path: String,
    filename: String,
    content: String,
    overwrite: bool,
) -> Result<bool, String> {
    if !filename.to_lowercase().ends_with(".json")
        || filename
            .chars()
            .any(|character| character.is_control() || "\\/:*?\"<>|".contains(character))
    {
        return Err("JSON 文件名无效".to_string());
    }
    let directory = PathBuf::from(directory_path);
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("导出目录不可用，请重新选择目录".to_string());
    }
    let destination = directory.join(filename);
    if overwrite {
        atomic_write(&destination, content.as_bytes())
            .map_err(|error| format!("写入 JSON 文件失败：{error}"))?;
        return Ok(true);
    }

    // create_new 保证首次写入不会覆盖选择目录后出现的同名文件。
    let mut file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
    {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(&destination)
                .map_err(|error| format!("检查同名文件失败：{error}"))?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("同名路径不是普通文件，无法覆盖".to_string());
            }
            return Ok(false);
        }
        Err(error) => return Err(format!("创建 JSON 文件失败：{error}")),
    };
    let result = file
        .write_all(content.as_bytes())
        .and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = result {
        let _ = fs::remove_file(&destination);
        return Err(format!("写入 JSON 文件失败：{error}"));
    }
    Ok(true)
}

#[cfg(test)]
mod json_export_tests {
    use super::*;

    #[test]
    fn export_requires_permission_to_overwrite_existing_file() {
        let directory = std::env::temp_dir().join(format!(
            "branchmark-json-export-{}-{}",
            process::id(),
            TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&directory).unwrap();
        let directory_path = directory.to_string_lossy().into_owned();
        let export = |filename: &str, content: &str, overwrite| {
            write_mindmap_json(
                directory_path.clone(),
                filename.to_string(),
                content.to_string(),
                overwrite,
            )
        };

        assert_eq!(export("示例.json", "old", false), Ok(true));
        assert_eq!(export("示例.json", "new", false), Ok(false));
        assert_eq!(
            fs::read_to_string(directory.join("示例.json")).unwrap(),
            "old"
        );
        assert_eq!(export("示例.json", "new", true), Ok(true));
        assert_eq!(
            fs::read_to_string(directory.join("示例.json")).unwrap(),
            "new"
        );
        for filename in [
            "../outside.json",
            "..\\outside.json",
            "D:outside.json",
            "示例.txt",
        ] {
            assert!(export(filename, "invalid", false).is_err());
        }
        fs::create_dir(directory.join("目录.json")).unwrap();
        assert!(export("目录.json", "invalid", false).is_err());
        assert!(export("目录.json", "invalid", true).is_err());
        fs::remove_file(directory.join("示例.json")).unwrap();
        fs::remove_dir(directory.join("目录.json")).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}

// !SECTION JSON 脑图文件导出

// SECTION 应用启动与窗口控制

#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    let theme = if dark {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    };
    window
        .set_theme(Some(theme))
        .map_err(|error| format!("切换窗口主题失败：{error}"))
}

#[tauri::command]
fn toggle_window_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("读取窗口全屏状态失败：{error}"))?;
    window
        .set_fullscreen(!fullscreen)
        .map_err(|error| format!("切换窗口全屏失败：{error}"))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            choose_storage_directory,
            get_storage_location,
            read_storage_data,
            write_storage_data,
            schedule_storage_directory,
            schedule_default_storage_directory,
            choose_json_export_directory,
            write_mindmap_json,
            set_window_theme,
            toggle_window_fullscreen,
        ])
        .setup(|app| {
            match apply_pending_storage_directory(app.handle()) {
                Ok(Some(notice)) => show_storage_notice(notice),
                Ok(None) => {}
                Err(error) => show_storage_notice(format!(
                    "存储位置未切换：{error}\n当前配置和原数据均已保留。"
                )),
            }

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("BranchMark")
                .inner_size(1440.0, 920.0)
                .min_inner_size(960.0, 640.0)
                .center()
                // Windows 下使用网页原生拖放，保证目录中的脑图可拖拽移动。
                .disable_drag_drop_handler()
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动 BranchMark Tauri 桌面版失败");
}

// !SECTION 应用启动与窗口控制
