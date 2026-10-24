import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
let vite, dom, React, createRoot, Modal, api;
before(async () => {
  dom = new JSDOM(
    '<!doctype html><html><body><button id="trigger">Open form</button><div id="root"></div></body></html>',
    { url: "http://localhost:5173" },
  );
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "Event",
    "KeyboardEvent",
    "sessionStorage",
  ])
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  vite = await createServer({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, entries: [], include: [] },
    appType: "custom",
  });
  ({ Modal } = await vite.ssrLoadModule("/src/components/ui.jsx"));
  ({ api } = await vite.ssrLoadModule("/src/services/api.js"));
});
after(async () => {
  await vite?.close();
  dom?.window.close();
});
test("typing in a dialog keeps focus, input identity and cursor across parent updates", async () => {
  const root = createRoot(document.getElementById("root"));
  const render = (value) =>
    React.createElement(
      Modal,
      { title: "Create HR login", onClose: () => {} },
      React.createElement("input", {
        "aria-label": "HR full name",
        value,
        onChange: () => {},
      }),
    );
  document.getElementById("trigger").focus();
  await React.act(async () => root.render(render("")));
  const input = document.querySelector("input");
  input.focus();
  assert.equal(document.activeElement, input);
  let value = "";
  for (const letter of "Sana Ahmed") {
    value += letter;
    await React.act(async () => root.render(render(value)));
    assert.equal(document.querySelector("input"), input);
    assert.equal(document.activeElement, input);
    input.setSelectionRange(value.length, value.length);
    assert.equal(input.selectionStart, value.length);
  }
  await React.act(async () => root.unmount());
  assert.equal(document.activeElement, document.getElementById("trigger"));
});
test("Escape invokes the latest close callback; Tab stays inside the modal", async () => {
  const root = createRoot(document.getElementById("root"));
  let closed = "";
  const view = (onClose) =>
    React.createElement(
      Modal,
      { title: "Edit", onClose },
      React.createElement("input", { "aria-label": "Name" }),
      React.createElement("button", { id: "last" }, "Save"),
    );
  await React.act(async () => root.render(view(() => (closed = "old"))));
  await React.act(async () => root.render(view(() => (closed = "latest"))));
  document.getElementById("last").focus();
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(
    document.activeElement.getAttribute("aria-label"),
    "Close dialog",
  );
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(closed, "latest");
  await React.act(async () => root.unmount());
});
test("a wrong current password shows an error without logging out the valid session", async () => {
  let expired = 0;
  const listener = () => expired++;
  window.addEventListener("hcm-session-expired", listener);
  const config = { url: "/auth/password" };
  const error = {
    response: {
      status: 401,
      data: { message: "Current password is incorrect." },
    },
    config,
  };
  await assert.rejects(() =>
    api.request({
      ...config,
      method: "post",
      data: {},
      adapter: () => Promise.reject(error),
    }),
  );
  assert.equal(expired, 0);
  const other = { url: "/employees" };
  await assert.rejects(() =>
    api.request({
      ...other,
      adapter: () =>
        Promise.reject({ response: { status: 401 }, config: other }),
    }),
  );
  assert.equal(expired, 1);
  window.removeEventListener("hcm-session-expired", listener);
});

test("password visibility and credential copying preserve the exact secret", async () => {
  const { PasswordField, LoginCredentials } = await vite.ssrLoadModule("/src/components/ui.jsx");
  const copied = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value) => copied.push(value) } } });
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(PasswordField, {label:"Password", value:"ExactSecret123!", onChange:()=>{}}),
    React.createElement(LoginCredentials, {email:" HR@EXAMPLE.TEST ",password:"Hcm!Keep-Exact_7"})
  )));
  assert.equal(document.querySelector('input').type, 'password');
  await React.act(async () => document.querySelector('[aria-label="Show Password"]').click());
  assert.equal(document.querySelector('input').type, 'text');
  assert.equal(document.querySelector('input').value, 'ExactSecret123!');
  const copyButton = [...document.querySelectorAll('button')].find(b=>b.textContent==='Copy password');
  await React.act(async () => copyButton.click());
  assert.equal(copied.at(-1), 'Hcm!Keep-Exact_7');
  assert.ok(document.body.textContent.includes('Password copied.'));
  assert.equal(document.querySelector('[aria-label="Login credentials"] input').value, 'hr@example.test');
  await React.act(async () => root.unmount());
});
