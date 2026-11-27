# BeBoss QNX Development Center

BeBoss Desktop includes a host-side workbench for QNX SDP 8.0 development. It does not claim that the retail desktop, Android, or web clients run directly on QNX.

## Capabilities

- Detects QNX_BASE, QNX_HOST, QNX_TARGET, QNX SDP target headers, compiler variants, qcc, q++, mkifs and mkqnximage.
- Runs a compile-and-link smoke test with each reported qcc target variant, including the QNX target headers, before marking that architecture as available.
- Cross-compiles a native Neutrino edge agent for x86-64 or AArch64 with qcc.
- Calculates SHA-256 for the generated target executable and IFS output.
- Builds a user-supplied QNX IFS buildfile with mkifs without overwriting existing output.
- Uses mkqnximage to prepare, launch and stop a QEMU target when the official QNX reference image package is installed.

The edge agent registers the beboss-edge-gateway service and processes health/echo requests with QNX Neutrino name_attach, MsgReceive and MsgReply. It handles disconnect pulses and uses an application message type outside the reserved QNX I/O message range. The companion IPC client uses name_open and MsgSend to run health and echo request/reply checks. These are native IPC/toolchain demonstrations, not a production point-of-sale client or a complete retail system port.

## Host requirements

Use a supported 64-bit x86 Windows or Linux development host with QNX SDP 8.0 installed and licensed. QNX SDP 8.0 is not supported as a macOS or ARM-host development environment. Check the release notes for the precise maintenance-release host operating-system support.

**QEMU host restriction:** the QNX SDP 8.0 quick-start QEMU reference-image workflow is supported on an x86-64 Ubuntu 22.04 or Ubuntu 24.04 host. On other supported QNX development hosts, SDK detection, qcc cross-compilation and mkifs workflows can still be used, but the BeBoss QEMU controls remain disabled.

The QEMU workflow requires the QNX SDP 8.0 quick-start/reference-image package installed from QNX Software Center and unpacked into:

    <QNX_BASE>/images/qemu/qemu

From an Ubuntu terminal, unpack the installed package with:

    cd "$QNX_BASE/images/qemu"
    ./unpack_qemu_image.sh

The workbench treats a non-empty unpacked image directory as a preliminary package-presence check; it does not claim the image is bootable. The actual `mkqnximage --build` command must complete successfully, and a QEMU boot must be confirmed in the guest window or serial console.

## Environment

On Linux, source the SDK environment before launching BeBoss Desktop or building from a terminal:

    source "$QNX_BASE/qnxsdp-env.sh"

On Windows, run qnxsdp-env.bat from the QNX SDP installation base directory before starting BeBoss Desktop.

The expected QNX 8 target tree is:

    <QNX_BASE>/target/qnx8

## Build and run in BeBoss Desktop

1. Open Administration, then QNX Development Center.
2. Enter the QNX SDP installation directory, or set QNX_BASE before starting BeBoss Desktop.
3. Select Refresh status. The workbench probes qcc, q++, mkifs, mkqnximage and target headers, then compiles and links a minimal QNX test program for each reported architecture. Only variants that pass this check are shown as verified and enabled for building.
4. Select x86_64 or aarch64le, then choose Build edge agent and Build IPC client. The generated target binaries and SHA-256 digests appear in the evidence panel.
5. To create a custom image, enter a valid QNX board-specific .build file and a new output path, then choose Build IFS.
6. Install and unpack the QNX QEMU quick-start image package. Choose Prepare image, then Launch QEMU. Choose Stop QEMU to request shutdown.

The workbench saves the sample C source and built binary in the per-user BeBoss application-data directory under qnx-workbench/edge-agent.

## Run the IPC smoke test on the QNX target

After copying both built binaries to the same running QNX 8.0 target (QEMU or supported hardware), start the service first and then execute the client:

    ./beboss-qnx-edge-agent-x86_64 &
    ./beboss-qnx-ipc-client-x86_64

Use the matching aarch64le binary names for an AArch64 target. A successful client run prints PASS for both the health response and the echo response, followed by a final message confirming the BeBoss QNX message-passing smoke test. The server handles QNX connection messages and disconnect pulses; the application message type is kept outside the reserved QNX I/O message range.


## Command-line equivalents

After sourcing the SDP environment, cross-compile for QNX x86-64:

    qcc -Vgcc_ntox86_64 -Wall -Wextra -O2 qnx/edge-agent/main.c -o beboss-qnx-edge-agent-x86_64

Cross-compile for QNX AArch64:

    qcc -Vgcc_ntoaarch64le -Wall -Wextra -O2 qnx/edge-agent/main.c -o beboss-qnx-edge-agent-aarch64le

Inspect compiler variants:

    qcc -V

Build a custom OS image using a valid target-specific buildfile:

    mkifs -v path/to/board.build path/to/source-directory path/to/new-image.ifs

Prepare, launch and stop the QNX QEMU reference target from its image directory:

    mkqnximage --type=qemu --arch=x86_64 --build
    mkqnximage --run
    mkqnximage --stop

## Reviewer evidence and limitations

- qnx/edge-agent/main.c — Neutrino message-passing service source.
- qnx/edge-agent/client.c — name_open/MsgSend IPC smoke-test client source.
- desktop/src-tauri/src/qnx.rs — real SDK detection, qcc compilation, mkifs image build and QEMU lifecycle commands.
- desktop/src/components/screens/QnxDevelopmentPage.tsx — interactive desktop workbench.

The qcc status probe validates each listed compiler variant by compiling and linking a temporary test program. The actual BeBoss edge-agent/client builds and IFS generation still require a licensed QNX SDP 8.0 installation, matching target packages and a supported development host. Starting `mkqnximage --run` only confirms that the launch command was handed off; confirm the guest boot independently in the QEMU window or serial console. The repository alone cannot establish that the SDK, license or reference image is installed on a user's computer. BeBoss retail desktop itself remains a Windows/macOS/Linux Tauri product; this integration provides host-based QNX 8.0 development support.
