use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::{cmp::Ordering, collections::HashMap};

use image::codecs::gif::{GifDecoder, GifEncoder, Repeat};
use image::codecs::png::PngDecoder;
use image::codecs::webp::WebPDecoder;
use image::imageops::{crop_imm, resize, FilterType};
use image::{AnimationDecoder, Frame, ImageFormat, ImageReader, ImageResult, RgbaImage};
use napi::bindgen_prelude::Error;
use napi_derive::napi;
use sysinfo::{ProcessesToUpdate, System};
use uuid::Uuid;

#[napi(object)]
pub struct ProcessedImageData {
    pub image_path: String,
    pub mime_type: String,
}

#[napi(object)]
pub struct HardwareMetrics {
    pub fps: f64,
    pub cpu_usage: f64,
    pub gpu_usage: f64,
    pub cpu_temp: f64,
    pub gpu_temp: f64,
    pub ram_usage_mb: f64,
}

#[napi(object)]
pub struct ProcessedFriendImageData {
    pub image_path: String,
    pub mime_type: String,
    pub is_animated: bool,
}

#[napi(object)]
pub struct NativeProcessPayload {
    pub exe: Option<String>,
    pub pid: u32,
    pub name: String,
    pub environ: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
}

#[napi]
pub fn process_profile_image(
    image_path: String,
    target_extension: Option<String>,
) -> napi::Result<ProcessedImageData> {
    let input_path = PathBuf::from(image_path);

    if !input_path.exists() {
        return Err(Error::from_reason("Image file not found"));
    }

    let format = detect_image_format(&input_path)?;
    let animated = is_animated_image(&input_path, format)?;

    if !animated {
        return Ok(ProcessedImageData {
            image_path: input_path.to_string_lossy().to_string(),
            mime_type: mime_type_from_format_or_path(format, &input_path),
        });
    }

    let extension = target_extension
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "webp".to_string());

    let output_format = output_format_from_extension(&extension)?;
    let output_path = build_temp_output_path(&extension);

    let image = ImageReader::open(&input_path)
        .map_err(|err| Error::from_reason(err.to_string()))?
        .with_guessed_format()
        .map_err(|err| Error::from_reason(err.to_string()))?
        .decode()
        .map_err(|err| Error::from_reason(err.to_string()))?;

    image
        .save_with_format(&output_path, output_format)
        .map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(ProcessedImageData {
        image_path: output_path.to_string_lossy().to_string(),
        mime_type: mime_type_from_format_or_path(Some(output_format), &output_path),
    })
}

#[napi]
pub async fn process_friend_image(
    image_path: String,
    output_path_base: String,
    width: u32,
    height: u32,
    preserve_animation: bool,
) -> napi::Result<ProcessedFriendImageData> {
    tokio::task::spawn_blocking(move || {
        process_friend_image_sync(
            image_path,
            output_path_base,
            width,
            height,
            preserve_animation,
        )
    })
    .await
    .map_err(|err| Error::from_reason(err.to_string()))?
}

fn process_friend_image_sync(
    image_path: String,
    output_path_base: String,
    width: u32,
    height: u32,
    preserve_animation: bool,
) -> napi::Result<ProcessedFriendImageData> {
    if width == 0 || height == 0 {
        return Err(Error::from_reason("Invalid output dimensions"));
    }

    let input_path = PathBuf::from(image_path);

    if !input_path.exists() {
        return Err(Error::from_reason("Image file not found"));
    }

    let format = detect_image_format(&input_path)?;
    let is_animated = preserve_animation && is_animated_image(&input_path, format)?;

    if is_animated {
        let output_path = with_extension(&output_path_base, "gif");
        resize_animated_image(&input_path, format, &output_path, width, height)?;

        return Ok(ProcessedFriendImageData {
            image_path: output_path.to_string_lossy().to_string(),
            mime_type: "image/gif".to_string(),
            is_animated: true,
        });
    }

    let output_path = with_extension(&output_path_base, "webp");
    resize_static_image(&input_path, &output_path, width, height)?;

    Ok(ProcessedFriendImageData {
        image_path: output_path.to_string_lossy().to_string(),
        mime_type: "image/webp".to_string(),
        is_animated: false,
    })
}

#[napi]
pub fn list_processes() -> Vec<NativeProcessPayload> {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut processes: Vec<NativeProcessPayload> = system
        .processes()
        .values()
        .map(|process| {
            let include_linux_extras = !cfg!(target_os = "windows");

            NativeProcessPayload {
                exe: process
                    .exe()
                    .map(|value| value.to_string_lossy().to_string()),
                pid: process.pid().as_u32(),
                name: process.name().to_string_lossy().to_string(),
                cwd: if include_linux_extras {
                    process
                        .cwd()
                        .map(|value| value.to_string_lossy().to_string())
                } else {
                    None
                },
                environ: if include_linux_extras {
                    let env_map: HashMap<String, String> = process
                        .environ()
                        .iter()
                        .filter_map(|entry| {
                            let entry_value = entry.to_string_lossy();
                            entry_value.split_once('=').and_then(|(key, value)| {
                                if key.is_empty() {
                                    None
                                } else {
                                    Some((key.to_string(), value.to_string()))
                                }
                            })
                        })
                        .collect();

                    if env_map.is_empty() {
                        None
                    } else {
                        Some(env_map)
                    }
                } else {
                    None
                },
            }
        })
        .collect();

    processes.sort_by(|left, right| {
        let by_pid = left.pid.cmp(&right.pid);
        if by_pid == Ordering::Equal {
            left.name.cmp(&right.name)
        } else {
            by_pid
        }
    });

    processes
}

fn detect_image_format(path: &Path) -> napi::Result<Option<ImageFormat>> {
    let reader = ImageReader::open(path).map_err(|err| Error::from_reason(err.to_string()))?;

    let guessed = reader
        .with_guessed_format()
        .map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(guessed.format())
}

fn is_animated_image(path: &Path, format: Option<ImageFormat>) -> napi::Result<bool> {
    match format {
        Some(ImageFormat::Gif) => is_gif_animated(path),
        Some(ImageFormat::WebP) => is_webp_animated(path),
        Some(ImageFormat::Png) => is_apng(path),
        _ => Ok(false),
    }
}

fn is_gif_animated(path: &Path) -> napi::Result<bool> {
    let file = File::open(path).map_err(|err| Error::from_reason(err.to_string()))?;
    let decoder =
        GifDecoder::new(BufReader::new(file)).map_err(|err| Error::from_reason(err.to_string()))?;

    let mut frames = decoder.into_frames();
    let _ = frames.next().transpose();
    Ok(matches!(frames.next().transpose(), Ok(Some(_))))
}

fn is_webp_animated(path: &Path) -> napi::Result<bool> {
    let file = File::open(path).map_err(|err| Error::from_reason(err.to_string()))?;
    let decoder = WebPDecoder::new(BufReader::new(file))
        .map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(decoder.has_animation())
}

fn is_apng(path: &Path) -> napi::Result<bool> {
    let file = File::open(path).map_err(|err| Error::from_reason(err.to_string()))?;
    let decoder =
        PngDecoder::new(BufReader::new(file)).map_err(|err| Error::from_reason(err.to_string()))?;

    decoder
        .is_apng()
        .map_err(|err| Error::from_reason(err.to_string()))
}

fn resize_animated_image(
    input_path: &Path,
    format: Option<ImageFormat>,
    output_path: &Path,
    width: u32,
    height: u32,
) -> napi::Result<()> {
    match format {
        Some(ImageFormat::Gif) => {
            let input_file =
                File::open(input_path).map_err(|err| Error::from_reason(err.to_string()))?;
            let decoder = GifDecoder::new(BufReader::new(input_file))
                .map_err(|err| Error::from_reason(err.to_string()))?;
            encode_animation_frames_to_gif(decoder.into_frames(), output_path, width, height)
        }
        Some(ImageFormat::WebP) => {
            let input_file =
                File::open(input_path).map_err(|err| Error::from_reason(err.to_string()))?;
            let decoder = WebPDecoder::new(BufReader::new(input_file))
                .map_err(|err| Error::from_reason(err.to_string()))?;
            encode_animation_frames_to_gif(decoder.into_frames(), output_path, width, height)
        }
        Some(ImageFormat::Png) => {
            let input_file =
                File::open(input_path).map_err(|err| Error::from_reason(err.to_string()))?;
            let decoder = PngDecoder::new(BufReader::new(input_file))
                .map_err(|err| Error::from_reason(err.to_string()))?
                .apng()
                .map_err(|err| Error::from_reason(err.to_string()))?;
            encode_animation_frames_to_gif(decoder.into_frames(), output_path, width, height)
        }
        _ => Err(Error::from_reason("Unsupported animated image format")),
    }
}

fn encode_animation_frames_to_gif<I>(
    frames: I,
    output_path: &Path,
    width: u32,
    height: u32,
) -> napi::Result<()>
where
    I: IntoIterator<Item = ImageResult<Frame>>,
{
    let output_file = File::create(output_path).map_err(|err| Error::from_reason(err.to_string()))?;
    let mut encoder = GifEncoder::new(BufWriter::new(output_file));
    encoder
        .set_repeat(Repeat::Infinite)
        .map_err(|err| Error::from_reason(err.to_string()))?;

    for frame in frames {
        let frame = frame.map_err(|err| Error::from_reason(err.to_string()))?;
        let delay = frame.delay().clone();
        let resized = resize_cover_rgba(&frame.into_buffer(), width, height)?;

        encoder
            .encode_frame(Frame::from_parts(resized, 0, 0, delay))
            .map_err(|err| Error::from_reason(err.to_string()))?;
    }

    Ok(())
}

fn resize_static_image(
    input_path: &Path,
    output_path: &Path,
    width: u32,
    height: u32,
) -> napi::Result<()> {
    let image = ImageReader::open(input_path)
        .map_err(|err| Error::from_reason(err.to_string()))?
        .with_guessed_format()
        .map_err(|err| Error::from_reason(err.to_string()))?
        .decode()
        .map_err(|err| Error::from_reason(err.to_string()))?
        .to_rgba8();

    let resized = resize_cover_rgba(&image, width, height)?;
    resized
        .save_with_format(output_path, ImageFormat::WebP)
        .map_err(|err| Error::from_reason(err.to_string()))
}

fn resize_cover_rgba(image: &RgbaImage, width: u32, height: u32) -> napi::Result<RgbaImage> {
    let source_width = image.width();
    let source_height = image.height();

    if source_width == 0 || source_height == 0 {
        return Err(Error::from_reason("Could not read source image dimensions"));
    }

    let width_scale = width as f32 / source_width as f32;
    let height_scale = height as f32 / source_height as f32;
    let scale = width_scale.max(height_scale);

    let resized_width = ((source_width as f32 * scale).ceil() as u32).max(width);
    let resized_height = ((source_height as f32 * scale).ceil() as u32).max(height);
    let resized = resize(
        image,
        resized_width,
        resized_height,
        FilterType::Lanczos3,
    );

    let left = (resized_width.saturating_sub(width)) / 2;
    let top = (resized_height.saturating_sub(height)) / 2;

    Ok(crop_imm(&resized, left, top, width, height).to_image())
}

fn with_extension(output_path_base: &str, extension: &str) -> PathBuf {
    let mut output_path = PathBuf::from(output_path_base);
    output_path.set_extension(extension);
    output_path
}

fn output_format_from_extension(extension: &str) -> napi::Result<ImageFormat> {
    match extension {
        "png" => Ok(ImageFormat::Png),
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        _ => Err(Error::from_reason("Unsupported target extension")),
    }
}

fn build_temp_output_path(extension: &str) -> PathBuf {
    let mut output_path = std::env::temp_dir();
    output_path.push(format!("{}.{}", Uuid::new_v4(), extension));
    output_path
}

fn mime_type_from_format_or_path(format: Option<ImageFormat>, path: &Path) -> String {
    if let Some(value) = mime_type_from_image_format(format) {
        return value.to_string();
    }

    mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string()
}

fn mime_type_from_image_format(format: Option<ImageFormat>) -> Option<&'static str> {
    match format {
        Some(ImageFormat::Png) => Some("image/png"),
        Some(ImageFormat::Jpeg) => Some("image/jpeg"),
        Some(ImageFormat::Gif) => Some("image/gif"),
        Some(ImageFormat::WebP) => Some("image/webp"),
        Some(ImageFormat::Bmp) => Some("image/bmp"),
        Some(ImageFormat::Ico) => Some("image/x-icon"),
        Some(ImageFormat::Tiff) => Some("image/tiff"),
        Some(ImageFormat::Avif) => Some("image/avif"),
        _ => None,
    }
}

// ── Hardware monitoring via MSI Afterburner / RTSS shared memory ──

#[cfg(windows)]
mod hardware {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ,
    };

    const MAHM_SIGNATURE: u32 = 0x4D41484D; // 'MAHM'
    const RTSS_SIGNATURE: u32 = 0x52545353; // 'RTSS'

    #[repr(C)]
    struct MahmHeader {
        signature: u32,
        version: u32,
        header_size: u32,
        num_entries: u32,
        entry_size: u32,
        time: u32,
        num_gpu_entries: u32,
        gpu_entry_size: u32,
    }

    #[repr(C)]
    struct MahmEntry {
        source_name: [u8; 260],
        source_units: [u8; 260],
        localized_source_name: [u8; 260],
        localized_source_units: [u8; 260],
        recommended_format: [u8; 260],
        data: f32,
        min_limit: f32,
        max_limit: f32,
        flags: u32,
        gpu: u32,
        src_id: u32,
    }

    #[repr(C)]
    struct RtssHeader {
        signature: u32,
        version: u32,
        app_entry_size: u32,
        app_arr_offset: u32,
        app_arr_size: u32,
        osd_entry_size: u32,
        osd_arr_offset: u32,
        osd_arr_size: u32,
        osd_frame: u32,
        busy: i32,
    }

    #[repr(C)]
    struct RtssOsdEntry {
        osd_owner: [u8; 256],
        osd_slot: [u32; 4],
        osd_text: [u8; 1024],
        osd_data: [f32; 4],
        osd_flags: u32,
    }

    fn wide_from_str(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read_utf8(buf: &[u8]) -> String {
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        String::from_utf8_lossy(&buf[..end]).into_owned()
    }

    unsafe fn open_shared_memory(name: &str) -> Option<(HANDLE, *mut u8, usize)> {
        let wide = wide_from_str(name);
        let handle = OpenFileMappingW(FILE_MAP_READ.0, false, windows::core::PCWSTR::from_raw(wide.as_ptr()))
            .ok()?;

        if handle.is_invalid() {
            return None;
        }

        let view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
        if view.Value.is_null() {
            let _ = CloseHandle(handle);
            return None;
        }

        Some((handle, view.Value as *mut u8, 0))
    }

    unsafe fn close_shared_memory(handle: HANDLE, view: *mut u8) {
        let _ = UnmapViewOfFile(windows::Win32::System::Memory::MEMORY_MAPPED_VIEW_ADDRESS {
            Value: view as *mut std::ffi::c_void,
        });
        let _ = CloseHandle(handle);
    }

    pub fn read_mahm_metrics() -> Option<(f32, f32, f32)> {
        unsafe {
            let (handle, view, _) = open_shared_memory("MAHMSharedMemory")?;

            let header = &*(view as *const MahmHeader);
            if header.signature != MAHM_SIGNATURE {
                close_shared_memory(handle, view);
                return None;
            }

            let header_size = header.header_size as usize;
            let entry_size = header.entry_size as usize;
            let min_entry_size = std::mem::size_of::<MahmEntry>();

            // Validate entry size to avoid reading garbage
            if entry_size < min_entry_size {
                close_shared_memory(handle, view);
                return None;
            }

            let entry_base = view.add(header_size);
            let num = header.num_entries as usize;

            let mut gpu_temp: f32 = 0.0;
            let mut gpu_usage: f32 = 0.0;
            let mut cpu_temp: f32 = 0.0;

            for i in 0..num {
                let entry_ptr = entry_base.add(i * entry_size) as *const MahmEntry;
                let entry = &*entry_ptr;
                let name = read_utf8(&entry.source_name);
                let name_lower = name.to_lowercase();

                if entry.data <= 0.0 {
                    continue;
                }

                if name_lower.contains("gpu") && name_lower.contains("temperature") {
                    gpu_temp = entry.data;
                } else if name_lower.contains("gpu") && name_lower.contains("usage") {
                    gpu_usage = entry.data;
                } else if name_lower.contains("cpu") && name_lower.contains("temperature") {
                    cpu_temp = entry.data;
                }
            }

            close_shared_memory(handle, view);
            Some((gpu_temp, gpu_usage, cpu_temp))
        }
    }

    pub fn read_rtss_fps() -> Option<f32> {
        unsafe {
            // Try V2 first, then fall back to V1
            let names = ["RTSSSharedMemoryV2", "RTSSSharedMemory"];

            for name in &names {
                let (handle, view, _) = open_shared_memory(name)?;

                let header = &*(view as *const RtssHeader);
                if header.signature != RTSS_SIGNATURE {
                    close_shared_memory(handle, view);
                    continue;
                }

                // Check busy flag to avoid torn reads
                if header.busy & 1 != 0 {
                    close_shared_memory(handle, view);
                    continue;
                }

                // Guard against division by zero
                if header.osd_entry_size == 0 {
                    close_shared_memory(handle, view);
                    continue;
                }

                // Read OSD entries to find the framerate
                let osd_arr = view.add(header.osd_arr_offset as usize);
                let num_osd = header.osd_arr_size / header.osd_entry_size;

                for i in 0..num_osd as usize {
                    let entry_ptr =
                        osd_arr.add(i * header.osd_entry_size as usize) as *const RtssOsdEntry;
                    let entry = &*entry_ptr;

                    let osd_text = read_utf8(&entry.osd_text);
                    let osd_data0 = entry.osd_data[0];

                    // Framerate is typically stored in osd_data[0] for the framerate OSD slot
                    if osd_text.contains("Framerate") || osd_text.contains("fps") || osd_text.is_empty() {
                        if osd_data0 > 0.0 {
                            close_shared_memory(handle, view);
                            return Some(osd_data0);
                        }
                    }
                }

                close_shared_memory(handle, view);
            }

            None
        }
    }
}

#[napi]
pub fn read_hardware_metrics() -> HardwareMetrics {
    #[cfg(windows)]
    {
        let (gpu_temp, gpu_usage, cpu_temp) =
            hardware::read_mahm_metrics().unwrap_or((0.0, 0.0, 0.0));

        let fps = hardware::read_rtss_fps().unwrap_or(0.0);

        // CPU usage and RAM are not reliably available from shared memory.
        // Return 0 for those — the TypeScript layer will fall back to systeminformation.
        return HardwareMetrics {
            fps: fps as f64,
            cpu_usage: 0.0,
            gpu_usage: gpu_usage as f64,
            cpu_temp: cpu_temp as f64,
            gpu_temp: gpu_temp as f64,
            ram_usage_mb: 0.0,
        };
    }

    #[cfg(not(windows))]
    {
        let mut system = System::new_all();
        system.refresh_cpu_all();
        system.refresh_memory();

        let cpu_usage = system.global_cpu_usage();
        let total_ram = system.total_memory();
        let used_ram = system.used_memory();
        let ram_usage_mb = if total_ram > 0 {
            (used_ram as f64) / (1024.0 * 1024.0)
        } else {
            0.0
        };

        HardwareMetrics {
            fps: 0.0,
            cpu_usage: cpu_usage as f64,
            gpu_usage: 0.0,
            cpu_temp: 0.0,
            gpu_temp: 0.0,
            ram_usage_mb,
        }
    }
}
