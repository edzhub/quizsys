@echo off
echo ===================================================
echo   ShowAnswer APK Builder (Host System)
echo ===================================================
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
