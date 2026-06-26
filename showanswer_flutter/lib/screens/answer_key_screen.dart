import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AnswerKeyScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const AnswerKeyScreen({super.key, required this.onLogout});

  @override
  State<AnswerKeyScreen> createState() => _AnswerKeyScreenState();
}

class _AnswerKeyScreenState extends State<AnswerKeyScreen> {
  List<String> _answerKey = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAnswerKey();
  }

  Future<void> _loadAnswerKey() async {
    final prefs = await SharedPreferences.getInstance();
    final String? keyJson = prefs.getString('local_answer_key');
    if (keyJson != null) {
      try {
        final List<dynamic> decoded = json.decode(keyJson);
        setState(() {
          _answerKey = decoded.map((val) => val.toString()).toList();
          _isLoading = false;
        });
      } catch (_) {
        setState(() {
          _isLoading = false;
        });
      }
    } else {
      // Seed default key (all A's or dynamic default)
      _answerKey = ['A', 'B', 'C', 'D', 'A'];
      await _saveAnswerKey();
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _saveAnswerKey() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('local_answer_key', json.encode(_answerKey));
  }

  void _selectOption(int qIndex, String option) {
    setState(() {
      _answerKey[qIndex] = option;
    });
    _saveAnswerKey();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Quiz Answer Key',
          style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
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
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B), // Dark Grey Card
                      borderRadius: BorderRadius.circular(20.0),
                      border: Border.all(color: Colors.white.withOpacity(0.06)),
                    ),
                    child: const Row(
                      children: [
                        Text(
                          '✏️',
                          style: TextStyle(fontSize: 24.0),
                        ),
                        SizedBox(width: 16.0),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Configure Quiz Key',
                                style: TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 16.0,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFFF4F4F5),
                                ),
                              ),
                              SizedBox(height: 4.0),
                              Text(
                                'Tap options below to set the correct answers for Q1 to Q5.',
                                style: TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 13.0,
                                  color: Color(0xFFA1A1AA),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24.0),
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _answerKey.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 16.0),
                    itemBuilder: (context, index) {
                      final currentAns = _answerKey[index];
                      final options = ['A', 'B', 'C', 'D'];

                      return Container(
                        padding: const EdgeInsets.all(20.0),
                        decoration: BoxDecoration(
                          color: const Color(0xFF18181B),
                          borderRadius: BorderRadius.circular(18.0),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.06),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Question ${index + 1}',
                              style: const TextStyle(
                                fontFamily: 'Outfit',
                                fontSize: 16.0,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFF4F4F5),
                              ),
                            ),
                            const SizedBox(height: 16.0),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: options.map((opt) {
                                final isSelected = currentAns == opt;
                                return GestureDetector(
                                  onTap: () => _selectOption(index, opt),
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 150),
                                    width: 58,
                                    height: 52,
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? const Color(0xFFD4FC34)
                                          : const Color(0xFF27272A),
                                      borderRadius: BorderRadius.circular(12.0),
                                      border: Border.all(
                                        color: isSelected
                                            ? const Color(0xFFD4FC34)
                                            : const Color(0xFF3F3F46),
                                      ),
                                    ),
                                    child: Center(
                                      child: Text(
                                        opt,
                                        style: TextStyle(
                                          fontFamily: 'Outfit',
                                          fontWeight: FontWeight.bold,
                                          fontSize: 16.0,
                                          color: isSelected
                                              ? const Color(0xFF09090B)
                                              : const Color(0xFFF4F4F5),
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 32.0),
                ],
              ),
            ),
    );
  }
}
