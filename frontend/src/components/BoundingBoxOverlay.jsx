import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';

const NOMINAL_FORMAT = {
  'Satu Ribu': 'Rp 1.000',
  'Dua Ribu': 'Rp 2.000',
  'Lima Ribu': 'Rp 5.000',
  'Sepuluh Ribu': 'Rp 10.000',
  'Dua Puluh Ribu': 'Rp 20.000',
  'Lima Puluh Ribu': 'Rp 50.000',
  'Seratus Ribu': 'Rp 100.000',
};

export default function BoundingBoxOverlay({
  boxes = [],
  containerDimensions = { width: 0, height: 0 },
  videoDimensions = { width: 0, height: 0 },
}) {
  const { width: containerWidth, height: containerHeight } = containerDimensions;
  const { width: videoWidth, height: videoHeight } = videoDimensions;

  // Compute rendered bounding box positions matching CSS object-fit: cover
  const renderedBoxes = useMemo(() => {
    if (!boxes || boxes.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
      return [];
    }

    const vW = videoWidth > 0 ? videoWidth : 640;
    const vH = videoHeight > 0 ? videoHeight : 480;

    const vAspect = vW / vH;
    const cAspect = containerWidth / containerHeight;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (vAspect > cAspect) {
      // Video is wider than container: height fits container, horizontal edges are cropped
      renderHeight = containerHeight;
      renderWidth = containerHeight * vAspect;
      offsetX = (containerWidth - renderWidth) / 2;
      offsetY = 0;
    } else {
      // Video is taller than container: width fits container, vertical edges are cropped
      renderWidth = containerWidth;
      renderHeight = containerWidth / vAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderHeight) / 2;
    }

    return boxes
      .filter((box) => box && NOMINAL_FORMAT[box.label])
      .map((box, index) => {
        const [normX1, normY1, normX2, normY2] = box.box_normalized || [0, 0, 0, 0];

      const boxLeft = offsetX + normX1 * renderWidth;
      const boxTop = offsetY + normY1 * renderHeight;
      const boxWidth = Math.max(20, (normX2 - normX1) * renderWidth);
      const boxHeight = Math.max(20, (normY2 - normY1) * renderHeight);

      // Display nominal text
      const nominalDisplay = NOMINAL_FORMAT[box.label] || box.label;
      const confidencePercent = box.confidence ? `${Math.round(box.confidence * 100)}%` : null;

      // Position badge inside box if too close to viewport top
      const isNearTop = boxTop < 36;

      return {
        id: `box-${index}-${box.label}`,
        style: {
          left: `${boxLeft}px`,
          top: `${boxTop}px`,
          width: `${boxWidth}px`,
          height: `${boxHeight}px`,
        },
        label: box.label,
        nominalDisplay,
        confidencePercent,
        isNearTop,
      };
    });
  }, [boxes, containerWidth, containerHeight, videoWidth, videoHeight]);

  if (renderedBoxes.length === 0) {
    return null;
  }

  return (
    <div className="bounding-box-overlay" aria-hidden="true">
      {renderedBoxes.map((item) => (
        <div key={item.id} className="bounding-box-item" style={item.style}>
          {/* Neon corner bracket accents */}
          <span className="bbox-corner bbox-corner-tl" />
          <span className="bbox-corner bbox-corner-tr" />
          <span className="bbox-corner bbox-corner-bl" />
          <span className="bbox-corner bbox-corner-br" />

          {/* Floating HUD Denomination Badge */}
          <div className={`bounding-box-badge ${item.isNearTop ? 'badge-inside' : 'badge-outside'}`}>
            <span className="badge-icon">
              <CheckCircle2 size={13} strokeWidth={2.8} />
            </span>
            <span className="badge-nominal">{item.nominalDisplay}</span>
            {item.confidencePercent && (
              <span className="badge-confidence">{item.confidencePercent}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
