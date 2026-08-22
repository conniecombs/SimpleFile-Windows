use serde::Serialize;
use serde_json::{json, Value};
use simplefile_ipc::frame::{decode_length, encode_frame, FrameError};
use simplefile_ipc::rpc::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use simplefile_ipc::{
    FILE_CHANGE, LIST_DIRECTORY_CHUNK, MAX_FRAME_BYTES, OPERATION_PROGRESS,
    PREFIX_RESULT_TOO_LARGE, SEARCH_COMPLETE, SEARCH_RESULTS_BATCH, UPDATE_CHUNK,
};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::dispatch::{dispatch, Dispatch, ProgressCopyMoveParams, SessionState};
use crate::progress::OperationRegistry;
use crate::watcher::WatcherState;
use simplefile_core::cleanup::{scan_disk_cleanup, scan_duplicate_check, DuplicateScanOptions};
use simplefile_core::models::ProgressUpdate;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
struct EventSink {
    sender: tokio::sync::mpsc::UnboundedSender<JsonRpcNotification>,
}

struct DuplicateCheckJob {
    cancel: Arc<AtomicBool>,
    id: Option<Value>,
    directory: String,
    min_size: Option<u64>,
    partial_hash_bytes: Option<u64>,
    operation_id: Option<String>,
}

impl EventSink {
    fn emit<T: Serialize>(&self, method: &str, params: &T) {
        if let Ok(params) = serde_json::to_value(params) {
            let _ = self.sender.send(JsonRpcNotification::new(method, params));
        }
    }
}

pub async fn serve_connection<R, W>(
    mut reader: R,
    writer: W,
    mut state: SessionState,
) -> Result<(), String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let writer = std::sync::Arc::new(tokio::sync::Mutex::new(writer));
    let operations = std::sync::Arc::new(OperationRegistry::default());
    let searches = std::sync::Arc::new(OperationRegistry::default());
    let mut watcher_state = WatcherState::default();
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel();
    let events = EventSink { sender: event_tx };
    let event_writer = writer.clone();
    tokio::spawn(async move {
        while let Some(notification) = event_rx.recv().await {
            if write_json(&event_writer, &notification).await.is_err() {
                break;
            }
        }
    });

    loop {
        let payload = match read_frame(&mut reader).await {
            Ok(payload) => payload,
            Err(FrameError::UnexpectedEof) => return Ok(()),
            Err(FrameError::Oversize { length }) => {
                return Err(format!("inbound frame too large: {length}"));
            }
            Err(error) => return Err(error.to_string()),
        };

        let request: JsonRpcRequest = serde_json::from_slice(&payload)
            .map_err(|error| format!("invalid JSON-RPC request: {error}"))?;

        match dispatch(&mut state, &request) {
            Dispatch::Reply(response) => write_json(&writer, &response).await?,
            Dispatch::ListDirectory { id, path } => {
                list_directory_and_reply(&writer, id, path).await?;
            }
            Dispatch::CopyWithProgress { id, params } => {
                spawn_copy_move_with_progress(
                    writer.clone(),
                    operations.clone(),
                    events.clone(),
                    id,
                    params,
                    true,
                );
            }
            Dispatch::MoveWithProgress { id, params } => {
                spawn_copy_move_with_progress(
                    writer.clone(),
                    operations.clone(),
                    events.clone(),
                    id,
                    params,
                    false,
                );
            }
            Dispatch::CancelOperation { id, operation_id } => {
                operations.cancel(&operation_id).await;
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::SearchFiles { id, options } => {
                spawn_search_files(
                    writer.clone(),
                    searches.clone(),
                    events.clone(),
                    id,
                    options,
                );
            }
            Dispatch::CancelSearch { id, search_id } => {
                searches.cancel(&search_id).await;
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::WatchDirectory { id, path } => {
                let events = events.clone();
                let result =
                    crate::watcher::watch_directory(path, &mut watcher_state, move |change| {
                        events.emit(FILE_CHANGE, &change);
                    });
                let response = match result {
                    Ok(()) => JsonRpcResponse::result(id, Value::Null),
                    Err(message) => JsonRpcResponse::application_error(id, message),
                };
                write_json(&writer, &response).await?;
            }
            Dispatch::UnwatchDirectory { id } => {
                crate::watcher::unwatch_directory(&mut watcher_state);
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::DuplicateCheck {
                id,
                directory,
                min_size,
                partial_hash_bytes,
                operation_id,
            } => {
                spawn_duplicate_check(
                    writer.clone(),
                    events.clone(),
                    DuplicateCheckJob {
                        cancel: state.duplicate_check_cancel.clone(),
                        id,
                        directory,
                        min_size,
                        partial_hash_bytes,
                        operation_id,
                    },
                );
            }
            Dispatch::CancelDuplicateCheck { id } => {
                state.duplicate_check_cancel.store(true, Ordering::Relaxed);
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::DiskCleanup {
                id,
                directory,
                size_threshold,
                operation_id,
            } => {
                spawn_disk_cleanup(
                    writer.clone(),
                    events.clone(),
                    state.disk_cleanup_cancel.clone(),
                    id,
                    directory,
                    size_threshold,
                    operation_id,
                );
            }
            Dispatch::CancelDiskCleanup { id } => {
                state.disk_cleanup_cancel.store(true, Ordering::Relaxed);
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::InstallUpdate { id } => {
                spawn_install_update(writer.clone(), events.clone(), id);
            }
            Dispatch::CalculateFolderSize { id, path, cancel } => {
                spawn_folder_size(writer.clone(), id, path, cancel);
            }
            Dispatch::CountFolderItems { id, path, cancel } => {
                spawn_folder_item_count(writer.clone(), id, path, cancel);
            }
            Dispatch::GetFolderMetrics { id, path, cancel } => {
                spawn_folder_metrics(writer.clone(), id, path, cancel);
            }
            Dispatch::Shutdown(response) => {
                crate::watcher::unwatch_directory(&mut watcher_state);
                write_json(&writer, &response).await?;
                state.shutdown = true;
                return Ok(());
            }
        }
    }
}

fn spawn_install_update<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    events: EventSink,
    id: Option<Value>,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let join = tokio::task::spawn_blocking(move || {
            simplefile_core::updater::install_update_with_progress(|downloaded, total| {
                events.emit(UPDATE_CHUNK, &[downloaded, total]);
            })
        });

        let response = match join.await {
            Ok(Ok(())) => JsonRpcResponse::result(id, Value::Null),
            Ok(Err(message)) => JsonRpcResponse::application_error(id, message),
            Err(error) => {
                JsonRpcResponse::application_error(id, format!("update task failed: {error}"))
            }
        };
        let _ = write_json(&writer, &response).await;
    });
}

fn spawn_folder_size<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    id: Option<Value>,
    path: String,
    cancel: Arc<AtomicBool>,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let join = tokio::task::spawn_blocking(move || {
            simplefile_core::file_ops::calculate_folder_size(&path, &cancel)
        });

        let response = match join.await {
            Ok(Some(size)) => JsonRpcResponse::result(id, json!(size)),
            Ok(None) => JsonRpcResponse::application_error(id, "cancelled".to_string()),
            Err(error) => {
                JsonRpcResponse::application_error(id, format!("folder size task failed: {error}"))
            }
        };
        let _ = write_json(&writer, &response).await;
    });
}

fn spawn_folder_item_count<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    id: Option<Value>,
    path: String,
    cancel: Arc<AtomicBool>,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let join = tokio::task::spawn_blocking(move || {
            simplefile_core::file_ops::count_folder_items(&path, &cancel)
        });

        let response = match join.await {
            Ok(Some(count)) => JsonRpcResponse::result(id, json!(count)),
            Ok(None) => JsonRpcResponse::application_error(id, "cancelled".to_string()),
            Err(error) => JsonRpcResponse::application_error(
                id,
                format!("folder item count task failed: {error}"),
            ),
        };
        let _ = write_json(&writer, &response).await;
    });
}

fn spawn_folder_metrics<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    id: Option<Value>,
    path: String,
    cancel: Arc<AtomicBool>,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let cancel2 = cancel.clone();
        let cancel3 = cancel.clone();
        let path2 = path.clone();
        let path3 = path.clone();

        // Run size, count, and subdirectory listing concurrently in the
        // blocking threadpool rather than serially on the main loop.
        let size_handle = tokio::task::spawn_blocking(move || {
            simplefile_core::file_ops::calculate_folder_size(&path, &cancel)
        });
        let count_handle = tokio::task::spawn_blocking(move || {
            simplefile_core::file_ops::count_folder_items(&path2, &cancel2)
        });
        let subdirs_handle = tokio::task::spawn_blocking(move || {
            if cancel3.load(Ordering::Relaxed) {
                Err("cancelled".to_string())
            } else {
                simplefile_core::file_ops::list_subdirectories(&path3)
            }
        });

        let (size_result, count_result, subdirs_result) =
            tokio::join!(size_handle, count_handle, subdirs_handle);

        let response = match (size_result, count_result, subdirs_result) {
            (Ok(Some(size)), Ok(Some(count)), Ok(Ok(subdirs))) => {
                JsonRpcResponse::result(
                    id,
                    json!({
                        "size": size,
                        "itemCount": count,
                        "subdirectories": subdirs,
                    }),
                )
            }
            (Ok(None), _, _) | (_, Ok(None), _) => {
                JsonRpcResponse::application_error(id, "cancelled".to_string())
            }
            (_, _, Ok(Err(message))) => JsonRpcResponse::application_error(id, message),
            (Err(error), _, _) | (_, Err(error), _) | (_, _, Err(error)) => {
                JsonRpcResponse::application_error(
                    id,
                    format!("folder metrics task failed: {error}"),
                )
            }
        };
        let _ = write_json(&writer, &response).await;
    });
}

async fn list_directory_and_reply<W>(
    writer: &std::sync::Arc<tokio::sync::Mutex<W>>,
    id: Option<Value>,
    path: String,
) -> Result<(), String>
where
    W: AsyncWrite + Unpin + Send + 'static,
{
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let join = tokio::task::spawn_blocking(move || {
        simplefile_core::dir_list::list_directory(path, |chunk| {
            tx.send(chunk).map_err(|error| error.to_string())
        })
    });

    while let Some(chunk) = rx.recv().await {
        let mut params = serde_json::to_value(&chunk)
            .map_err(|error| format!("failed to serialize listing chunk: {error}"))?;
        if let Some(object) = params.as_object_mut() {
            if let Some(request_id) = &id {
                object.insert("requestId".to_string(), request_id.clone());
            }
        }
        write_json(
            writer,
            &JsonRpcNotification::new(LIST_DIRECTORY_CHUNK, params),
        )
        .await?;
    }

    match join
        .await
        .map_err(|error| format!("listing task failed: {error}"))?
    {
        Ok(listing) => {
            let result = serde_json::to_value(&listing)
                .map_err(|error| format!("failed to serialize listing: {error}"))?;
            write_json(writer, &JsonRpcResponse::result(id, result)).await
        }
        Err(message) => write_json(writer, &JsonRpcResponse::application_error(id, message)).await,
    }
}

fn spawn_copy_move_with_progress<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    registry: std::sync::Arc<OperationRegistry>,
    events: EventSink,
    id: Option<Value>,
    params: ProgressCopyMoveParams,
    is_copy: bool,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let op_id = params
            .operation_id
            .unwrap_or_else(crate::progress::generate_transfer_operation_id);
        let cancel = registry.register(&op_id).await;
        let sources = params.sources;
        let destination = params.destination;
        let conflict_action = params.conflict_action;
        let operation_type = if is_copy { "copy" } else { "move" };
        let events_for_task = events.clone();
        let op_id_for_task = op_id.clone();

        let join = tokio::task::spawn_blocking(move || {
            let emit = |update| events_for_task.emit(OPERATION_PROGRESS, &update);
            crate::progress::transfer_with_progress_blocking(
                operation_type,
                sources,
                destination,
                op_id_for_task,
                conflict_action,
                cancel,
                &emit,
            )
        });

        let response = match join.await {
            Ok(Ok(results)) => match serde_json::to_value(results) {
                Ok(result) => JsonRpcResponse::result(id, result),
                Err(error) => JsonRpcResponse::application_error(
                    id,
                    format!("failed to serialize transfer result: {error}"),
                ),
            },
            Ok(Err(message)) => JsonRpcResponse::application_error(id, message),
            Err(error) => {
                JsonRpcResponse::application_error(id, format!("transfer task failed: {error}"))
            }
        };

        let _ = write_json(&writer, &response).await;
        registry.remove(&op_id).await;
    });
}

fn spawn_search_files<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    registry: std::sync::Arc<OperationRegistry>,
    events: EventSink,
    id: Option<Value>,
    options: simplefile_core::models::SearchOptions,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let search_id = options.search_id.clone();
        let cancel = if let Some(search_id) = search_id.as_deref() {
            registry.register(search_id).await
        } else {
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false))
        };

        let events_for_task = events.clone();
        let join = tokio::task::spawn_blocking(move || {
            let emit_batch = |batch| events_for_task.emit(SEARCH_RESULTS_BATCH, &batch);
            let result = crate::search::search_files_blocking(options, cancel, &emit_batch);
            if let Ok(results) = &result {
                events_for_task.emit(SEARCH_COMPLETE, &results.len());
            }
            result
        });

        let response = match join.await {
            Ok(Ok(results)) => match serde_json::to_value(results) {
                Ok(result) => JsonRpcResponse::result(id, result),
                Err(error) => JsonRpcResponse::application_error(
                    id,
                    format!("failed to serialize search result: {error}"),
                ),
            },
            Ok(Err(message)) => JsonRpcResponse::application_error(id, message),
            Err(error) => {
                JsonRpcResponse::application_error(id, format!("search task failed: {error}"))
            }
        };

        let _ = write_json(&writer, &response).await;
        if let Some(search_id) = search_id {
            registry.remove(&search_id).await;
        }
    });
}

fn spawn_duplicate_check<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    events: EventSink,
    job: DuplicateCheckJob,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    let DuplicateCheckJob {
        cancel,
        id,
        directory,
        min_size,
        partial_hash_bytes,
        operation_id,
    } = job;
    cancel.store(false, Ordering::Relaxed);
    let operation_id = operation_id.unwrap_or_else(|| "duplicate_check".to_string());
    tokio::spawn(async move {
        let events_for_task = events.clone();
        let operation_id_for_task = operation_id.clone();
        let join = tokio::task::spawn_blocking(move || {
            let emit = |current, total, item: &str| {
                events_for_task.emit(
                    OPERATION_PROGRESS,
                    &ProgressUpdate {
                        operation_id: operation_id_for_task.clone(),
                        operation_type: "duplicate-check".to_string(),
                        current,
                        total,
                        current_files: 0,
                        total_files: 0,
                        current_item: item.to_string(),
                        status: "running".to_string(),
                        error: None,
                    },
                );
            };
            scan_duplicate_check(
                &directory,
                DuplicateScanOptions::from_params(min_size, partial_hash_bytes),
                &cancel,
                emit,
            )
        });

        let response = match join.await {
            Ok(Ok(result)) => match serde_json::to_value(result) {
                Ok(value) => JsonRpcResponse::result(id, value),
                Err(error) => JsonRpcResponse::application_error(
                    id,
                    format!("failed to serialize duplicate check result: {error}"),
                ),
            },
            Ok(Err(message)) => JsonRpcResponse::application_error(id, message),
            Err(error) => JsonRpcResponse::application_error(
                id,
                format!("duplicate check task failed: {error}"),
            ),
        };
        let _ = write_json(&writer, &response).await;
    });
}

fn spawn_disk_cleanup<W>(
    writer: std::sync::Arc<tokio::sync::Mutex<W>>,
    events: EventSink,
    cancel: Arc<std::sync::atomic::AtomicBool>,
    id: Option<Value>,
    directory: String,
    size_threshold: Option<u64>,
    operation_id: Option<String>,
) where
    W: AsyncWrite + Unpin + Send + 'static,
{
    cancel.store(false, Ordering::Relaxed);
    let operation_id = operation_id.unwrap_or_else(|| "disk_cleanup".to_string());
    tokio::spawn(async move {
        let events_for_task = events.clone();
        let operation_id_for_task = operation_id.clone();
        let join = tokio::task::spawn_blocking(move || {
            let emit = |current, total, item: &str| {
                events_for_task.emit(
                    OPERATION_PROGRESS,
                    &ProgressUpdate {
                        operation_id: operation_id_for_task.clone(),
                        operation_type: "cleanup".to_string(),
                        current,
                        total,
                        current_files: 0,
                        total_files: 0,
                        current_item: item.to_string(),
                        status: "running".to_string(),
                        error: None,
                    },
                );
            };
            scan_disk_cleanup(&directory, size_threshold, &cancel, emit)
        });

        let response = match join.await {
            Ok(Ok(result)) => match serde_json::to_value(result) {
                Ok(value) => JsonRpcResponse::result(id, value),
                Err(error) => JsonRpcResponse::application_error(
                    id,
                    format!("failed to serialize cleanup result: {error}"),
                ),
            },
            Ok(Err(message)) => JsonRpcResponse::application_error(id, message),
            Err(error) => {
                JsonRpcResponse::application_error(id, format!("disk cleanup task failed: {error}"))
            }
        };
        let _ = write_json(&writer, &response).await;
    });
}

async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> Result<Vec<u8>, FrameError> {
    let mut header = [0u8; 4];
    if let Err(error) = reader.read_exact(&mut header).await {
        if error.kind() == std::io::ErrorKind::UnexpectedEof {
            return Err(FrameError::UnexpectedEof);
        }
        return Err(FrameError::Io(error.to_string()));
    }
    let length = decode_length(header)?;
    let mut payload = vec![0u8; length as usize];
    reader
        .read_exact(&mut payload)
        .await
        .map_err(|error| FrameError::Io(error.to_string()))?;
    Ok(payload)
}

async fn write_json<W, T>(
    writer: &std::sync::Arc<tokio::sync::Mutex<W>>,
    value: &T,
) -> Result<(), String>
where
    W: AsyncWrite + Unpin,
    T: serde::Serialize,
{
    let payload =
        serde_json::to_vec(value).map_err(|error| format!("failed to encode JSON: {error}"))?;
    if payload.len() > MAX_FRAME_BYTES as usize {
        let error = JsonRpcResponse::application_error(
            None,
            format!("{PREFIX_RESULT_TOO_LARGE} result exceeds 80 MiB; use streamed chunks"),
        );
        let payload = serde_json::to_vec(&error)
            .map_err(|err| format!("failed to encode oversize error: {err}"))?;
        write_frame(writer, &payload).await
    } else {
        write_frame(writer, &payload).await
    }
}

async fn write_frame<W: AsyncWrite + Unpin>(
    writer: &std::sync::Arc<tokio::sync::Mutex<W>>,
    payload: &[u8],
) -> Result<(), String> {
    let frame = encode_frame(payload).map_err(|error| error.to_string())?;
    let mut guard = writer.lock().await;
    guard
        .write_all(&frame)
        .await
        .map_err(|error| format!("failed to write frame: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use simplefile_ipc::rpc::JsonRpcRequest;
    use simplefile_ipc::{HANDSHAKE_METHOD, HEALTH_METHOD, PROTOCOL_VERSION};
    use tokio::io::duplex;

    async fn call(
        client: &mut tokio::io::DuplexStream,
        method: &str,
        id: u64,
        params: Value,
    ) -> Value {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(json!(id)),
            method: method.into(),
            params: Some(params),
        };
        let payload = serde_json::to_vec(&request).unwrap();
        let frame = encode_frame(&payload).unwrap();
        client.write_all(&frame).await.unwrap();
        let response = read_frame(client).await.unwrap();
        serde_json::from_slice(&response).unwrap()
    }

    #[tokio::test]
    async fn duplex_health_and_home_dir() {
        let (mut client, server) = duplex(64 * 1024);
        let (server_read, server_write) = tokio::io::split(server);
        let server = tokio::spawn(serve_connection(
            server_read,
            server_write,
            SessionState::default(),
        ));

        let handshake = call(
            &mut client,
            HANDSHAKE_METHOD,
            1,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "clientName": "test",
                "authToken": "dev"
            }),
        )
        .await;
        assert_eq!(handshake["result"]["protocolVersion"], PROTOCOL_VERSION);

        let health = call(&mut client, HEALTH_METHOD, 2, json!({})).await;
        assert_eq!(health["result"]["ok"], true);

        let home = call(&mut client, "get_home_dir", 3, json!({})).await;
        assert!(home["result"].as_str().unwrap().len() > 1);

        let dir = std::env::temp_dir();
        let listing = call(
            &mut client,
            "list_directory",
            4,
            json!({ "path": dir.to_string_lossy() }),
        )
        .await;
        // One or more chunk notifications may arrive before the result.
        let mut message = listing;
        while message.get("method").and_then(Value::as_str) == Some(LIST_DIRECTORY_CHUNK) {
            message = {
                let response = read_frame(&mut client).await.unwrap();
                serde_json::from_slice(&response).unwrap()
            };
        }
        assert!(message["result"]["path"].as_str().is_some());
        assert!(message["result"]["entries"].is_array());

        let _ = call(&mut client, "ipc.shutdown", 5, json!({})).await;
        let _ = server.await;
    }
}
