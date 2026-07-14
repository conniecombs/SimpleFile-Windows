use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[tauri::command]
pub fn get_all_tags(db: State<'_, DbState>) -> Result<Vec<Tag>, String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;

    let tag_iter = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }

    Ok(tags)
}

#[tauri::command]
pub fn create_tag(db: State<'_, DbState>, name: String, color: String) -> Result<Tag, String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        params![name, color],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Tag { id, name, color })
}

#[tauri::command]
pub fn update_tag(
    db: State<'_, DbState>,
    id: i64,
    name: String,
    color: String,
) -> Result<(), String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_tag(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_tags_for_path(db: State<'_, DbState>, path: String) -> Result<Vec<Tag>, String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.color 
             FROM tags t
             JOIN file_tags ft ON t.id = ft.tag_id
             WHERE ft.file_path = ?1",
        )
        .map_err(|e| e.to_string())?;

    let tag_iter = stmt
        .query_map(params![path], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }

    Ok(tags)
}

#[tauri::command]
pub fn set_tags_for_path(
    db: State<'_, DbState>,
    path: String,
    tag_ids: Vec<i64>,
) -> Result<(), String> {
    let mut conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM file_tags WHERE file_path = ?1", params![path])
        .map_err(|e| e.to_string())?;

    for id in tag_ids {
        tx.execute(
            "INSERT INTO file_tags (file_path, tag_id) VALUES (?1, ?2)",
            params![path, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_files_with_tag(db: State<'_, DbState>, tag_id: i64) -> Result<Vec<String>, String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT file_path FROM file_tags WHERE tag_id = ?1")
        .map_err(|e| e.to_string())?;

    let path_iter = stmt
        .query_map(params![tag_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for path in path_iter {
        paths.push(path.map_err(|e| e.to_string())?);
    }

    Ok(paths)
}

#[tauri::command]
pub fn get_all_file_tags(
    db: State<'_, DbState>,
) -> Result<std::collections::HashMap<String, Tag>, String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT ft.file_path, t.id, t.name, t.color
             FROM file_tags ft
             JOIN tags t ON ft.tag_id = t.id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let tag = Tag {
                id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
            };
            Ok((path, tag))
        })
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for (path, tag) in rows.flatten() {
        map.insert(path, tag);
    }
    Ok(map)
}
