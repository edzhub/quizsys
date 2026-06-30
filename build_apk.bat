@echo off
echo ===================================================
echo   ShowAnswer APK Builder (Host System)
echo ===================================================
echo.
echo Step 0: Syncing web assets from host directories...
for %%F in (CardGeneratorProject\*.html CardGeneratorProject\*.js CardGeneratorProject\*.css) do (
    if exist "showanswer_flutter\assets\web\admin\%%~nxF" (
        copy /Y "%%F" "showanswer_flutter\assets\web\admin\%%~nxF" >nul
        echo   Synced admin: %%~nxF
    )
)
for %%F in (QuestionScannerProject\*.html QuestionScannerProject\*.js QuestionScannerProject\*.css) do (
    if exist "showanswer_flutter\assets\web\teacher\%%~nxF" (
        copy /Y "%%F" "showanswer_flutter\assets\web\teacher\%%~nxF" >nul
        echo   Synced teacher: %%~nxF
    )
)
echo Web assets synced.
echo.
echo Step 1: Cleaning previous build caches...
cd showanswer_flutter
call C:\flutter_windows_3.44.1-stable\flutter\bin\flutter clean

echo.
echo Step 2: Compiling release APK...
call C:\flutter_windows_3.44.1-stable\flutter\bin\flutter build apk --release

echo.
echo Step 3: Copying new APK to quizSys...
copy /Y build\app\outputs\flutter-apk\app-release.apk ..\QuizScanner_v4.apk

echo.
echo ===================================================
echo   Successfully compiled and copied QuizScanner_v4.apk!
echo ===================================================
echo.
pause
