use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;
use simplefile_core::utils::dirs_home;
use simplefile_ipc::rpc::{JsonRpcRequest, JsonRpcResponse};
use simplefile_ipc::{
    APP_IDENTIFIER, DOMAIN_METHOD_COUNT, ERR_HOST_OWNED, ERR_INVALID_PARAMS, ERR_INVALID_REQUEST,
    ERR_METHOD_NOT_FOUND, HANDSHAKE_METHOD, HEALTH_METHOD, PREFIX_HOST_OWNED, PROTOCOL_VERSION,
    SHUTDOWN_METHOD,
};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Default)]
pub struct SessionState {
    pub handshake_done: bool,
    pub expected_token: Option<String>,
    pub shutdown: bool,
}

pub(crate) enum Dispatch {
    Reply(JsonRpcResponse),
    ListDirectory { id: Option<Value>, path: String },
    CopyWithProgress { id: Option<Value>, params: ProgressCopyMoveParams },
    MoveWithProgress { id: Option<Value>, params: ProgressCopyMoveParams },
    CancelOperation { id: Option<Value>, operation_id: String },
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
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "create_file" => match parse_params::<NameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::create_file(&p.path, &p.name) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "delete_entry" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::delete_entry(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_to_trash" => match parse_params::<PathsParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_to_trash(&p.paths) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "rename_entry" => match parse_params::<RenameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::rename_entry(&p.path, &p.new_name) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "batch_rename" => match parse_params::<BatchRenameParams>(request) {
            Ok(p) => match simplefile_core::file_ops::batch_rename(p.entries) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "copy_entry" => match parse_params::<CopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::copy_entry(&p.source, &p.destination) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_entry" => match parse_params::<CopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_entry(&p.source, &p.destination) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "copy_entry_resolved" => match parse_params::<ResolvedCopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::copy_entry_resolved(&p.source, &p.destination, &p.conflict_action) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "move_entry_resolved" => match parse_params::<ResolvedCopyMoveParams>(request) {
            Ok(p) => match simplefile_core::file_ops::move_entry_resolved(&p.source, &p.destination, &p.conflict_action) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(r))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "get_entry_info" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::get_entry_info_simple(&p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), serde_json::to_value(r).unwrap_or(Value::Null))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "list_subdirectories" => match parse_params::<PathParams>(request) {
            Ok(p) => match simplefile_core::file_ops::list_subdirectories(&p.path) {
                Ok(r) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), serde_json::to_value(r).unwrap_or(Value::Null))),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "open_file" => match parse_params::<PathParams>(request) {
            Ok(p) => match crate::shell::open_file(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "reveal_in_folder" => match parse_params::<PathParams>(request) {
            Ok(p) => match crate::shell::reveal_in_folder(&p.path) {
                Ok(()) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), Value::Null)),
                Err(m) => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), m)),
            },
            Err(r) => Dispatch::Reply(r),
        },
        "calculate_folder_size" => match parse_params::<PathParams>(request) {
            Ok(p) => {
                let cancel = AtomicBool::new(false);
                match simplefile_core::file_ops::calculate_folder_size(&p.path, &cancel) {
                    Some(size) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(size))),
                    None => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), "cancelled".to_string())),
                }
            }
            Err(r) => Dispatch::Reply(r),
        },
        "count_folder_items" => match parse_params::<PathParams>(request) {
            Ok(p) => {
                let cancel = AtomicBool::new(false);
                match simplefile_core::file_ops::count_folder_items(&p.path, &cancel) {
                    Some(count) => Dispatch::Reply(JsonRpcResponse::result(request.id.clone(), json!(count))),
                    None => Dispatch::Reply(JsonRpcResponse::application_error(request.id.clone(), "cancelled".to_string())),
                }
            }
            Err(r) => Dispatch::Reply(r),
        },
        "copy_with_progress" => match parse_params::<ProgressCopyMoveParams>(request) {
            Ok(params) => Dispatch::CopyWithProgress { id: request.id.clone(), params },
            Err(r) => Dispatch::Reply(r),
        },
        "move_with_progress" => match parse_params::<ProgressCopyMoveParams>(request) {
            Ok(params) => Dispatch::MoveWithProgress { id: request.id.clone(), params },
            Err(r) => Dispatch::Reply(r),
        },
        "cancel_operation" => match parse_params::<OperationIdParams>(request) {
            Ok(p) => Dispatch::CancelOperation { id: request.id.clone(), operation_id: p.operation_id },
            Err(r) => Dispatch::Reply(r),
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

    fn request(method: &str, id: u64, params: Value) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(json!(id)),
            method: method.into(),
            params: Some(params),
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
        let outcome = dispatch(&mut state, &request("search_files", 4, json!({})));
        let Dispatch::Reply(response) = outcome else {
            panic!("expected reply");
        };
        assert_eq!(response.error.unwrap().code, ERR_METHOD_NOT_FOUND);
    }
}
