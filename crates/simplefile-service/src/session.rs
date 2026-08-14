use serde_json::{json, Value};
use simplefile_ipc::frame::{decode_length, encode_frame, FrameError};
use simplefile_ipc::rpc::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use simplefile_ipc::{LIST_DIRECTORY_CHUNK, MAX_FRAME_BYTES, PREFIX_RESULT_TOO_LARGE};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::dispatch::{dispatch, Dispatch, ProgressCopyMoveParams, SessionState};
use crate::progress::OperationRegistry;

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
    let registry = std::sync::Arc::new(OperationRegistry::default());

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
                copy_move_with_progress(&writer, &registry, id, params, true).await?;
            }
            Dispatch::MoveWithProgress { id, params } => {
                copy_move_with_progress(&writer, &registry, id, params, false).await?;
            }
            Dispatch::CancelOperation { id, operation_id } => {
                registry.cancel(&operation_id).await;
                write_json(&writer, &JsonRpcResponse::result(id, Value::Null)).await?;
            }
            Dispatch::Shutdown(response) => {
                write_json(&writer, &response).await?;
                state.shutdown = true;
                return Ok(());
            }
        }
    }
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

async fn copy_move_with_progress<W>(
    writer: &std::sync::Arc<tokio::sync::Mutex<W>>,
    registry: &std::sync::Arc<OperationRegistry>,
    id: Option<Value>,
    params: ProgressCopyMoveParams,
    is_copy: bool,
) -> Result<(), String>
where
    W: AsyncWrite + Unpin + Send + 'static,
{
    let op_id = params.operation_id.clone().unwrap_or_else(|| {
        let mut buf = [0u8; 8];
        let _ = getrandom::fill(&mut buf);
        buf.iter().map(|b| format!("{b:02x}")).collect()
    });
    let cancel = registry.register(&op_id).await;

    let sources = params.sources;
    let destination = params.destination;
    let conflict_action = params.conflict_action;
    let total = sources.len();

    let join = tokio::task::spawn_blocking(move || {
        let mut results: Vec<Value> = Vec::with_capacity(total);
        for (i, source) in sources.iter().enumerate() {
            if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                return Err("Operation cancelled".to_string());
            }
            let result = if is_copy {
                simplefile_core::file_ops::copy_entry_resolved(source, &destination, &conflict_action)
            } else {
                simplefile_core::file_ops::move_entry_resolved(source, &destination, &conflict_action)
            };
            match result {
                Ok(dest_path) => {
                    results.push(json!({"source": source, "destination": dest_path}));
                }
                Err(e) => return Err(e),
            }
            let _ = i; // progress index available for future notification use
        }
        Ok(results)
    });

    match join
        .await
        .map_err(|error| format!("transfer task failed: {error}"))?
    {
        Ok(results) => {
            write_json(writer, &JsonRpcResponse::result(id, json!(results))).await?;
        }
        Err(message) => {
            write_json(writer, &JsonRpcResponse::application_error(id, message)).await?;
        }
    }

    registry.remove(&op_id).await;
    Ok(())
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
