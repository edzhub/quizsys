import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:permission_handler/permission_handler.dart';

class GradesScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const GradesScreen({super.key, required this.onLogout});

  @override
  State<GradesScreen> createState() => GradesScreenState();
}

class GradesScreenState extends State<GradesScreen> {
  List<Map<String, dynamic>> _gradesHistory = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    loadGradesHistory();
  }

  Future<void> loadGradesHistory() async {
    final prefs = await SharedPreferences.getInstance();
    final String? historyJson = prefs.getString('local_grades_history');
    if (historyJson != null) {
      try {
        final List<dynamic> decoded = json.decode(historyJson);
        setState(() {
          _gradesHistory = decoded.map((val) => Map<String, dynamic>.from(val)).toList();
          _isLoading = false;
        });
      } catch (_) {
        setState(() {
          _isLoading = false;
        });
      }
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('local_grades_history');
    setState(() {
      _gradesHistory.clear();
    });
  }

  String _generateCsvString() {
    final StringBuffer buffer = StringBuffer();
    // CSV Header
    buffer.writeln('Timestamp,Roll No,Name,Q1,Q2,Q3,Q4,Q5,Score,Total');
    
    for (var grade in _gradesHistory) {
      final String timestamp = grade['timestamp'] ?? '';
      final String id = grade['student_id'] ?? '';
      final String name = grade['name'] ?? '';
      final List<dynamic> answers = grade['answers'] ?? [];
      final int score = (grade['score'] as num).toInt();
      final int total = (grade['total'] as num).toInt();

      final String q1 = answers.isNotEmpty ? answers[0] : '';
      final String q2 = answers.length > 1 ? answers[1] : '';
      final String q3 = answers.length > 2 ? answers[2] : '';
      final String q4 = answers.length > 3 ? answers[3] : '';
      final String q5 = answers.length > 4 ? answers[4] : '';

      buffer.writeln('"$timestamp","$id","$name","$q1","$q2","$q3","$q4","$q5",$score,$total');
    }
    return buffer.toString();
  }

  Future<void> _exportCsv() async {
    if (_gradesHistory.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No grades history available to export.')),
      );
      return;
    }

    final String csvContent = _generateCsvString();
    
    // 1. Copy to clipboard
    await Clipboard.setData(ClipboardData(text: csvContent));
    
    // 2. Save as file in Download Directory
    String fileMessage = '';
    bool savedInDownloads = false;
    
    try {
      if (Platform.isAndroid) {
        // Request storage permission
        final status = await Permission.storage.request();
        if (status.isGranted) {
          final downloadDir = Directory('/storage/emulated/0/Download');
          if (await downloadDir.exists()) {
            final File file = File('${downloadDir.path}/showanswer_grades.csv');
            await file.writeAsString(csvContent);
            fileMessage = 'Saved file to Download folder:\n${file.path}';
            savedInDownloads = true;
          }
        }
      }
    } catch (e) {
      print("Failed to save to public Downloads folder: $e");
    }

    // Fallback if not saved in public Downloads folder
    if (!savedInDownloads) {
      try {
        final Directory? appDocDir = await getExternalStorageDirectory() ?? await getApplicationDocumentsDirectory();
        if (appDocDir != null) {
          final File file = File('${appDocDir.path}/showanswer_grades.csv');
          await file.writeAsString(csvContent);
          fileMessage = 'Saved to app storage:\n${file.path}\n\n(Public Download folder was not accessible)';
        }
      } catch (e) {
        fileMessage = 'Failed to write file. Copy-pasted to clipboard instead.';
      }
    }

    if (mounted) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: const Color(0xFF18181B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16.0)),
          title: const Text(
            'Grades Exported successfully',
            style: TextStyle(color: Color(0xFFD4FC34), fontWeight: FontWeight.bold),
          ),
          content: Text(
            '1. CSV text copied to your Clipboard! You can paste it into WhatsApp, Email, or Excel.\n\n'
            '2. $fileMessage',
            style: const TextStyle(color: Color(0xFFF4F4F5), height: 1.5),
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
  }

  Widget _buildDashboardCard() {
    int totalAttempted = _gradesHistory.length;
    int totalCorrect = 0;
    int totalPossible = 0;
    for (var grade in _gradesHistory) {
      totalCorrect += (grade['score'] as num).toInt();
      totalPossible += (grade['total'] as num).toInt();
    }
    double classAccuracy = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 16.0),
      padding: const EdgeInsets.all(20.0),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFFD4FC34).withOpacity(0.15),
            const Color(0xFF18181B),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20.0),
        border: Border.all(
          color: const Color(0xFFD4FC34).withOpacity(0.2),
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '📊 Class Performance Analysis',
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 16.0,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFD4FC34),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFD4FC34).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'OCR Summary',
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 11.0,
                    color: Color(0xFFD4FC34),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16.0),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Total Attempted',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 12.0,
                        color: Color(0xFFA1A1AA),
                      ),
                    ),
                    const SizedBox(height: 4.0),
                    Text(
                      '$totalAttempted Student${totalAttempted == 1 ? '' : 's'}',
                      style: const TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 20.0,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFF4F4F5),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 1,
                height: 40,
                color: Colors.white.withOpacity(0.1),
              ),
              const SizedBox(width: 16.0),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Overall Accuracy',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 12.0,
                        color: Color(0xFFA1A1AA),
                      ),
                    ),
                    const SizedBox(height: 4.0),
                    Text(
                      '${classAccuracy.toStringAsFixed(1)}%',
                      style: const TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 20.0,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFD4FC34),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Graded Quizzes',
          style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          if (_gradesHistory.isNotEmpty) ...[
            IconButton(
              icon: const Icon(Icons.share, color: Color(0xFFD4FC34)),
              onPressed: _exportCsv,
              tooltip: 'Export CSV',
            ),
            IconButton(
              icon: const Icon(Icons.delete_sweep, color: Color(0xFFEF4444)),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    backgroundColor: const Color(0xFF18181B),
                    title: const Text('Clear Grades Log?'),
                    content: const Text('This will delete all scanned quiz results. This cannot be undone.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Cancel', style: TextStyle(color: Colors.white)),
                      ),
                      TextButton(
                        onPressed: () {
                          _clearHistory();
                          Navigator.of(context).pop();
                        },
                        child: const Text('Clear', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                );
              },
              tooltip: 'Clear Grades Log',
            ),
          ],
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
            onPressed: widget.onLogout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFD4FC34)),
              ),
            )
          : _gradesHistory.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          '📈',
                          style: TextStyle(fontSize: 60.0),
                        ),
                        const SizedBox(height: 16.0),
                        const Text(
                          'No Graded History Yet',
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 18.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFF4F4F5),
                          ),
                        ),
                        const SizedBox(height: 8.0),
                        const Text(
                          'Use the Scanner tab to evaluate physical student answer sheets.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFFA1A1AA)),
                        ),
                      ],
                    ),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.fromLTRB(20.0, 20.0, 20.0, 0.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildDashboardCard(),
                      Expanded(
                        child: ListView.separated(
                          padding: const EdgeInsets.only(bottom: 20.0),
                          itemCount: _gradesHistory.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12.0),
                          itemBuilder: (context, index) {
                            // Show in reverse chronological order (newest first)
                            final record = _gradesHistory[_gradesHistory.length - 1 - index];
                            final String id = record['student_id'] ?? '';
                            final String name = record['name'] ?? '';
                            final String time = record['timestamp'] ?? '';
                            final int score = (record['score'] as num).toInt();
                            final int total = (record['total'] as num).toInt();
                            final bool isPass = score >= (total / 2.0);

                            return Container(
                              padding: const EdgeInsets.all(18.0),
                              decoration: BoxDecoration(
                                color: const Color(0xFF18181B), // Dark Grey Card
                                borderRadius: BorderRadius.circular(16.0),
                                border: Border.all(
                                  color: Colors.white.withOpacity(0.06),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          name,
                                          style: const TextStyle(
                                            fontFamily: 'Outfit',
                                            fontSize: 16.0,
                                            fontWeight: FontWeight.bold,
                                            color: Color(0xFFF4F4F5),
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4.0),
                                        Text(
                                          'Roll No: $id • Class: ${record['class'] ?? '-'}${record['section'] != null ? ' (${record['section']})' : ''}',
                                          style: const TextStyle(
                                            fontFamily: 'Outfit',
                                            fontSize: 13.0,
                                            color: Color(0xFFA1A1AA),
                                          ),
                                        ),
                                        const SizedBox(height: 8.0),
                                        Text(
                                          time,
                                          style: const TextStyle(
                                            fontFamily: 'Outfit',
                                            fontSize: 11.0,
                                            color: Color(0xFF71717A),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                                    decoration: BoxDecoration(
                                      color: isPass 
                                          ? const Color(0xFF10B981).withOpacity(0.08) 
                                          : const Color(0xFFEF4444).withOpacity(0.08),
                                      borderRadius: BorderRadius.circular(20.0),
                                      border: Border.all(
                                          color: isPass 
                                              ? const Color(0xFF10B981).withOpacity(0.2) 
                                              : const Color(0xFFEF4444).withOpacity(0.2),
                                      ),
                                    ),
                                    child: Text(
                                      '$score / $total',
                                      style: TextStyle(
                                        fontFamily: 'Outfit',
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16.0,
                                        color: isPass ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
