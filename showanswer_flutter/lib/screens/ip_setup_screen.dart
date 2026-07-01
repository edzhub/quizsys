import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'camera_scanner_screen.dart';

class IpSetupScreen extends StatefulWidget {
  const IpSetupScreen({super.key});

  @override
  State<IpSetupScreen> createState() => _IpSetupScreenState();
}

class _IpSetupScreenState extends State<IpSetupScreen> {
  final TextEditingController _ipController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadCachedIp();
  }

  void _loadCachedIp() async {
    final prefs = await SharedPreferences.getInstance();
    final String? cached = prefs.getString('server_ip');
    if (cached != null) {
      _ipController.text = cached;
    }
  }

  Future<void> _testAndSaveConnection() async {
    final String ip = _ipController.text.trim();
    if (ip.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter a valid IP address or hostname';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    // Strip http:// or https:// if user entered it, as we will prepend it
    String formattedIp = ip;
    if (formattedIp.startsWith('http://')) {
      formattedIp = formattedIp.substring(7);
    } else if (formattedIp.startsWith('https://')) {
      formattedIp = formattedIp.substring(8);
    }
    // Remove trailing slashes
    if (formattedIp.endsWith('/')) {
      formattedIp = formattedIp.substring(0, formattedIp.length - 1);
    }

    final String targetUrl = 'http://$formattedIp:8000/api/server-info';

    try {
      final response = await http.get(Uri.parse(targetUrl)).timeout(
        const Duration(seconds: 5),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data is Map && data.containsKey('local_ip')) {
          // Success! Save the connection to preferences
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('server_ip', formattedIp);

          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (context) => CameraScannerScreen(serverIp: formattedIp),
              ),
            );
          }
          return;
        }
      }
      
      setState(() {
        _errorMessage = 'Failed to connect. Make sure ShowAnswer server is running on PC.';
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Connection timeout. Check if both devices are on the same Wi-Fi.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Background Premium Radial Gradient
          Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.0, -0.5),
                radius: 1.2,
                colors: [
                  Color(0xFF18181B), // Charcoal Dark Grey
                  Color(0xFF09090B), // Carbon Black
                ],
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(28.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Icon Badge
                    Center(
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: const Color(0xFF18181B),
                          borderRadius: BorderRadius.circular(24.0),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.08),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.2),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: Text(
                            '📹',
                            style: TextStyle(fontSize: 40.0),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24.0),
                    // Title
                    const Center(
                      child: Text(
                        'ShowAnswer Scanner',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 26.0,
                          fontWeight: FontWeight.bold,
                          letterSpacing: -0.8,
                          color: Color(0xFFF4F4F5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8.0),
                    const Center(
                      child: Text(
                        'Enter your PC\'s local IP address to sync.',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 15.0,
                          color: Color(0xFFA1A1AA),
                        ),
                      ),
                    ),
                    const SizedBox(height: 40.0),
                    // Card Wrapper for Inputs
                    Container(
                      padding: const EdgeInsets.all(24.0),
                      decoration: BoxDecoration(
                        color: const Color(0xFF18181B),
                        borderRadius: BorderRadius.circular(24.0),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.08),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.3),
                            blurRadius: 20,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Server Host IP',
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontWeight: FontWeight.w600,
                              fontSize: 14.0,
                              color: Color(0xFFF4F4F5),
                            ),
                          ),
                          const SizedBox(height: 10.0),
                          TextField(
                            controller: _ipController,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                              signed: false,
                            ),
                            decoration: const InputDecoration(
                              hintText: 'e.g., 192.168.1.105',
                              prefixIcon: Icon(
                                Icons.settings_ethernet,
                                color: Color(0xFFA1A1AA),
                              ),
                            ),
                            style: const TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 16.0,
                              color: Color(0xFFF4F4F5),
                            ),
                            autocorrect: false,
                            enableSuggestions: false,
                          ),
                          const SizedBox(height: 20.0),
                          if (_errorMessage != null) ...[
                            Container(
                              padding: const EdgeInsets.all(12.0),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444).withOpacity(0.08),
                                borderRadius: BorderRadius.circular(8.0),
                                border: Border.all(
                                  color: const Color(0xFFEF4444).withOpacity(0.2),
                                ),
                              ),
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 13.0,
                                  color: Color(0xFFEF4444),
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                            const SizedBox(height: 20.0),
                          ],
                          ElevatedButton(
                            onPressed: _isLoading ? null : _testAndSaveConnection,
                            child: _isLoading
                                ? const SizedBox(
                                    width: 20.0,
                                    height: 20.0,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.0,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        Color(0xFF09090B),
                                      ),
                                    ),
                                  )
                                : const Text('Connect to Server ➔'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32.0),
                    // Instructions
                    const Text(
                      'How to find your local IP:\n'
                      '1. Open the ShowAnswer Teacher Portal on your PC.\n'
                      '2. Look at the network/address bar or check the server pairing card.\n'
                      '3. Ensure both devices are on the exact same Wi-Fi router network.',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 12.0,
                        color: Color(0xFF71717A),
                        height: 1.6,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
