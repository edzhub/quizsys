import 'dart:io';
import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'screens/camera_scanner_screen.dart';
import 'screens/ar_polling_screen.dart';
import 'screens/roster_screen.dart';
import 'screens/answer_key_screen.dart';
import 'screens/grades_screen.dart';
import 'services/local_http_server.dart';
import 'services/pdf_generator.dart';

// Declare loopback server globally
final LocalHttpServer _localHttpServer = LocalHttpServer();

// Navigator key for showing native dialogs from global context
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Start Dart loopback server to serve web assets and mock APIs offline
  await _localHttpServer.start();

  // Enable WebView debugging for inspection
  try {
    if (Platform.isAndroid) {
      AndroidWebViewController.enableDebugging(true);
    }
  } catch (_) {}
  
  runApp(const ShowAnswerApp());
}

enum AppViewMode { login, admin, teacher }

class ShowAnswerApp extends StatefulWidget {
  const ShowAnswerApp({super.key});

  @override
  State<ShowAnswerApp> createState() => _ShowAnswerAppState();
}

class _ShowAnswerAppState extends State<ShowAnswerApp> {
  AppViewMode _viewMode = AppViewMode.login;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    final prefs = await SharedPreferences.getInstance();
    final role = prefs.getString('session_role');
    final token = prefs.getString('session_token');

    setState(() {
      _isLoading = false;
      if (token == 'offline_token') {
        if (role == 'Admin') {
          _viewMode = AppViewMode.admin;
        } else if (role == 'Teacher') {
          _viewMode = AppViewMode.teacher;
        } else {
          _viewMode = AppViewMode.login;
        }
      } else {
        _viewMode = AppViewMode.login;
      }
    });
  }

  void _onLoginSuccess() {
    _checkSession();
  }

  void _onLogoutDirectly() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_role');
    await prefs.remove('session_token');
    await prefs.remove('session_username');
    setState(() {
      _viewMode = AppViewMode.login;
    });
  }

  void _handleLogoutWithConfirm() {
    final context = navigatorKey.currentContext;
    if (context == null) return;
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF18181B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20.0)),
          title: const Text(
            'Confirm Logout',
            style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold, color: Colors.white),
          ),
          content: const Text(
            'Are you sure you want to log out of the session?',
            style: TextStyle(fontFamily: 'Outfit', color: Color(0xFFA1A1AA)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Colors.white, fontFamily: 'Outfit')),
            ),
            TextButton(
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                _onLogoutDirectly();
              },
              child: const Text(
                'Logout',
                style: TextStyle(color: Color(0xFFEF4444), fontFamily: 'Outfit', fontWeight: FontWeight.bold),
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ShowAnswer Standalone',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      
      // Premium Dark Theme Configured to match Web Portals
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF09090B), // Carbon Black
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFD4FC34), // Neon Lime Accent
          secondary: Color(0xFFD4FC34),
          background: Color(0xFF09090B),
          surface: Color(0xFF18181B), // Sleek Dark Card Background
          onPrimary: Color(0xFF09090B),
          onBackground: Color(0xFFF4F4F5), // Off-white Primary Text
          onSurface: Color(0xFFF4F4F5),
          error: Color(0xFFEF4444),
        ),
        textTheme: const TextTheme(
          titleLarge: TextStyle(
            fontFamily: 'Outfit',
            fontSize: 22.0,
            fontWeight: FontWeight.bold,
            letterSpacing: -0.5,
            color: Color(0xFFF4F4F5),
          ),
          bodyLarge: TextStyle(
            fontFamily: 'Outfit',
            fontSize: 16.0,
            color: Color(0xFFF4F4F5),
          ),
          bodyMedium: TextStyle(
            fontFamily: 'Outfit',
            fontSize: 14.0,
            color: Color(0xFFA1A1AA), // Soft Muted Gray
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF27272A), // Dark Input
          labelStyle: const TextStyle(color: Color(0xFFA1A1AA)),
          hintStyle: const TextStyle(color: Color(0xFF71717A)),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: const BorderSide(color: Color(0xFF3F3F46)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: const BorderSide(color: Color(0xFF27272A)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: const BorderSide(color: Color(0xFFD4FC34), width: 1.5),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFD4FC34), // Neon Lime
            foregroundColor: const Color(0xFF09090B), // Black Text
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12.0),
            ),
            padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 24.0),
            textStyle: const TextStyle(
              fontFamily: 'Outfit',
              fontWeight: FontWeight.bold,
              fontSize: 16.0,
            ),
          ),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Color(0xFF121214),
          selectedItemColor: Color(0xFFD4FC34),
          unselectedItemColor: Color(0xFFA1A1AA),
          type: BottomNavigationBarType.fixed,
        ),
      ),
      home: _isLoading
          ? const Scaffold(
              backgroundColor: Color(0xFF09090B),
              body: Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
                ),
              ),
            )
          : _buildHomeWidget(),
    );
  }

  Widget _buildHomeWidget() {
    switch (_viewMode) {
      case AppViewMode.login:
        return WebLoginScreen(onLoginSuccess: _onLoginSuccess);
      case AppViewMode.admin:
        return AdminPortalScreen(onLogout: _onLogoutDirectly);
      case AppViewMode.teacher:
        return MainNavigationShell(onLogout: _handleLogoutWithConfirm);
    }
  }
}

class WebLoginScreen extends StatefulWidget {
  final VoidCallback onLoginSuccess;
  const WebLoginScreen({super.key, required this.onLoginSuccess});

  @override
  State<WebLoginScreen> createState() => _WebLoginScreenState();
}

class _WebLoginScreenState extends State<WebLoginScreen> {
  WebViewController? _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initWebViewController();
  }

  void _initWebViewController() {
    final controller = WebViewController.fromPlatformCreationParams(
      const PlatformWebViewControllerCreationParams(),
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF09090B))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (String url) async {
            setState(() {
              _isLoading = false;
            });
            _checkWebSession();
          },
          onUrlChange: (UrlChange change) {
            _checkWebSession();
          },
        ),
      );

    controller.loadRequest(Uri.parse('http://127.0.0.1:8000/login.html'));
    
    setState(() {
      _controller = controller;
    });
  }

  Future<void> _checkWebSession() async {
    final prefs = await SharedPreferences.getInstance();
    final role = prefs.getString('session_role');
    final token = prefs.getString('session_token');
    if (token == 'offline_token' && (role == 'Admin' || role == 'Teacher')) {
      widget.onLoginSuccess();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09090B),
      body: SafeArea(
        child: Stack(
          children: [
            if (_controller != null) WebViewWidget(controller: _controller!),
            if (_isLoading)
              const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class AdminPortalScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const AdminPortalScreen({super.key, required this.onLogout});

  @override
  State<AdminPortalScreen> createState() => _AdminPortalScreenState();
}

class _AdminPortalScreenState extends State<AdminPortalScreen> {
  WebViewController? _controller;
  bool _isLoading = true;
  String _appBarTitle = 'Classroom Hub';

  @override
  void initState() {
    super.initState();
    _initWebViewController();
  }

  Future<void> _handlePrintChannelMessage(String messageBody) async {
    try {
      final Map<String, dynamic> data = json.decode(messageBody);
      final String type = data['type']?.toString() ?? '';
      
      Uint8List pdfBytes;
      String fileName;
      
      if (type == 'print_cards') {
        final List<dynamic> cards = data['cards'] ?? [];
        pdfBytes = await PdfGenerator.generateStudentCardsPdf(cards);
        fileName = 'student_polling_cards.pdf';
      } else if (type == 'print_response_sheet') {
        final List<dynamic> questions = data['questions'] ?? [];
        final String? questionImage = data['questionImage']?.toString();
        pdfBytes = await PdfGenerator.generateResponseSheetPdf(questions, questionImage);
        fileName = 'student_response_sheet.pdf';
      } else {
        print('[PrintChannel] Unknown print type: $type');
        return;
      }

      final tempDir = await getTemporaryDirectory();
      final tempFile = File('${tempDir.path}/$fileName');
      await tempFile.writeAsBytes(pdfBytes);

      await Share.shareXFiles([XFile(tempFile.path)], subject: 'Print ShowAnswer Document');
    } catch (e) {
      print('[PrintChannel Error] Failed to generate/share PDF: $e');
    }
  }

  void _updateTitleFromUrl(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final path = uri.path;
    String newTitle = 'Admin Portal';
    if (path.endsWith('index.html') || path == '/' || path.isEmpty) {
      newTitle = 'Classroom Hub';
    } else if (path.endsWith('generator.html')) {
      newTitle = 'Card Generator';
    } else if (path.endsWith('ocr_sheet.html')) {
      newTitle = 'Print OCR Sheets';
    } else if (path.endsWith('manage_teachers.html')) {
      newTitle = 'Manage Teachers';
    }
    setState(() {
      _appBarTitle = newTitle;
    });
  }

  void _setupFilePicker(WebViewController controller) {
    if (Platform.isAndroid) {
      final platformController = controller.platform;
      if (platformController is AndroidWebViewController) {
        platformController.setOnShowFileSelector((FileSelectorParams params) async {
          try {
            final result = await FilePicker.platform.pickFiles(
              allowMultiple: params.mode == FileSelectorMode.openMultiple,
              type: FileType.any,
            );
            if (result != null && result.files.isNotEmpty) {
              return result.files
                  .where((file) => file.path != null)
                  .map((file) => Uri.file(file.path!).toString())
                  .toList();
            }
          } catch (e) {
            print('[FilePicker Error] $e');
          }
          return [];
        });
      }
    }
  }

  void _initWebViewController() {
    final controller = WebViewController.fromPlatformCreationParams(
      const PlatformWebViewControllerCreationParams(),
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF09090B))
      ..setUserAgent("ShowAnswerMobileWebView")
      ..addJavaScriptChannel(
        'PrintChannel',
        onMessageReceived: (JavaScriptMessage message) {
          _handlePrintChannelMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            _updateTitleFromUrl(url);
            setState(() {
              _isLoading = true;
            });
            _checkLogoutRedirect(url);
          },
          onPageFinished: (String url) {
            _updateTitleFromUrl(url);
            setState(() {
              _isLoading = false;
            });
            _checkLogoutRedirect(url);
          },
          onUrlChange: (UrlChange change) {
            if (change.url != null) {
              _updateTitleFromUrl(change.url!);
              _checkLogoutRedirect(change.url!);
            }
          },
        ),
      );

    _setupFilePicker(controller);
    controller.loadRequest(Uri.parse('http://127.0.0.1:8000/index.html'));

    setState(() {
      _controller = controller;
    });
  }

  void _checkLogoutRedirect(String url) {
    if (url.contains('login.html')) {
      widget.onLogout();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09090B),
      appBar: AppBar(
        title: Text(
          _appBarTitle,
          style: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold, fontSize: 18.0),
        ),
        backgroundColor: const Color(0xFF121214),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFFD4FC34)),
            onPressed: () {
              _controller?.reload();
            },
            tooltip: 'Reload Portal',
          ),
          IconButton(
            icon: const Icon(Icons.home, color: Color(0xFFD4FC34)),
            onPressed: () {
              _controller?.loadRequest(Uri.parse('http://127.0.0.1:8000/index.html'));
            },
            tooltip: 'Home Dashboard',
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
            onPressed: widget.onLogout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_controller != null) WebViewWidget(controller: _controller!),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
              ),
            ),
        ],
      ),
    );
  }
}

class MainNavigationShell extends StatefulWidget {
  final VoidCallback onLogout;
  const MainNavigationShell({super.key, required this.onLogout});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;
  final GlobalKey<CameraScannerScreenState> _cameraKey = GlobalKey<CameraScannerScreenState>();
  final GlobalKey<GradesScreenState> _gradesKey = GlobalKey<GradesScreenState>();

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      ArPollingScreen(
        onLogout: widget.onLogout,
        onSwitchToNativeScanner: () {
          setState(() {
            _currentIndex = 1;
          });
          _cameraKey.currentState?.onTabFocusChanged(true);
        },
      ),
      CameraScannerScreen(key: _cameraKey, onLogout: widget.onLogout),
      GradesScreen(key: _gradesKey, onLogout: widget.onLogout),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          if (_currentIndex == 1 && index != 1) {
            _cameraKey.currentState?.onTabFocusChanged(false);
          } else if (_currentIndex != 1 && index == 1) {
            _cameraKey.currentState?.onTabFocusChanged(true);
          }

          setState(() {
            _currentIndex = index;
          });

          if (index == 2) {
            _gradesKey.currentState?.loadGradesHistory();
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.document_scanner),
            label: 'OCR Scanner',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.assessment),
            label: 'Analysis',
          ),
        ],
      ),
    );
  }
}
