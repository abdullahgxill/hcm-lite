// Frames stay on the device. Only face count and a fresh GPS fix are submitted on confirmation.
export async function createFaceDetector() {
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm",
  );
  return FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.6,
  });
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser does not support location. Try a current browser or request an HR correction."));
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, capturedAt: timestamp }),
      (error) => reject(new Error(error.code === 1
        ? "Location permission was denied. Allow location in your browser site settings and try again."
        : error.code === 3
          ? "Location timed out. Move near a window or use your phone, then try again."
          : "Your location is unavailable. Check device location settings or request an HR correction.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export function cameraError(error) {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Camera permission was denied. Allow camera in browser site settings and try again.";
  if (error.name === "NotFoundError") return "No camera was found. Connect a webcam or use your phone.";
  if (error.name === "NotReadableError") return "Your camera is busy. Close other camera apps and try again.";
  return error.message || "Camera verification is unavailable. Try again or request an HR correction.";
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
