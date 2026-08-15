use serde::Deserialize;
use serde_json::{json, Value};
use simplefile_core::models::SearchOptions;
use simplefile_core::utils::dirs_home;
use simplefile_ipc::rpc::{JsonRpcRequest, JsonRpcResponse};
use simplefile_ipc::{
    APP_IDENTIFIER, DOMAIN_METHOD_COUNT, ERR_HOST_OWNED, ERR_INVALID_PARAMS, ERR_INVALID_REQUEST,
    ERR_METHOD_NOT_FOUND, HANDSHAKE_METHOD, HEALTH_METHOD, PREFIX_HOST_OWNED, PROTOCOL_VERSION,
    SHUTDOWN_METHOD,
};
use std::sync::atomic::AtomicBool;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Default)]
pub struct SessionState {
    pub handshake_done: bool,
    pub expected_token: Option<String>,
    pub shutdown: bool,
}

pub(crate) enum Dispatch {
    Reply(JsonRpcResponse),
    ListDirectory {
        id: Option<Value>,
        path: String,
    },
    CopyWithProgress {
        id: Option<Value>,
        params: ProgressCopyMoveParams,
    },
    MoveWithProgress {
        id: Option<Value>,
        params: ProgressCopyMoveParams,
    },
    CancelOperation {
        id: Option<Value>,
        operation_id: String,
    },
    SearchFiles {
        id: Option<Value>,
        options: SearchOptions,
    },
    CancelSearch {
        id: Option<Value>,
        search_id: String,
    },
    WatchDirectory {
        id: Option<Value>,
        path: String,
    },
    UnwatchDirectory {
        id: Option<Value>,
    },
    Shutdown(JsonRpcResponse),
}

#[derive(Debug, Deserialize)]
struct HandshakeParams {
    #[serde(rename = "protocolVersion")]
    protocol_version: u32,
    #[serde(rename = "clientName")]
    #[allow(dead_code)]
    client_name: Option<String>,
    #[serde(rename = "authToken")]
    auth_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PathParams {
    path: String,
}

#[derive(Debug, Deserialize)]
struct NameParams {
    path: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct PathsParams {
    paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RenameParams {
    path: String,
    #[serde(rename = "newName")]
    new_name: String,
}

#[derive(Debug, Deserialize)]
struct BatchRenameParams {
    entries: Vec<simplefile_core::file_ops::RenameRequest>,
}

#[derive(Debug, Deserialize)]
struct CopyMoveParams {
    source: String,
    destination: String,
}

#[derive(Debug, Deserialize)]
struct ResolvedCopyMoveParams {
    source: String,
    destination: String,
    #[serde(rename = "conflictAction")]
    conflict_action: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ProgressCopyMoveParams {
    pub sources: Vec<String>,
    pub destination: String,
    #[serde(rename = "operationId")]
    pub operation_id: Option<String>,
    #[serde(rename = "conflictAction")]
    pub conflict_action: String,
}

#[derive(Debug, Deserialize)]
struct OperationIdParams {
    #[serde(rename = "operationId")]
    operation_id: String,
}

#[derive(Debug, Deserialize)]
struct SearchFilesParams {
    options: SearchOptions,
}

#[derive(Debug, Deserialize)]
struct SearchIdParams {
    #[serde(rename = "searchId")]
    search_id: String,
}

#[derive(Debug, Deserialize)]
struct PreviewParams {
    path: String,
    #[serde(rename = "maxSize")]
    max_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ThumbnailParams {
    path: String,
    size: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ThumbnailBatchParams {
    paths: Vec<String>,
    size: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ExternalUrlParams {
    url: String,
}

#[derive(Debug, Deserialize)]
struct SettingKeyParams {
    key: String,
}

#[derive(Debug, Deserialize)]
struct SettingValueParams {
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct OpenWithParams {
    path: String,
    application: String,
}

#[derive(Debug, Deserialize)]
struct CompareParams {
    #[serde(rename = "pathA")]
    path_a: String,
    #[serde(rename = "pathB")]
    path_b: String,
}

#[derive(Debug, Deserialize)]
struct ExtractArchiveParams {
    #[serde(rename = "archivePath")]
    archive_path: String,
    destination: String,
}

#[derive(Debug, Deserialize)]
struct CreateArchiveParams {
    paths: Vec<String>,
    #[serde(rename = "archivePath")]
    archive_path: String,
    format: String,
}

pub(crate) fn dispatch(state: &mut SessionState, request: &JsonRpcRequest) -> Dispatch {
    if request.jsonrpc != simplefile_ipc::JSONRPC_VERSION {
        return Dispatch::Reply(JsonRpcResponse::error(
            request.id.clone(),
            ERR_INVALID_REQUEST,
            "jsonrpc must be \"2.0\"",
        ));
    }

    if !state.handshake_done && request.method != HANDSHAKE_METHOD {
        return Dispatch::Reply(JsonRpcResponse::error(
            request.id.clone(),
            ERR_INVALID_REQUEST,
            "ipc.handshake must be the first method",
        ));
    }

    match request.method.as_str() {
        HANDSHAKE_METHOD => Dispatch::Reply(handshake(state, request)),
        HEALTH_METHOD => Dispatch::Reply(JsonRpcResponse::result(
            request.id.clone(),
            json!({
                "ok": true,
                "protocolVersion": PROTOCOL_VERSION,
                "appVersion": APP_VERSION,
            }),
        )),
        "get_app_version" => Dispatch::Reply(JsonRpcResponse::result(
            request.id.clone(),
            json!(APP_VERSION),
        )),
        "get_home_dir" => match dirs_home() {
            Ok(path) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(path))),
            Err(message) => Dispatch::Reply(JsonRpcResponse::application_error(
                request.id.clone(),
                message,
            )),
        },
        "list_drives" => match simplefile_core::drives::list_drives() {
            Ok(drives) => Dispatch::Reply(JsonRpcResponse::result(
                request.id.clone(),
                serde_json::to_value(drives).unwrap_or(Value::Null),
            )),
            Err(message) => Dispatch::Reply(JsonRpcResponse::application_error(
                request.id.clone(),
                message,
            )),
        },
        "get_db_setting" => match parse_params::<SettingKeyParams>(request) {
            Ok(p) => match simplefile_core::settings_store::get_db_setting(p.key) {
                Ok(value) => {
                    Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(value)))
                }
                Err(message) => Dispatch::Reply(JsonRpcResponse::application_error(
                    request.id.clone(),
                    message,
                )),
            },
            Err(response) => Dispatch::Reply(response),
        },
        "set_db_setting" => match parse_params::<SettingValueParams>(request) {
            Ok(p) => match simplefile_core::settings_store::set_db_setting(p.key, p.value) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(message) => Dispatch::Reply(JsonRpcResponse::application_error(
                    request.id.clone(),
                    message,
                )),
            },
            Err(response) => Dispatch::Reply(response),
        },
        "list_directory" => match parse_path_params(request) {
            Ok(path) => Dispatch::ListDirectory {
                id: request.id.clone(),
                path,
            },
            Err(response) => Dispatch::Reply(response),
        },
        "select_directory" => Dispatch::Reply(JsonRpcResponse::error(
            request.id.clone(),
            ERR_HOST_OWNED,
            format!("{PREFIX_HOST_OWNED} select_directory"),
        )),
        "show_main_window" => {
            Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null))
        }
        SHUTDOWN_METHOD => {
            Dispatch::Shutdown(JsonRpcResponse::result(request.id.clone(), Value::Null))
        }
        // File operations
        "create_directory" => match parse_params::<NameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::create_directory(&p.path, &p.name) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "create_file" => match parse_params::<NameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::create_file(&p.path, &p.name) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "delete_entry" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::delete_entry(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_to_trash" => match parse_params::<PathsParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_to_trash(&p.paths) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "rename_entry" => match parse_params::<RenameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::rename_entry(&p.path, &p.new_name) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "batch_rename" => match parse_params::<BatchRenameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::batch_rename(p.entries) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "copy_entry" => match parse_params::<CopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::copy_entry(&p.source, &p.destination) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_entry" => match parse_params::<CopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_entry(&p.source, &p.destination) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "copy_entry_resolved" => match parse_params::<ResolvedCopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::copy_entry_resolved(
                &p.source,
                &p.destination,
                &p.conflict_action,
            ) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_entry_resolved" => match parse_params::<ResolvedCopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_entry_resolved(
                &p.source,
                &p.destination,
                &p.conflict_action,
            ) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "get_entry_info" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::get_entry_info_simple(&p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "list_subdirectories" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::list_subdirectories(&p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "open_file" => match parse_params::<PathParams>(request) {
            Ok(p) => match crate::shell::open_file(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "reveal_in_folder" => match parse_params::<PathParams>(request) {
            Ok(p) => match crate::shell::reveal_in_folder(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "open_external_url" => match parse_params::<ExternalUrlParams>(request) {
            Ok(p) => match crate::shell::open_external_url(&p.url) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "list_archive" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::archive::list_archive(p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "extract_archive" => match parse_params::<ExtractArchiveParams>(request) {
            Ok(p) => match simplefile_core::archive::extract_archive(p.archive_path, p.destination)
            {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "create_archive" => match parse_params::<CreateArchiveParams>(request) {
            Ok(p) => {
                match simplefile_core::archive::create_archive(p.paths, p.archive_path, p.format) {
                    Ok(()) => {
                        Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null))
                    }
                    Err(m) => {
                        Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                    }
                }
            }
            Err(r) => Dispatch::Reply(r),
        },
        "read_file_preview" => match parse_params::<PreviewParams>(request) {
            Ok(p) => match simplefile_core::preview::read_file_preview(p.path, p.max_size) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "generate_thumbnail" => match parse_params::<ThumbnailParams>(request) {
            Ok(p) => match simplefile_core::preview::generate_thumbnail(p.path, p.size) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "generate_thumbnails" => match parse_params::<ThumbnailBatchParams>(request) {
            Ok(p) => Dispatch::Reply(JsonRpcResponse::result(
                request.id.clone(),
                serde_json::to_value(simplefile_core::preview::generate_thumbnails(
                    p.paths, p.size,
                ))
                .unwrap_or(Value::Null),
            )),
            Err(r) => Dispatch::Reply(r),
        },
        "compute_checksum" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::checksum::compute_checksum(p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), r)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "get_image_metadata" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::metadata::get_image_metadata(p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "get_file_metadata" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::metadata::get_file_metadata(p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "open_file_with" => match parse_params::<OpenWithParams>(request) {
            Ok(p) => match simplefile_core::open_with::open_file_with(p.path, p.application) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "compare_files" => match parse_params::<CompareParams>(request) {
            Ok(p) => match simplefile_core::compare::compare_files(p.path_a, p.path_b) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(
                    request.id.clone(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                )),
                Err(m) => {
                    Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m))
                }
            },
            Err(r) => Dispatch::Reply(r),
        },
        "calculate_folder_size" => match parse_params::<PathParams>(request) {
            Ok(p) => {
                let cancel = AtomicBool::new(false);
                match simplefile_core::file_ops::calculate_folder_size(&p.path, &cancel) {
                    Some(size) => {
                        Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(size)))
                    }
                    None => Dispatch::Reply(JsonRpcResponse::application_error(
                        request.id.clone(),
                        "cancelled".to_string(),
                    )),
                }
            }
            Err(r) => Dispatch::Reply(r),
        },
        "count_folder_items" => match parse_params::<PathParams>(request) {
            Ok(p) => {
                let cancel = AtomicBool::new(false);
                match simplefile_core::file_ops::count_folder_items(&p.path, &cancel) {
                    Some(count) => {
                        Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(count)))
                    }
                    None => Dispatch::Reply(JsonRpcResponse::application_error(
                        request.id.clone(),
                        "cancelled".to_string(),
                    )),
                }
            }
            Err(r) => Dispatch::Reply(r),
        },
        "copy_with_progress" => match parse_params::<ProgressCopyMoveParams>(request) {
            Ok(params) => Dispatch::CopyWithProgress {
                id: request.id.clone(),
                params,
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_with_progress" => match parse_params::<ProgressCopyMoveParams>(request) {
            Ok(params) => Dispatch::MoveWithProgress {
                id: request.id.clone(),
                params,
            },
            Err(r) => Dispatch::Reply(r),
        },
        "cancel_operation" => match parse_params::<OperationIdParams>(request) {
            Ok(p) => Dispatch::CancelOperation {
                id: request.id.clone(),
                operation_id: p.operation_id,
            },
            Err(r) => Dispatch::Reply(r),
        },
        "search_files" => match parse_params::<SearchFilesParams>(request) {
            Ok(p) => Dispatch::SearchFiles {
                id: request.id.clone(),
                options: p.options,
            },
            Err(r) => Dispatch::Reply(r),
        },
        "cancel_search" => match parse_params::<SearchIdParams>(request) {
            Ok(p) => Dispatch::CancelSearch {
                id: request.id.clone(),
                search_id: p.search_id,
            },
            Err(r) => Dispatch::Reply(r),
        },
        "watch_directory" => match parse_path_params(request) {
            Ok(path) => Dispatch::WatchDirectory {
                id: request.id.clone(),
                path,
            },
            Err(response) => Dispatch::Reply(response),
        },
        "unwatch_directory" => Dispatch::UnwatchDirectory {
            id: request.id.clone(),
        },
        _ => Dispatch::Reply(JsonRpcResponse::error(
            request.id.clone(),
            ERR_METHOD_NOT_FOUND,
            format!("method not available in IPC MVP: {}", request.method),
        )),
    }
}

fn handshake(state: &mut SessionState, request: &JsonRpcRequest) -> JsonRpcResponse {
    let params = match parse_params::<HandshakeParams>(request) {
        Ok(params) => params,
        Err(response) => return response,
    };

    if params.protocol_version != PROTOCOL_VERSION {
        return JsonRpcResponse::application_error(
            request.id.clone(),
            format!(
                "unsupported protocolVersion {}; this service speaks {PROTOCOL_VERSION}",
                params.protocol_version
            ),
        );
    }

    if let Some(expected) = &state.expected_token {
        if params.auth_token.as_deref() != Some(expected.as_str()) {
            return JsonRpcResponse::error(
                request.id.clone(),
                ERR_INVALID_REQUEST,
                "authToken does not match",
            );
        }
    }

    state.handshake_done = true;
    JsonRpcResponse::result(
        request.id.clone(),
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "appVersion": APP_VERSION,
            "identifier": APP_IDENTIFIER,
            "methodCount": DOMAIN_METHOD_COUNT,
        }),
    )
}

fn parse_path_params(request: &JsonRpcRequest) -> Result<String, JsonRpcResponse> {
    parse_params::<PathParams>(request).map(|params| params.path)
}

fn parse_params<T: for<'de> Deserialize<'de>>(
    request: &JsonRpcRequest,
) -> Result<T, JsonRpcResponse> {
    let params = request
        .params
        .clone()
        .unwrap_or(Value::Object(Default::default()));
    serde_json::from_value(params).map_err(|error| {
        JsonRpcResponse::error(
            request.id.clone(),
            ERR_INVALID_PARAMS,
            format!("invalid params: {error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::fs;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn request(method: &str, id: u64, params: Value) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(json!(id)),
            method: method.into(),
            params: Some(params),
        }
    }

    fn temp_file(name: &str, content: &[u8]) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("simplefile-service-dispatch-{name}-{nanos}.txt"));
        fs::write(&path, content).expect("write temp file");
        path
    }

    fn metadata_db_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct EnvVarGuard {
        key: &'static str,
        previous: Option<OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &std::path::Path) -> Self {
            let previous = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            if let Some(previous) = &self.previous {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    #[test]
    fn rejects_methods_before_handshake() {
        let mut state = SessionState::default();
        let outcome = dispatch(&mut state, &request("get_home_dir", 1, json!({})));
        let Dispatch::Reply(response) = outcome else {
            panic!("expected reply");
        };
        assert_eq!(response.error.unwrap().code, ERR_INVALID_REQUEST);
    }

    #[test]
    fn handshake_then_home_dir() {
        let mut state = SessionState::default();
        let handshake = dispatch(
            &mut state,
            &request(
                HANDSHAKE_METHOD,
                1,
                json!({
                    "protocolVersion": 1,
                    "clientName": "test",
                    "authToken": "dev"
                }),
            ),
        );
        let Dispatch::Reply(ready) = handshake else {
            panic!("expected handshake reply");
        };
        assert!(ready.error.is_none());
        assert!(state.handshake_done);

        let home = dispatch(&mut state, &request("get_home_dir", 2, json!({})));
        let Dispatch::Reply(response) = home else {
            panic!("expected home dir reply");
        };
        let path = response.result.unwrap().as_str().unwrap().to_string();
        assert!(!path.is_empty());
    }

    #[test]
    fn select_directory_is_host_owned() {
        let mut state = SessionState {
            handshake_done: true,
            ..SessionState::default()
        };
        let outcome = dispatch(&mut state, &request("select_directory", 3, json!({})));
        let Dispatch::Reply(response) = outcome else {
            panic!("expected reply");
        };
        let error = response.error.unwrap();
        assert_eq!(error.code, ERR_HOST_OWNED);
        assert!(error.message.starts_with(PREFIX_HOST_OWNED));
    }

    #[test]
    fn unknown_method_is_not_found() {
        let mut state = SessionState {
            handshake_done: true,
            ..SessionState::default()
        };
        let outcome = dispatch(&mut state, &request("not_a_real_method", 4, json!({})));
        let Dispatch::Reply(response) = outcome else {
            panic!("expected reply");
        };
        assert_eq!(response.error.unwrap().code, ERR_METHOD_NOT_FOUND);
    }

    #[test]
    fn settings_methods_round_trip_through_metadata_db() {
        let _lock = metadata_db_env_lock().lock().expect("env lock");
        let db_path = temp_file("settings-db", b"");
        fs::remove_file(&db_path).expect("remove seed temp file");
        let _env = EnvVarGuard::set("SIMPLEFILE_METADATA_DB", &db_path);
        let mut state = SessionState {
            handshake_done: true,
            ..SessionState::default()
        };

        let set = dispatch(
            &mut state,
            &request(
                "set_db_setting",
                5,
                json!({ "key": "winui.layout", "value": "{\"dualPane\":true}" }),
            ),
        );
        let Dispatch::Reply(set_response) = set else {
            panic!("expected settings set reply");
        };
        assert!(set_response.error.is_none());

        let get = dispatch(
            &mut state,
            &request("get_db_setting", 6, json!({ "key": "winui.layout" })),
        );
        let Dispatch::Reply(get_response) = get else {
            panic!("expected settings get reply");
        };
        assert_eq!(
            get_response.result.unwrap().as_str(),
            Some("{\"dualPane\":true}")
        );

        let missing = dispatch(
            &mut state,
            &request("get_db_setting", 7, json!({ "key": "missing" })),
        );
        let Dispatch::Reply(missing_response) = missing else {
            panic!("expected missing settings reply");
        };
        assert!(missing_response.result.unwrap().is_null());

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn inspection_methods_use_core_logic() {
        let left = temp_file("left", b"alpha\nbravo\n");
        let right = temp_file("right", b"alpha\ncharlie\n");
        let mut state = SessionState {
            handshake_done: true,
            ..SessionState::default()
        };

        let preview = dispatch(
            &mut state,
            &request(
                "read_file_preview",
                10,
                json!({ "path": left.to_string_lossy(), "maxSize": 1024 }),
            ),
        );
        let Dispatch::Reply(preview_response) = preview else {
            panic!("expected preview reply");
        };
        let preview_value = preview_response.result.unwrap();
        assert_eq!(preview_value["file_type"], "text");
        assert_eq!(preview_value["content"], "alpha\nbravo\n");

        let checksum = dispatch(
            &mut state,
            &request(
                "compute_checksum",
                11,
                json!({ "path": left.to_string_lossy() }),
            ),
        );
        let Dispatch::Reply(checksum_response) = checksum else {
            panic!("expected checksum reply");
        };
        assert!(
            checksum_response.result.unwrap()["sha256"]
                .as_str()
                .unwrap()
                .len()
                >= 64
        );

        let compare = dispatch(
            &mut state,
            &request(
                "compare_files",
                12,
                json!({
                    "pathA": left.to_string_lossy(),
                    "pathB": right.to_string_lossy(),
                }),
            ),
        );
        let Dispatch::Reply(compare_response) = compare else {
            panic!("expected compare reply");
        };
        let compare_value = compare_response.result.unwrap();
        assert_eq!(compare_value["identical"], false);
        assert!(compare_value["changed"].as_u64().unwrap() >= 1);

        let archive_path = left.with_file_name(format!(
            "simplefile-service-dispatch-archive-{}.zip",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let create_archive = dispatch(
            &mut state,
            &request(
                "create_archive",
                13,
                json!({
                    "paths": [left.to_string_lossy()],
                    "archivePath": archive_path.to_string_lossy(),
                    "format": "zip",
                }),
            ),
        );
        let Dispatch::Reply(create_archive_response) = create_archive else {
            panic!("expected create archive reply");
        };
        assert!(create_archive_response.error.is_none());
        assert!(archive_path.exists());

        let list_archive = dispatch(
            &mut state,
            &request(
                "list_archive",
                14,
                json!({ "path": archive_path.to_string_lossy() }),
            ),
        );
        let Dispatch::Reply(list_archive_response) = list_archive else {
            panic!("expected list archive reply");
        };
        let archive_value = list_archive_response.result.unwrap();
        assert_eq!(archive_value["format"], "zip");
        assert_eq!(
            archive_value["entries"][0]["name"].as_str().unwrap(),
            left.file_name().unwrap().to_string_lossy()
        );

        let extract_dir = archive_path.with_file_name(format!(
            "simplefile-service-dispatch-extract-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let extract_archive = dispatch(
            &mut state,
            &request(
                "extract_archive",
                15,
                json!({
                    "archivePath": archive_path.to_string_lossy(),
                    "destination": extract_dir.to_string_lossy(),
                }),
            ),
        );
        let Dispatch::Reply(extract_archive_response) = extract_archive else {
            panic!("expected extract archive reply");
        };
        assert!(extract_archive_response.error.is_none());
        assert!(extract_dir.join(left.file_name().unwrap()).exists());

        let _ = fs::remove_file(left);
        let _ = fs::remove_file(right);
        let _ = fs::remove_file(archive_path);
        let _ = fs::remove_dir_all(extract_dir);
    }
}
