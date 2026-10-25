# Camera attendance, location and assistant reports

## Implemented extension

The optional camera attendance path follows section 5 of the official brief. It is available beside normal web check-in/out on the Employee dashboard and Attendance page, and on Attendance for HR accounts with a linked employee profile.

1. Admin saves both office latitude and longitude, plus radius (default 150 metres), under Organization. HR cannot change these settings. Use the actual office coordinates; no office location is preloaded.
2. Employee opens Camera check in/out, reads the capture disclosure and explicitly selects the consent checkbox. No permissions are requested just by opening the page.
3. Start camera requests front-camera video only, with no microphone. MediaPipe Tasks Vision 0.10.32 detects faces locally. Exactly one face is required. Raw frames, photos and face descriptors are never uploaded or stored.
4. Get my location requests a fresh high-accuracy GPS fix. Accuracy must be 100 metres or better. Coordinates are submitted only when attendance is explicitly confirmed.
5. Express validates numeric inputs and the face count, checks fix freshness (at most 60 seconds, at most 15 seconds ahead for clock skew), calculates Haversine distance and requires distance within the configured radius. Attendance timestamps always come from the server. A 45-second client freshness check asks the employee to refresh before sending.
6. MongoDB stores source=camera and verification result (face count, GPS accuracy, distance, server verification timestamp), never raw GPS coordinates or a photo. Check-in/out verification is separate. Audit includes only source and a verification boolean.
7. Duplicate check-in stays HTTP 409. Invalid captures are HTTP 422. Ordinary web attendance remains available, as required by the brief. Failed verification directs an Employee to Request correction for HR review.

## Device check

Open https://hcm-lite-web.vercel.app/device-check on the device with the actual camera. This public diagnostic works without logging in or registering attendance. Camera and GPS stay in that browser. Select consent, Start camera, allow camera, face the camera alone, then Get my location and allow location. It reports one-face detection and GPS accuracy. Stop camera or leave the page to release the device. It does not test office distance or save a business record.

HTTPS or localhost is required. Google hosts the face model and jsDelivr serves pinned WASM assets; these downloads need network access. No video frames are sent to either host. A phone generally provides a more accurate location than a laptop.

## Security limits

Browser detection is not identity verification or liveness. A modified client can forge its reported face count and GPS; do not present this optional hackathon feature as an anti-spoofing system. There is no face enrollment, biometric identity matching, blink/liveness check, native mobile app or geolocation attestation. GPS accuracy is a device estimate. Real-device camera/GPS behavior requires user confirmation and is not established by mocked device tests.

## Assistant

The existing hosted LLM integration retains seven backend-controlled tools, role/scope validation, policy Q&A, dashboard summaries, smart leave with explicit form confirmation, 15-second timeout, 20 requests/user/hour and AI request logging. Configure AI_API_KEY, AI_MODEL and optionally AI_BASE_URL on the backend Vercel project; never put keys into Vite or chat. Hosted AI is not claimed to work until tested with a real configured provider.

The assistant now displays authenticated provider configuration status and offers Verified reports. These are explicitly labeled **not AI-generated**. They use the exact same authorized backend tools, stored rate limit and request logs, and work without an LLM key. Employees see only their own balances, attendance, payslip and directory record. Employee headcount requests and department scope escalation are denied on the server. Verified reports are a deterministic reporting feature, not a substitute for the challenge's hosted-LLM requirement.

## Verification

- 24 backend tests passed, including geofence math, capture rejection, private results, server timestamps, duplicates, scoped reports, dashboard consistency and report rate limit.
- 11 UI tests passed, including existing full-role forms, camera consent, multiple-face rejection, permission failure, inaccurate GPS, stream cleanup and provider-free scoped report controls.
- Production frontend build passed. Device tests mock hardware; no physical camera/GPS success is claimed.
- Complete production HR/employee walkthrough and live hosted AI remain unverified. Existing temporary Atlas network access retains its original expiry; no network permission was extended by this change.

Logs: camera-backend-tests.txt, camera-ui-tests.txt, camera-build.txt.
