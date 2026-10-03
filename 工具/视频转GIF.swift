import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func frameImage(generator: AVAssetImageGenerator, seconds: Double) throws -> CGImage {
    let time = CMTime(seconds: seconds, preferredTimescale: 600)
    return try generator.copyCGImage(at: time, actualTime: nil)
}

func scaledImage(_ image: CGImage, maxSide: Int) -> CGImage? {
    let scale = min(1.0, Double(maxSide) / Double(max(image.width, image.height)))
    let width = max(1, Int(Double(image.width) * scale))
    let height = max(1, Int(Double(image.height) * scale))
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage()
}

func makeContactSheet(generator: AVAssetImageGenerator, duration: Double, output: URL) throws {
    let columns = 4
    let rows = 3
    let cellWidth = 280
    let cellHeight = 320
    let count = columns * rows
    guard let context = CGContext(
        data: nil,
        width: columns * cellWidth,
        height: rows * cellHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { throw NSError(domain: "ContactSheet", code: 1) }
    context.setFillColor(CGColor(gray: 0.96, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: columns * cellWidth, height: rows * cellHeight))
    for index in 0..<count {
        let seconds = duration * Double(index) / Double(max(1, count - 1))
        let image = try frameImage(generator: generator, seconds: min(seconds, max(0, duration - 0.04)))
        let scale = min(Double(cellWidth) / Double(image.width), Double(cellHeight) / Double(image.height))
        let width = Double(image.width) * scale
        let height = Double(image.height) * scale
        let column = index % columns
        let row = rows - 1 - index / columns
        let x = Double(column * cellWidth) + (Double(cellWidth) - width) / 2
        let y = Double(row * cellHeight) + (Double(cellHeight) - height) / 2
        context.draw(image, in: CGRect(x: x, y: y, width: width, height: height))
    }
    guard let sheet = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { throw NSError(domain: "ContactSheet", code: 2) }
    CGImageDestinationAddImage(destination, sheet, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "ContactSheet", code: 3) }
}

func makeGIF(generator: AVAssetImageGenerator, start: Double, duration: Double, output: URL) throws {
    let fps = 10.0
    let frameCount = max(2, Int(duration * fps))
    guard let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, frameCount, nil)
    else { throw NSError(domain: "GIF", code: 1) }
    let loopProperties = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary
    CGImageDestinationSetProperties(destination, loopProperties)
    let frameProperties = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: 1.0 / fps]] as CFDictionary
    for index in 0..<frameCount {
        let seconds = start + duration * Double(index) / Double(frameCount)
        let image = try frameImage(generator: generator, seconds: seconds)
        if let scaled = scaledImage(image, maxSide: 480) {
            CGImageDestinationAddImage(destination, scaled, frameProperties)
        }
    }
    guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "GIF", code: 2) }
}

guard CommandLine.arguments.count >= 4 else {
    fputs("Usage: 视频转GIF.swift preview|gif input output [start] [duration]\n", stderr)
    exit(2)
}

let mode = CommandLine.arguments[1]
let input = URL(fileURLWithPath: CommandLine.arguments[2])
let output = URL(fileURLWithPath: CommandLine.arguments[3])
let asset = AVURLAsset(url: input)
let duration = CMTimeGetSeconds(asset.duration)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

if mode == "preview" {
    try makeContactSheet(generator: generator, duration: duration, output: output)
} else if mode == "gif" {
    let start = CommandLine.arguments.count > 4 ? Double(CommandLine.arguments[4]) ?? 0 : 0
    let requestedDuration = CommandLine.arguments.count > 5 ? Double(CommandLine.arguments[5]) ?? duration : duration
    try makeGIF(generator: generator, start: start, duration: min(requestedDuration, duration - start), output: output)
} else {
    throw NSError(domain: "Mode", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unknown mode: \(mode)"])
}

print(String(format: "duration=%.3f output=%@", duration, output.path))
