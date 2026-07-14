use crate::models::ImageMetadata;
use crate::utils::validate_existing_path_no_resolve;
use image::GenericImageView;
use std::fs::File;
use std::io::BufReader;

/// Extract basic metadata from an image file. This command returns the
/// pixel dimensions and any EXIF fields found in the image. If the
/// file cannot be decoded as an image, an error is returned. If the
/// image contains no EXIF metadata or EXIF parsing fails, the `exif`
/// vector in the result will simply be empty.
#[tauri::command]
pub async fn get_image_metadata(path: String) -> Result<ImageMetadata, String> {
    // Ensure the provided path exists and refers to a regular file.
    let path_buf = validate_existing_path_no_resolve(&path)?;
    // Open the image using the `image` crate to fetch dimensions. This
    // supports a broad range of formats (JPEG, PNG, GIF, BMP, etc.) via
    // feature flags enabled in Cargo.toml.
    let img = image::open(&path_buf).map_err(|e| format!("Failed to open image: {e}"))?;
    let (width, height) = img.dimensions();

    // Attempt to read EXIF metadata. Not all image formats or files
    // include EXIF sections; the `exif` crate gracefully handles
    // unsupported or missing EXIF data by returning an error which we
    // treat as yielding an empty vector. We perform EXIF parsing in a
    // separate scope so the BufReader can be dropped before returning.
    let exif_pairs = {
        // Use a buffered reader for EXIF parsing to work around
        // performance issues when the underlying file is large.
        match File::open(&path_buf) {
            Ok(file) => {
                let mut reader = BufReader::new(file);
                match exif::Reader::new().read_from_container(&mut reader) {
                    Ok(exif) => {
                        let mut pairs = Vec::new();
                        for field in exif.fields() {
                            let tag = format!("{}", field.tag);
                            let value = field.display_value().with_unit(&exif).to_string();
                            pairs.push((tag, value));
                        }
                        pairs
                    }
                    Err(_) => Vec::new(),
                }
            }
            Err(_) => Vec::new(),
        }
    };

    Ok(ImageMetadata {
        width,
        height,
        exif: exif_pairs,
    })
}
