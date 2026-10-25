import { Link } from "react-router-dom";
import { CameraVerification } from "../features/CameraAttendance";
import { Panel } from "../components/ui";

export default function DeviceCheck() {
  return <main className="device-check-page"><header><Link className="brand" to="/">hcm<span className="brand-lite">lite</span></Link><Link to="/">Back to sign in</Link></header><div className="eyebrow">ATTENDANCE / DEVICE READINESS</div><h1>Your camera. Your location. Your control.</h1><p>Check your browser before using camera attendance. This page does not require a login and never creates an attendance record.</p><Panel title="Camera & location check" subtitle="Requires HTTPS, browser permissions and a connected webcam or phone camera."><CameraVerification testOnly /></Panel></main>;
}
