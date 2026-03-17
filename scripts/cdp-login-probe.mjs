import fs from "node:fs";

const targetUrl = process.argv[2] || "https://bhpan.buaa.edu.cn/anyshare/signin";
const outFile = process.argv[3] || "/tmp/bhpan-cdp-probe.json";

async function getPageTarget() {
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  return list.find((item) => item.type === "page" && item.url === "about:blank")
    || list.find((item) => item.type === "page");
}

async function main() {
  const target = await getPageTarget();
  if (!target) {
    throw new Error("No debuggable page target found");
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const requests = [];
  const responses = [];

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (msg.error) {
          entry.reject(new Error(JSON.stringify(msg.error)));
        } else {
          entry.resolve(msg.result);
        }
      }
      return;
    }

    if (msg.method === "Network.requestWillBeSent") {
      requests.push({
        url: msg.params.request.url,
        method: msg.params.request.method,
        headers: msg.params.request.headers,
        postData: msg.params.request.postData,
      });
    }
    if (msg.method === "Network.responseReceived") {
      responses.push({
        url: msg.params.response.url,
        status: msg.params.response.status,
        headers: msg.params.response.headers,
        mimeType: msg.params.response.mimeType,
      });
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Page.navigate", { url: targetUrl });

  await new Promise((resolve) => setTimeout(resolve, 8000));

  const expression = `
    JSON.stringify({
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText.slice(0, 2000),
      forms: [...document.forms].map((form) => ({
        action: form.action,
        method: form.method,
        text: form.innerText.slice(0, 500),
      })),
      inputs: [...document.querySelectorAll('input')].map((el) => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        autocomplete: el.autocomplete,
        className: el.className,
      })),
      buttons: [...document.querySelectorAll('button')].map((el) => ({
        text: el.innerText,
        type: el.type,
        className: el.className,
      })),
      links: [...document.querySelectorAll('a')].map((el) => ({
        text: el.innerText,
        href: el.href,
      })).slice(0, 20),
    });
  `;

  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });

  const payload = {
    targetUrl,
    evalResult: result,
    dom: result?.result?.value ? JSON.parse(result.result.value) : null,
    requests,
    responses,
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(outFile);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
