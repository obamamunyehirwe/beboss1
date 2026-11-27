use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::Manager;

const EDGE_AGENT_SOURCE: &str = include_str!("../../../qnx/edge-agent/main.c");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QnxToolchainStatus {
    pub host_os: String,
    pub host_arch: String,
    pub host_supported: bool,
    pub qnx_base: Option<String>,
    pub qnx_host: Option<String>,
    pub qnx_target: Option<String>,
    pub qcc_path: Option<String>,
    pub qpp_path: Option<String>,
    pub mkifs_path: Option<String>,
    pub mkqnximage_path: Option<String>,
    pub qnx_target_tree_present: bool,
    pub qcc_found: bool,
    pub sdp8_ready: bool,
    pub qcc_variants: Vec<String>,
    pub qemu_image_dir: Option<String>,
    pub qemu_image_present: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QnxOperationResult {
    pub success: bool,
    pub message: String,
    pub command: String,
    pub output_path: Option<String>,
    pub sha256: Option<String>,
    pub process_id: Option<u32>,
    pub stdout: String,
    pub stderr: String,
}

fn canonical_dir(path: impl AsRef<Path>) -> Option<PathBuf> {
    let path = path.as_ref();
    path.is_dir().then(|| path.canonicalize().ok()).flatten()
}

fn qnx_root_from_environment() -> Option<PathBuf> {
    if let Some(base) = env::var_os("QNX_BASE").and_then(|value| canonical_dir(PathBuf::from(value))) {
        return Some(base);
    }

    if let Some(target) = env::var_os("QNX_TARGET").and_then(|value| canonical_dir(PathBuf::from(value))) {
        if target.file_name().is_some_and(|name| name == "qnx8") {
            if let Some(base) = target.parent().and_then(Path::parent) {
                if let Some(base) = canonical_dir(base) {
                    return Some(base);
                }
            }
        }
    }

    if let Some(host) = env::var_os("QNX_HOST").and_then(|value| canonical_dir(PathBuf::from(value))) {
        if let Some(base) = host.parent().and_then(Path::parent).and_then(Path::parent) {
            if let Some(base) = canonical_dir(base) {
                return Some(base);
            }
        }
    }

    None
}

fn resolve_qnx_root(selected: Option<String>) -> Result<Option<PathBuf>, String> {
    if let Some(selected) = selected {
        let value = selected.trim();
        if value.is_empty() {
            return Ok(qnx_root_from_environment());
        }
        let path = PathBuf::from(value);
        if !path.is_dir() {
            return Err("The selected QNX installation directory does not exist.".into());
        }
        return path.canonicalize().map(Some).map_err(|error| error.to_string());
    }
    Ok(qnx_root_from_environment())
}

fn host_directory(root: Option<&Path>) -> Option<PathBuf> {
    if let Some(value) = env::var_os("QNX_HOST") {
        if let Some(path) = canonical_dir(PathBuf::from(value)) {
            return Some(path);
        }
    }

    let root = root?;
    let candidates = [
        root.join("host/win64/x86_64"),
        root.join("host/linux/x86_64"),
        root.join("host/win64"),
        root.join("host/linux"),
    ];
    candidates.into_iter().find_map(canonical_dir)
}

fn target_directory(root: Option<&Path>) -> Option<PathBuf> {
    if let Some(value) = env::var_os("QNX_TARGET") {
        if let Some(path) = canonical_dir(PathBuf::from(value)) {
            return Some(path);
        }
    }
    root.and_then(|base| canonical_dir(base.join("target/qnx8")))
}

fn executable_names(name: &str) -> Vec<String> {
    if cfg!(target_os = "windows") {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    }
}

fn find_tool(name: &str, host: Option<&Path>) -> Option<PathBuf> {
    if let Some(host) = host {
        for bin in [host.join("usr/bin"), host.join("bin")] {
            for file in executable_names(name) {
                let candidate = bin.join(file);
                if candidate.is_file() {
                    return candidate.canonicalize().ok().or(Some(candidate));
                }
            }
        }
    }

    let path_value = env::var_os("PATH")?;
    for directory in env::split_paths(&path_value) {
        for file in executable_names(name) {
            let candidate = directory.join(file);
            if candidate.is_file() {
                return candidate.canonicalize().ok().or(Some(candidate));
            }
        }
    }
    None
}

fn configured_command(executable: &Path, host: Option<&Path>, target: Option<&Path>) -> Command {
    let mut command = Command::new(executable);
    if let Some(host) = host {
        command.env("QNX_HOST", host);
    }
    if let Some(target) = target {
        command.env("QNX_TARGET", target);
    }
    command
}

fn output_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim().to_string()
}

fn known_variants(qcc_output: &str) -> Vec<String> {
    ["gcc_ntox86_64", "gcc_ntoaarch64le"]
        .into_iter()
        .filter(|variant| qcc_output.contains(variant))
        .map(str::to_string)
        .collect()
}

fn qemu_image_directory(root: Option<&Path>) -> Option<PathBuf> {
    root.and_then(|base| canonical_dir(base.join("images/qemu")))
}

fn has_qemu_image(directory: Option<&Path>) -> bool {
    directory
        .and_then(|path| fs::read_dir(path).ok())
        .is_some_and(|mut entries| entries.next().is_some())
}

fn probe(install_root: Option<String>) -> Result<QnxToolchainStatus, String> {
    let root = resolve_qnx_root(install_root)?;
    let host = host_directory(root.as_deref());
    let target = target_directory(root.as_deref());

    let qcc = find_tool("qcc", host.as_deref());
    let qpp = find_tool("q++", host.as_deref());
    let mkifs = find_tool("mkifs", host.as_deref());
    let mkqnximage = find_tool("mkqnximage", host.as_deref());

    let qcc_output = if let Some(tool) = qcc.as_deref() {
        configured_command(tool, host.as_deref(), target.as_deref())
            .arg("-Vgcc,")
            .output()
            .ok()
            .filter(|result| result.status.success())
            .map(|result| format!("{}\n{}", output_text(&result.stdout), output_text(&result.stderr)))
            .unwrap_or_default()
    } else {
        String::new()
    };

    let variants = known_variants(&qcc_output);
    let target_tree_present = target
        .as_deref()
        .is_some_and(|path| path.join("usr/include/sys/neutrino.h").is_file());

    let host_supported = (cfg!(target_os = "windows") || cfg!(target_os = "linux"))
        && env::consts::ARCH == "x86_64";

    let image_directory = qemu_image_directory(root.as_deref());
    let qemu_image_present = has_qemu_image(image_directory.as_deref());

    let mut notes = Vec::new();
    if !host_supported {
        notes.push("QNX SDP 8.0 development requires a supported x86-64 Windows or Linux host.".into());
    }
    if root.is_none() {
        notes.push("Set QNX_BASE or select the QNX SDP 8.0 installation directory to locate the SDK.".into());
    }
    if qcc.is_none() {
        notes.push("QNX qcc was not found. Install QNX SDP 8.0 and make its host tools available.".into());
    }
    if !target_tree_present {
        notes.push("The QNX target headers were not found at target/qnx8/usr/include/sys/neutrino.h.".into());
    }
    if variants.is_empty() && qcc.is_some() {
        notes.push("qcc is present, but the x86-64 and AArch64 compiler variants were not confirmed by qcc -V.".into());
    }
    if mkifs.is_none() {
        notes.push("mkifs was not found; custom IFS image creation is unavailable.".into());
    }
    if mkqnximage.is_none() {
        notes.push("mkqnximage was not found; QEMU image management is unavailable.".into());
    }
    if !qemu_image_present {
        notes.push("No QNX QEMU reference image was detected under QNX_BASE/images/qemu.".into());
    }

    let sdp8_ready = host_supported && qcc.is_some() && target_tree_present && !variants.is_empty();

    Ok(QnxToolchainStatus {
        host_os: env::consts::OS.to_string(),
        host_arch: env::consts::ARCH.to_string(),
        host_supported,
        qnx_base: root.as_ref().map(|path| path.display().to_string()),
        qnx_host: host.as_ref().map(|path| path.display().to_string()),
        qnx_target: target.as_ref().map(|path| path.display().to_string()),
        qcc_path: qcc.as_ref().map(|path| path.display().to_string()),
        qpp_path: qpp.as_ref().map(|path| path.display().to_string()),
        mkifs_path: mkifs.as_ref().map(|path| path.display().to_string()),
        mkqnximage_path: mkqnximage.as_ref().map(|path| path.display().to_string()),
        qnx_target_tree_present: target_tree_present,
        qcc_found: qcc.is_some(),
        sdp8_ready,
        qcc_variants: variants,
        qemu_image_dir: image_directory.as_ref().map(|path| path.display().to_string()),
        qemu_image_present,
        notes,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_probe(install_root: Option<String>) -> Result<QnxToolchainStatus, String> {
    probe(install_root)
}

fn required_status(install_root: Option<String>) -> Result<QnxToolchainStatus, String> {
    let status = probe(install_root)?;
    if !status.host_supported {
        return Err("QNX SDP 8.0 tools require a supported x86-64 Windows or Linux development host.".into());
    }
    if !status.sdp8_ready {
        return Err("QNX SDP 8.0 is not ready. Confirm QNX_BASE, target/qnx8 headers and qcc compiler variants, then refresh status.".into());
    }
    Ok(status)
}

fn status_paths(status: &QnxToolchainStatus) -> (PathBuf, PathBuf) {
    (
        PathBuf::from(status.qnx_host.as_deref().unwrap_or_default()),
        PathBuf::from(status.qnx_target.as_deref().unwrap_or_default()),
    )
}

fn run_checked(
    executable: &Path,
    host: &Path,
    target: &Path,
    args: &[String],
    working_directory: Option<&Path>,
) -> Result<(String, String), String> {
    let mut command = configured_command(executable, Some(host), Some(target));
    command.args(args);
    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }
    let result = command.output().map_err(|error| {
        format!("Could not start {}: {error}", executable.display())
    })?;
    let stdout = output_text(&result.stdout);
    let stderr = output_text(&result.stderr);
    if !result.status.success() {
        return Err(format!(
            "{} failed ({}).\n{}\n{}",
            executable.file_name().and_then(|name| name.to_str()).unwrap_or("QNX tool"),
            result.status,
            stdout,
            stderr
        ));
    }
    Ok((stdout, stderr))
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_build_agent(
    app: tauri::AppHandle,
    install_root: Option<String>,
    target_arch: String,
) -> Result<QnxOperationResult, String> {
    let status = required_status(install_root)?;
    let variant = match target_arch.as_str() {
        "x86_64" => "gcc_ntox86_64",
        "aarch64le" => "gcc_ntoaarch64le",
        _ => return Err("Choose x86_64 or aarch64le as the QNX target architecture.".into()),
    };
    if !status.qcc_variants.iter().any(|available| available == variant) {
        return Err(format!("The installed qcc toolchain did not report {variant}. Install the matching QNX SDP target package."));
    }

    let qcc = PathBuf::from(status.qcc_path.as_deref().ok_or("qcc is unavailable.")?);
    let (host, target) = status_paths(&status);
    let build_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("qnx-workbench")
        .join("edge-agent");
    fs::create_dir_all(&build_directory).map_err(|error| error.to_string())?;

    let source = build_directory.join("beboss-qnx-edge-agent.c");
    let output = build_directory.join(format!("beboss-qnx-edge-agent-{target_arch}"));
    fs::write(&source, EDGE_AGENT_SOURCE).map_err(|error| error.to_string())?;

    let args = vec![
        "-V".into(), variant.into(),
        "-Wall".into(), "-Wextra".into(), "-O2".into(),
        source.display().to_string(),
        "-o".into(), output.display().to_string(),
    ];
    let (stdout, stderr) = run_checked(&qcc, &host, &target, &args, Some(&build_directory))?;
    let bytes = fs::read(&output).map_err(|error| {
        format!("qcc reported success but the output binary could not be read: {error}")
    })?;
    let digest = Sha256::digest(&bytes);
    let sha256 = digest.iter().map(|byte| format!("{byte:02x}")).collect::<String>();

    Ok(QnxOperationResult {
        success: true,
        message: format!("Compiled the BeBoss Neutrino edge agent for {target_arch}."),
        command: format!("qcc -V {variant} -Wall -Wextra -O2 <source> -o <binary>"),
        output_path: Some(output.display().to_string()),
        sha256: Some(sha256),
        process_id: None,
        stdout,
        stderr,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_build_ifs(
    install_root: Option<String>,
    build_file: String,
    output_file: String,
) -> Result<QnxOperationResult, String> {
    let status = required_status(install_root)?;
    let mkifs = PathBuf::from(status.mkifs_path.as_deref().ok_or("mkifs is unavailable.")?);
    let (host, target) = status_paths(&status);

    let build_path = PathBuf::from(build_file.trim()).canonicalize()
        .map_err(|error| format!("The selected mkifs buildfile could not be opened: {error}"))?;
    if !build_path.is_file() {
        return Err("The selected mkifs buildfile is not a file.".into());
    }
    let requested_output = PathBuf::from(output_file.trim());
    if requested_output.as_os_str().is_empty() {
        return Err("Enter an output path for the QNX IFS image.".into());
    }
    let output_parent = requested_output.parent().filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(output_parent).map_err(|error| error.to_string())?;
    let output_parent = output_parent.canonicalize().map_err(|error| error.to_string())?;
    let file_name = requested_output.file_name().ok_or("The output path must include a filename.")?;
    let output = output_parent.join(file_name);
    if output.exists() {
        return Err("The output file already exists. Choose a new filename so an existing image is not overwritten.".into());
    }

    let source_directory = build_path.parent().ok_or("The buildfile has no parent directory.")?;
    let args = vec![
        "-v".into(),
        build_path.display().to_string(),
        source_directory.display().to_string(),
        output.display().to_string(),
    ];
    let (stdout, stderr) = run_checked(&mkifs, &host, &target, &args, Some(source_directory))?;
    let bytes = fs::read(&output).map_err(|error| {
        format!("mkifs reported success but the image could not be read: {error}")
    })?;
    let digest = Sha256::digest(&bytes);
    let sha256 = digest.iter().map(|byte| format!("{byte:02x}")).collect::<String>();

    Ok(QnxOperationResult {
        success: true,
        message: "QNX IFS image created successfully with mkifs.".into(),
        command: "mkifs -v <buildfile> <source-directory> <output-image>".into(),
        output_path: Some(output.display().to_string()),
        sha256: Some(sha256),
        process_id: None,
        stdout,
        stderr,
    })
}

fn qemu_directory(status: &QnxToolchainStatus) -> Result<PathBuf, String> {
    let directory = status.qemu_image_dir.as_deref()
        .ok_or("The QNX QEMU image directory was not found under QNX_BASE/images/qemu.")?;
    let path = PathBuf::from(directory);
    if !has_qemu_image(Some(&path)) {
        return Err("The QNX QEMU image directory is empty. Install and unpack the QNX SDP 8.0 QEMU reference image first.".into());
    }
    Ok(path)
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_build_qemu_image(
    install_root: Option<String>,
    architecture: String,
) -> Result<QnxOperationResult, String> {
    let status = required_status(install_root)?;
    if !["x86_64", "aarch64le"].contains(&architecture.as_str()) {
        return Err("Choose x86_64 or aarch64le for the QEMU target.".into());
    }
    let mkqnximage = PathBuf::from(status.mkqnximage_path.as_deref().ok_or("mkqnximage is unavailable.")?);
    let (host, target) = status_paths(&status);
    let directory = qemu_directory(&status)?;
    let args = vec![
        "--type=qemu".into(),
        format!("--arch={architecture}"),
        "--build".into(),
    ];
    let (stdout, stderr) = run_checked(&mkqnximage, &host, &target, &args, Some(&directory))?;

    Ok(QnxOperationResult {
        success: true,
        message: format!("Generated or updated the QNX QEMU image for {architecture}."),
        command: format!("mkqnximage --type=qemu --arch={architecture} --build"),
        output_path: Some(directory.display().to_string()),
        sha256: None,
        process_id: None,
        stdout,
        stderr,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_run_qemu(
    install_root: Option<String>,
) -> Result<QnxOperationResult, String> {
    let status = required_status(install_root)?;
    let mkqnximage = PathBuf::from(status.mkqnximage_path.as_deref().ok_or("mkqnximage is unavailable.")?);
    let (host, target) = status_paths(&status);
    let directory = qemu_directory(&status)?;

    let mut command = configured_command(&mkqnximage, Some(&host), Some(&target));
    command.arg("--run").current_dir(&directory)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn().map_err(|error| format!("Could not start the QNX QEMU target: {error}"))?;

    Ok(QnxOperationResult {
        success: true,
        message: "QEMU launch was handed to mkqnximage. Confirm the target boot in the QEMU window or serial console.".into(),
        command: "mkqnximage --run".into(),
        output_path: Some(directory.display().to_string()),
        sha256: None,
        process_id: Some(child.id()),
        stdout: String::new(),
        stderr: String::new(),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn qnx_stop_qemu(
    install_root: Option<String>,
) -> Result<QnxOperationResult, String> {
    let status = required_status(install_root)?;
    let mkqnximage = PathBuf::from(status.mkqnximage_path.as_deref().ok_or("mkqnximage is unavailable.")?);
    let (host, target) = status_paths(&status);
    let directory = qemu_directory(&status)?;
    let args = vec!["--stop".into()];
    let (stdout, stderr) = run_checked(&mkqnximage, &host, &target, &args, Some(&directory))?;

    Ok(QnxOperationResult {
        success: true,
        message: "Sent the QEMU stop request through mkqnximage.".into(),
        command: "mkqnximage --stop".into(),
        output_path: Some(directory.display().to_string()),
        sha256: None,
        process_id: None,
        stdout,
        stderr,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_supported_qnx_compiler_variants() {
        let variants = known_variants("gcc_ntox86_64\n gcc_ntoaarch64le\n gcc_ntoarmv7le");
        assert_eq!(variants, vec!["gcc_ntox86_64", "gcc_ntoaarch64le"]);
    }

    #[test]
    fn ignores_unrelated_compiler_variants() {
        assert!(known_variants("gcc_ntoarmv7le gcc_ntox86").is_empty());
    }

    #[test]
    fn qemu_image_detection_requires_a_non_empty_directory() {
        let directory = env::temp_dir().join(format!("beboss-qnx-image-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).expect("fixture directory should be created");
        assert!(!has_qemu_image(Some(&directory)));
        fs::write(directory.join("README.txt"), "image fixture").expect("fixture file should be written");
        assert!(has_qemu_image(Some(&directory)));
        let _ = fs::remove_dir_all(directory);
    }
}
