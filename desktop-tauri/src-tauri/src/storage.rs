use super::{atomic_write, read_regular_file};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

// SECTION 分文件数据读写
const STATE_FILE: &str = "app-state.json";
const BOOKMARKS_FILE: &str = "bookmarks.json";
const MAP_PREFIX: &str = "MindMapData.__REF__";
const MAP_SUFFIX: &str = "-extra";
type Values = BTreeMap<String, Value>;

#[derive(Deserialize, Serialize)]
struct StoredValue {
    version: u32,
    data: Value,
}

fn read_value(path: &Path) -> Result<Option<Value>, String> {
    let Some(bytes) = read_regular_file(path, "业务数据文件")? else {
        return Ok(None);
    };
    let stored: StoredValue = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "数据文件无法解析，原文件已保留：{}：{error}",
            path.display()
        )
    })?;
    if stored.version != 1 {
        return Err(format!(
            "数据文件版本不受支持，原文件已保留：{}",
            path.display()
        ));
    }
    Ok(Some(stored.data))
}

fn write_value(path: &Path, data: Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&StoredValue { version: 1, data })
        .map_err(|error| format!("序列化业务数据失败：{error}"))?;
    atomic_write(path, &bytes)
        .map_err(|error| format!("保存业务数据失败：{}：{error}", path.display()))
}

fn check_subdirectory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        _ => Err(format!("业务数据子目录不可用：{}", path.display())),
    }
}

// 转义路径字符及大写字母，避免路径穿越和 Windows 大小写文件名冲突。
fn encode_key(key: &str) -> Result<String, String> {
    let mut name = String::new();
    for byte in key.bytes() {
        if byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_' {
            name.push(char::from(byte));
        } else {
            name.push_str(&format!("%{byte:02X}"));
        }
    }
    if matches!(name.as_str(), "con" | "prn" | "aux" | "nul")
        || (name.len() == 4
            && (name.starts_with("com") || name.starts_with("lpt"))
            && matches!(name.as_bytes()[3], b'1'..=b'9'))
    {
        name.replace_range(..1, &format!("%{:02X}", name.as_bytes()[0]));
    }
    if name.is_empty() || name.len() > 240 {
        return Err("业务数据 ID 为空或文件名过长".to_string());
    }
    Ok(name)
}

fn decode_key(name: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let mut index = 0;
    while index < name.len() {
        if name.as_bytes()[index] == b'%' {
            bytes.push(u8::from_str_radix(name.get(index + 1..index + 3)?, 16).ok()?);
            index += 3;
        } else {
            bytes.push(name.as_bytes()[index]);
            index += 1;
        }
    }
    let key = String::from_utf8(bytes).ok()?;
    (encode_key(&key).ok()?.as_str() == name).then_some(key)
}

fn value_path(directory: &Path, key: &str) -> Result<PathBuf, String> {
    if key == "bookmarkData" {
        return Ok(directory.join(BOOKMARKS_FILE));
    }
    let (folder, file_key) = match key
        .strip_prefix(MAP_PREFIX)
        .and_then(|id| id.strip_suffix(MAP_SUFFIX))
    {
        Some(id) => ("maps", id),
        None => ("contents", key),
    };
    let parent = directory.join(folder);
    check_subdirectory(&parent)?;
    Ok(parent.join(format!("{}.json", encode_key(file_key)?)))
}

fn read_state(directory: &Path) -> Result<Values, String> {
    let data = read_value(&directory.join(STATE_FILE))?.unwrap_or_else(|| serde_json::json!({}));
    let mut values: Values = serde_json::from_value(data)
        .map_err(|error| format!("应用状态格式无效，原文件已保留：{error}"))?;
    values.remove("MindMapData");
    Ok(values)
}

fn idb_keys(directory: &Path) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    if read_regular_file(&directory.join(BOOKMARKS_FILE), "收藏夹数据文件")?.is_some() {
        keys.push("bookmarkData".to_string());
    }
    for folder in ["maps", "contents"] {
        let parent = directory.join(folder);
        check_subdirectory(&parent)?;
        if !parent.exists() {
            continue;
        }
        for entry in fs::read_dir(&parent).map_err(|error| format!("读取业务目录失败：{error}"))?
        {
            let entry = entry.map_err(|error| format!("读取业务文件路径失败：{error}"))?;
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            if let Some(key) = path
                .file_stem()
                .and_then(|name| name.to_str())
                .and_then(decode_key)
            {
                keys.push(if folder == "maps" {
                    format!("{MAP_PREFIX}{key}{MAP_SUFFIX}")
                } else {
                    key
                });
            }
        }
    }
    keys.sort();
    Ok(keys)
}

pub(super) fn read_values(
    directory: &Path,
    bucket: &str,
    keys: Option<Vec<String>>,
) -> Result<Values, String> {
    match bucket {
        "chrome" => {
            let mut state = read_state(directory)?;
            if let Some(keys) = keys {
                state.retain(|key, _| keys.contains(key));
            }
            Ok(state)
        }
        "idb" => {
            let mut values = Values::new();
            for key in keys.map(Ok).unwrap_or_else(|| idb_keys(directory))? {
                if let Some(value) = read_value(&value_path(directory, &key)?)? {
                    values.insert(key, value);
                }
            }
            Ok(values)
        }
        _ => Err("存储数据区无效".to_string()),
    }
}

pub(super) fn write_values(
    directory: &Path,
    bucket: &str,
    values: Values,
    removed_keys: Vec<String>,
) -> Result<(), String> {
    match bucket {
        "chrome" => {
            let mut state = read_state(directory)?;
            state.extend(values);
            for key in removed_keys {
                state.remove(&key);
            }
            state.remove("MindMapData");
            write_value(
                &directory.join(STATE_FILE),
                serde_json::to_value(state).map_err(|error| error.to_string())?,
            )
        }
        "idb" => {
            // 同一批新建操作先提交内容，再提交收藏夹引用；删除则先移除索引。
            let mut entries: Vec<_> = values.into_iter().collect();
            entries.sort_by_key(|(key, _)| key == "bookmarkData");
            for (key, data) in entries {
                write_value(&value_path(directory, &key)?, data)?;
            }
            let mut removed_keys = removed_keys;
            removed_keys.sort_by_key(|key| key != "bookmarkData");
            for key in removed_keys {
                let path = value_path(directory, &key)?;
                // 先检查普通文件，避免删除同名目录或符号链接。
                if read_regular_file(&path, "待删除的业务数据文件")?.is_some() {
                    fs::remove_file(&path).map_err(|error| format!("删除业务数据失败：{error}"))?;
                }
            }
            Ok(())
        }
        _ => Err("存储数据区无效".to_string()),
    }
}
// !SECTION 分文件数据读写

// SECTION 业务数据目录切换
pub(super) fn files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    if read_regular_file(&directory.join(STATE_FILE), "应用状态文件")?.is_some() {
        read_state(directory)?;
        paths.push(PathBuf::from(STATE_FILE));
    }
    for key in idb_keys(directory)? {
        let path = value_path(directory, &key)?;
        read_value(&path)?;
        paths.push(
            path.strip_prefix(directory)
                .map_err(|error| error.to_string())?
                .to_path_buf(),
        );
    }
    Ok(paths)
}

pub(super) fn remove_files(directory: &Path, paths: &[PathBuf]) -> Result<(), String> {
    for relative in paths {
        fs::remove_file(directory.join(relative))
            .map_err(|error| format!("清理业务文件失败：{error}"))?;
    }
    Ok(())
}

pub(super) fn copy_files(
    source: &Path,
    destination: &Path,
    paths: &[PathBuf],
) -> Result<(), String> {
    let mut copied = Vec::new();
    let result = (|| {
        for relative in paths {
            let source_path = source.join(relative);
            let bytes = read_regular_file(&source_path, "源业务文件")?
                .ok_or_else(|| format!("源业务文件不存在：{}", source_path.display()))?;
            let destination_path = destination.join(relative);
            atomic_write(&destination_path, &bytes)
                .map_err(|error| format!("复制业务文件失败：{error}"))?;
            copied.push(relative.clone());
            if read_regular_file(&destination_path, "目标业务文件")?.as_ref() != Some(&bytes)
            {
                return Err("目标业务文件校验失败，原数据已保留".to_string());
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = remove_files(destination, &copied);
    }
    result
}
// !SECTION 业务数据目录切换

// SECTION 存储契约测试
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = crate::TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "branchmark-storage-test-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn save(directory: &Path, bucket: &str, key: &str, value: Value) {
        write_values(
            directory,
            bucket,
            BTreeMap::from([(key.to_string(), value)]),
            vec![],
        )
        .unwrap();
    }

    #[test]
    fn maps_and_bookmarks_are_independent_from_state() {
        let directory = TestDirectory::new();
        let path = &directory.0;
        let map_a = "MindMapData.__REF__a-extra";
        let map_b = "MindMapData.__REF__b-extra";
        save(
            path,
            "idb",
            map_a,
            serde_json::json!({"version":"tabs-v1", "tabs":[{"data":{"topic":"A"}}]}),
        );
        save(
            path,
            "idb",
            map_b,
            serde_json::json!({"data":{"topic":"B"}}),
        );
        save(
            path,
            "idb",
            "bookmarkData",
            serde_json::json!({"folders":{}, "items":{}, "rootOrder":[]}),
        );
        save(
            path,
            "chrome",
            "MindMapData",
            serde_json::json!({"data":{"topic":"不能写进状态"}}),
        );
        save(path, "chrome", "mindmap_theme", serde_json::json!("dark"));
        assert!(path.join("maps/a.json").is_file());
        assert!(path.join("maps/b.json").is_file());
        assert!(path.join(BOOKMARKS_FILE).is_file());
        let state = read_value(&path.join(STATE_FILE)).unwrap().unwrap();
        assert_eq!(state["mindmap_theme"], "dark");
        assert!(state.get("MindMapData").is_none());
        let a_bytes = fs::read(path.join("maps/a.json")).unwrap();
        save(
            path,
            "idb",
            map_b,
            serde_json::json!({"data":{"topic":"B 已编辑"}}),
        );
        assert_eq!(fs::read(path.join("maps/a.json")).unwrap(), a_bytes);
        // 一张导图损坏不会妨碍其他导图和设置的读取、保存。
        fs::write(path.join("maps/a.json"), b"invalid").unwrap();
        save(path, "chrome", "mindmap_theme", serde_json::json!("light"));
        save(
            path,
            "idb",
            map_b,
            serde_json::json!({"data":{"topic":"B 仍可保存"}}),
        );
        assert_eq!(
            read_values(path, "idb", Some(vec![map_b.to_string()])).unwrap()[map_b]["data"]
                ["topic"],
            "B 仍可保存"
        );
        assert!(read_values(path, "idb", Some(vec![map_a.to_string()])).is_err());
    }

    #[test]
    fn keys_round_trip_without_path_or_case_collisions() {
        let directory = TestDirectory::new();
        let ids = ["a", "A", "../escape", "con", "CON", "中文导图"];
        for id in ids {
            let key = format!("{MAP_PREFIX}{id}{MAP_SUFFIX}");
            save(&directory.0, "idb", &key, serde_json::json!({"id":id}));
        }
        let content_key = "largeContents.__REF__a-extra";
        save(
            &directory.0,
            "idb",
            content_key,
            serde_json::json!(["内容"]),
        );
        let values = read_values(&directory.0, "idb", None).unwrap();
        assert_eq!(values.len(), ids.len() + 1);
        for id in ids {
            assert_eq!(values[&format!("{MAP_PREFIX}{id}{MAP_SUFFIX}")]["id"], id);
        }
        assert_eq!(values[content_key], serde_json::json!(["内容"]));
        assert!(!directory.0.join("escape.json").exists());
        write_values(
            &directory.0,
            "idb",
            Values::new(),
            vec![content_key.to_string()],
        )
        .unwrap();
        assert!(!read_values(&directory.0, "idb", None)
            .unwrap()
            .contains_key(content_key));
    }

    #[test]
    fn directory_switch_preserves_unrelated_files_and_existing_data() {
        let source = TestDirectory::new();
        let destination = TestDirectory::new();
        save(&source.0, "chrome", "currentFileID", serde_json::json!("a"));
        save(
            &source.0,
            "idb",
            "bookmarkData",
            serde_json::json!({"items":{"a":{"type":"mindmap"}}}),
        );
        save(
            &source.0,
            "idb",
            "MindMapData.__REF__a-extra",
            serde_json::json!({"data":{"topic":"A"}}),
        );
        save(
            &source.0,
            "idb",
            "largeContents.__REF__a-extra",
            serde_json::json!(["Markdown"]),
        );
        fs::write(source.0.join("unrelated.txt"), b"keep").unwrap();
        fs::write(
            source.0.join("deepconvo-mindmap-data.json"),
            b"old test data",
        )
        .unwrap();
        let outcome =
            crate::copy_storage_files_if_missing(&source.0, &destination.0, false).unwrap();
        let crate::StorageCopyOutcome::Copied(paths) = outcome else {
            panic!("应复制分文件数据");
        };
        assert_eq!(
            read_values(&source.0, "idb", None).unwrap(),
            read_values(&destination.0, "idb", None).unwrap()
        );
        save(
            &destination.0,
            "chrome",
            "currentFileID",
            serde_json::json!("existing"),
        );
        assert!(matches!(
            crate::copy_storage_files_if_missing(&source.0, &destination.0, false).unwrap(),
            crate::StorageCopyOutcome::Existing
        ));
        assert_eq!(
            read_state(&destination.0).unwrap()["currentFileID"],
            "existing"
        );
        remove_files(&source.0, &paths).unwrap();
        assert!(source.0.join("unrelated.txt").is_file());
        assert!(source.0.join("deepconvo-mindmap-data.json").is_file());
        assert!(source.0.join("maps").is_dir());
    }

    #[test]
    fn failed_copy_and_unsupported_files_preserve_source() {
        let source = TestDirectory::new();
        let destination = TestDirectory::new();
        save(
            &source.0,
            "chrome",
            "mindmap_theme",
            serde_json::json!("dark"),
        );
        save(
            &source.0,
            "idb",
            "MindMapData.__REF__a-extra",
            serde_json::json!({"data":{}}),
        );
        let paths = files(&source.0).unwrap();
        fs::create_dir(destination.0.join("maps")).unwrap();
        fs::create_dir(destination.0.join("maps/a.json")).unwrap();
        assert!(copy_files(&source.0, &destination.0, &paths).is_err());
        assert!(!destination.0.join(STATE_FILE).exists());
        assert_eq!(files(&source.0).unwrap(), paths);
        fs::write(
            destination.0.join(STATE_FILE),
            br#"{"version":999,"data":{}}"#,
        )
        .unwrap();
        assert!(read_values(&destination.0, "chrome", None).is_err());
        assert!(crate::copy_storage_files_if_missing(&source.0, &destination.0, false).is_err());
        assert_eq!(files(&source.0).unwrap(), paths);
    }
}
// !SECTION 存储契约测试
