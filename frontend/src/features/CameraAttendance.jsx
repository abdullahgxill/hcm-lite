import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, ShieldCheck, RefreshCw } from "lucide-react";
import { Button, Notice, Modal, State, useAction, ActionNotices } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import { createFaceDetector, getLocation, cameraError, stopStream } from "../services/camera";

export function CameraVerification({ policy, kind = "check-in", testOnly = false, onRecorded, detectorFactory = createFaceDetector }) {
  const video = useRef(null), session = useRef(null), mounted = useRef(true), timer = useRef(null);
  const [running, setRunning] = useState(false), [starting, setStarting] = useState(false),
    [faces, setFaces] = useState(null), [location, setLocation] = useState(null),
    [locating, setLocating] = useState(false), [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const action = useAction();
  function release() {
    clearTimeout(timer.current);
    const old = session.current;
    session.current = null;
    stopStream(old?.stream);
    old?.detector?.close();
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; release(); };
  }, []);
  async function start() {
    setError(""); setStarting(true); setRunning(false); setFaces(null); release();
    let stream, detector;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera requires HTTPS or localhost and a browser with camera support.");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!mounted.current) { stopStream(stream); return; }
      session.current = { stream };
      video.current.srcObject = stream;
      await video.current.play();
      detector = await detectorFactory();
      if (!mounted.current || session.current?.stream !== stream) { detector.close(); stopStream(stream); return; }
      session.current.detector = detector;
      setRunning(true);
      const detect = () => {
        if (!mounted.current || session.current?.detector !== detector) return;
        try {
          if (video.current.readyState >= 2) setFaces(detector.detectForVideo(video.current, performance.now()).detections.length);
          timer.current = setTimeout(detect, 400);
        } catch (e) { setError(cameraError(e)); release(); setRunning(false); }
      };
      detect();
    } catch (e) {
      stopStream(stream);
      if (mounted.current) { release(); setRunning(false); setError(cameraError(e)); }
    } finally { if (mounted.current) setStarting(false); }
  }
  async function locate() {
    setLocating(true); setError(""); setLocation(null);
    try {
      const fix = await getLocation();
      if (mounted.current) {
        setLocation(fix);
        if (fix.accuracy > 100) setError("GPS accuracy is worse than 100 metres. Move near a window or try your phone, then refresh location.");
      }
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { if (mounted.current) setLocating(false); }
  }
  async function confirm() {
    setError("");
    if (!session.current?.detector || !video.current || video.current.readyState < 2) return setError("Start the camera and wait for a live frame.");
    let count;
    try { count = session.current.detector.detectForVideo(video.current, performance.now()).detections.length; }
    catch (e) { return setError(cameraError(e)); }
    setFaces(count);
    if (count !== 1) return setError("Exactly one face must be visible. Try again or request an HR correction.");
    if (!location || Date.now() - location.capturedAt > 45000) return setError("Refresh your location before confirming attendance.");
    const result = await action.run(() => api.post(`/attendance/${kind}`, { source: "camera", faceCount: count, location }), "Camera attendance recorded.");
    if (result) { release(); setRunning(false); onRecorded?.(result.data); }
  }
  return <div className="camera-verification">
    <div className="camera-privacy"><ShieldCheck size={20} /><p>{testOnly
      ? "Device check only. Video and GPS stay in this browser; nothing is submitted or saved."
      : "Your video is processed on this device. No photo, video, audio or face descriptor is saved. On confirmation, your face count and location go to the attendance server; only the verification result is stored."}</p></div>
    <label className="checkbox-field"><input type="checkbox" checked={consent} disabled={running || starting} onChange={(e) => setConsent(e.target.checked)} />I understand and want to use my camera and location for this check.</label>
    <div className="camera-grid">
      <section className="camera-stage" aria-label="Live camera preview">
        <video ref={video} autoPlay muted playsInline aria-label="Your camera preview" />
        {!running && <div className="camera-placeholder"><Camera size={38} /><p>{starting ? "Opening camera and loading face detector…" : "Your camera stays off until you choose to start."}</p></div>}
        {running && <span className={`camera-face-status ${faces === 1 ? "ready" : ""}`} role="status">{faces === null ? "Checking frame…" : faces === 1 ? "One face detected" : faces === 0 ? "No face detected" : `${faces} faces detected — only one allowed`}</span>}
      </section>
      <section className="camera-checklist">
        <h3>Before you record</h3>
        <p>Face the camera in good light. Keep just one person in the frame.</p>
        <div><Camera size={18} /><span>{faces === 1 ? "Exactly one face detected" : "One face required"}</span></div>
        <div><MapPin size={18} /><span>{location ? `GPS accuracy: ${Math.ceil(location.accuracy)} m ${location.accuracy <= 100 ? "— ready" : "— too imprecise"}` : "Fresh location required"}</span></div>
        {!testOnly && <p>{policy?.enabled ? `The server accepts camera attendance within ${policy.radiusMeters} metres of the office. GPS accuracy must be 100 metres or better.` : "Camera attendance needs an office location. Ask your Admin to save latitude, longitude and radius in Organization settings."}</p>}
        {testOnly && <p>This checks your device only. Office distance is checked by the server when a signed-in employee confirms attendance.</p>}
        <p className="muted">This detects a face; it does not identify a person or prove liveness.</p>
      </section>
    </div>
    <Notice>{error}</Notice><ActionNotices action={action} />
    <div className="camera-actions">
      <Button type="button" variant="secondary" disabled={!consent || starting || action.busy} loading={starting} onClick={start}><Camera size={17} />{running ? "Restart camera" : "Start camera"}</Button>
      <Button type="button" variant="secondary" disabled={!consent || locating || action.busy} loading={locating} onClick={locate}><RefreshCw size={17} />{location ? "Refresh location" : "Get my location"}</Button>
      {running && <Button type="button" variant="text" disabled={action.busy} onClick={() => { release(); setRunning(false); setFaces(null); }}>Stop camera</Button>}
      {!testOnly && <Button type="button" loading={action.busy} disabled={!consent || !policy?.enabled || faces !== 1 || !location || location.accuracy > 100} onClick={confirm}>Confirm camera {kind === "check-in" ? "check-in" : "check-out"}</Button>}
    </div>
    {testOnly && faces === 1 && location?.accuracy <= 100 && <Notice type="success">Camera and location are ready on this device. No attendance was submitted.</Notice>}
    <p className="camera-help">If verification fails, use Attendance → Request correction and explain the issue to HR. Camera stops when you close this screen.</p>
  </div>;
}

export default function CameraAttendance({ kind = "check-in", onClose, onRecorded }) {
  const policy = useResource("/attendance/camera-policy");
  return <Modal title={`Camera ${kind === "check-in" ? "check-in" : "check-out"}`} onClose={onClose} wide><State resource={policy}><CameraVerification policy={policy.data} kind={kind} onRecorded={onRecorded} /></State></Modal>;
}
