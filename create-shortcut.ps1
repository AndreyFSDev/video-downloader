$ErrorActionPreference = "Stop"

$root = "Z:\Git\Programs\_Active\video-downloader"
$built = "$root\src-tauri\target\release\video-downloader.exe"
# Постоянное имя и папка: ярлык не ломается при смене версии, а tools\ с yt-dlp/FFmpeg
# остаётся рядом с exe и не качается заново.
$app = "$root\release\app"
$exe = "$app\Viloader.exe"
New-Item -ItemType Directory -Force $app | Out-Null
Copy-Item $built $exe -Force

$srcIco = "$root\src-tauri\icons\icon.ico"
# Кэш иконок Explorer keyed by path: копия под новым именем гарантирует
# свежую отрисовку после перегенерации icon.ico.
$desktopIco = "$root\src-tauri\icons\icon-desktop.ico"
Copy-Item $srcIco $desktopIco -Force

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\Andrey\Desktop\Viloader.lnk")
$Shortcut.TargetPath = $exe
$Shortcut.WorkingDirectory = $app
$Shortcut.IconLocation = "$desktopIco,0"
$Shortcut.Description = "Viloader - Boosty and 1000+ sites"
$Shortcut.Save()
Write-Host "Shortcut -> $exe (icon: $desktopIco)"


