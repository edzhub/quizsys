import 'dart:convert';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

class PdfGenerator {
  static double mm(double value) => value * 2.83464567;

  /// Generates the PDF containing A4-sized student ArUco cards.
  static Future<Uint8List> generateStudentCardsPdf(List<dynamic> cards) async {
    final pdf = pw.Document();

    for (var card in cards) {
      final name = card['name']?.toString() ?? 'Student';
      final studentId = card['student_id']?.toString() ?? '';
      final code = card['code']?.toString() ?? '0000000000000000';

      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: pw.EdgeInsets.zero,
          build: (pw.Context context) {
            return pw.Stack(
              children: [
                // Student Name
                pw.Positioned(
                  left: mm(20),
                  top: mm(25),
                  child: pw.SizedBox(
                    width: mm(170),
                    child: pw.Center(
                      child: pw.Text(
                        name,
                        style: pw.TextStyle(
                          fontSize: 24,
                          fontWeight: pw.FontWeight.bold,
                          color: PdfColors.black,
                        ),
                      ),
                    ),
                  ),
                ),
                // Student ID
                pw.Positioned(
                  left: mm(20),
                  top: mm(36),
                  child: pw.SizedBox(
                    width: mm(170),
                    child: pw.Center(
                      child: pw.Text(
                        'Student ID: $studentId',
                        style: const pw.TextStyle(
                          fontSize: 16,
                          color: PdfColors.grey700,
                        ),
                      ),
                    ),
                  ),
                ),

                // Top Edge Label (A)
                pw.Positioned(
                  left: mm(20),
                  top: mm(62),
                  child: pw.SizedBox(
                    width: mm(170),
                    child: pw.Center(
                      child: pw.Text(
                        'A',
                        style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                      ),
                    ),
                  ),
                ),

                // Right Edge Label (B)
                pw.Positioned(
                  left: mm(170),
                  top: mm(142),
                  child: pw.Text(
                    'B',
                    style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                  ),
                ),

                // Bottom Edge Label (C)
                pw.Positioned(
                  left: mm(20),
                  top: mm(222),
                  child: pw.SizedBox(
                    width: mm(170),
                    child: pw.Center(
                      child: pw.Text(
                        'C',
                        style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                      ),
                    ),
                  ),
                ),

                // Left Edge Label (D)
                pw.Positioned(
                  left: mm(35),
                  top: mm(142),
                  child: pw.Text(
                    'D',
                    style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                  ),
                ),

                // Central ArUco Marker
                pw.Positioned(
                  left: mm(45), // 210/2 - 120/2
                  top: mm(92),  // 297/2 - 120/2
                  child: pw.Stack(
                    children: [
                      // Black 6x6 marker background
                      pw.Container(
                        width: mm(120),
                        height: mm(120),
                        color: PdfColors.black,
                      ),
                      // Inner 4x4 data blocks
                      ...List.generate(16, (bitIdx) {
                        int y = bitIdx ~/ 4;
                        int x = bitIdx % 4;
                        if (code[bitIdx] == '1') {
                          return pw.Positioned(
                            left: mm((x + 1) * 20.0),
                            top: mm((y + 1) * 20.0),
                            child: pw.Container(
                              width: mm(20.0),
                              height: mm(20.0),
                              color: PdfColors.white,
                            ),
                          );
                        }
                        return pw.SizedBox();
                      }).where((w) => w is! pw.SizedBox),
                    ],
                  ),
                ),

                // Instructions Footer
                pw.Positioned(
                  left: mm(20),
                  bottom: mm(20),
                  child: pw.SizedBox(
                    width: mm(170),
                    child: pw.Center(
                      child: pw.Text(
                        '↑ Upright = A  |  → Rotate 90° CW = B  |  ↓ Flip = C  |  ← Rotate 90° CCW = D',
                        style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      );
    }

    return pdf.save();
  }

  /// Generates the PDF response sheet (A4 OCR template).
  static Future<Uint8List> generateResponseSheetPdf(List<dynamic> questions, String? questionImage) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.zero,
        build: (pw.Context context) {
          final List<pw.Widget> children = [
            // 4 Corner warp anchors
            pw.Positioned(left: mm(10), top: mm(10), child: pw.Container(width: mm(15), height: mm(15), color: PdfColors.black)),
            pw.Positioned(right: mm(10), top: mm(10), child: pw.Container(width: mm(15), height: mm(15), color: PdfColors.black)),
            pw.Positioned(left: mm(10), bottom: mm(10), child: pw.Container(width: mm(15), height: mm(15), color: PdfColors.black)),
            pw.Positioned(right: mm(10), bottom: mm(10), child: pw.Container(width: mm(15), height: mm(15), color: PdfColors.black)),

            // Top Center roman numeral header
            pw.Positioned(
              left: mm(20),
              top: mm(18),
              child: pw.SizedBox(
                width: mm(170),
                child: pw.Center(
                  child: pw.Text(
                    'I',
                    style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                  ),
                ),
              ),
            ),

            // Roll No Header
            pw.Positioned(
              left: mm(20),
              top: mm(31),
              child: pw.Text(
                'ROLL NO.',
                style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
              ),
            ),
          ];

          // 6 Roll number grid boxes
          for (int i = 0; i < 6; i++) {
            children.add(
              pw.Positioned(
                left: mm(20.0 + i * 14.0),
                top: mm(41),
                child: pw.Container(
                  width: mm(12),
                  height: mm(12),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.black, width: 1.5),
                    borderRadius: pw.BorderRadius.circular(2),
                  ),
                ),
              ),
            );
          }

          // Class Header & Box
          children.addAll([
            pw.Positioned(
              left: mm(141),
              top: mm(31),
              child: pw.SizedBox(
                width: mm(20),
                child: pw.Center(
                  child: pw.Text(
                    'CLASS',
                    style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                  ),
                ),
              ),
            ),
            pw.Positioned(
              left: mm(145),
              top: mm(41),
              child: pw.Container(
                width: mm(12),
                height: mm(12),
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.black, width: 1.5),
                  borderRadius: pw.BorderRadius.circular(2),
                ),
              ),
            ),
          ]);

          // Section Header & Box
          children.addAll([
            pw.Positioned(
              left: mm(171),
              top: mm(28),
              child: pw.SizedBox(
                width: mm(20),
                child: pw.Center(
                  child: pw.Text(
                    'SECTIO\nN',
                    textAlign: pw.TextAlign.center,
                    style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                  ),
                ),
              ),
            ),
            pw.Positioned(
              left: mm(175),
              top: mm(41),
              child: pw.Container(
                width: mm(12),
                height: mm(12),
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.black, width: 1.5),
                  borderRadius: pw.BorderRadius.circular(2),
                ),
              ),
            ),
          ]);

          // Instruction Label
          children.add(
            pw.Positioned(
              left: mm(20),
              top: mm(68),
              child: pw.Text(
                'Answer the following questions:',
                style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
              ),
            ),
          );

          // Questions & Answer Boxes placed dynamically next to each other
          const double startY = 82.0;
          const double endY = 240.0;
          final double availableHeight = endY - startY;
          final double stepY = availableHeight / 5.0;

          for (int i = 0; i < 5; i++) {
            final double topMm = startY + i * stepY;

            String qText = '${i + 1}. Question ${i + 1}';
            List<String> qChoices = ['A. ', 'B. ', 'C. ', 'D. '];

            if (i < questions.length) {
              final q = questions[i];
              qText = q['text']?.toString() ?? '';
              final choices = q['choices'];
              if (choices is List) {
                qChoices = choices.map((c) => c.toString()).toList();
              }
            }

            while (qChoices.length < 4) {
              qChoices.add('');
            }

            // Question block (left = 20mm, top = topMm, width = 145mm, height = stepY - 2)
            children.add(
              pw.Positioned(
                left: mm(20),
                top: mm(topMm),
                child: pw.SizedBox(
                  width: mm(145),
                  height: mm(stepY - 2),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    mainAxisAlignment: pw.MainAxisAlignment.center,
                    children: [
                      pw.Text(
                        qText,
                        style: pw.TextStyle(fontSize: 9.5, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                        maxLines: 2,
                        overflow: pw.TextOverflow.clip,
                      ),
                      pw.SizedBox(height: 2),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Row(
                            children: [
                              pw.Expanded(
                                child: pw.Text(
                                  qChoices[0],
                                  style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.black),
                                ),
                              ),
                              pw.Expanded(
                                child: pw.Text(
                                  qChoices[1],
                                  style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.black),
                                ),
                              ),
                            ],
                          ),
                          pw.SizedBox(height: 2),
                          pw.Row(
                            children: [
                              pw.Expanded(
                                child: pw.Text(
                                  qChoices[2],
                                  style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.black),
                                ),
                              ),
                              pw.Expanded(
                                child: pw.Text(
                                  qChoices[3],
                                  style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.black),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );

            // Answer Box next to the question (left = 175mm, top = topMm, width = 12mm, height = 12mm)
            children.add(
              pw.Positioned(
                left: mm(175),
                top: mm(topMm),
                child: pw.Container(
                  width: mm(12),
                  height: mm(12),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.black, width: 1.5),
                    borderRadius: pw.BorderRadius.circular(2),
                  ),
                ),
              ),
            );
          }

          // Custom syllabus reference image (Base64) at bottom
          if (questionImage != null && questionImage.isNotEmpty) {
            try {
              final bytes = base64Decode(questionImage.split(',')[1]);
              final image = pw.MemoryImage(bytes);
              children.add(
                pw.Positioned(
                  left: mm(20),
                  top: mm(240),
                  child: pw.SizedBox(
                    width: mm(170),
                    height: mm(32),
                    child: pw.Image(image, fit: pw.BoxFit.contain),
                  ),
                ),
              );
            } catch (e) {
              print("[PdfGenerator Error] Failed to render base64 image: $e");
            }
          }

          // Footer info text
          children.add(
            pw.Positioned(
              left: mm(20),
              bottom: mm(20),
              child: pw.SizedBox(
                width: mm(170),
                child: pw.Container(
                  padding: pw.EdgeInsets.only(top: mm(4)),
                  child: pw.Center(
                    child: pw.Text(
                      'Write letters clearly in UPPERCASE (e.g., A, B, C, D) inside the boxes.',
                      style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey500),
                    ),
                  ),
                ),
              ),
            ),
          );

          return pw.Stack(children: children);
        },
      ),
    );

    return pdf.save();
  }
}
