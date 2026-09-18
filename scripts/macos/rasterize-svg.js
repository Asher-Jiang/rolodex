/* Rasterize an SVG to PNG with AppKit. Run with:
   osascript -l JavaScript scripts/macos/rasterize-svg.js <input.svg> <output.png> <pixels> */

ObjC.import('AppKit');

function run(args) {
  const [svgPath, pngPath, sizeArgument] = args;
  const size = Number(sizeArgument);
  if (!svgPath || !pngPath || !Number.isFinite(size) || size <= 0) {
    throw new Error('Usage: rasterize-svg.js <input.svg> <output.png> <pixels>');
  }

  const source = $.NSImage.alloc.initWithContentsOfFile(svgPath);
  if (!source.js || !source.isValid) throw new Error(`Could not read ${svgPath}`);

  // Draw into a bitmap sized in pixels so the result does not pick up the
  // display's backing scale factor.
  const bitmap = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    $(), size, size, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0,
  );
  const context = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmap);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.currentContext = context;
  context.imageInterpolation = $.NSImageInterpolationHigh;
  source.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, size, size), $.NSZeroRect, $.NSCompositeSourceOver, 1);
  $.NSGraphicsContext.restoreGraphicsState;

  const data = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (!data.writeToFileAtomically(pngPath, true)) throw new Error(`Could not write ${pngPath}`);
  return pngPath;
}
