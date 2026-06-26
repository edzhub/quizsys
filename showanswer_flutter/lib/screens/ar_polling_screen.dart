import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../services/pdf_generator.dart';

class ArPollingScreen extends StatefulWidget {
  final VoidCallback onLogout;
  final VoidCallback? onSwitchToNativeScanner;
  const ArPollingScreen({super.key, required this.onLogout, this.onSwitchToNativeScanner});

  @override
  State<ArPollingScreen> createState() => _ArPollingScreenState();
}

class _ArPollingScreenState extends State<ArPollingScreen> {
  WebViewController? _controller;
  bool _isPermissionGranted = false;
  bool _isLoading = true;
  String _appBarTitle = 'Teacher Dashboard';

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
    String newTitle = 'Teacher Portal';
    if (path.endsWith('index.html') || path == '/' || path.isEmpty) {
      newTitle = 'Teacher Dashboard';
    } else if (path.endsWith('question.html')) {
      newTitle = 'Setup AR Quiz';
    } else if (path.endsWith('scanner.html')) {
      newTitle = 'Scan AR Cards';
    } else if (path.endsWith('ocr_setup.html')) {
      newTitle = 'OCR Setup & Print';
    } else if (path.endsWith('ocr_scanner.html')) {
      newTitle = 'Scan OCR Sheets';
    } else if (path.endsWith('report.html')) {
      newTitle = 'Quiz Report';
    }
    setState(() {
      _appBarTitle = newTitle;
    });
  }

  @override
  void initState() {
    super.initState();
    _requestCameraPermission();
  }

  Future<void> _requestCameraPermission() async {
    final status = await Permission.camera.request();
    if (status.isGranted) {
      setState(() {
        _isPermissionGranted = true;
      });
      _initWebViewController();
    } else {
      setState(() {
        _isPermissionGranted = false;
        _isLoading = false;
      });
    }
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
      onPermissionRequest: (WebViewPermissionRequest request) {
        request.grant();
      },
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF09090B)) // Carbon black background
      ..setUserAgent("ShowAnswerMobileWebView")
      ..addJavaScriptChannel(
        'PrintChannel',
        onMessageReceived: (JavaScriptMessage message) {
          _handlePrintChannelMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            if (request.url.contains('ocr_scanner.html')) {
              if (widget.onSwitchToNativeScanner != null) {
                widget.onSwitchToNativeScanner!();
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onPageStarted: (String url) {
            _updateTitleFromUrl(url);
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (String url) async {
            _updateTitleFromUrl(url);
            final prefs = await SharedPreferences.getInstance();
            final token = prefs.getString('session_token') ?? 'offline_token';
            final role = prefs.getString('session_role') ?? 'Teacher';
            final username = prefs.getString('session_username') ?? 'Teacher';

            // Inject auto-login credentials in localStorage so web portal bypasses login.html
            await _controller?.runJavaScript('''
              localStorage.setItem('showanswer_session_token', '$token');
              localStorage.setItem('showanswer_session_role', '$role');
              localStorage.setItem('showanswer_session_username', '$username');
            ''');
            setState(() {
              _isLoading = false;
            });
          },
          onUrlChange: (UrlChange change) {
            if (change.url != null) {
              _updateTitleFromUrl(change.url!);
            }
          },
          onWebResourceError: (WebResourceError error) {
            print('[WebView Error] Code: ${error.errorCode}, Desc: ${error.description}');
          },
        ),
      );

    _setupFilePicker(controller);
    
    // Load the local loopback server index page on port 8002
    controller.loadRequest(Uri.parse('http://127.0.0.1:8002/index.html'));
    
    setState(() {
      _controller = controller;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isPermissionGranted) {
      return Scaffold(
        backgroundColor: const Color(0xFF09090B),
        appBar: AppBar(
          title: const Text('AR Polling Dashboard', style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold)),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.camera_alt_outlined, size: 64, color: Color(0xFFA1A1AA)),
                const SizedBox(height: 24),
                const Text(
                  'Camera Permission Required',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFF4F4F5), fontFamily: 'Outfit'),
                ),
                const SizedBox(height: 16),
                const Text(
                  'The AR live polling scanner relies on camera access to capture student ArUco answer cards.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFFA1A1AA), fontFamily: 'Outfit'),
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: _requestCameraPermission,
                  child: const Text('Grant Camera Permission'),
                ),
              ],
            ),
          ),
        ),
      );
    }

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
              _controller?.loadRequest(Uri.parse('http://127.0.0.1:8002/index.html'));
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
          if (_controller != null)
            WebViewWidget(controller: _controller!),
          
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
