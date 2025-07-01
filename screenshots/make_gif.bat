@echo off
setlocal enabledelayedexpansion

:: 输入提示
set /p name=请输入视频名称（不含扩展名）:

:: 设置文件名
set input=%name%.mkv
set palette=%name%_palette.png
set output=%name%.gif

:: 检查 FFmpeg 是否存在
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo 请先安装 FFmpeg 并将其添加到环境变量！
    pause
    exit /b
)

echo 🎬 Step 1: 生成调色板...
ffmpeg -y -i "%input%" -vf "fps=10,scale=1080:-1:flags=lanczos,palettegen" "%palette%"

echo 🎨 Step 2: 生成高质量 GIF...
ffmpeg -y -i "%input%" -i "%palette%" -filter_complex "[0:v]fps=10,scale=1080:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "%output%"

echo ✅ 完成啦！生成的 GIF 文件是：%output%

del %palette%
pause

