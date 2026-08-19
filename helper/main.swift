// zbirka-helper — the parts of the app that macOS already does better
// than a bundled binary would.
//
// This exists to replace ffmpeg-static, whose prebuilt binary reports
// "nonfree parts compiled in. Therefore it is not legally
// redistributable" and cannot ship inside an MIT application. AVFoundation
// covers video frames and duration, Vision covers OCR, and
// QuickLookThumbnailing covers PDF, HEIC and anything else the system can
// preview — one binary instead of 43 MB of licence problem.
//
// Every subcommand prints one line of JSON to stdout and exits non-zero
// on failure, so the Node side never has to parse prose.

import AVFoundation
import CoreImage
import Foundation
import QuickLookThumbnailing
import Vision

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func fail(_ message: String) -> Never {
    emit(["ok": false, "error": message])
    exit(1)
}

func writeJPEG(_ cgImage: CGImage, to path: String) throws {
    let ci = CIImage(cgImage: cgImage)
    let context = CIContext()
    guard let colorSpace = cgImage.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB) else {
        throw NSError(domain: "zbirka", code: 2)
    }
    try context.writeJPEGRepresentation(
        of: ci,
        to: URL(fileURLWithPath: path),
        colorSpace: colorSpace,
        options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.9]
    )
}

// MARK: - poster: one frame plus duration, replacing ffmpeg

func poster(input: String, output: String) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(seconds: 1, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 2, preferredTimescale: 600)

    let semaphore = DispatchSemaphore(value: 0)
    var duration: Double = 0
    var failure: String?

    Task {
        do {
            duration = try await CMTimeGetSeconds(asset.load(.duration))
            // One second in skips fade-ins and black leaders; clips
            // shorter than that fall back to the first frame.
            let at = CMTime(seconds: duration > 1.2 ? 1.0 : 0.0, preferredTimescale: 600)
            let (image, _) = try await generator.image(at: at)
            try writeJPEG(image, to: output)
        } catch {
            failure = error.localizedDescription
        }
        semaphore.signal()
    }
    semaphore.wait()

    if let failure { fail(failure) }
    emit(["ok": true, "duration": duration.isFinite ? duration : 0])
}

// MARK: - thumbnail: QuickLook, which covers PDF and HEIC in one path

func thumbnail(input: String, output: String, size: Int) {
    let request = QLThumbnailGenerator.Request(
        fileAt: URL(fileURLWithPath: input),
        size: CGSize(width: size, height: size),
        scale: 1,
        representationTypes: .thumbnail
    )

    let semaphore = DispatchSemaphore(value: 0)
    var failure: String?

    QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { rep, error in
        if let rep {
            do { try writeJPEG(rep.cgImage, to: output) } catch { failure = "\(error)" }
        } else {
            failure = error?.localizedDescription ?? "no representation"
        }
        semaphore.signal()
    }
    semaphore.wait()

    if let failure { fail(failure) }
    emit(["ok": true])
}

// MARK: - ocr: Vision

func ocr(input: String) {
    guard let image = CIImage(contentsOf: URL(fileURLWithPath: input)) else {
        fail("could not read image")
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    // Ask for what the OS actually supports rather than hard-coding a
    // list that silently degrades on a different macOS version.
    if let supported = try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate, revision: VNRecognizeTextRequestRevision3
    ) {
        request.recognitionLanguages = supported
    }

    let handler = VNImageRequestHandler(ciImage: image)
    do {
        try handler.perform([request])
    } catch {
        fail(error.localizedDescription)
    }

    let text = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
    emit(["ok": true, "text": text])
}

func languages() {
    let list = (try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate, revision: VNRecognizeTextRequestRevision3
    )) ?? []
    emit(["ok": true, "languages": list])
}

// MARK: - entry

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: zbirka-helper <poster|thumbnail|ocr|languages> …") }

switch args[1] {
case "poster":
    guard args.count >= 4 else { fail("usage: poster <input> <output>") }
    poster(input: args[2], output: args[3])
case "thumbnail":
    guard args.count >= 4 else { fail("usage: thumbnail <input> <output> [size]") }
    thumbnail(input: args[2], output: args[3], size: args.count > 4 ? Int(args[4]) ?? 640 : 640)
case "ocr":
    guard args.count >= 3 else { fail("usage: ocr <input>") }
    ocr(input: args[2])
case "languages":
    languages()
default:
    fail("unknown command \(args[1])")
}
