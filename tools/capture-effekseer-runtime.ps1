$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopRoot = "C:\dev\scenemax_desktop"
$mainPath = Join-Path $desktopRoot "running\main"
$ffmpeg = "C:\Users\adikt\Downloads\ffmpeg-2025-10-01-git-1a02412170-full_build\bin\ffmpeg.exe"
$jar = Join-Path $desktopRoot "launcher2.0.1.jar"
$assetDir = Join-Path $repoRoot "public\assets\tutorials\effekseer-runtime"
$logPath = Join-Path $assetDir "effekseer-runtime-real-capture.log"
$backupText = [System.IO.File]::ReadAllText($mainPath)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $ffmpeg)) { throw "FFmpeg was not found at $ffmpeg" }
if (-not (Test-Path $jar)) { throw "SceneMax launcher was not found at $jar" }
if (-not (Test-Path $assetDir)) { New-Item -ItemType Directory -Path $assetDir | Out-Null }

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class CodexWin32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

function Write-Log {
    param([string] $Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $logPath -Value $line
    Write-Host $line
}

function Write-Main {
    param([string] $Code)
    [System.IO.File]::WriteAllText($mainPath, $Code, $utf8NoBom)
}

function Get-LwjglWindows {
    $windows = New-Object System.Collections.Generic.List[object]
    $callback = [CodexWin32+EnumWindowsProc]{
        param([IntPtr] $handle, [IntPtr] $lParam)
        if (-not [CodexWin32]::IsWindowVisible($handle)) { return $true }

        $className = New-Object System.Text.StringBuilder 256
        [void][CodexWin32]::GetClassName($handle, $className, $className.Capacity)
        if ($className.ToString() -ne "LWJGL") { return $true }

        $title = New-Object System.Text.StringBuilder 512
        [void][CodexWin32]::GetWindowText($handle, $title, $title.Capacity)

        $rect = New-Object CodexWin32+RECT
        $point = New-Object CodexWin32+POINT
        if ([CodexWin32]::GetClientRect($handle, [ref]$rect) -and [CodexWin32]::ClientToScreen($handle, [ref]$point)) {
            $rect.Left = $point.X
            $rect.Top = $point.Y
            $rect.Right = $point.X + $rect.Right
            $rect.Bottom = $point.Y + $rect.Bottom
        }
        elseif (-not [CodexWin32]::GetWindowRect($handle, [ref]$rect)) {
            return $true
        }

        [uint32] $windowPid = 0
        [void][CodexWin32]::GetWindowThreadProcessId($handle, [ref]$windowPid)
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top
        if ($width -lt 200 -or $height -lt 150) { return $true }

        $windows.Add([pscustomobject]@{
            Handle = $handle
            Pid = [int] $windowPid
            Title = $title.ToString()
            X = $rect.Left
            Y = $rect.Top
            Width = $width
            Height = $height
        }) | Out-Null
        return $true
    }

    [void][CodexWin32]::EnumWindows($callback, [IntPtr]::Zero)
    return $windows
}

function Wait-ForMarker {
    param(
        [string[]] $Files,
        [string] $Marker,
        [int] $TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        foreach ($file in $Files) {
            if ((Test-Path $file) -and ((Get-Content -Path $file -Raw -ErrorAction SilentlyContinue) -like "*$Marker*")) {
                return $true
            }
        }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Wait-ForLwjglWindow {
    param(
        [int] $ProcessId,
        [int] $TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $windows = @(Get-LwjglWindows)
        $match = $windows | Where-Object { $_.Pid -eq $ProcessId } | Select-Object -First 1
        if (-not $match) {
            $match = $windows | Sort-Object @{ Expression = { $_.Width * $_.Height }; Descending = $true } | Select-Object -First 1
        }
        if ($match) { return $match }
        Start-Sleep -Milliseconds 250
    }
    return $null
}

function Capture-Clip {
    param(
        [string] $Name,
        [string] $OutputFile,
        [double] $CaptureSeconds,
        [string] $Code
    )

    $stdout = Join-Path $env:TEMP "scenemax-$Name-out.log"
    $stderr = Join-Path $env:TEMP "scenemax-$Name-err.log"
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

    Write-Log "starting $Name"
    Write-Main $Code
    $process = Start-Process -FilePath "java" -WorkingDirectory $desktopRoot -PassThru `
        -ArgumentList @(
            "-Dscenemax.runtime.javaLogLevel=INFO",
            "-XX:MaxDirectMemorySize=1024m",
            "-jar",
            $jar
        ) `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr

    try {
        $window = Wait-ForLwjglWindow -ProcessId $process.Id -TimeoutSeconds 25
        if (-not $window) { throw "Could not find the LWJGL runtime window for $Name" }
        Write-Log "$Name window pid=$($window.Pid) rect=$($window.X),$($window.Y),$($window.Width)x$($window.Height)"

        if (-not (Wait-ForMarker -Files @($stdout, $stderr) -Marker "CODEX_EFFEKSEER_READY" -TimeoutSeconds 60)) {
            throw "SceneMax did not log CODEX_EFFEKSEER_READY for $Name"
        }

        $outPath = Join-Path $assetDir $OutputFile
        & $ffmpeg -y -hide_banner -loglevel error `
            -f gdigrab -framerate 15 `
            -draw_mouse 0 `
            -offset_x $window.X -offset_y $window.Y `
            -video_size "$($window.Width)x$($window.Height)" `
            -i desktop `
            -t $CaptureSeconds `
            -vf "crop=iw-90:ih-58:90:58,scale=960:540" `
            -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -movflags +faststart `
            $outPath

        if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed for $Name with exit code $LASTEXITCODE" }
        if (-not (Wait-ForMarker -Files @($stdout, $stderr) -Marker "CODEX_EFFEKSEER_DONE" -TimeoutSeconds 30)) {
            throw "SceneMax did not log CODEX_EFFEKSEER_DONE for $Name"
        }
        if (-not $process.WaitForExit(8000)) {
            Write-Log "SceneMax did not exit promptly after $Name; stopping it after DONE"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $process.WaitForExit(3000) | Out-Null
        }

        $combined = ""
        foreach ($file in @($stdout, $stderr)) {
            if (Test-Path $file) { $combined += "`n" + (Get-Content -Path $file -Raw -ErrorAction SilentlyContinue) }
        }
        if ($combined -match "(?m)\b(SEVERE|Uncaught exception|RuntimeException|IllegalArgumentException)\b") {
            throw "SceneMax logged an error for $Name. See $stdout and $stderr"
        }

        $info = Get-Item -LiteralPath $outPath
        Write-Log "finished $Name -> $OutputFile ($($info.Length) bytes)"
    }
    finally {
        if ($process -and -not $process.HasExited) {
            Write-Log "stopping lingering SceneMax process for $Name"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

$joints = 'joints ("mixamorig:Head","mixamorig:LeftShoulder","mixamorig:LeftArm","mixamorig:LeftForeArm","mixamorig:LeftHand","mixamorig:RightShoulder","mixamorig:RightArm","mixamorig:RightForeArm","mixamorig:RightHand","mixamorig:LeftUpLeg","mixamorig:LeftLeg","mixamorig:LeftFoot","mixamorig:RightUpLeg","mixamorig:RightLeg","mixamorig:RightFoot")'

$clips = @(
    @{
        Name = "fixed-position"
        Output = "play-fixed-position-loop.mp4"
        Seconds = 2.6
        Code = @"
//$[source_rel]=/codex_effekseer_capture/fixed_position;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
impact_fx => effects.effekseer.Simple_Ring_Shape1 : scale 5
impact_fx.play pos (0,0,0), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "play-at-target"
        Output = "play-at-target-loop.mp4"
        Seconds = 2.8
        Code = @"
//$[source_rel]=/codex_effekseer_capture/play_at_target;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
hit_fx => effects.effekseer.Simple_Sprite_BillBoard : scale 4
hit_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "runtime-speed"
        Output = "runtime-speed-loop.mp4"
        Seconds = 2.4
        Code = @"
//$[source_rel]=/codex_effekseer_capture/runtime_speed;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
fast_fx => effects.effekseer.A_Salamander1 : scale 6
fast_fx.play pos (player), loop, attr = ["play_back_speed" 2]
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "looping-aura"
        Output = "looping-aura-loop.mp4"
        Seconds = 2.8
        Code = @"
//$[source_rel]=/codex_effekseer_capture/looping_aura;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
aura_fx => effects.effekseer.Simple_Ring_Shape1 : scale 5
aura_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "aim-effect"
        Output = "aim-effect-loop.mp4"
        Seconds = 2.8
        Code = @"
//$[source_rel]=/codex_effekseer_capture/aim_effect;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (-1,0,0), scale 3, $joints
enemy => dynamic old_fighter2 : pos (2,0,5), scale 3
player.look at (enemy)
camera.attach to player : pos (0,2.5,-12)
beam_fx => effects.effekseer.Laser01 : scale 6
beam_fx.look at (enemy)
beam_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "attach-effect"
        Output = "attach-effect-loop.mp4"
        Seconds = 3.6
        Code = @"
//$[source_rel]=/codex_effekseer_capture/attach_effect;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
aura_fx => effects.effekseer.Simple_Ring_Shape1 : scale 5
aura_fx.attach to player : pos (0,1,0)
aura_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
player.move left 2 in 3 seconds
wait 1 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "attach-joint"
        Output = "attach-joint-loop.mp4"
        Seconds = 3.0
        Code = @"
//$[source_rel]=/codex_effekseer_capture/attach_joint;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
hand_fx => effects.effekseer.Simple_Sprite_BillBoard : scale 6
hand_fx.attach to player."mixamorig:RightHand"
hand_fx.play pos (player."mixamorig:RightHand"), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "show-hide-delete"
        Output = "show-hide-delete-loop.mp4"
        Seconds = 3.8
        Code = @"
//$[source_rel]=/codex_effekseer_capture/show_hide_delete;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
portal_fx => effects.effekseer.Simple_Ring_Shape1 : scale 5
portal_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 1 seconds
portal_fx.hide
wait 0.6 seconds
portal_fx.show
wait 1 seconds
portal_fx.delete
wait 0.8 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    },
    @{
        Name = "packaging"
        Output = "packaging-loop.mp4"
        Seconds = 2.4
        Code = @"
//$[source_rel]=/codex_effekseer_capture/packaging;//$[project]=fighting_game_project;
canvas.size 960,540
Screen.mode window
skybox.show solar system
player => dynamic fighter1 : pos (0,0,0), scale 3, $joints
camera.attach to player : pos (0,2.5,-12)
fire_fx => effects.effekseer.A_Salamander1 : scale 6
fire_fx.play pos (player), loop
Logger.info "CODEX_EFFEKSEER_READY"
wait 3 seconds
Logger.info "CODEX_EFFEKSEER_DONE"
Process.End
"@
    }
)

try {
    Set-Content -Path $logPath -Value "Effekseer real SceneMax captures started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    foreach ($clip in $clips) {
        Capture-Clip -Name $clip.Name -OutputFile $clip.Output -CaptureSeconds $clip.Seconds -Code $clip.Code
    }
}
finally {
    [System.IO.File]::WriteAllText($mainPath, $backupText, $utf8NoBom)
    Write-Log "restored running/main"
}
