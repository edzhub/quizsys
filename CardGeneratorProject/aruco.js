/*
Copyright (c) 2020 Damiano Falcioni
Copyright (c) 2011 Juan Mellado
HI
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
References:
- "ArUco: a minimal library for Augmented Reality applications based on OpenCv"
  http://www.uco.es/investiga/grupos/ava/node/26
- "js-aruco: a port to JavaScript of the ArUco library"
  https://github.com/jcmellado/js-aruco
*/

var AR = {};
var CV = this.CV || require('./cv').CV;
this.AR = AR;

AR.DICTIONARIES = {
  DICT_4X4_1000: {
    nBits: 16,
    tau: 3,
    codeList: [[173, 50], [240, 154], [204, 45], [153, 70], [42, 158], [158, 205], [121, 46], [35, 242], [127, 218], [243, 86], [159, 145], [136, 167], [112, 183], [84, 15], [36, 177], [100, 62], [98, 101], [102, 0], [54, 94], [110, 175], [97, 139], [13, 43], [51, 213], [187, 130], [127, 71], [41, 113], [53, 228], [165, 84], [132, 35], [44, 111], [34, 21], [234, 178], [121, 207], [15, 203], [16, 174], [144, 41], [24, 117], [32, 255], [176, 246], [56, 90], [232, 24], [84, 40], [76, 140], [28, 178], [36, 232], [116, 235], [180, 63], [210, 100], [10, 46], [10, 19], [138, 148], [170, 104], [186, 65], [250, 151], [22, 1], [22, 103], [134, 36], [134, 233], [214, 18], [246, 229], [230, 223], [126, 27], [1, 160], [193, 68], [209, 162], [201, 122], [33, 108], [161, 42], [161, 156], [57, 137], [249, 161], [221, 124], [61, 4], [109, 91], [253, 200], [237, 171], [83, 31], [147, 98], [155, 88], [203, 213], [51, 152], [227, 160], [163, 55], [151, 93], [159, 37], [223, 187], [119, 42], [239, 77], [172, 117], [81, 173], [110, 23], [80, 207], [96, 75], [180, 193], [146, 216], [194, 244], [242, 54], [242, 211], [150, 228], [14, 199], [94, 110], [45, 234], [183, 79], [63, 231], [127, 166], [0, 37], [0, 67], [80, 136], [80, 134], [64, 111], [0, 28], [0, 151], [16, 55], [80, 49], [144, 198], [208, 1], [144, 251], [208, 88], [8, 130], [24, 45], [8, 120], [8, 115], [72, 116], [72, 177], [88, 249], [200, 6], [48, 14], [48, 241], [32, 51], [48, 159], [112, 242], [112, 253], [224, 76], [240, 164], [224, 47], [160, 181], [240, 145], [224, 219], [120, 228], [40, 57], [184, 128], [168, 200], [248, 139], [168, 186], [184, 177], [4, 128], [20, 233], [68, 162], [20, 83], [84, 240], [68, 247], [148, 64], [132, 70], [148, 185], [212, 156], [212, 178], [28, 202], [28, 46], [12, 7], [28, 231], [92, 73], [92, 101], [76, 93], [220, 136], [156, 29], [220, 211], [100, 71], [228, 128], [244, 170], [180, 20], [164, 222], [164, 83], [244, 119], [44, 72], [60, 168], [60, 65], [44, 13], [44, 251], [108, 154], [188, 224], [172, 106], [188, 9], [188, 237], [252, 196], [252, 108], [236, 206], [188, 92], [188, 118], [236, 176], [252, 23], [252, 255], [18, 229], [66, 104], [82, 45], [130, 96], [146, 81], [130, 221], [210, 223], [26, 79], [90, 72], [26, 22], [10, 93], [90, 250], [90, 181], [138, 35], [218, 138], [154, 25], [138, 53], [50, 105], [98, 193], [114, 11], [34, 95], [114, 89], [178, 131], [178, 125], [226, 216], [226, 115], [58, 133], [122, 68], [106, 43], [58, 187], [170, 195], [250, 110], [250, 235], [186, 18], [170, 94], [70, 112], [70, 21], [134, 194], [214, 32], [198, 69], [214, 92], [214, 91], [30, 12], [94, 207], [30, 127], [158, 128], [142, 229], [142, 116], [158, 182], [142, 211], [222, 51], [38, 106], [102, 168], [118, 167], [118, 145], [166, 34], [182, 203], [230, 141], [182, 49], [126, 128], [126, 226], [126, 141], [46, 210], [62, 50], [126, 53], [174, 171], [238, 5], [254, 43], [190, 218], [254, 146], [1, 117], [1, 243], [129, 166], [145, 237], [129, 252], [25, 166], [89, 32], [137, 67], [153, 249], [137, 147], [217, 212], [33, 9], [33, 107], [97, 196], [113, 100], [97, 26], [161, 78], [177, 203], [161, 103], [161, 175], [161, 215], [225, 179], [57, 225], [57, 242], [41, 23], [169, 0], [169, 162], [185, 35], [249, 98], [185, 82], [169, 218], [5, 197], [85, 205], [69, 216], [69, 87], [149, 61], [149, 87], [213, 82], [197, 54], [197, 89], [13, 244], [29, 18], [13, 191], [77, 157], [221, 237], [157, 114], [157, 150], [37, 195], [53, 210], [117, 177], [165, 130], [245, 101], [165, 123], [245, 250], [45, 100], [61, 98], [45, 129], [109, 160], [125, 238], [125, 13], [61, 217], [125, 248], [173, 40], [237, 9], [237, 210], [3, 234], [3, 25], [3, 253], [19, 211], [83, 90], [131, 77], [147, 180], [131, 87], [195, 152], [195, 29], [27, 128], [27, 239], [91, 43], [11, 30], [139, 5], [203, 173], [219, 167], [35, 201], [51, 120], [179, 69], [163, 11], [243, 207], [59, 172], [43, 2], [59, 99], [43, 39], [43, 245], [107, 120], [123, 184], [187, 230], [171, 93], [187, 189], [251, 29], [71, 202], [87, 107], [7, 180], [71, 56], [71, 212], [199, 34], [135, 216], [15, 3], [79, 204], [31, 246], [143, 73], [207, 234], [143, 156], [159, 245], [143, 59], [55, 141], [119, 201], [103, 15], [39, 247], [231, 96], [247, 232], [183, 178], [167, 21], [247, 209], [47, 134], [63, 1], [111, 195], [47, 124], [63, 147], [175, 66], [191, 152], [175, 61], [64, 189], [0, 225], [64, 226], [64, 174], [16, 120], [0, 116], [16, 158], [16, 209], [16, 125], [80, 50], [80, 222], [64, 81], [128, 162], [192, 128], [208, 131], [208, 75], [208, 39], [208, 239], [144, 182], [144, 89], [144, 147], [208, 248], [192, 217], [192, 241], [8, 196], [24, 171], [88, 160], [88, 4], [88, 108], [88, 174], [72, 137], [8, 23], [88, 243], [152, 64], [136, 2], [136, 43], [136, 207], [216, 34], [200, 46], [136, 21], [200, 187], [48, 32], [48, 201], [48, 220], [48, 54], [96, 20], [96, 114], [176, 97], [160, 13], [176, 143], [240, 224], [240, 73], [224, 133], [160, 144], [176, 51], [240, 150], [240, 118], [40, 96], [56, 141], [40, 218], [56, 115], [120, 148], [120, 186], [104, 217], [120, 61], [104, 251], [184, 233], [184, 254], [248, 159], [20, 139], [4, 175], [68, 14], [68, 169], [84, 141], [84, 163], [84, 239], [20, 144], [20, 59], [84, 88], [68, 51], [132, 160], [132, 2], [132, 165], [132, 199], [212, 3], [196, 103], [148, 48], [148, 210], [212, 25], [212, 155], [212, 151], [28, 40], [28, 165], [92, 134], [76, 1], [28, 159], [76, 210], [92, 153], [92, 213], [156, 232], [220, 193], [204, 67], [220, 231], [140, 154], [204, 144], [220, 158], [36, 196], [52, 74], [52, 173], [52, 207], [52, 103], [100, 234], [116, 229], [52, 112], [116, 18], [116, 209], [116, 57], [164, 100], [164, 231], [244, 204], [180, 188], [180, 113], [164, 213], [164, 155], [228, 16], [244, 124], [228, 242], [228, 58], [244, 182], [228, 211], [244, 179], [228, 31], [60, 75], [108, 192], [108, 238], [124, 233], [44, 184], [60, 20], [60, 82], [44, 114], [44, 126], [44, 191], [124, 113], [124, 83], [188, 140], [172, 162], [172, 46], [172, 45], [236, 172], [172, 112], [236, 250], [252, 241], [252, 219], [18, 196], [18, 233], [82, 194], [82, 65], [66, 235], [18, 19], [82, 216], [66, 253], [82, 23], [146, 99], [194, 110], [130, 58], [146, 177], [130, 61], [210, 146], [210, 155], [194, 63], [26, 34], [10, 170], [26, 39], [74, 200], [74, 132], [74, 10], [90, 15], [26, 152], [26, 92], [10, 219], [10, 247], [90, 244], [138, 236], [138, 66], [138, 13], [218, 3], [202, 235], [138, 118], [154, 113], [138, 147], [202, 249], [218, 179], [202, 151], [50, 76], [34, 75], [50, 35], [98, 140], [114, 39], [98, 144], [114, 212], [162, 206], [162, 229], [162, 39], [242, 193], [226, 5], [162, 52], [162, 114], [58, 200], [58, 14], [42, 235], [106, 137], [106, 67], [122, 231], [58, 112], [42, 178], [122, 121], [106, 243], [186, 163], [186, 242], [170, 29], [186, 157], [234, 252], [234, 210], [250, 115], [22, 45], [22, 195], [22, 135], [86, 74], [70, 105], [6, 185], [22, 255], [86, 220], [86, 218], [86, 62], [86, 81], [86, 49], [70, 215], [134, 204], [214, 130], [214, 227], [150, 58], [134, 158], [134, 149], [134, 117], [150, 95], [150, 55], [198, 218], [14, 2], [30, 99], [14, 79], [78, 202], [94, 173], [14, 123], [94, 20], [94, 249], [94, 211], [94, 187], [158, 226], [142, 41], [222, 103], [142, 208], [158, 57], [206, 48], [206, 185], [206, 83], [206, 255], [54, 136], [38, 9], [54, 67], [102, 6], [102, 131], [38, 176], [38, 218], [118, 159], [230, 200], [246, 238], [182, 59], [246, 210], [46, 128], [62, 171], [126, 104], [126, 2], [62, 156], [46, 54], [62, 17], [126, 222], [126, 182], [110, 219], [190, 196], [190, 138], [174, 109], [238, 136], [238, 32], [238, 65], [174, 56], [174, 190], [190, 155], [238, 87], [17, 40], [1, 172], [17, 13], [17, 103], [65, 78], [81, 161], [65, 43], [1, 24], [17, 249], [1, 157], [81, 156], [65, 49], [81, 117], [65, 151], [129, 9], [129, 235], [129, 7], [209, 40], [209, 172], [193, 46], [193, 229], [129, 80], [145, 50], [209, 122], [209, 150], [193, 125], [9, 135], [89, 252], [73, 245], [137, 170], [201, 65], [201, 37], [217, 235], [153, 52], [137, 247], [217, 218], [201, 86], [33, 66], [49, 129], [49, 79], [97, 72], [97, 166], [113, 3], [97, 227], [97, 111], [113, 175], [33, 94], [33, 119], [97, 250], [113, 30], [113, 55], [225, 10], [241, 138], [241, 38], [225, 33], [225, 13], [161, 114], [225, 62], [57, 67], [121, 97], [41, 88], [41, 248], [57, 50], [41, 118], [41, 177], [41, 221], [41, 155], [57, 219], [121, 156], [121, 210], [105, 25], [121, 177], [169, 105], [249, 109], [233, 43], [169, 182], [169, 185], [185, 61], [185, 87], [21, 236], [21, 37], [69, 172], [69, 2], [85, 102], [85, 143], [85, 231], [21, 48], [21, 122], [21, 246], [21, 147], [69, 20], [85, 52], [69, 114], [85, 242], [69, 241], [133, 64], [149, 10], [133, 38], [149, 197], [149, 207], [133, 52], [149, 18], [133, 250], [213, 152], [197, 247], [13, 6], [13, 69], [29, 141], [77, 132], [29, 240], [29, 85], [77, 118], [93, 145], [77, 113], [157, 192], [157, 66], [157, 42], [205, 140], [205, 202], [221, 102], [205, 15], [141, 218], [221, 20], [221, 246], [205, 19], [37, 104], [53, 44], [53, 161], [53, 235], [53, 199], [37, 103], [101, 192], [117, 224], [101, 35], [181, 232], [165, 204], [229, 236], [181, 124], [165, 26], [165, 145], [181, 25], [165, 151], [45, 109], [125, 203], [61, 58], [61, 245], [125, 189], [125, 243], [173, 37], [173, 143], [237, 104], [253, 228], [189, 254], [189, 157], [173, 245], [173, 243], [253, 176], [237, 90], [253, 62], [237, 57], [253, 213], [237, 29], [253, 53], [237, 127], [19, 1], [3, 165], [67, 130], [19, 189], [67, 252], [83, 145], [67, 91], [147, 68], [131, 42], [195, 192], [147, 122], [131, 185], [147, 117], [131, 247], [211, 177], [11, 108], [27, 135], [11, 175], [91, 196], [75, 12], [91, 9], [11, 48], [27, 148], [11, 58], [11, 182], [11, 117], [75, 118], [91, 93], [91, 53], [75, 23], [155, 2], [203, 232], [203, 229], [139, 154], [139, 246], [139, 81], [219, 20], [203, 62], [203, 211], [35, 96], [51, 167], [99, 66], [99, 71], [115, 231], [35, 92], [51, 29], [51, 53], [99, 188], [179, 168], [163, 12], [163, 228], [163, 194], [179, 45], [179, 89], [179, 149], [163, 147], [227, 95], [43, 197], [123, 136], [107, 36], [123, 236], [107, 226], [123, 198], [123, 35], [59, 220], [59, 26], [43, 17], [123, 84], [107, 148], [123, 157], [187, 129], [171, 165], [235, 172], [235, 102], [251, 169], [171, 220], [187, 31], [251, 240], [71, 72], [71, 232], [71, 7], [7, 93], [87, 245], [215, 38], [215, 237], [135, 82], [135, 126], [151, 219], [31, 6], [15, 238], [31, 161], [95, 0], [95, 194], [15, 155], [95, 244], [95, 60], [79, 252], [79, 189], [79, 147], [143, 96], [159, 236], [143, 70], [159, 225], [207, 72], [207, 174], [207, 193], [207, 139], [207, 167], [143, 115], [143, 151], [207, 244], [223, 50], [39, 7], [103, 77], [55, 85], [183, 192], [183, 133], [247, 162], [231, 78], [167, 213], [247, 80], [47, 34], [47, 137], [47, 41], [111, 106], [127, 11], [127, 111], [47, 149], [47, 53], [47, 31], [111, 176], [175, 232], [175, 197], [191, 35], [255, 192], [239, 204], [239, 233], [175, 188], [191, 246], [175, 217], [191, 151], [191, 63], [255, 156], [255, 90], [239, 254], [255, 17], [239, 191]]
  },
  ARUCO: {
    nBits: 25,
    tau: 3,
    codeList: [0x1084210, 0x1084217, 0x1084209, 0x108420e, 0x10842f0, 0x10842f7, 0x10842e9, 0x10842ee, 0x1084130, 0x1084137, 0x1084129, 0x108412e, 0x10841d0, 0x10841d7, 0x10841c9, 0x10841ce, 0x1085e10, 0x1085e17, 0x1085e09, 0x1085e0e, 0x1085ef0, 0x1085ef7, 0x1085ee9, 0x1085eee, 0x1085d30, 0x1085d37, 0x1085d29, 0x1085d2e, 0x1085dd0, 0x1085dd7, 0x1085dc9, 0x1085dce, 0x1082610, 0x1082617, 0x1082609, 0x108260e, 0x10826f0, 0x10826f7, 0x10826e9, 0x10826ee, 0x1082530, 0x1082537, 0x1082529, 0x108252e, 0x10825d0, 0x10825d7, 0x10825c9, 0x10825ce, 0x1083a10, 0x1083a17, 0x1083a09, 0x1083a0e, 0x1083af0, 0x1083af7, 0x1083ae9, 0x1083aee, 0x1083930, 0x1083937, 0x1083929, 0x108392e, 0x10839d0, 0x10839d7, 0x10839c9, 0x10839ce, 0x10bc210, 0x10bc217, 0x10bc209, 0x10bc20e, 0x10bc2f0, 0x10bc2f7, 0x10bc2e9, 0x10bc2ee, 0x10bc130, 0x10bc137, 0x10bc129, 0x10bc12e, 0x10bc1d0, 0x10bc1d7, 0x10bc1c9, 0x10bc1ce, 0x10bde10, 0x10bde17, 0x10bde09, 0x10bde0e, 0x10bdef0, 0x10bdef7, 0x10bdee9, 0x10bdeee, 0x10bdd30, 0x10bdd37, 0x10bdd29, 0x10bdd2e, 0x10bddd0, 0x10bddd7, 0x10bddc9, 0x10bddce, 0x10ba610, 0x10ba617, 0x10ba609, 0x10ba60e, 0x10ba6f0, 0x10ba6f7, 0x10ba6e9, 0x10ba6ee, 0x10ba530, 0x10ba537, 0x10ba529, 0x10ba52e, 0x10ba5d0, 0x10ba5d7, 0x10ba5c9, 0x10ba5ce, 0x10bba10, 0x10bba17, 0x10bba09, 0x10bba0e, 0x10bbaf0, 0x10bbaf7, 0x10bbae9, 0x10bbaee, 0x10bb930, 0x10bb937, 0x10bb929, 0x10bb92e, 0x10bb9d0, 0x10bb9d7, 0x10bb9c9, 0x10bb9ce, 0x104c210, 0x104c217, 0x104c209, 0x104c20e, 0x104c2f0, 0x104c2f7, 0x104c2e9, 0x104c2ee, 0x104c130, 0x104c137, 0x104c129, 0x104c12e, 0x104c1d0, 0x104c1d7, 0x104c1c9, 0x104c1ce, 0x104de10, 0x104de17, 0x104de09, 0x104de0e, 0x104def0, 0x104def7, 0x104dee9, 0x104deee, 0x104dd30, 0x104dd37, 0x104dd29, 0x104dd2e, 0x104ddd0, 0x104ddd7, 0x104ddc9, 0x104ddce, 0x104a610, 0x104a617, 0x104a609, 0x104a60e, 0x104a6f0, 0x104a6f7, 0x104a6e9, 0x104a6ee, 0x104a530, 0x104a537, 0x104a529, 0x104a52e, 0x104a5d0, 0x104a5d7, 0x104a5c9, 0x104a5ce, 0x104ba10, 0x104ba17, 0x104ba09, 0x104ba0e, 0x104baf0, 0x104baf7, 0x104bae9, 0x104baee, 0x104b930, 0x104b937, 0x104b929, 0x104b92e, 0x104b9d0, 0x104b9d7, 0x104b9c9, 0x104b9ce, 0x1074210, 0x1074217, 0x1074209, 0x107420e, 0x10742f0, 0x10742f7, 0x10742e9, 0x10742ee, 0x1074130, 0x1074137, 0x1074129, 0x107412e, 0x10741d0, 0x10741d7, 0x10741c9, 0x10741ce, 0x1075e10, 0x1075e17, 0x1075e09, 0x1075e0e, 0x1075ef0, 0x1075ef7, 0x1075ee9, 0x1075eee, 0x1075d30, 0x1075d37, 0x1075d29, 0x1075d2e, 0x1075dd0, 0x1075dd7, 0x1075dc9, 0x1075dce, 0x1072610, 0x1072617, 0x1072609, 0x107260e, 0x10726f0, 0x10726f7, 0x10726e9, 0x10726ee, 0x1072530, 0x1072537, 0x1072529, 0x107252e, 0x10725d0, 0x10725d7, 0x10725c9, 0x10725ce, 0x1073a10, 0x1073a17, 0x1073a09, 0x1073a0e, 0x1073af0, 0x1073af7, 0x1073ae9, 0x1073aee, 0x1073930, 0x1073937, 0x1073929, 0x107392e, 0x10739d0, 0x10739d7, 0x10739c9, 0x10739ce, 0x1784210, 0x1784217, 0x1784209, 0x178420e, 0x17842f0, 0x17842f7, 0x17842e9, 0x17842ee, 0x1784130, 0x1784137, 0x1784129, 0x178412e, 0x17841d0, 0x17841d7, 0x17841c9, 0x17841ce, 0x1785e10, 0x1785e17, 0x1785e09, 0x1785e0e, 0x1785ef0, 0x1785ef7, 0x1785ee9, 0x1785eee, 0x1785d30, 0x1785d37, 0x1785d29, 0x1785d2e, 0x1785dd0, 0x1785dd7, 0x1785dc9, 0x1785dce, 0x1782610, 0x1782617, 0x1782609, 0x178260e, 0x17826f0, 0x17826f7, 0x17826e9, 0x17826ee, 0x1782530, 0x1782537, 0x1782529, 0x178252e, 0x17825d0, 0x17825d7, 0x17825c9, 0x17825ce, 0x1783a10, 0x1783a17, 0x1783a09, 0x1783a0e, 0x1783af0, 0x1783af7, 0x1783ae9, 0x1783aee, 0x1783930, 0x1783937, 0x1783929, 0x178392e, 0x17839d0, 0x17839d7, 0x17839c9, 0x17839ce, 0x17bc210, 0x17bc217, 0x17bc209, 0x17bc20e, 0x17bc2f0, 0x17bc2f7, 0x17bc2e9, 0x17bc2ee, 0x17bc130, 0x17bc137, 0x17bc129, 0x17bc12e, 0x17bc1d0, 0x17bc1d7, 0x17bc1c9, 0x17bc1ce, 0x17bde10, 0x17bde17, 0x17bde09, 0x17bde0e, 0x17bdef0, 0x17bdef7, 0x17bdee9, 0x17bdeee, 0x17bdd30, 0x17bdd37, 0x17bdd29, 0x17bdd2e, 0x17bddd0, 0x17bddd7, 0x17bddc9, 0x17bddce, 0x17ba610, 0x17ba617, 0x17ba609, 0x17ba60e, 0x17ba6f0, 0x17ba6f7, 0x17ba6e9, 0x17ba6ee, 0x17ba530, 0x17ba537, 0x17ba529, 0x17ba52e, 0x17ba5d0, 0x17ba5d7, 0x17ba5c9, 0x17ba5ce, 0x17bba10, 0x17bba17, 0x17bba09, 0x17bba0e, 0x17bbaf0, 0x17bbaf7, 0x17bbae9, 0x17bbaee, 0x17bb930, 0x17bb937, 0x17bb929, 0x17bb92e, 0x17bb9d0, 0x17bb9d7, 0x17bb9c9, 0x17bb9ce, 0x174c210, 0x174c217, 0x174c209, 0x174c20e, 0x174c2f0, 0x174c2f7, 0x174c2e9, 0x174c2ee, 0x174c130, 0x174c137, 0x174c129, 0x174c12e, 0x174c1d0, 0x174c1d7, 0x174c1c9, 0x174c1ce, 0x174de10, 0x174de17, 0x174de09, 0x174de0e, 0x174def0, 0x174def7, 0x174dee9, 0x174deee, 0x174dd30, 0x174dd37, 0x174dd29, 0x174dd2e, 0x174ddd0, 0x174ddd7, 0x174ddc9, 0x174ddce, 0x174a610, 0x174a617, 0x174a609, 0x174a60e, 0x174a6f0, 0x174a6f7, 0x174a6e9, 0x174a6ee, 0x174a530, 0x174a537, 0x174a529, 0x174a52e, 0x174a5d0, 0x174a5d7, 0x174a5c9, 0x174a5ce, 0x174ba10, 0x174ba17, 0x174ba09, 0x174ba0e, 0x174baf0, 0x174baf7, 0x174bae9, 0x174baee, 0x174b930, 0x174b937, 0x174b929, 0x174b92e, 0x174b9d0, 0x174b9d7, 0x174b9c9, 0x174b9ce, 0x1774210, 0x1774217, 0x1774209, 0x177420e, 0x17742f0, 0x17742f7, 0x17742e9, 0x17742ee, 0x1774130, 0x1774137, 0x1774129, 0x177412e, 0x17741d0, 0x17741d7, 0x17741c9, 0x17741ce, 0x1775e10, 0x1775e17, 0x1775e09, 0x1775e0e, 0x1775ef0, 0x1775ef7, 0x1775ee9, 0x1775eee, 0x1775d30, 0x1775d37, 0x1775d29, 0x1775d2e, 0x1775dd0, 0x1775dd7, 0x1775dc9, 0x1775dce, 0x1772610, 0x1772617, 0x1772609, 0x177260e, 0x17726f0, 0x17726f7, 0x17726e9, 0x17726ee, 0x1772530, 0x1772537, 0x1772529, 0x177252e, 0x17725d0, 0x17725d7, 0x17725c9, 0x17725ce, 0x1773a10, 0x1773a17, 0x1773a09, 0x1773a0e, 0x1773af0, 0x1773af7, 0x1773ae9, 0x1773aee, 0x1773930, 0x1773937, 0x1773929, 0x177392e, 0x17739d0, 0x17739d7, 0x17739c9, 0x17739ce, 0x984210, 0x984217, 0x984209, 0x98420e, 0x9842f0, 0x9842f7, 0x9842e9, 0x9842ee, 0x984130, 0x984137, 0x984129, 0x98412e, 0x9841d0, 0x9841d7, 0x9841c9, 0x9841ce, 0x985e10, 0x985e17, 0x985e09, 0x985e0e, 0x985ef0, 0x985ef7, 0x985ee9, 0x985eee, 0x985d30, 0x985d37, 0x985d29, 0x985d2e, 0x985dd0, 0x985dd7, 0x985dc9, 0x985dce, 0x982610, 0x982617, 0x982609, 0x98260e, 0x9826f0, 0x9826f7, 0x9826e9, 0x9826ee, 0x982530, 0x982537, 0x982529, 0x98252e, 0x9825d0, 0x9825d7, 0x9825c9, 0x9825ce, 0x983a10, 0x983a17, 0x983a09, 0x983a0e, 0x983af0, 0x983af7, 0x983ae9, 0x983aee, 0x983930, 0x983937, 0x983929, 0x98392e, 0x9839d0, 0x9839d7, 0x9839c9, 0x9839ce, 0x9bc210, 0x9bc217, 0x9bc209, 0x9bc20e, 0x9bc2f0, 0x9bc2f7, 0x9bc2e9, 0x9bc2ee, 0x9bc130, 0x9bc137, 0x9bc129, 0x9bc12e, 0x9bc1d0, 0x9bc1d7, 0x9bc1c9, 0x9bc1ce, 0x9bde10, 0x9bde17, 0x9bde09, 0x9bde0e, 0x9bdef0, 0x9bdef7, 0x9bdee9, 0x9bdeee, 0x9bdd30, 0x9bdd37, 0x9bdd29, 0x9bdd2e, 0x9bddd0, 0x9bddd7, 0x9bddc9, 0x9bddce, 0x9ba610, 0x9ba617, 0x9ba609, 0x9ba60e, 0x9ba6f0, 0x9ba6f7, 0x9ba6e9, 0x9ba6ee, 0x9ba530, 0x9ba537, 0x9ba529, 0x9ba52e, 0x9ba5d0, 0x9ba5d7, 0x9ba5c9, 0x9ba5ce, 0x9bba10, 0x9bba17, 0x9bba09, 0x9bba0e, 0x9bbaf0, 0x9bbaf7, 0x9bbae9, 0x9bbaee, 0x9bb930, 0x9bb937, 0x9bb929, 0x9bb92e, 0x9bb9d0, 0x9bb9d7, 0x9bb9c9, 0x9bb9ce, 0x94c210, 0x94c217, 0x94c209, 0x94c20e, 0x94c2f0, 0x94c2f7, 0x94c2e9, 0x94c2ee, 0x94c130, 0x94c137, 0x94c129, 0x94c12e, 0x94c1d0, 0x94c1d7, 0x94c1c9, 0x94c1ce, 0x94de10, 0x94de17, 0x94de09, 0x94de0e, 0x94def0, 0x94def7, 0x94dee9, 0x94deee, 0x94dd30, 0x94dd37, 0x94dd29, 0x94dd2e, 0x94ddd0, 0x94ddd7, 0x94ddc9, 0x94ddce, 0x94a610, 0x94a617, 0x94a609, 0x94a60e, 0x94a6f0, 0x94a6f7, 0x94a6e9, 0x94a6ee, 0x94a530, 0x94a537, 0x94a529, 0x94a52e, 0x94a5d0, 0x94a5d7, 0x94a5c9, 0x94a5ce, 0x94ba10, 0x94ba17, 0x94ba09, 0x94ba0e, 0x94baf0, 0x94baf7, 0x94bae9, 0x94baee, 0x94b930, 0x94b937, 0x94b929, 0x94b92e, 0x94b9d0, 0x94b9d7, 0x94b9c9, 0x94b9ce, 0x974210, 0x974217, 0x974209, 0x97420e, 0x9742f0, 0x9742f7, 0x9742e9, 0x9742ee, 0x974130, 0x974137, 0x974129, 0x97412e, 0x9741d0, 0x9741d7, 0x9741c9, 0x9741ce, 0x975e10, 0x975e17, 0x975e09, 0x975e0e, 0x975ef0, 0x975ef7, 0x975ee9, 0x975eee, 0x975d30, 0x975d37, 0x975d29, 0x975d2e, 0x975dd0, 0x975dd7, 0x975dc9, 0x975dce, 0x972610, 0x972617, 0x972609, 0x97260e, 0x9726f0, 0x9726f7, 0x9726e9, 0x9726ee, 0x972530, 0x972537, 0x972529, 0x97252e, 0x9725d0, 0x9725d7, 0x9725c9, 0x9725ce, 0x973a10, 0x973a17, 0x973a09, 0x973a0e, 0x973af0, 0x973af7, 0x973ae9, 0x973aee, 0x973930, 0x973937, 0x973929, 0x97392e, 0x9739d0, 0x9739d7, 0x9739c9, 0x9739ce, 0xe84210, 0xe84217, 0xe84209, 0xe8420e, 0xe842f0, 0xe842f7, 0xe842e9, 0xe842ee, 0xe84130, 0xe84137, 0xe84129, 0xe8412e, 0xe841d0, 0xe841d7, 0xe841c9, 0xe841ce, 0xe85e10, 0xe85e17, 0xe85e09, 0xe85e0e, 0xe85ef0, 0xe85ef7, 0xe85ee9, 0xe85eee, 0xe85d30, 0xe85d37, 0xe85d29, 0xe85d2e, 0xe85dd0, 0xe85dd7, 0xe85dc9, 0xe85dce, 0xe82610, 0xe82617, 0xe82609, 0xe8260e, 0xe826f0, 0xe826f7, 0xe826e9, 0xe826ee, 0xe82530, 0xe82537, 0xe82529, 0xe8252e, 0xe825d0, 0xe825d7, 0xe825c9, 0xe825ce, 0xe83a10, 0xe83a17, 0xe83a09, 0xe83a0e, 0xe83af0, 0xe83af7, 0xe83ae9, 0xe83aee, 0xe83930, 0xe83937, 0xe83929, 0xe8392e, 0xe839d0, 0xe839d7, 0xe839c9, 0xe839ce, 0xebc210, 0xebc217, 0xebc209, 0xebc20e, 0xebc2f0, 0xebc2f7, 0xebc2e9, 0xebc2ee, 0xebc130, 0xebc137, 0xebc129, 0xebc12e, 0xebc1d0, 0xebc1d7, 0xebc1c9, 0xebc1ce, 0xebde10, 0xebde17, 0xebde09, 0xebde0e, 0xebdef0, 0xebdef7, 0xebdee9, 0xebdeee, 0xebdd30, 0xebdd37, 0xebdd29, 0xebdd2e, 0xebddd0, 0xebddd7, 0xebddc9, 0xebddce, 0xeba610, 0xeba617, 0xeba609, 0xeba60e, 0xeba6f0, 0xeba6f7, 0xeba6e9, 0xeba6ee, 0xeba530, 0xeba537, 0xeba529, 0xeba52e, 0xeba5d0, 0xeba5d7, 0xeba5c9, 0xeba5ce, 0xebba10, 0xebba17, 0xebba09, 0xebba0e, 0xebbaf0, 0xebbaf7, 0xebbae9, 0xebbaee, 0xebb930, 0xebb937, 0xebb929, 0xebb92e, 0xebb9d0, 0xebb9d7, 0xebb9c9, 0xebb9ce, 0xe4c210, 0xe4c217, 0xe4c209, 0xe4c20e, 0xe4c2f0, 0xe4c2f7, 0xe4c2e9, 0xe4c2ee, 0xe4c130, 0xe4c137, 0xe4c129, 0xe4c12e, 0xe4c1d0, 0xe4c1d7, 0xe4c1c9, 0xe4c1ce, 0xe4de10, 0xe4de17, 0xe4de09, 0xe4de0e, 0xe4def0, 0xe4def7, 0xe4dee9, 0xe4deee, 0xe4dd30, 0xe4dd37, 0xe4dd29, 0xe4dd2e, 0xe4ddd0, 0xe4ddd7, 0xe4ddc9, 0xe4ddce, 0xe4a610, 0xe4a617, 0xe4a609, 0xe4a60e, 0xe4a6f0, 0xe4a6f7, 0xe4a6e9, 0xe4a6ee, 0xe4a530, 0xe4a537, 0xe4a529, 0xe4a52e, 0xe4a5d0, 0xe4a5d7, 0xe4a5c9, 0xe4a5ce, 0xe4ba10, 0xe4ba17, 0xe4ba09, 0xe4ba0e, 0xe4baf0, 0xe4baf7, 0xe4bae9, 0xe4baee, 0xe4b930, 0xe4b937, 0xe4b929, 0xe4b92e, 0xe4b9d0, 0xe4b9d7, 0xe4b9c9, 0xe4b9ce, 0xe74210, 0xe74217, 0xe74209, 0xe7420e, 0xe742f0, 0xe742f7, 0xe742e9, 0xe742ee, 0xe74130, 0xe74137, 0xe74129, 0xe7412e, 0xe741d0, 0xe741d7, 0xe741c9, 0xe741ce, 0xe75e10, 0xe75e17, 0xe75e09, 0xe75e0e, 0xe75ef0, 0xe75ef7, 0xe75ee9, 0xe75eee, 0xe75d30, 0xe75d37, 0xe75d29, 0xe75d2e, 0xe75dd0, 0xe75dd7, 0xe75dc9, 0xe75dce, 0xe72610, 0xe72617, 0xe72609, 0xe7260e, 0xe726f0, 0xe726f7, 0xe726e9, 0xe726ee, 0xe72530, 0xe72537, 0xe72529, 0xe7252e, 0xe725d0, 0xe725d7, 0xe725c9, 0xe725ce, 0xe73a10, 0xe73a17, 0xe73a09, 0xe73a0e, 0xe73af0, 0xe73af7, 0xe73ae9, 0xe73aee, 0xe73930, 0xe73937, 0xe73929, 0xe7392e, 0xe739d0, 0xe739d7, 0xe739c9]
  },
  ARUCO_MIP_36h12: {
    nBits: 36,
    tau: 12,
    codeList: [0xd2b63a09d, 0x6001134e5, 0x1206fbe72, 0xff8ad6cb4, 0x85da9bc49, 0xb461afe9c, 0x6db51fe13, 0x5248c541f, 0x8f34503, 0x8ea462ece, 0xeac2be76d, 0x1af615c44, 0xb48a49f27, 0x2e4e1283b, 0x78b1f2fa8, 0x27d34f57e, 0x89222fff1, 0x4c1669406, 0xbf49b3511, 0xdc191cd5d, 0x11d7c3f85, 0x16a130e35, 0xe29f27eff, 0x428d8ae0c, 0x90d548477, 0x2319cbc93, 0xc3b0c3dfc, 0x424bccc9, 0x2a081d630, 0x762743d96, 0xd0645bf19, 0xf38d7fd60, 0xc6cbf9a10, 0x3c1be7c65, 0x276f75e63, 0x4490a3f63, 0xda60acd52, 0x3cc68df59, 0xab46f9dae, 0x88d533d78, 0xb6d62ec21, 0xb3c02b646, 0x22e56d408, 0xac5f5770a, 0xaaa993f66, 0x4caa07c8d, 0x5c9b4f7b0, 0xaa9ef0e05, 0x705c5750, 0xac81f545e, 0x735b91e74, 0x8cc35cee4, 0xe44694d04, 0xb5e121de0, 0x261017d0f, 0xf1d439eb5, 0xa1a33ac96, 0x174c62c02, 0x1ee27f716, 0x8b1c5ece9, 0x6a05b0c6a, 0xd0568dfc, 0x192d25e5f, 0x1adbeccc8, 0xcfec87f00, 0xd0b9dde7a, 0x88dcef81e, 0x445681cb9, 0xdbb2ffc83, 0xa48d96df1, 0xb72cc2e7d, 0xc295b53f, 0xf49832704, 0x9968edc29, 0x9e4e1af85, 0x8683e2d1b, 0x810b45c04, 0x6ac44bfe2, 0x645346615, 0x3990bd598, 0x1c9ed0f6a, 0xc26729d65, 0x83993f795, 0x3ac05ac5d, 0x357adff3b, 0xd5c05565, 0x2f547ef44, 0x86c115041, 0x640fd9e5f, 0xce08bbcf7, 0x109bb343e, 0xc21435c92, 0x35b4dfce4, 0x459752cf2, 0xec915b82c, 0x51881eed0, 0x2dda7dc97, 0x2e0142144, 0x42e890f99, 0x9a8856527, 0x8e80d9d80, 0x891cbcf34, 0x25dd82410, 0x239551d34, 0x8fe8f0c70, 0x94106a970, 0x82609b40c, 0xfc9caf36, 0x688181d11, 0x718613c08, 0xf1ab7629, 0xa357bfc18, 0x4c03b7a46, 0x204dedce6, 0xad6300d37, 0x84cc4cd09, 0x42160e5c4, 0x87d2adfa8, 0x7850e7749, 0x4e750fc7c, 0xbf2e5dfda, 0xd88324da5, 0x234b52f80, 0x378204514, 0xabdf2ad53, 0x365e78ef9, 0x49caa6ca2, 0x3c39ddf3, 0xc68c5385d, 0x5bfcbbf67, 0x623241e21, 0xabc90d5cc, 0x388c6fe85, 0xda0e2d62d, 0x10855dfe9, 0x4d46efd6b, 0x76ea12d61, 0x9db377d3d, 0xeed0efa71, 0xe6ec3ae2f, 0x441faee83, 0xba19c8ff5, 0x313035eab, 0x6ce8f7625, 0x880dab58d, 0x8d3409e0d, 0x2be92ee21, 0xd60302c6c, 0x469ffc724, 0x87eebeed3, 0x42587ef7a, 0x7a8cc4e52, 0x76a437650, 0x999e41ef4, 0x7d0969e42, 0xc02baf46b, 0x9259f3e47, 0x2116a1dc0, 0x9f2de4d84, 0xeffac29, 0x7b371ff8c, 0x668339da9, 0xd010aee3f, 0x1cd00b4c0, 0x95070fc3b, 0xf84c9a770, 0x38f863d76, 0x3646ff045, 0xce1b96412, 0x7a5d45da8, 0x14e00ef6c, 0x5e95abfd8, 0xb2e9cb729, 0x36c47dd7, 0xb8ee97c6b, 0xe9e8f657, 0xd4ad2ef1a, 0x8811c7f32, 0x47bde7c31, 0x3adadfb64, 0x6e5b28574, 0x33e67cd91, 0x2ab9fdd2d, 0x8afa67f2b, 0xe6a28fc5e, 0x72049cdbd, 0xae65dac12, 0x1251a4526, 0x1089ab841, 0xe2f096ee0, 0xb0caee573, 0xfd6677e86, 0x444b3f518, 0xbe8b3a56a, 0x680a75cfc, 0xac02baea8, 0x97d815e1c, 0x1d4386e08, 0x1a14f5b0e, 0xe658a8d81, 0xa3868efa7, 0x3668a9673, 0xe8fc53d85, 0x2e2b7edd5, 0x8b2470f13, 0xf69795f32, 0x4589ffc8e, 0x2e2080c9c, 0x64265f7d, 0x3d714dd10, 0x1692c6ef1, 0x3e67f2f49, 0x5041dad63, 0x1a1503415, 0x64c18c742, 0xa72eec35, 0x1f0f9dc60, 0xa9559bc67, 0xf32911d0d, 0x21c0d4ffc, 0xe01cef5b0, 0x4e23a3520, 0xaa4f04e49, 0xe1c4fcc43, 0x208e8f6e8, 0x8486774a5, 0x9e98c7558, 0x2c59fb7dc, 0x9446a4613, 0x8292dcc2e, 0x4d61631, 0xd05527809, 0xa0163852d, 0x8f657f639, 0xcca6c3e37, 0xcb136bc7a, 0xfc5a83e53, 0x9aa44fc30, 0xbdec1bd3c, 0xe020b9f7c, 0x4b8f35fb0, 0xb8165f637, 0x33dc88d69, 0x10a2f7e4d, 0xc8cb5ff53, 0xde259ff6b, 0x46d070dd4, 0x32d3b9741, 0x7075f1c04, 0x4d58dbea0]
  }
};

AR.Dictionary = function (dicName) {
  this.codes = {};
  this.codeList = [];
  this.tau = 0;
  this._initialize(dicName);
};

AR.Dictionary.prototype._initialize = function (dicName) {
  this.codes = {};
  this.codeList = [];
  this.tau = 0;
  this.nBits = 0;
  this.markSize = 0;
  this.dicName = dicName;
  var dictionary = AR.DICTIONARIES[dicName];
  if (!dictionary)
    throw 'The dictionary "' + dicName + '" is not recognized.';

  this.nBits = dictionary.nBits;
  this.markSize = Math.sqrt(dictionary.nBits) + 2;
  for (var i = 0; i < dictionary.codeList.length; i++) {
    var code = null;
    if (typeof dictionary.codeList[i] === 'number')
      code = this._hex2bin(dictionary.codeList[i], dictionary.nBits);
    if (typeof dictionary.codeList[i] === 'string')
      code = this._hex2bin(parseInt(dictionary.codeList[i], 16), dictionary.nBits);
    if (Array.isArray(dictionary.codeList[i]))
      code = this._bytes2bin(dictionary.codeList[i], dictionary.nBits);
    if (code === null)
      throw 'Invalid code ' + i + ' in dictionary ' + dicName + ': ' + JSON.stringify(dictionary.codeList[i]);
    if (code.length != dictionary.nBits)
      throw 'The code ' + i + ' in dictionary ' + dicName + ' is not ' + dictionary.nBits + ' bits long but ' + code.length + ': ' + code;
    this.codeList.push(code);
    this.codes[code] = {
      id: i
    };
  }
  this.tau = dictionary.tau || this._calculateTau();
};

AR.Dictionary.prototype.find = function (bits) {
  var val = '',
    i, j;
  for (i = 0; i < bits.length; i++) {
    var bitRow = bits[i];
    for (j = 0; j < bitRow.length; j++) {
      val += bitRow[j];
    }
  }
  var minFound = this.codes[val];
  if (minFound)
    return {
      id: minFound.id,
      distance: 0
    };

  for (i = 0; i < this.codeList.length; i++) {
    var code = this.codeList[i];
    var distance = this._hammingDistance(val, code);
    if (this._hammingDistance(val, code) < this.tau) {
      if (!minFound || minFound.distance > distance) {
        minFound = {
          id: this.codes[code].id,
          distance: distance
        };
      }
    }
  }
  return minFound;
};

AR.Dictionary.prototype._hex2bin = function (hex, nBits) {
  return hex.toString(2).padStart(nBits, '0');
};

AR.Dictionary.prototype._bytes2bin = function (byteList, nBits) {
  var bits = '', byte;
  for (byte of byteList) {
    bits += byte.toString(2).padStart(bits.length + 8 > nBits ? nBits - bits.length : 8, '0');
  }
  return bits;
};

AR.Dictionary.prototype._hammingDistance = function (str1, str2) {
  if (str1.length != str2.length)
    throw 'Hamming distance calculation require inputs of the same length';
  var distance = 0,
    i;
  for (i = 0; i < str1.length; i++)
    if (str1[i] !== str2[i])
      distance += 1;
  return distance;
};

AR.Dictionary.prototype._calculateTau = function () {
  var tau = Number.MAX_VALUE;
  for (var i = 0; i < this.codeList.length; i++)
    for (var j = i + 1; j < this.codeList.length; j++) {
      var distance = this._hammingDistance(this.codeList[i], this.codeList[j]);
      tau = distance < tau ? distance : tau;
    }
  return tau;
};

AR.Dictionary.prototype.generateSVG = function (id) {
  var code = this.codeList[id];
  if (code == null)
    throw 'The id "' + id + '" is not valid for the dictionary "' + this.dicName + '". ID must be between 0 and ' + (this.codeList.length - 1) + ' included.';
  var size = this.markSize - 2;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 1 ' + (size + 2) + ' ' + (size + 2) + '">';
  svg += '<rect x="0" y="0" width="' + (size + 4) + '" height="' + (size + 4) + '" fill="white"/>';
  svg += '<rect x="1" y="1" width="' + (size + 2) + '" height="' + (size + 2) + '" fill="black"/>';
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      if (code[y * size + x] == '1')
        svg += '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="1" height="1" fill="white"/>';
    }
  }
  svg += '</svg>';
  return svg;
};

AR.Marker = function (id, corners, hammingDistance) {
  this.id = id;
  this.corners = corners;
  this.hammingDistance = hammingDistance;
};

AR.Detector = function (config) {
  config = config || {};
  this.grey = new CV.Image();
  this.thres = new CV.Image();
  this.homography = new CV.Image();
  this.binary = [];
  this.contours = [];
  this.polys = [];
  this.candidates = [];
  config.dictionaryName = config.dictionaryName || 'ARUCO_MIP_36h12';
  this.dictionary = new AR.Dictionary(config.dictionaryName);
  this.dictionary.tau = config.maxHammingDistance != null ? config.maxHammingDistance : this.dictionary.tau;
};

AR.Detector.prototype.detectImage = function (width, height, data) {
  return this.detect({
    width: width,
    height: height,
    data: data
  });
};

AR.Detector.prototype.detectStreamInit = function (width, height, callback) {
  this.streamConfig = {};
  this.streamConfig.width = width;
  this.streamConfig.height = height;
  this.streamConfig.imageSize = width * height * 4; //provided image must be a sequence of rgba bytes (4 bytes represent a pixel)
  this.streamConfig.index = 0;
  this.streamConfig.imageData = new Uint8ClampedArray(this.streamConfig.imageSize);
  this.streamConfig.callback = callback || function (image, markerList) { };
};

//accept data chunks of different sizes
AR.Detector.prototype.detectStream = function (data) {
  for (var i = 0; i < data.length; i++) {
    this.streamConfig.imageData[this.streamConfig.index] = data[i];
    this.streamConfig.index = (this.streamConfig.index + 1) % this.streamConfig.imageSize;
    if (this.streamConfig.index == 0) {
      var image = {
        width: this.streamConfig.width,
        height: this.streamConfig.height,
        data: this.streamConfig.imageData
      };
      var markerList = this.detect(image);
      this.streamConfig.callback(image, markerList);
    }
  }
};

AR.Detector.prototype.detectMJPEGStreamInit = function (width, height, callback, decoderFn) {
  this.mjpeg = {
    decoderFn: decoderFn,
    chunks: [],
    SOI: [0xff, 0xd8],
    EOI: [0xff, 0xd9]
  };
  this.detectStreamInit(width, height, callback);
};

AR.Detector.prototype.detectMJPEGStream = function (chunk) {
  var eoiPos = chunk.findIndex(function (element, index, array) {
    return this.mjpeg.EOI[0] == element && array.length > index + 1 && this.mjpeg.EOI[1] == array[index + 1];
  });
  var soiPos = chunk.findIndex(function (element, index, array) {
    return this.mjpeg.SOI[0] == element && array.length > index + 1 && this.mjpeg.SOI[1] == array[index + 1];
  });

  if (eoiPos === -1) {
    this.mjpeg.chunks.push(chunk);
  } else {
    var part1 = chunk.slice(0, eoiPos + 2);
    if (part1.length) {
      this.mjpeg.chunks.push(part1);
    }
    if (this.mjpeg.chunks.length) {
      var jpegImage = this.mjpeg.chunks.flat();
      var rgba = this.mjpeg.decoderFn(jpegImage);
      this.detectStream(rgba);
    }
    this.mjpeg.chunks = [];
  }
  if (soiPos > -1) {
    this.mjpeg.chunks = [];
    this.mjpeg.chunks.push(chunk.slice(soiPos));
  }
};

AR.Detector.prototype.detect = function (image) {
  CV.grayscale(image, this.grey);
  CV.adaptiveThreshold(this.grey, this.thres, 6, 7);

  this.contours = CV.findContours(this.thres, this.binary);
  //Scale Fix: https://stackoverflow.com/questions/35936397/marker-detection-on-paper-sheet-using-javascript
  //this.candidates = this.findCandidates(this.contours, image.width * 0.20, 0.05, 10);
  this.candidates = this.findCandidates(this.contours, image.width * 0.005, 0.035, 8);
  this.candidates = this.clockwiseCorners(this.candidates);
  this.candidates = this.notTooNear(this.candidates, 10);

  return this.findMarkers(this.grey, this.candidates, 49);
};

AR.Detector.prototype.findCandidates = function (contours, minSize, epsilon, minLength) {
  var candidates = [],
    len = contours.length,
    contour, poly, i;

  this.polys = [];

  for (i = 0; i < len; ++i) {
    contour = contours[i];

    if (contour.length >= minSize) {
      poly = CV.approxPolyDP(contour, contour.length * epsilon);

      this.polys.push(poly);

      if ((4 === poly.length) && (CV.isContourConvex(poly))) {

        if (CV.minEdgeLength(poly) >= minLength) {
          candidates.push(poly);
        }
      }
    }
  }

  return candidates;
};

AR.Detector.prototype.clockwiseCorners = function (candidates) {
  var len = candidates.length,
    dx1, dx2, dy1, dy2, swap, i;

  for (i = 0; i < len; ++i) {
    dx1 = candidates[i][1].x - candidates[i][0].x;
    dy1 = candidates[i][1].y - candidates[i][0].y;
    dx2 = candidates[i][2].x - candidates[i][0].x;
    dy2 = candidates[i][2].y - candidates[i][0].y;

    if ((dx1 * dy2 - dy1 * dx2) < 0) {
      swap = candidates[i][1];
      candidates[i][1] = candidates[i][3];
      candidates[i][3] = swap;
    }
  }

  return candidates;
};

AR.Detector.prototype.notTooNear = function (candidates, minDist) {
  var notTooNear = [],
    len = candidates.length,
    dist, dx, dy, i, j, k;

  for (i = 0; i < len; ++i) {

    for (j = i + 1; j < len; ++j) {
      dist = 0;

      for (k = 0; k < 4; ++k) {
        dx = candidates[i][k].x - candidates[j][k].x;
        dy = candidates[i][k].y - candidates[j][k].y;

        dist += dx * dx + dy * dy;
      }

      if ((dist / 4) < (minDist * minDist)) {

        if (CV.perimeter(candidates[i]) < CV.perimeter(candidates[j])) {
          candidates[i].tooNear = true;
        } else {
          candidates[j].tooNear = true;
        }
      }
    }
  }

  for (i = 0; i < len; ++i) {
    if (!candidates[i].tooNear) {
      notTooNear.push(candidates[i]);
    }
  }

  return notTooNear;
};

AR.Detector.prototype.findMarkers = function (imageSrc, candidates, warpSize) {
  var markers = [],
    len = candidates.length,
    candidate, marker, i;

  for (i = 0; i < len; ++i) {
    candidate = candidates[i];

    CV.warp(imageSrc, this.homography, candidate, warpSize);

    CV.threshold(this.homography, this.homography, CV.otsu(this.homography));

    marker = this.getMarker(this.homography, candidate);
    if (marker) {
      markers.push(marker);
    }
  }

  return markers;
};

AR.Detector.prototype.getMarker = function (imageSrc, candidate) {
  var markSize = this.dictionary.markSize;
  var width = (imageSrc.width / markSize) >>> 0,
    minZero = (width * width) >> 1,
    bits = [],
    rotations = [],
    square, inc, i, j;

  for (i = 0; i < markSize; ++i) {
    inc = (0 === i || (markSize - 1) === i) ? 1 : (markSize - 1);

    for (j = 0; j < markSize; j += inc) {
      square = {
        x: j * width,
        y: i * width,
        width: width,
        height: width
      };
      if (CV.countNonZero(imageSrc, square) > minZero) {
        return null;
      }
    }
  }

  for (i = 0; i < markSize - 2; ++i) {
    bits[i] = [];

    for (j = 0; j < markSize - 2; ++j) {
      square = {
        x: (j + 1) * width,
        y: (i + 1) * width,
        width: width,
        height: width
      };

      bits[i][j] = CV.countNonZero(imageSrc, square) > minZero ? 1 : 0;
    }
  }

  rotations[0] = bits;

  var foundMin = null;
  var rot = 0;
  for (i = 0; i < 4; i++) {
    var found = this.dictionary.find(rotations[i]);
    if (found && (foundMin === null || found.distance < foundMin.distance)) {
      foundMin = found;
      rot = i;
      if (foundMin.distance === 0)
        break;
    }
    rotations[i + 1] = this.rotate(rotations[i]);
  }

  if (foundMin)
    return new AR.Marker(foundMin.id, this.rotate2(candidate, 4 - rot), foundMin.distance);

  return null;
};

AR.Detector.prototype.rotate = function (src) {
  var dst = [],
    len = src.length,
    i, j;

  for (i = 0; i < len; ++i) {
    dst[i] = [];
    for (j = 0; j < src[i].length; ++j) {
      dst[i][j] = src[src[i].length - j - 1][i];
    }
  }

  return dst;
};

AR.Detector.prototype.rotate2 = function (src, rotation) {
  var dst = [],
    len = src.length,
    i;

  for (i = 0; i < len; ++i) {
    dst[i] = src[(rotation + i) % len];
  }

  return dst;
};