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
  // Must be the explicit setter: assigning to .currentContext does not bridge,
  // and the drawing below would silently go nowhere.
  $.NSGraphicsContext.setCurrentContext(context);
  context.imageInterpolation = $.NSImageInterpolationHigh;
  source.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, size, size), $.NSZeroRect, $.NSCompositeSourceOver, 1);
  $.NSGraphicsContext.restoreGraphicsState;

  // An empty centre pixel means the SVG loaded but nothing drew. Fail loudly
  // instead of writing a blank icon that still looks valid to sips and iconutil.
  const centre = bitmap.colorAtXY(Math.floor(size / 2), Math.floor(size / 2));
  if (!centre.js || centre.alphaComponent < 1) throw new Error(`${svgPath} rendered blank at ${size}px`);

  const data = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (!data.writeToFileAtomically(pngPath, true)) throw new Error(`Could not write ${pngPath}`);
  return pngPath;
}
