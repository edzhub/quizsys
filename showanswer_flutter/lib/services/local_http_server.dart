import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocalHttpServer {
  HttpServer? _adminServer;
  HttpServer? _teacherServer;
  
  // In-memory active responses for the live AR scanner
  static Map<String, String> activeResponses = {}; // student_id -> answer
  // In-memory quiz responses accumulated during a live quiz
  static List<Map<String, dynamic>> activeQuizResponses = [];

  Future<void> start() async {
    // 1. Start Admin Server (Port 8000)
    try {
      _adminServer = await HttpServer.bind(InternetAddress.loopbackIPv4, 8000);
      print("[Server] Local loopback Admin server running on http://localhost:8000");
      
      _adminServer!.listen((HttpRequest request) async {
        try {
          await _handleRequest(request);
        } catch (e) {
          print("[Server Admin] Error handling request: $e");
          _sendErrorResponse(request, 500, "Internal Server Error: $e");
        }
      });
    } catch (e) {
      print("[Server Admin] Could not start port 8000 server: $e");
    }

    // 2. Start Teacher Server (Port 8002)
    try {
      _teacherServer = await HttpServer.bind(InternetAddress.loopbackIPv4, 8002);
      print("[Server] Local loopback Teacher server running on http://localhost:8002");
      
      _teacherServer!.listen((HttpRequest request) async {
        try {
          await _handleRequest(request);
        } catch (e) {
          print("[Server Teacher] Error handling request: $e");
          _sendErrorResponse(request, 500, "Internal Server Error: $e");
        }
      });
    } catch (e) {
      print("[Server Teacher] Could not start port 8002 server: $e");
    }
  }

  Future<void> stop() async {
    await _adminServer?.close(force: true);
    await _teacherServer?.close(force: true);
    _adminServer = null;
    _teacherServer = null;
    print("[Server] Both local loopback servers stopped.");
  }

  Future<void> _handleRequest(HttpRequest request) async {
    // Add CORS headers to all responses
    request.response.headers.add('Access-Control-Allow-Origin', '*');
    request.response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    request.response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

    if (request.method == 'OPTIONS') {
      request.response.statusCode = HttpStatus.ok;
      await request.response.close();
      return;
    }

    final pathWithQuery = request.uri.path;
    // Strip query parameters
    final path = pathWithQuery.split('?')[0];
    final localPort = request.connectionInfo?.localPort ?? 8002;

    // --- STATIC FILES ROUTING ---
    if (!path.startsWith('/api/')) {
      await _serveStaticFile(request, path, localPort);
      return;
    }

    // --- API ENDPOINTS ROUTING ---
    final bodyBytes = await request.fold<List<int>>([], (prev, element) => prev..addAll(element));

    final prefs = await SharedPreferences.getInstance();
    final String? serverIp = prefs.getString('server_ip');
    if (serverIp != null && serverIp.isNotEmpty) {
      final success = await _proxyRequest(request, serverIp, 8000, bodyBytes);
      if (success) {
        return;
      }
    }

    // Roster API (GET)
    if (path == '/api/class' && request.method == 'GET') {
      final rosterList = await _getMergedRoster(prefs);
      _sendJsonResponse(request, rosterList);
      return;
    }

    // Roster API (POST - for Admin Classroom Hub client page to add/sync students)
    if (path == '/api/class' && request.method == 'POST') {
      final parsed = _parseBody(bodyBytes);
      final rosterList = await _getMergedRoster(prefs);

      if (parsed is List) {
        // Clear and reload the roster when receiving the full array
        rosterList.clear();
        for (var item in parsed) {
          if (item is Map) {
            final String sid = item['student_id']?.toString().trim() ?? '';
            final String name = item['name']?.toString().trim() ?? '';
            final int markerId = int.tryParse(item['marker_id']?.toString() ?? '') ?? 0;
            final String classVal = item['class']?.toString().trim().toUpperCase() ?? "10";
            final String secVal = item['section']?.toString().trim().toUpperCase() ?? "A";
            
            if (sid.isNotEmpty && name.isNotEmpty) {
              rosterList.add({
                "marker_id": markerId,
                "student_id": sid,
                "name": name,
                "class": classVal,
                "section": secVal
              });
            }
          }
        }
        await prefs.setString('local_roster', json.encode(rosterList));
      } else if (parsed is Map) {
        // Support adding a single student object
        final String? sid = parsed['student_id']?.toString().trim();
        final String? name = parsed['name']?.toString().trim();
        final String classVal = parsed['class']?.toString().trim().toUpperCase() ?? "10";
        final String secVal = parsed['section']?.toString().trim().toUpperCase() ?? "A";

        if (sid != null && name != null && sid.isNotEmpty && name.isNotEmpty) {
          rosterList.removeWhere((s) => s['student_id'] == sid);
          int nextMarkerId = 0;
          while (rosterList.any((s) => s['marker_id'] == nextMarkerId)) {
            nextMarkerId++;
          }

          rosterList.add({
            "marker_id": nextMarkerId,
            "student_id": sid,
            "name": name,
            "class": classVal,
            "section": secVal
          });
          await prefs.setString('local_roster', json.encode(rosterList));
        }
      }

      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Server Info (GET)
    if (path == '/api/server-info' && request.method == 'GET') {
      final String? serverIp = prefs.getString('server_ip');
      _sendJsonResponse(request, {
        "local_ip": "127.0.0.1",
        "port": localPort,
        "server_ip": serverIp ?? ""
      });
      return;
    }

    // Active Card Responses (GET)
    if (path == '/api/responses' && request.method == 'GET') {
      _sendJsonResponse(request, activeResponses);
      return;
    }

    // Reset Card Responses (POST)
    if (path == '/api/reset_responses' && request.method == 'POST') {
      activeResponses.clear();
      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Save/Merge Card Responses (POST)
    if (path == '/api/responses' && request.method == 'POST') {
      final data = _parseBody(bodyBytes);
      if (data is Map) {
        data.forEach((k, v) {
          activeResponses[k.toString()] = v.toString();
        });
      }
      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Active Quiz Questions (GET)
    if (path == '/api/quiz/active' && request.method == 'GET') {
      final String? activeJson = prefs.getString('local_active_quiz');
      if (activeJson != null) {
        _sendJsonResponse(request, json.decode(activeJson));
      } else {
        // Fallback: seed a default 5 question quiz
        final defaultQuiz = List.generate(5, (index) => {
          "q_index": index,
          "question": "Sample Question ${index + 1}",
          "optionA": "Option A",
          "optionB": "Option B",
          "optionC": "Option C",
          "optionD": "Option D",
          "correctAnswer": ["A", "B", "C", "D"][index % 4]
        });
        await prefs.setString('local_active_quiz', json.encode(defaultQuiz));
        _sendJsonResponse(request, defaultQuiz);
      }
      return;
    }

    // Upload Quizzes (POST)
    if (path == '/api/quiz/upload_multiple' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final List<dynamic> quizzes = data['quizzes'] ?? [];
      
      final Map<String, dynamic> existingQuizzes = {};
      final String? quizzesJson = prefs.getString('local_quizzes');
      if (quizzesJson != null) {
        try {
          existingQuizzes.addAll(json.decode(quizzesJson));
        } catch (_) {}
      }

      for (var q in quizzes) {
        final qId = q['quiz_id'];
        if (qId != null) {
          existingQuizzes[qId.toString()] = q['questions'];
        }
      }
      
      await prefs.setString('local_quizzes', json.encode(existingQuizzes));
      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Get List of Saved Quizzes (GET)
    if (path == '/api/quiz/list' && request.method == 'GET') {
      final String? quizzesJson = prefs.getString('local_quizzes');
      if (quizzesJson != null) {
        try {
          final Map<String, dynamic> decoded = json.decode(quizzesJson);
          _sendJsonResponse(request, decoded.keys.toList());
          return;
        } catch (_) {}
      }
      _sendJsonResponse(request, []);
      return;
    }

    // Setup New Quiz (POST)
    if (path == '/api/quiz/setup' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final List<dynamic> questions = data['questions'] ?? [];
      
      activeResponses.clear();
      activeQuizResponses.clear();

      await prefs.setString('local_active_quiz', json.encode(questions));
      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Activate a Quiz (POST)
    if (path == '/api/quiz/activate' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final String? qId = data['quiz_id']?.toString();
      
      activeResponses.clear();
      activeQuizResponses.clear();

      if (qId != null) {
        final String? quizzesJson = prefs.getString('local_quizzes');
        if (quizzesJson != null) {
          try {
            final Map<String, dynamic> decoded = json.decode(quizzesJson);
            final questions = decoded[qId];
            if (questions != null) {
              await prefs.setString('local_active_quiz', json.encode(questions));
              _sendJsonResponse(request, {"status": "success"});
              return;
            }
          } catch (_) {}
        }
      }
      _sendJsonResponse(request, {"status": "error", "message": "Quiz not found"});
      return;
    }

    // Delete a Quiz (POST)
    if (path == '/api/quiz/delete' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final String? qId = data['quiz_id']?.toString();
      if (qId != null) {
        final String? quizzesJson = prefs.getString('local_quizzes');
        if (quizzesJson != null) {
          try {
            final Map<String, dynamic> decoded = json.decode(quizzesJson);
            decoded.remove(qId);
            await prefs.setString('local_quizzes', json.encode(decoded));
          } catch (_) {}
        }
      }
      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Submit Response for a Question Index (POST)
    if (path == '/api/quiz/response' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final int? qIndex = data['q_index'] != null ? int.tryParse(data['q_index'].toString()) : null;
      final Map<String, dynamic> responses = data['responses'] ?? {};

      if (qIndex != null) {
        // Remove only THIS student's previous response for this question (not all students)
        responses.forEach((sid, val) {
          activeQuizResponses.removeWhere(
            (resp) => resp['q_index'] == qIndex && resp['student_id'] == sid
          );
          activeQuizResponses.add({
            "student_id": sid,
            "q_index": qIndex,
            "answer": val
          });
        });

        final String? activeJson = prefs.getString('local_active_quiz');
        if (activeJson != null) {
          final List<dynamic> questions = json.decode(activeJson);
          if (qIndex == questions.length - 1) {
            await _gradeAndLogCompletedQuiz(prefs, questions);
          }
        }
      }

      _sendJsonResponse(request, {"status": "success"});
      return;
    }

    // Get Active Quiz Results (GET)
    if (path == '/api/quiz/results' && request.method == 'GET') {
      final rosterList = await _getMergedRoster(prefs);
      final String? activeJson = prefs.getString('local_active_quiz');
      final List<dynamic> questions = activeJson != null ? json.decode(activeJson) : [];

      final Map<String, Map<String, String>> ansMap = {};
      for (var r in activeQuizResponses) {
        final sid = r['student_id'].toString();
        final qIdx = r['q_index'].toString();
        final ans = r['answer'].toString();
        if (!ansMap.containsKey(sid)) {
          ansMap[sid] = {};
        }
        ansMap[sid]![qIdx] = ans;
      }

      final List<Map<String, dynamic>> studentResults = [];
      for (var s in rosterList) {
        final sid = s['student_id'].toString();
        final sAnswers = ansMap[sid] ?? {};
        
        int score = 0;
        for (var q in questions) {
          final qIdx = q['q_index'].toString();
          final correct = q['correctAnswer'].toString();
          if (sAnswers[qIdx] == correct) {
            score++;
          }
        }

        studentResults.add({
          "student_id": sid,
          "name": s['name'],
          "score": score,
          "total": questions.length,
          "answers": sAnswers
        });
      }

      _sendJsonResponse(request, {
        "questions": questions,
        "student_results": studentResults
      });
      return;
    }

    // Authentic Credentials Check Mock (POST)
    if (path == '/api/auth/login' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final username = data['username']?.toString().toLowerCase().trim() ?? '';
      final password = data['password']?.toString() ?? '';

      if ((username == 'admin' && password == 'admin123') ||
          (username == 'teacher' && password == 'teacher123')) {
        _sendJsonResponse(request, {
          "status": "otp_required",
          "username": username,
          "otp_simulated": "123456" // Hardcode mock OTP code
        });
      } else {
        _sendJsonResponse(request, {
          "status": "error",
          "message": "Invalid username or password. (admin/admin123 or teacher/teacher123)"
        });
      }
      return;
    }

    // Authentic OTP Verification Mock (POST)
    if (path == '/api/auth/verify_otp' && request.method == 'POST') {
      final Map<String, dynamic> data = _parseBody(bodyBytes) ?? {};
      final username = data['username']?.toString().toLowerCase().trim() ?? '';
      final otp = data['otp']?.toString().trim() ?? '';

      if (otp == '123456') {
        final role = username == 'admin' ? 'Admin' : 'Teacher';
        
        // Cache the active session inside SharedPreferences
        await prefs.setString('session_token', 'offline_token');
        await prefs.setString('session_role', role);
        await prefs.setString('session_username', username);
        
        _sendJsonResponse(request, {
          "status": "success",
          "token": "offline_token",
          "role": role
        });
      } else {
        _sendJsonResponse(request, {
          "status": "error",
          "message": "Invalid passcode. Please enter 123456."
        });
      }
      return;
    }

    // Auth session verify check (GET)
    if (path == '/api/auth/check' && request.method == 'GET') {
      final String? role = prefs.getString('session_role');
      if (role != null) {
        _sendJsonResponse(request, {
          "status": "success",
          "role": role
        });
      } else {
        _sendJsonResponse(request, {
          "status": "error",
          "message": "No active session."
        });
      }
      return;
    }

    _sendErrorResponse(request, 404, "API route not found");
  }

  // --- PRIVATE HELPERS ---

  Future<void> _serveStaticFile(HttpRequest request, String path, int localPort) async {
    var fileUri = path == '/' ? '/index.html' : path;
    if (fileUri.startsWith('/')) {
      fileUri = fileUri.substring(1);
    }

    final folder = localPort == 8000 ? 'admin' : 'teacher';
    final assetPath = 'assets/web/$folder/$fileUri';

    try {
      final byteData = await rootBundle.load(assetPath);
      final bytes = byteData.buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes);

      String contentType = 'text/plain';
      List<int> responseBytes = bytes;

      if (fileUri.endsWith('.html')) {
        contentType = 'text/html; charset=utf-8';
        try {
          String htmlContent = utf8.decode(bytes);
          final role = localPort == 8000 ? 'Admin' : 'Teacher';
          final injection = '<head><script>'
              'localStorage.setItem("showanswer_session_token", "offline_token");'
              'localStorage.setItem("showanswer_session_role", "$role");'
              'localStorage.setItem("showanswer_session_username", "Teacher");'
              '</script>';
          htmlContent = htmlContent.replaceFirst(RegExp(r'<head>', caseSensitive: false), injection);
          responseBytes = utf8.encode(htmlContent);
        } catch (e) {
          print("[Server] Error injecting session into HTML: $e");
        }
      } else if (fileUri.endsWith('.js')) {
        contentType = 'application/javascript; charset=utf-8';
      } else if (fileUri.endsWith('.css')) {
        contentType = 'text/css; charset=utf-8';
      } else if (fileUri.endsWith('.png')) {
        contentType = 'image/png';
      } else if (fileUri.endsWith('.jpg') || fileUri.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      }

      request.response.headers.contentType = ContentType.parse(contentType);
      request.response.statusCode = HttpStatus.ok;
      request.response.add(responseBytes);
      await request.response.close();
    } catch (e) {
      _sendErrorResponse(request, 404, "Static asset not found on port $localPort: $e");
    }
  }

  Future<List<Map<String, dynamic>>> _getMergedRoster(SharedPreferences prefs) async {
    final String? rosterJson = prefs.getString('local_roster');
    if (rosterJson == null) return [];

    try {
      final decoded = json.decode(rosterJson);
      
      if (decoded is Map<String, dynamic>) {
        final List<Map<String, dynamic>> list = [];
        int index = 0;
        decoded.forEach((key, val) {
          list.add({
            "marker_id": index++,
            "student_id": key,
            "name": val.toString(),
            "class": "10",
            "section": "A"
          });
        });
        await prefs.setString('local_roster', json.encode(list));
        return list;
      }
      
      if (decoded is List) {
        final List<Map<String, dynamic>> list = [];
        for (var item in decoded) {
          if (item is Map) {
            final Map<String, dynamic> map = {};
            item.forEach((key, val) {
              map[key.toString()] = val;
            });
            list.add(map);
          }
        }
        return list;
      }
    } catch (e, stackTrace) {
      print("[Server Roster Error] Failed to decode local roster: $e\n$stackTrace");
    }

    return [];
  }

  Future<void> _gradeAndLogCompletedQuiz(SharedPreferences prefs, List<dynamic> questions) async {
    final rosterList = await _getMergedRoster(prefs);
    if (rosterList.isEmpty) return;

    final Map<String, List<String>> ansMap = {};
    for (var s in rosterList) {
      final sid = s['student_id'].toString();
      ansMap[sid] = List.filled(questions.length, '?');
    }

    for (var r in activeQuizResponses) {
      final sid = r['student_id'].toString();
      final qIdx = int.tryParse(r['q_index'].toString());
      final ans = r['answer'].toString();
      if (ansMap.containsKey(sid) && qIdx != null && qIdx >= 0 && qIdx < questions.length) {
        ansMap[sid]![qIdx] = ans;
      }
    }

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

    for (var s in rosterList) {
      final sid = s['student_id'].toString();
      final sAnswers = ansMap[sid]!;
      
      int score = 0;
      bool participated = false;
      for (int i = 0; i < questions.length; i++) {
        final correct = questions[i]['correctAnswer'].toString();
        final ans = sAnswers[i];
        if (ans != '?') {
          participated = true;
        }
        if (ans == correct) {
          score++;
        }
      }

      if (participated) {
        final record = {
          'student_id': sid,
          'name': s['name'],
          'class': s['class']?.toString().toUpperCase() ?? '10',
          'section': s['section']?.toString().toUpperCase() ?? 'A',
          'answers': sAnswers,
          'score': score,
          'total': questions.length,
          'timestamp': '$formattedTime (AR)',
        };
        decodedHistory.add(record);
      }
    }

    await prefs.setString('local_grades_history', json.encode(decodedHistory));
    print("[Server] Successfully graded and logged completed AR Quiz results.");
  }

  Future<bool> _proxyRequest(HttpRequest clientRequest, String serverIp, int port, List<int> bodyBytes) async {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 6);
    
    try {
      final pathWithQuery = clientRequest.uri.path + (clientRequest.uri.hasQuery ? '?${clientRequest.uri.query}' : '');
      final targetUri = Uri.parse('http://$serverIp:$port$pathWithQuery');
      final proxyRequest = await client.openUrl(clientRequest.method, targetUri);
      
      // Copy headers from client request to proxy request
      clientRequest.headers.forEach((name, values) {
        if (name != 'host' && name != 'content-length') {
          for (var value in values) {
            proxyRequest.headers.add(name, value);
          }
        }
      });
      
      // Copy body from client request to proxy request
      if (bodyBytes.isNotEmpty) {
        proxyRequest.add(bodyBytes);
      }
      
      final proxyResponse = await proxyRequest.close().timeout(const Duration(seconds: 10));
      
      // Copy status code and headers from proxy response to client response
      clientRequest.response.statusCode = proxyResponse.statusCode;
      
      // Clear default headers
      clientRequest.response.headers.clear();
      clientRequest.response.headers.add('Access-Control-Allow-Origin', '*');
      clientRequest.response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      clientRequest.response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      
      proxyResponse.headers.forEach((name, values) {
        if (name != 'access-control-allow-origin' && name != 'access-control-allow-methods' && name != 'access-control-allow-headers') {
          for (var val in values) {
            clientRequest.response.headers.add(name, val);
          }
        }
      });
      
      // Read response body bytes
      final responseBytes = await proxyResponse.fold<List<int>>([], (prev, element) => prev..addAll(element));
      
      // Cache responses locally for offline fallback
      if (proxyResponse.statusCode == 200) {
        final prefs = await SharedPreferences.getInstance();
        final path = clientRequest.uri.path;
        
        if (path == '/api/class' && clientRequest.method == 'GET') {
          await prefs.setString('local_roster', utf8.decode(responseBytes));
        } else if (path == '/api/quiz/active' && clientRequest.method == 'GET') {
          await prefs.setString('local_active_quiz', utf8.decode(responseBytes));
        } else if (path == '/api/quiz/list' && clientRequest.method == 'GET') {
          await prefs.setString('local_quizzes', utf8.decode(responseBytes));
        }
      }
      
      clientRequest.response.add(responseBytes);
      await clientRequest.response.close();
      return true;
    } catch (e) {
      print("[LocalServer] Proxy request to $serverIp failed: $e");
      return false;
    } finally {
      client.close();
    }
  }

  dynamic _parseBody(List<int> bodyBytes) {
    try {
      if (bodyBytes.isEmpty) return null;
      final body = utf8.decode(bodyBytes);
      return json.decode(body);
    } catch (e) {
      print("[Server] Error decoding request body: $e");
      return null;
    }
  }

  void _sendJsonResponse(HttpRequest request, dynamic data) {
    request.response.headers.contentType = ContentType.json;
    request.response.statusCode = HttpStatus.ok;
    request.response.write(json.encode(data));
    request.response.close();
  }

  void _sendErrorResponse(HttpRequest request, int statusCode, String message) {
    request.response.statusCode = statusCode;
    request.response.headers.contentType = ContentType.text;
    request.response.write(message);
    request.response.close();
  }
}
