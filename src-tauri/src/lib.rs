mod archive;
mod checksum;
mod cleanup;

mod compare;
mod db;
mod drives;

mod fs_ops;

mod git;

mod metadata;
mod models;

mod open_with;

mod preview;
mod progress;
mod rar_installer;

mod search;
mod smart_folders;
mod state;
mod tags;
mod terminal;
mod updater;
mod utils;
mod watcher;

use db::DbState;
use state::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus(); // FIX: Forces the window to the foreground and grants it focus
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let conn =
                db::init_db(app.handle()).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(DbState {
                conn: Mutex::new(Some(conn)),
            });
            Ok(())
        })
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            fs_ops::get_home_dir,
            fs_ops::select_directory,
            drives::list_drives,
            fs_ops::list_directory,
            fs_ops::create_directory,
            fs_ops::create_file,
            fs_ops::delete_entry,
            fs_ops::move_to_trash,
            fs_ops::rename_entry,
            fs_ops::batch_rename,
            fs_ops::copy_entry,
            fs_ops::move_entry,
            fs_ops::copy_entry_resolved,
            fs_ops::move_entry_resolved,
            fs_ops::get_entry_info,
            watcher::watch_directory,
            watcher::unwatch_directory,
            progress::copy_with_progress,
            progress::move_with_progress,
            progress::cancel_operation,
            preview::open_file,
            preview::open_external_url,
            preview::reveal_in_folder,
            fs_ops::list_subdirectories,
            fs_ops::calculate_folder_size,
            fs_ops::count_folder_items,
            fs_ops::cancel_folder_size,
            fs_ops::cancel_folder_item_count,
            fs_ops::cancel_count_items,
            preview::read_file_preview,
            preview::generate_thumbnail,
            preview::generate_thumbnails,
            search::search_files,
            search::cancel_search,
            git::get_git_status,
            git::get_git_file_statuses,
            git::git_pull,
            git::git_push,
            archive::list_archive,
            archive::extract_archive,
            archive::create_archive,
            terminal::open_terminal,
            terminal::open_powershell_admin,
            checksum::compute_checksum,
            rar_installer::check_rar_installed,
            rar_installer::prepare_rar_install,
            rar_installer::discard_rar_install,
            rar_installer::install_rar,
            updater::get_app_version,
            updater::get_app_about_info,
            updater::check_for_update,
            updater::install_update,
            open_with::open_file_with,
            compare::compare_files,
            cleanup::disk_cleanup,
            cleanup::cancel_disk_cleanup,
            metadata::get_image_metadata,
            show_main_window,
            smart_folders::load_smart_folders,
            smart_folders::save_smart_folder,
            smart_folders::delete_smart_folder,
            db::get_db_setting,
            db::set_db_setting,
            tags::get_all_tags,
            tags::create_tag,
            tags::update_tag,
            tags::delete_tag,
            tags::get_tags_for_path,
            tags::set_tags_for_path,
            tags::get_files_with_tag,
            tags::get_all_file_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use crate::fs_ops::{
        batch_rename, calculate_size_recursive_scoped, copy_dir_iterative, copy_entry,
        create_directory, create_file, move_entry, rename_entry, RenameRequest,
    };
    use crate::utils::{
        count_directory_entries, count_items_scoped, get_file_entry, validate_existing_path,
        validate_existing_path_no_resolve,
    };
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let mut p = std::env::temp_dir();
        p.push(format!("simplefile_test_{}_{}", name, nanos));
        p
    }

    fn write_file(path: &PathBuf, content: &[u8]) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let mut f = File::create(path).expect("create file");
        f.write_all(content).expect("write file");
    }

    #[test]
    fn test_validate_existing_path_nonexistent() {
        let p = unique_temp_path("nonexistent");
        // Ensure it does not exist
        let _ = fs::remove_dir_all(&p);
        let res = validate_existing_path(p.to_string_lossy().as_ref());
        assert!(res.is_err());
        let msg = res.err().unwrap();
        assert!(msg.contains("does not exist"));
    }

    #[test]
    fn test_validate_existing_path_existing_and_canonicalize() {
        let p = unique_temp_path("exists");
        fs::create_dir_all(&p).expect("create temp dir");
        // add a nested ".." to test canonicalize resolves components
        let mut p_with_dot = p.clone();
        p_with_dot.push("..");
        p_with_dot.push(p.file_name().unwrap());
        let res = validate_existing_path(p_with_dot.to_string_lossy().as_ref());
        assert!(res.is_ok());
        let canonical = res.unwrap();
        assert!(canonical.exists());
        // cleanup
        let _ = fs::remove_dir_all(&p);
    }

    #[test]
    fn test_validate_existing_path_no_resolve_preserves_supplied_path() {
        let p = unique_temp_path("exists_no_resolve");
        fs::create_dir_all(&p).expect("create temp dir");
        let p_with_dot = p.join("..").join(p.file_name().unwrap());

        let res = validate_existing_path_no_resolve(p_with_dot.to_string_lossy().as_ref());
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), p_with_dot);

        let _ = fs::remove_dir_all(&p);
    }

    #[test]
    fn test_count_items_and_calculate_size_recursive() {
        let base = unique_temp_path("count_size");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("create base");

        // root file a.txt (10 bytes)
        let a = base.join("a.txt");
        write_file(&a, b"aaaaaaaaaa"); // 10 bytes

        // subdir with file b.bin (20 bytes)
        let sub = base.join("sub");
        fs::create_dir_all(&sub).unwrap();
        let b = sub.join("b.bin");
        write_file(&b, &[0u8; 20]);

        // count_items counts all descendants recursively, excluding the root:
        // 1 (a.txt) + 1 (sub) + 1 (b.bin) = 3
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let cnt = count_items_scoped(&base, &cancel, None);
        assert_eq!(cnt, Some(3));

        let cancel = std::sync::atomic::AtomicBool::new(false);
        let direct_count = count_directory_entries(&base, &cancel, None);
        assert_eq!(direct_count, Some(2));

        // calculate_size_recursive should sum file sizes: 10 + 20 = 30
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let size = calculate_size_recursive_scoped(&base, &cancel, None);
        assert_eq!(size, Some(30));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_get_file_entry_for_file() {
        let base = unique_temp_path("file_entry");
        fs::create_dir_all(&base).unwrap();
        let fpath = base.join("example.txt");
        write_file(&fpath, b"hello");

        let entry = get_file_entry(&fpath).expect("should get file entry");
        assert_eq!(entry.name, "example.txt");
        assert!(!entry.is_dir);
        assert_eq!(entry.size, 5);
        assert_eq!(entry.extension, "txt");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_copy_dir_iterative_copies_contents() {
        let src = unique_temp_path("copy_src");
        let _ = fs::remove_dir_all(&src);
        fs::create_dir_all(&src).unwrap();

        // files and nested dir
        let f1 = src.join("one.txt");
        write_file(&f1, b"one");
        let nested = src.join("nested");
        fs::create_dir_all(&nested).unwrap();
        let f2 = nested.join("two.txt");
        write_file(&f2, b"two-two");

        let dst = unique_temp_path("copy_dst");
        let _ = fs::remove_dir_all(&dst);

        // call the helper
        copy_dir_iterative(&src, &dst).expect("copy should succeed");

        // Verify files exist and contents match
        let dst_f1 = dst.join("one.txt");
        let dst_f2 = dst.join("nested").join("two.txt");
        assert!(dst_f1.exists());
        assert!(dst_f2.exists());
        let a = fs::read(&dst_f1).unwrap();
        let b = fs::read(&dst_f2).unwrap();
        assert_eq!(a, b"one");
        assert_eq!(b, b"two-two");

        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dst);
    }

    #[test]
    fn test_create_directory_and_file_commands() {
        let base = unique_temp_path("create_cmd");
        fs::create_dir_all(&base).unwrap();

        // create_directory
        let res = create_directory(base.to_string_lossy().to_string(), "newdir".to_string());
        assert!(res.is_ok());
        let newpath = PathBuf::from(res.unwrap());
        assert!(newpath.exists() && newpath.is_dir());

        // create_file
        let file_res = create_file(
            newpath.to_string_lossy().to_string(),
            "file.txt".to_string(),
        );
        assert!(file_res.is_ok());
        let created = PathBuf::from(file_res.unwrap());
        assert!(created.exists() && created.is_file());

        // cleaning
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_filesystem_command_smoke_create_rename_copy_move() {
        let base = unique_temp_path("filesystem_command_smoke");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let source_dir = PathBuf::from(
            create_directory(base.to_string_lossy().to_string(), "source".to_string())
                .expect("create source directory"),
        );
        let copy_dir = PathBuf::from(
            create_directory(base.to_string_lossy().to_string(), "copies".to_string())
                .expect("create copy directory"),
        );
        let move_dir = PathBuf::from(
            create_directory(base.to_string_lossy().to_string(), "moved".to_string())
                .expect("create move directory"),
        );

        let original = PathBuf::from(
            create_file(
                source_dir.to_string_lossy().to_string(),
                "draft.txt".to_string(),
            )
            .expect("create draft file"),
        );
        fs::write(&original, b"release-smoke").expect("write draft content");

        let renamed = PathBuf::from(
            rename_entry(
                original.to_string_lossy().to_string(),
                "final.txt".to_string(),
            )
            .expect("rename draft file"),
        );
        assert!(renamed.exists());
        assert!(!original.exists());
        assert_eq!(
            fs::read(&renamed).expect("read renamed file"),
            b"release-smoke"
        );

        let copied = PathBuf::from(
            copy_entry(
                renamed.to_string_lossy().to_string(),
                copy_dir.to_string_lossy().to_string(),
            )
            .expect("copy renamed file"),
        );
        assert!(copied.exists());
        assert_eq!(
            fs::read(&copied).expect("read copied file"),
            b"release-smoke"
        );
        assert!(renamed.exists());

        let moved = PathBuf::from(
            move_entry(
                copied.to_string_lossy().to_string(),
                move_dir.to_string_lossy().to_string(),
            )
            .expect("move copied file"),
        );
        assert!(moved.exists());
        assert!(!copied.exists());
        assert_eq!(fs::read(&moved).expect("read moved file"), b"release-smoke");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_copy_and_move_commands_refuse_destination_conflicts() {
        let base = unique_temp_path("filesystem_conflict_smoke");
        let _ = fs::remove_dir_all(&base);
        let source_dir = base.join("source");
        let copy_dest_dir = base.join("copy_dest");
        let move_dest_dir = base.join("move_dest");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&copy_dest_dir).unwrap();
        fs::create_dir_all(&move_dest_dir).unwrap();

        let copy_source = source_dir.join("copy.txt");
        let copy_dest = copy_dest_dir.join("copy.txt");
        fs::write(&copy_source, b"copy-source").unwrap();
        fs::write(&copy_dest, b"copy-dest").unwrap();

        let copy_result = copy_entry(
            copy_source.to_string_lossy().to_string(),
            copy_dest_dir.to_string_lossy().to_string(),
        );
        assert!(copy_result.unwrap_err().starts_with("CONFLICT:"));
        assert_eq!(fs::read(&copy_source).unwrap(), b"copy-source");
        assert_eq!(fs::read(&copy_dest).unwrap(), b"copy-dest");

        let move_source = source_dir.join("move.txt");
        let move_dest = move_dest_dir.join("move.txt");
        fs::write(&move_source, b"move-source").unwrap();
        fs::write(&move_dest, b"move-dest").unwrap();

        let move_result = move_entry(
            move_source.to_string_lossy().to_string(),
            move_dest_dir.to_string_lossy().to_string(),
        );
        assert!(move_result.unwrap_err().starts_with("CONFLICT:"));
        assert_eq!(fs::read(&move_source).unwrap(), b"move-source");
        assert_eq!(fs::read(&move_dest).unwrap(), b"move-dest");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_batch_rename_across_nested_directories() {
        let base = unique_temp_path("batch_rename_nested");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("nested")).unwrap();

        let root_file = base.join("alpha draft.txt");
        let nested_file = base.join("nested").join("beta draft.txt");
        write_file(&root_file, b"alpha");
        write_file(&nested_file, b"beta");

        let final_paths = batch_rename(vec![
            RenameRequest {
                path: root_file.to_string_lossy().to_string(),
                new_name: "alpha-final.txt".to_string(),
            },
            RenameRequest {
                path: nested_file.to_string_lossy().to_string(),
                new_name: "beta-final.txt".to_string(),
            },
        ])
        .expect("batch rename should succeed");

        assert_eq!(final_paths.len(), 2);
        assert!(base.join("alpha-final.txt").exists());
        assert!(base.join("nested").join("beta-final.txt").exists());
        assert!(!root_file.exists());
        assert!(!nested_file.exists());

        let _ = fs::remove_dir_all(&base);
    }
}
