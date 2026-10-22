// Rasterize an SVG into a 1024px app icon PNG: osascript -l JavaScript render-icon.js in.svg out.png
ObjC.import("AppKit");
function run(argv) {
  const size = 1024;
  // Inset to match the margin of standard macOS app icons.
  const inset = size * 0.1;
  const svg = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  const rep =
    $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
      null, size, size, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0,
    );
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  svg.drawInRect($.NSMakeRect(inset, inset, size - 2 * inset, size - 2 * inset));
  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(argv[1], true);
}
