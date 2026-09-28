pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动 BranchMark Tauri 桌面版失败");
}
