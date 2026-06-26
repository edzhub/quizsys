import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

class OcrService {
  /// Sends the base64-encoded image to the ShowAnswer backend server for RapidOCR scanning.
  /// Resizes the image to max 1280px on the long side before sending to keep payload small.
  static Future<Map<String, dynamic>> scanImage({
    required String serverIp,
    required String base64Image,
  }) async {
    final String targetUrl = 'http://$serverIp:8002/api/ocr/scan';

    try {
      // Decode and resize the image before sending
      final String compressedBase64 = _resizeAndCompress(base64Image);

      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: json.encode({
          'image': compressedBase64,
        }),
      ).timeout(
        const Duration(seconds: 120),
      );

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        return data;
      } else {
        return {
          'status': 'error',
          'message': 'Server responded with status code ${response.statusCode}',
        };
      }
    } on SocketException catch (e) {
      return {
        'status': 'error',
        'message': 'socket:${e.message}',
      };
    } on TimeoutException {
      return {
        'status': 'error',
        'message':
            'timeout:Request timed out after 120 seconds. Make sure the Python server is running and on the same Wi-Fi.',
      };
    } catch (e) {
      return {
        'status': 'error',
        'message': 'Failed to connect: ${e.toString()}',
      };
    }
  }

  /// Uploads a single page of a student sheet to the queue
  static Future<Map<String, dynamic>> uploadPage({
    required String serverIp,
    required int studentIndex,
    required int pageNumber,
    required String base64Image,
  }) async {
    final String targetUrl = 'http://$serverIp:8002/api/ocr/upload-page';

    try {
      final String compressedBase64 = _resizeAndCompress(base64Image);

      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: json.encode({
          'student_index': studentIndex,
          'page_number': pageNumber,
          'image': compressedBase64,
        }),
      ).timeout(
        const Duration(seconds: 60),
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        return {
          'status': 'error',
          'message': 'Upload failed with status code ${response.statusCode}',
        };
      }
    } on SocketException catch (e) {
      return {
        'status': 'error',
        'message': 'socket:${e.message}',
      };
    } on TimeoutException {
      return {
        'status': 'error',
        'message': 'timeout:Upload request timed out.',
      };
    } catch (e) {
      return {
        'status': 'error',
        'message': 'Failed to upload page: ${e.toString()}',
      };
    }
  }

  /// Triggers batch processing on the server
  static Future<Map<String, dynamic>> processBatch({
    required String serverIp,
  }) async {
    final String targetUrl = 'http://$serverIp:8002/api/ocr/process-batch';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ).timeout(
        const Duration(seconds: 240), // Large timeout for batch OCR processing
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        return {
          'status': 'error',
          'message': 'Batch processing failed with status code ${response.statusCode}',
        };
      }
    } on SocketException catch (e) {
      return {
        'status': 'error',
        'message': 'socket:${e.message}',
      };
    } on TimeoutException {
      return {
        'status': 'error',
        'message': 'timeout:Batch processing request timed out. Please check server logs.',
      };
    } catch (e) {
      return {
        'status': 'error',
        'message': 'Failed to run batch process: ${e.toString()}',
      };
    }
  }

  /// Decodes base64 JPEG, resizes to max 1280px on the long side, re-encodes as JPEG quality 85.
  /// Falls back to the original if the image package fails.
  static String _resizeAndCompress(String base64Input) {
    try {
      final bytes = base64Decode(base64Input);
      img.Image? decoded = img.decodeImage(bytes);
      if (decoded == null) return base64Input;

      const int maxDim = 1280;
      if (decoded.width > maxDim || decoded.height > maxDim) {
        decoded = img.copyResize(
          decoded,
          width: decoded.width > decoded.height ? maxDim : -1,
          height: decoded.height >= decoded.width ? maxDim : -1,
        );
      }

      final List<int> compressed = img.encodeJpg(decoded, quality: 85);
      return base64Encode(compressed);
    } catch (_) {
      // If anything fails, just send original
      return base64Input;
    }
  }
}

// For SocketException + TimeoutException to be recognized
class TimeoutException implements Exception {
  final String? message;
  const TimeoutException([this.message]);
  @override
  String toString() => 'TimeoutException: $message';
}
