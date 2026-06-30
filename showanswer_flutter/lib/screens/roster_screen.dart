import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class RosterScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const RosterScreen({super.key, required this.onLogout});

  @override
  State<RosterScreen> createState() => _RosterScreenState();
}

class _RosterScreenState extends State<RosterScreen> {
  List<Map<String, dynamic>> _roster = [];
  final TextEditingController _idController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _classController = TextEditingController(text: '10');
  final TextEditingController _secController = TextEditingController(text: 'A');
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRoster();
  }

  Future<void> _loadServerRoster() async {
    final prefs = await SharedPreferences.getInstance();
    final serverIp = prefs.getString('server_ip');
    if (serverIp == null || serverIp.isEmpty) return;

    try {
      final uri = Uri.parse('http://$serverIp:8000/api/class');
      final response = await http.get(uri).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        final roster = decoded is List
            ? decoded
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : <Map<String, dynamic>>[];

        await prefs.setString('local_roster', json.encode(roster));
        if (mounted) {
          setState(() {
            _roster = roster;
            _isLoading = false;
          });
        }
        return;
      }
    } catch (_) {
      // Fall back to the cached roster if the server cannot be reached.
    }
  }

  Future<void> _loadRoster() async {
    final prefs = await SharedPreferences.getInstance();
    await _loadServerRoster();

    final String? rosterJson = prefs.getString('local_roster');
    if (rosterJson != null) {
      try {
        final decoded = json.decode(rosterJson);
        if (decoded is List) {
          if (mounted) {
            setState(() {
              _roster = decoded.map((v) => Map<String, dynamic>.from(v)).toList();
              _isLoading = false;
            });
          }
        } else if (decoded is Map) {
          // Migrate old Map<String, String> format to List
          final List<Map<String, dynamic>> migrated = [];
          int markerId = 0;
          decoded.forEach((key, val) {
            migrated.add({
              "marker_id": markerId++,
              "student_id": key.toString(),
              "name": val.toString(),
              "class": "10",
              "section": "A"
            });
          });
          if (mounted) {
            setState(() {
              _roster = migrated;
              _isLoading = false;
            });
          }
          await _saveRoster();
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }
      }
    } else {
      _roster = [];
      await _saveRoster();
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _saveRoster() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('local_roster', json.encode(_roster));
  }

  void _addStudent() {
    final String id = _idController.text.trim();
    final String name = _nameController.text.trim();
    final String classVal = _classController.text.trim().toUpperCase();
    final String secVal = _secController.text.trim().toUpperCase();

    if (id.isEmpty || name.isEmpty || classVal.isEmpty || secVal.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all roster fields.')),
      );
      return;
    }

    if (_roster.any((s) => s['student_id'] == id)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('A student with this Roll No. already exists.')),
      );
      return;
    }

    // Auto-allocate next available Card / Marker ID
    int nextMarkerId = 0;
    while (_roster.any((s) => s['marker_id'] == nextMarkerId)) {
      nextMarkerId++;
    }

    setState(() {
      _roster.add({
        'marker_id': nextMarkerId,
        'student_id': id,
        'name': name,
        'class': classVal,
        'section': secVal,
      });
    });
    _saveRoster();
    
    _idController.clear();
    _nameController.clear();
    _classController.text = '10';
    _secController.text = 'A';
    Navigator.of(context).pop(); // Close bottom sheet
  }

  void _deleteStudent(String id) {
    setState(() {
      _roster.removeWhere((s) => s['student_id'] == id);
    });
    _saveRoster();
  }

  void _showAddStudentBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF18181B), // Dark Grey Card
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom + 24,
            left: 24.0,
            right: 24.0,
            top: 24.0,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Add New Student',
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 20.0,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFF4F4F5),
                ),
              ),
              const SizedBox(height: 20.0),
              TextField(
                controller: _idController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Roll No. / ID',
                  hintText: 'e.g., 220006',
                ),
                style: const TextStyle(color: Color(0xFFF4F4F5)),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  hintText: 'e.g., Gaurav Sen',
                ),
                style: const TextStyle(color: Color(0xFFF4F4F5)),
              ),
              const SizedBox(height: 16.0),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _classController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Class',
                        hintText: 'e.g., 10',
                      ),
                      style: const TextStyle(color: Color(0xFFF4F4F5)),
                    ),
                  ),
                  const SizedBox(width: 16.0),
                  Expanded(
                    child: TextField(
                      controller: _secController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Section',
                        hintText: 'e.g., A',
                      ),
                      style: const TextStyle(color: Color(0xFFF4F4F5)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24.0),
              ElevatedButton(
                onPressed: _addStudent,
                child: const Text('Add Student'),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Sort roster alphabetically by student name
    final sortedRoster = List<Map<String, dynamic>>.from(_roster)
      ..sort((a, b) => a['name'].toString().compareTo(b['name'].toString()));

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Student Roster',
          style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline, color: Color(0xFFD4FC34), size: 28),
            onPressed: _showAddStudentBottomSheet,
          ),
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
          : sortedRoster.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          '👥',
                          style: TextStyle(fontSize: 60.0),
                        ),
                        const SizedBox(height: 16.0),
                        const Text(
                          'No Students in Roster',
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 18.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFF4F4F5),
                          ),
                        ),
                        const SizedBox(height: 8.0),
                        const Text(
                          'Add students manually to sync Card IDs for AR Polling and Roll numbers for OCR Scanning.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFFA1A1AA)),
                        ),
                        const SizedBox(height: 24.0),
                        ElevatedButton(
                          onPressed: _showAddStudentBottomSheet,
                          child: const Text('Add Student'),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(20.0),
                  itemCount: sortedRoster.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 12.0),
                  itemBuilder: (context, index) {
                    final student = sortedRoster[index];
                    final String id = student['student_id'].toString();
                    final String name = student['name'].toString();
                    final int markerId = (student['marker_id'] as num).toInt();
                    final String classVal = (student['class'] ?? '10').toString();
                    final String secVal = (student['section'] ?? 'A').toString();

                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
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
                                ),
                                const SizedBox(height: 6.0),
                                Text(
                                  'Roll No: $id • Class: $classVal ($secVal) • Card ID: $markerId',
                                  style: const TextStyle(
                                    fontFamily: 'Outfit',
                                    fontSize: 12.0,
                                    color: Color(0xFFA1A1AA),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                            onPressed: () => _deleteStudent(id),
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
