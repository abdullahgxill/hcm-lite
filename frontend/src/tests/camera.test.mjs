import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
let dom, vite, React, createRoot, Verification, api, root;
let faces = 1, stopped = 0, closed = 0, mediaRequests = 0, locationRequests = 0, saved = [];
const detector = { detectForVideo: () => ({ detections: Array(faces).fill({}) }), close: () => closed++ };
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://hcm.test/device-check" });
  for (const name of ["window", "document", "navigator", "HTMLElement", "Event", "KeyboardEvent", "sessionStorage"])
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async (constraints) => {
    mediaRequests++; assert.equal(constraints.audio, false);
    return { getTracks: () => [{ stop: () => stopped++ }] };
  } } });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success, failure, options) => {
    locationRequests++; assert.equal(options.maximumAge, 0); assert.equal(options.enableHighAccuracy, true);
    success({ coords: { latitude: 24.9, longitude: 67.1, accuracy: 12 }, timestamp: Date.now() });
  } } });
  window.HTMLMediaElement.prototype.play = async function () {};
  Object.defineProperty(window.HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react"); ({ createRoot } = await import("react-dom/client"));
  vite = await createServer({ root: fileURLToPath(new URL("../..", import.meta.url)), server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [], include: [] }, appType: "custom" });
  ({ CameraVerification: Verification } = await vite.ssrLoadModule("/src/features/CameraAttendance.jsx"));
  ({ api } = await vite.ssrLoadModule("/src/services/api.js"));
  api.defaults.adapter = async (config) => { saved.push(JSON.parse(config.data)); return { data: { source: "camera" }, status: 201, headers: {}, config }; };
});
after(async () => { if (root) await React.act(async () => root.unmount()); await vite?.close(); dom?.window.close(); });
async function mount(props = {}) {
  if (root) await React.act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(Verification, { detectorFactory: async () => detector, policy: { enabled: true, radiusMeters: 150 }, ...props })));
}
const button = (name) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
async function click(name) { assert.ok(button(name), name); await React.act(async () => button(name).click()); }
async function consent() { await React.act(async () => document.querySelector('input[type="checkbox"]').click()); }
test("camera UI starts with permissions untouched and blocks recording until face and GPS are ready", async () => {
  await mount(); assert.equal(mediaRequests, 0); assert.equal(locationRequests, 0);
  assert.equal(button("Start camera").disabled, true);
  assert.equal(button("Confirm camera check-in").disabled, true);
  await consent(); await click("Start camera");
  assert.equal(mediaRequests, 1); assert.match(document.body.textContent, /One face detected/);
  assert.equal(button("Confirm camera check-in").disabled, true);
  await click("Get my location");
  assert.equal(locationRequests, 1); assert.equal(button("Confirm camera check-in").disabled, false);
  assert.ok(!document.body.textContent.includes("24.9"));
  faces = 2; await click("Confirm camera check-in");
  assert.match(document.body.textContent, /Exactly one face must be visible/);
  assert.equal(saved.length, 0);
  faces = 1; await click("Restart camera"); await click("Confirm camera check-in");
  assert.equal(saved.length, 1); assert.equal(saved[0].faceCount, 1); assert.equal(saved[0].source, "camera");
  assert.equal(saved[0].photo, undefined); assert.equal(saved[0].location.accuracy, 12);
  assert.ok(stopped >= 2); assert.ok(closed >= 2);
});
test("device diagnostic never submits attendance and closes camera resources on unmount", async () => {
  const count = saved.length, previousStops = stopped;
  await mount({ testOnly: true }); await consent(); await click("Start camera"); await click("Get my location");
  assert.equal(button("Confirm camera check-in"), undefined);
  assert.match(document.body.textContent, /No attendance was submitted/);
  assert.equal(saved.length, count);
  await React.act(async () => root.unmount()); root = null;
  assert.ok(stopped > previousStops);
});
test("camera permission denial and inaccurate GPS explain recovery without saving", async () => {
  const original = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  await mount(); await consent(); await click("Start camera");
  assert.match(document.body.textContent, /Camera permission was denied/);
  navigator.mediaDevices.getUserMedia = original;
  const location = navigator.geolocation.getCurrentPosition;
  navigator.geolocation.getCurrentPosition = (success) => success({ coords: { latitude: 24.9, longitude: 67.1, accuracy: 101 }, timestamp: Date.now() });
  await click("Start camera"); await click("Get my location");
  assert.match(document.body.textContent, /worse than 100 metres/);
  assert.equal(button("Confirm camera check-in").disabled, true);
  navigator.geolocation.getCurrentPosition = location;
});
test("a camera permission request resolving after unmount is stopped instead of leaking", async () => {
  const original = navigator.mediaDevices.getUserMedia;
  let resolveMedia;
  navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { resolveMedia = resolve; });
  await mount(); await consent(); await click("Start camera");
  await React.act(async () => root.unmount()); root = null;
  const previous = stopped;
  await React.act(async () => resolveMedia({ getTracks: () => [{ stop: () => stopped++ }] }));
  assert.equal(stopped, previous + 1);
  navigator.mediaDevices.getUserMedia = original;
});
