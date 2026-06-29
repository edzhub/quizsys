import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/ocr_service.dart';

class CameraScannerScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const CameraScannerScreen({super.key, required this.onLogout});

  @override
  State<CameraScannerScreen> createState() => CameraScannerScreenState();
}

class CameraScannerScreenState extends State<CameraScannerScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isPermissionGranted = false;
  bool _isInitializing = true;
  bool _isScanning = false;
  String? _statusText;
  String? _serverIp;

  void onTabFocusChanged(bool isFocused) {
    if (isFocused) {
      _loadServerIp();
      if (_controller == null || !_controller!.value.isInitialized) {
        _requestPermissionAndInitCamera();
      }
    } else {
      _controller?.dispose();
      _controller = null;
      if (mounted) {
        setState(() {
          _isInitializing = true;
        });
      }
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _requestPermissionAndInitCamera();
    _loadServerIp();
  }

  Future<void> _loadServerIp() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _serverIp = prefs.getString('server_ip');
    });
  }

  void _showIpSettingsDialog() {
    final TextEditingController ipInputController = TextEditingController(text: _serverIp);
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF18181B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20.0)),
          title: const Text(
            'Configure PC Server IP',
            style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold, color: Colors.white),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Enter the IP address of the PC running the Python server (port 8002).',
                style: TextStyle(fontFamily: 'Outfit', color: Color(0xFFA1A1AA), fontSize: 13.0),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: ipInputController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Server IP',
                  hintText: 'e.g., 192.168.1.105',
                ),
                style: const TextStyle(color: Colors.white),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Colors.white, fontFamily: 'Outfit')),
            ),
            TextButton(
              onPressed: () async {
                String ip = ipInputController.text.trim();
                if (ip.startsWith('http://')) ip = ip.substring(7);
                if (ip.startsWith('https://')) ip = ip.substring(8);
                if (ip.endsWith('/')) ip = ip.substring(0, ip.length - 1);
                
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString('server_ip', ip);
                setState(() {
                  _serverIp = ip;
                });
                if (mounted) {
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: const Color(0xFF10B981),
                      content: Text('Server IP updated to $ip', style: const TextStyle(color: Colors.white)),
                    ),
                  );
                }
              },
              child: const Text(
                'Save',
                style: TextStyle(color: Color(0xFFD4FC34), fontFamily: 'Outfit', fontWeight: FontWeight.bold),
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final CameraController? cameraController = _controller;

    if (cameraController == null || !cameraController.value.isInitialized) {
      return;
    }

    if (state == AppLifecycleState.inactive) {
      cameraController.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initializeCameraController(cameraController.description);
    }
  }

  Future<void> _requestPermissionAndInitCamera() async {
    final status = await Permission.camera.request();
    if (status.isGranted) {
      setState(() {
        _isPermissionGranted = true;
      });
      await _setupCameras();
    } else {
      setState(() {
        _isPermissionGranted = false;
        _isInitializing = false;
      });
    }
  }

  Future<void> _setupCameras() async {
    try {
      _cameras = await availableCameras();
      if (_cameras != null && _cameras!.isNotEmpty) {
        final backCamera = _cameras!.firstWhere(
          (camera) => camera.lensDirection == CameraLensDirection.back,
          orElse: () => _cameras!.first,
        );
        await _initializeCameraController(backCamera);
      } else {
        setState(() {
          _statusText = "No cameras found on device.";
          _isInitializing = false;
        });
      }
    } catch (e) {
      setState(() {
        _statusText = "Error getting cameras: $e";
        _isInitializing = false;
      });
    }
  }

  Future<void> _initializeCameraController(CameraDescription description) async {
    final CameraController cameraController = CameraController(
      description,
      ResolutionPreset.high,
      enableAudio: false,
    );

    _controller = cameraController;

    try {
      await cameraController.initialize();
      if (mounted) {
        setState(() {
          _isInitializing = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _statusText = "Camera initialization failed: $e";
          _isInitializing = false;
        });
      }
    }
  }

  Future<void> _captureAndScan() async {
    if (_controller == null || !_controller!.value.isInitialized || _isScanning) {
      return;
    }

    if (_serverIp == null || _serverIp!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Color(0xFFEF4444),
          content: Text('Please configure the PC Server IP in settings first.', style: TextStyle(color: Colors.white)),
        ),
      );
      _showIpSettingsDialog();
      return;
    }

    setState(() {
      _isScanning = true;
      _statusText = "📸 Capturing sheet...";
    });

    try {
      final XFile imageFile = await _controller!.takePicture();

      setState(() {
        _statusText = "🗜️ Compressing image...";
      });

      // Read file bytes and encode to base64
      final bytes = await File(imageFile.path).readAsBytes();
      final base64Image = base64Encode(bytes);

      // Delete captured temp file to save space
      try { await File(imageFile.path).delete(); } catch (_) {}

      setState(() {
        _statusText = "⬆️ Uploading to server...";
      });

      // Call OcrService — it resizes image + sends to RapidOCR Python server
      final result = await OcrService.scanImage(
        serverIp: _serverIp!,
        base64Image: base64Image,
      );

      setState(() {
        _isScanning = false;
        _statusText = null;
      });

      if (result['status'] == 'error') {
        final String rawMsg = result['message'] ?? 'Failed to parse image.';
        if (rawMsg.startsWith('timeout:')) {
          _showErrorDialog(
            '⏱️ Scan timed out.\n\n'
            'The server took too long to respond. Make sure:\n'
            '• Python server is running on the PC\n'
            '• Phone and PC are on the same Wi-Fi\n'
            '• The IP address is correct\n\n'
            '${rawMsg.substring(8)}',
          );
        } else if (rawMsg.startsWith('socket:')) {
          _showErrorDialog(
            '📡 Cannot reach the PC server.\n\n'
            'Make sure:\n'
            '• The Python server is running on the PC\n'
            '• Both phone and PC are on the same Wi-Fi\n'
            '• The IP address is correct\n\n'
            'Detail: ${rawMsg.substring(7)}',
          );
        } else {
          _showErrorDialog(rawMsg);
        }
      } else {
        if (mounted) {
          List<dynamic> rawAnswers = result['answers'] ?? [];
          List<String> answers = rawAnswers.map((v) => v.toString()).toList();
          while (answers.length < 5) {
            answers.add('?');
          }
          final Map<String, dynamic> formattedResult = {
            'roll_no': result['roll_no']?.toString() ?? '',
            'class': result['class']?.toString() ?? '',
            'section': result['section']?.toString() ?? '',
            'answers': answers,
            'annotated_image': result['annotated_image']?.toString() ?? '',
          };
          _showVerifyAndSaveDialog(formattedResult);
        }
      }
    } on SocketException catch (e) {
      setState(() {
        _isScanning = false;
        _statusText = null;
      });
      _showErrorDialog(
        '📡 Cannot reach the PC server.\n\n'
        'Make sure:\n'
        '• The Python server is running on the PC\n'
        '• Both phone and PC are on the same Wi-Fi\n'
        '• The IP address is correct\n\n'
        'Detail: ${e.message}',
      );
    } catch (e) {
      setState(() {
        _isScanning = false;
        _statusText = null;
      });
      _showErrorDialog('Scan failed: ${e.toString()}');
    }
  }

  void _showVerifyAndSaveDialog(Map<String, dynamic> parsed) async {
    final prefs = await SharedPreferences.getInstance();
    final String? rosterJson = prefs.getString('local_roster');
    final String? keyJson = prefs.getString('local_answer_key');

    Map<String, String> roster = {};
    if (rosterJson != null) {
      try {
        final decoded = json.decode(rosterJson);
        if (decoded is List) {
          for (var item in decoded) {
            if (item is Map) {
              final sid = item['student_id']?.toString();
              final sname = item['name']?.toString();
              if (sid != null && sname != null) {
                roster[sid] = sname;
              }
            }
          }
        } else if (decoded is Map) {
          roster = decoded.map((k, v) => MapEntry(k.toString(), v.toString()));
        }
      } catch (_) {}
    }

    List<String> answerKey = ['A', 'B', 'C', 'D', 'A'];
    if (keyJson != null) {
      try {
        final List<dynamic> decoded = json.decode(keyJson);
        answerKey = decoded.map((v) => v.toString()).toList();
      } catch (_) {}
    } else {
      // Fallback: check if there's an active quiz configured in the AR Polling tab
      final String? activeJson = prefs.getString('local_active_quiz');
      if (activeJson != null) {
        try {
          final List<dynamic> decoded = json.decode(activeJson);
          if (decoded.isNotEmpty) {
            answerKey = decoded.map((q) => q['correctAnswer']?.toString() ?? 'A').toList();
          }
        } catch (_) {}
      }
    }

    final TextEditingController rollController = TextEditingController(text: parsed['roll_no']);
    final TextEditingController classController = TextEditingController(text: parsed['class']);
    final TextEditingController secController = TextEditingController(text: parsed['section']);
    List<String> currentAnswers = List<String>.from(parsed['answers']);
    final String annotatedImageData = parsed['annotated_image'] ?? '';

    if (mounted) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              final String roll = rollController.text.trim();
              final String studentName = roster[roll] ?? 'Unknown Student (Not in Roster)';

              return AlertDialog(
                backgroundColor: const Color(0xFF18181B),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20.0)),
                title: const Text(
                  'Verify Scan Details',
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFF4F4F5),
                  ),
                ),
                content: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Annotated preview image (what the server actually scanned)
                      if (annotatedImageData.isNotEmpty) ...[
                        const Text(
                          'SCAN PREVIEW',
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 11.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFA1A1AA),
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 6.0),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8.0),
                          child: Image.memory(
                            base64Decode(annotatedImageData.replaceFirst('data:image/jpeg;base64,', '')),
                            fit: BoxFit.contain,
                            height: 200,
                          ),
                        ),
                        const SizedBox(height: 16.0),
                      ],
                      // Roll No Input
                      TextField(
                        controller: rollController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Roll No. (Student ID)'),
                        style: const TextStyle(color: Color(0xFFF4F4F5)),
                        onChanged: (_) {
                          setDialogState(() {}); // Recalculate Student Name matching
                        },
                      ),
                      const SizedBox(height: 8.0),
                      Text(
                        studentName,
                        style: TextStyle(
                          fontSize: 13.0,
                          fontWeight: FontWeight.bold,
                          color: roster.containsKey(roll) ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                        ),
                      ),
                      const SizedBox(height: 16.0),
                      // Class & Section Row
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: classController,
                              textCapitalization: TextCapitalization.characters,
                              decoration: const InputDecoration(labelText: 'Class'),
                              style: const TextStyle(color: Color(0xFFF4F4F5)),
                            ),
                          ),
                          const SizedBox(width: 16.0),
                          Expanded(
                            child: TextField(
                              controller: secController,
                              textCapitalization: TextCapitalization.characters,
                              decoration: const InputDecoration(labelText: 'Section'),
                              style: const TextStyle(color: Color(0xFFF4F4F5)),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24.0),
                      const Text(
                        'ANSWERS GRID',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 12.0,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFA1A1AA),
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 8.0),
                      // List of 5 answers to tap/modify if OCR was incorrect
                      Column(
                        children: List.generate(5, (index) {
                          final String correct = answerKey[index];
                          final String scanned = currentAnswers[index];
                          final options = ['A', 'B', 'C', 'D', '?'];

                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4.0),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Q${index + 1} (Key: $correct)',
                                  style: const TextStyle(
                                    fontSize: 13.0,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFFF4F4F5),
                                  ),
                                ),
                                Row(
                                  children: options.map((opt) {
                                    final isSelected = scanned == opt;
                                    return GestureDetector(
                                      onTap: () {
                                        setDialogState(() {
                                          currentAnswers[index] = opt;
                                        });
                                      },
                                      child: Container(
                                        margin: const EdgeInsets.symmetric(horizontal: 2.0),
                                        width: 32,
                                        height: 32,
                                        decoration: BoxDecoration(
                                          color: isSelected
                                              ? const Color(0xFFD4FC34)
                                              : const Color(0xFF27272A),
                                          borderRadius: BorderRadius.circular(6.0),
                                        ),
                                        child: Center(
                                          child: Text(
                                            opt,
                                            style: TextStyle(
                                              fontSize: 12.0,
                                              fontWeight: FontWeight.bold,
                                              color: isSelected
                                                  ? const Color(0xFF09090B)
                                                  : const Color(0xFFF4F4F5),
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                )
                              ],
                            ),
                          );
                        }),
                      )
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel', style: TextStyle(color: Colors.white)),
                  ),
                  TextButton(
                    onPressed: () async {
                      // Save Result locally
                      final String finalRoll = rollController.text.trim();
                      final String finalClass = classController.text.trim().toUpperCase();
                      final String finalSec = secController.text.trim().toUpperCase();
                      final String finalStudentName = roster[finalRoll] ?? 'Student $finalRoll';

                      // Grade Score
                      int score = 0;
                      for (int i = 0; i < 5; i++) {
                        if (currentAnswers[i] == answerKey[i]) {
                          score++;
                        }
                      }

                      // Save Grade record in history
                      final List<dynamic> decodedHistory = [];
                      final String? historyJson = prefs.getString('local_grades_history');
                      if (historyJson != null) {
                        try {
                          decodedHistory.addAll(json.decode(historyJson));
                        } catch (_) {}
                      }

                      final DateTime now = DateTime.now();
                      final String formattedTime = 
                          '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')} '
                          '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

                      final record = {
                        'student_id': finalRoll,
                        'name': finalStudentName,
                        'class': finalClass,
                        'section': finalSec,
                        'answers': currentAnswers,
                        'score': score,
                        'total': 5,
                        'timestamp': formattedTime,
                      };

                      decodedHistory.add(record);
                      await prefs.setString('local_grades_history', json.encode(decodedHistory));

                      if (mounted) {
                        Navigator.of(context).pop(); // Close dialog
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: const Color(0xFF10B981),
                            content: Text(
                              'Saved $finalStudentName: $score/5',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                          ),
                        );
                      }
                    },
                    child: const Text(
                      'Save Grade',
                      style: TextStyle(color: Color(0xFFD4FC34), fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              );
            },
          );
        },
      );
    }
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF18181B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16.0)),
        title: const Text(
          'Scanner Error',
          style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold),
        ),
        content: Text(
          message,
          style: const TextStyle(color: Color(0xFFF4F4F5)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK', style: TextStyle(color: Color(0xFFD4FC34))),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      body: Stack(
        children: [
          // Camera Preview
          Positioned.fill(
            child: _buildCameraPreview(size),
          ),

          // Viewfinder Guidelines
          Positioned.fill(
            child: IgnorePointer(
              child: Stack(
                children: [
                  CustomPaint(
                    size: size,
                    painter: const ViewfinderPainter(),
                  ),
                  Center(
                    child: SizedBox(
                      width: size.width * 0.85,
                      height: (size.width * 0.85) * 1.414,
                      child: Stack(
                        children: [
                          Positioned(
                            top: 0, left: 0,
                            child: Container(width: 32, height: 32, decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFD4FC34), width: 4), left: BorderSide(color: Color(0xFFD4FC34), width: 4)))),
                          ),
                          Positioned(
                            top: 0, right: 0,
                            child: Container(width: 32, height: 32, decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFD4FC34), width: 4), right: BorderSide(color: Color(0xFFD4FC34), width: 4)))),
                          ),
                          Positioned(
                            bottom: 0, left: 0,
                            child: Container(width: 32, height: 32, decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFD4FC34), width: 4), left: BorderSide(color: Color(0xFFD4FC34), width: 4)))),
                          ),
                          Positioned(
                            bottom: 0, right: 0,
                            child: Container(width: 32, height: 32, decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFD4FC34), width: 4), right: BorderSide(color: Color(0xFFD4FC34), width: 4)))),
                          ),
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: 16.0),
                              child: Text(
                                'Align 4 corner anchors inside the brackets\nand hold steady',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 13.0,
                                  color: Color(0xFFD4FC34),
                                  fontWeight: FontWeight.bold,
                                  shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // App Header
          Positioned(
            top: 0, left: 0, right: 0,
            child: Container(
              padding: const EdgeInsets.only(top: 40.0, left: 20.0, right: 20.0, bottom: 16.0),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter, end: Alignment.bottomCenter,
                  colors: [Colors.black.withOpacity(0.7), Colors.transparent],
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.settings, color: Color(0xFFD4FC34)),
                    onPressed: _showIpSettingsDialog,
                    tooltip: 'Server Settings',
                  ),
                  const Text(
                    'ShowAnswer Standalone Scanner',
                    style: TextStyle(
                      fontFamily: 'Outfit',
                      fontSize: 16.0,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
                    onPressed: widget.onLogout,
                    tooltip: 'Logout',
                  ),
                ],
              ),
            ),
          ),

          // Shoot Trigger Button
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              padding: const EdgeInsets.only(bottom: 40.0, top: 20.0),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter, end: Alignment.topCenter,
                  colors: [Colors.black.withOpacity(0.7), Colors.transparent],
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: GestureDetector(
                      onTap: _captureAndScan,
                      child: Container(
                        width: 76, height: 76,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFFD4FC34),
                          border: Border.all(color: const Color(0xFF09090B), width: 6),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFFD4FC34).withOpacity(0.3),
                              blurRadius: 15, spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.camera_alt,
                          size: 32,
                          color: Color(0xFF09090B),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Offline Scan Loader
          if (_isScanning)
            Positioned.fill(
              child: Container(
                color: Colors.black.withOpacity(0.8),
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.all(32.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B),
                      borderRadius: BorderRadius.circular(24.0),
                      border: Border.all(color: Colors.white.withOpacity(0.08)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                          width: 48, height: 48,
                          child: CircularProgressIndicator(
                            strokeWidth: 3.5,
                            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
                          ),
                        ),
                        const SizedBox(height: 24.0),
                        Text(
                          _statusText ?? 'Analyzing sheet...',
                          style: const TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 16.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFF4F4F5),
                          ),
                        ),
                        const SizedBox(height: 8.0),
                        const Text(
                          'Running server-side RapidOCR Text Recognition',
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 12.0,
                            color: Color(0xFFA1A1AA),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCameraPreview(Size size) {
    if (!_isPermissionGranted) {
      return Container(
        color: const Color(0xFF09090B),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.camera_alt_outlined, size: 64, color: Color(0xFFA1A1AA)),
                const SizedBox(height: 24),
                const Text(
                  'Camera Permission Required',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFF4F4F5)),
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: _requestPermissionAndInitCamera,
                  child: const Text('Grant Camera Permission'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_isInitializing || _controller == null || !_controller!.value.isInitialized) {
      return Container(
        color: const Color(0xFF09090B),
        child: const Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
          ),
        ),
      );
    }

    return OverflowBox(
      alignment: Alignment.center,
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: size.width,
          height: size.width * _controller!.value.aspectRatio,
          child: CameraPreview(_controller!),
        ),
      ),
    );
  }
}

class ViewfinderPainter extends CustomPainter {
  const ViewfinderPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black.withOpacity(0.55)
      ..style = PaintingStyle.fill;

    final double cutoutWidth = size.width * 0.85;
    final double cutoutHeight = cutoutWidth * 1.414;
    final double left = (size.width - cutoutWidth) / 2;
    final double top = (size.height - cutoutHeight) / 2;

    final RRect rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, top, cutoutWidth, cutoutHeight),
      const Radius.circular(24.0),
    );

    final Path path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(rrect);

    path.fillType = PathFillType.evenOdd;

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
