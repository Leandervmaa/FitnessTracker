import Foundation
import Vision
import AppKit

let directoryPath = "/Users/leandervanmaarschalkerwaard/Downloads/FitnessTracker/artifacts/fitness-tracker/public/images"
let fileManager = FileManager.default

do {
    let pngFiles = files.filter { $0.hasPrefix("Gemini_Generated_Image_") && $0.hasSuffix(".png") }
    let logFile = "/Users/leandervanmaarschalkerwaard/Downloads/FitnessTracker/artifacts/api-server/src/scratch/ocr_results.txt"
    try? "".write(toFile: logFile, atomically: true, encoding: .utf8)
    
    print("Found \(pngFiles.count) Gemini generated images. Running OCR...")
    
    for filename in pngFiles.sorted() {
        let filePath = (directoryPath as NSString).appendingPathComponent(filename)
        guard let image = NSImage(contentsOfFile: filePath),
              let tiffData = image.tiffRepresentation,
              let cgImage = NSBitmapImageRep(data: tiffData)?.cgImage else {
            print("[\(filename)]: Failed to load image")
            fflush(stdout)
            continue
        }
        
        let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest { request, error in
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                return
            }
            
            let detectedText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
            let result = "FILE: \(filename)\nTEXT: \(detectedText)\n----------------------------------------\n"
            print(result, terminator: "")
            fflush(stdout)
            
            if let fileHandle = FileHandle(forWritingAtPath: logFile) {
                fileHandle.seekToEndOfFile()
                if let data = result.data(using: .utf8) {
                    fileHandle.write(data)
                }
                fileHandle.closeFile()
            }
        }
        
        request.recognitionLevel = .accurate
        try requestHandler.perform([request])
    }
} catch {
    print("Error: \(error)")
}
