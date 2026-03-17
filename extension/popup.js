// Ändra denna URL till din deployade server (t.ex. https://redflagly-api.onrender.com)
const API_BASE = "http://localhost:3000";

// ── Gmail auth ──────────────────────────────────────────────

function getGmailTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error("Ingen token mottogs."));
        return;
      }
      chrome.storage.local.set({ gmailToken: token }, () => resolve(token));
    });
  });
}

function getCachedToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["gmailToken"], (d) => resolve(d.gmailToken || null));
  });
}

async function getToken() {
  const cached = await getCachedToken();
  if (cached) return cached;
  return getGmailTokenInteractive();
}

function revokeToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          chrome.storage.local.remove("gmailToken", resolve);
        });
      } else {
        chrome.storage.local.remove("gmailToken", resolve);
      }
    });
  });
}

// ── Gmail API helpers ───────────────────────────────────────

async function gmailGet(path, token) {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) {
    chrome.storage.local.remove("gmailToken");
    throw new Error("Token har gått ut. Koppla Gmail igen.");
  }
  if (!resp.ok) throw new Error(`Gmail API-fel: ${resp.status}`);
  return resp.json();
}

function decodeBase64Url(str) {
  if (!str) return "";
  const safe = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(safe)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    try {
      return atob(safe);
    } catch {
      return "";
    }
  }
}

function extractBodyFromPayload(payload) {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBodyFromPayload(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

function getHeader(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

async function fetchEmails(token, count) {
  const list = await gmailGet(`messages?maxResults=${count}&q=in:inbox`, token);
  const ids = (list.messages || []).map((m) => m.id);
  const results = [];

  for (const id of ids) {
    try {
      const msg = await gmailGet(`messages/${id}?format=full`, token);
      const payload = msg.payload || {};
      const headers = payload.headers || [];

      const importantHeaders = [
        "From",
        "To",
        "Subject",
        "Date",
        "Return-Path",
        "Reply-To",
        "Received-SPF",
        "Authentication-Results",
        "DKIM-Signature",
        "X-Mailer",
        "X-Originating-IP",
        "Received",
        "Message-ID",
        "List-Unsubscribe",
      ];

      const filteredHeaders = headers.filter((h) =>
        importantHeaders.some((ih) => h.name.toLowerCase() === ih.toLowerCase())
      );

      const bodyText = extractBodyFromPayload(payload).slice(0, 3000);

      results.push({
        id: msg.id,
        from: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        returnPath: getHeader(headers, "Return-Path"),
        replyTo: getHeader(headers, "Reply-To"),
        spf: getHeader(headers, "Received-SPF"),
        authResults: getHeader(headers, "Authentication-Results"),
        headers: filteredHeaders,
        snippet: msg.snippet || "",
        bodyText,
      });
    } catch {
      // skip unreachable message
    }
  }

  return results;
}

// ── Analyze via backend ─────────────────────────────────────

async function analyzeEmail(email) {
  const resp = await fetch(`${API_BASE}/analyze-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      headers: email.headers,
      snippet: email.snippet,
      bodyText: email.bodyText,
      from: email.from,
      returnPath: email.returnPath,
      replyTo: email.replyTo,
      spf: email.spf,
      authResults: email.authResults,
    }),
  });
  return resp.json();
}

// ── Page analysis (existing feature) ────────────────────────

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

function isBlockedUrl(url) {
  if (!url) return true;
  const blocked = ["chrome://", "chrome-extension://", "edge://", "brave://", "about:", "https://chromewebstore.google.com"];
  return blocked.some((b) => url.startsWith(b));
}

async function readPageText(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: () => (document.body?.innerText || "").slice(0, 12000),
  });
  return results?.[0]?.result || "";
}

// ── UI helpers ──────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function setStatus(connected) {
  const dot = $("status-dot");
  const text = $("status-text");
  const connectBtn = $("connect-gmail");
  const scanBtn = $("scan-gmail");
  const disconnectBtn = $("disconnect-gmail");

  if (connected) {
    dot.className = "status-dot connected";
    text.textContent = "Gmail ansluten";
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "block";
    scanBtn.disabled = false;
  } else {
    dot.className = "status-dot disconnected";
    text.textContent = "Gmail ej ansluten";
    connectBtn.style.display = "flex";
    disconnectBtn.style.display = "none";
    scanBtn.disabled = true;
  }
}

function setProgress(pct) {
  const bar = $("progress-bar");
  const fill = $("progress-fill");
  if (pct <= 0) {
    bar.classList.remove("active");
    fill.style.width = "0%";
  } else {
    bar.classList.add("active");
    fill.style.width = Math.min(pct, 100) + "%";
  }
}

function detectRisk(text) {
  const lower = (text || "").toLowerCase();
  if (lower.includes("hög risk") || lower.includes("hög")) return "high";
  if (lower.includes("medel")) return "medium";
  return "low";
}

function renderResults(analyses) {
  const container = $("results");
  container.innerHTML = "";

  if (!analyses.length) {
    container.innerHTML = '<div class="info-message">Inga mejl hittades att analysera.</div>';
    return;
  }

  for (const a of analyses) {
    const risk = detectRisk(a.analysis);
    const riskLabel = risk === "high" ? "Hög risk" : risk === "medium" ? "Medel risk" : "Låg risk";

    const card = document.createElement("div");
    card.className = `email-card risk-${risk}`;

    card.innerHTML = `
      <div class="card-header">
        <span class="sender">${escapeHtml(a.from || "(okänd)")}</span>
        <span class="risk-badge ${risk}">${riskLabel}</span>
      </div>
      <div class="subject">${escapeHtml(a.subject || "(inget ämne)")}</div>
      <div class="analysis-text">${escapeHtml(a.analysis)}</div>
    `;

    container.appendChild(card);
  }
}

function renderMessage(icon, text) {
  $("results").innerHTML = `<div class="info-message"><div class="icon">${icon}</div>${text}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Init: check connection state ────────────────────────────

(async () => {
  const token = await getCachedToken();
  setStatus(!!token);
})();

// ── Event: connect Gmail ────────────────────────────────────

$("connect-gmail").addEventListener("click", async () => {
  renderMessage("&#9203;", "Ansluter till Google...");
  try {
    await getGmailTokenInteractive();
    setStatus(true);
    renderMessage("&#9989;", "Gmail anslutet! Klicka <b>Skanna mina mejl</b> för att börja.");
  } catch (e) {
    setStatus(false);
    renderMessage("&#10060;", "Kunde inte ansluta: " + escapeHtml(e.message));
  }
});

// ── Event: disconnect Gmail ─────────────────────────────────

$("disconnect-gmail").addEventListener("click", async () => {
  await revokeToken();
  setStatus(false);
  renderMessage("&#128274;", "Gmail bortkopplad. Koppla ditt konto igen för att skanna mejl.");
});

// ── Event: scan emails ──────────────────────────────────────

$("scan-gmail").addEventListener("click", async () => {
  const count = parseInt($("email-count").value, 10) || 10;
  $("scan-gmail").disabled = true;
  setProgress(5);
  renderMessage("&#128269;", `Hämtar dina senaste ${count} mejl...`);

  try {
    const token = await getToken();
    setProgress(15);

    const emails = await fetchEmails(token, count);

    if (!emails.length) {
      setProgress(0);
      $("scan-gmail").disabled = false;
      renderMessage("&#128232;", "Hittade inga mejl i din inkorg.");
      return;
    }

    renderMessage("&#129302;", `Analyserar ${emails.length} mejl med AI. Vänta...`);
    setProgress(25);

    const analyses = [];
    for (let i = 0; i < emails.length; i++) {
      try {
        const data = await analyzeEmail(emails[i]);
        analyses.push({
          from: emails[i].from,
          subject: emails[i].subject,
          analysis: data.analysis || data.error || "Inget svar.",
        });
      } catch {
        analyses.push({
          from: emails[i].from,
          subject: emails[i].subject,
          analysis: "Kunde inte analysera detta mejl.",
        });
      }
      setProgress(25 + ((i + 1) / emails.length) * 70);
    }

    setProgress(100);
    renderResults(analyses);

    setTimeout(() => setProgress(0), 800);
  } catch (e) {
    setProgress(0);
    renderMessage("&#10060;", "Fel vid skanning: " + escapeHtml(e.message));
  }

  $("scan-gmail").disabled = false;
});

// ── Event: analyze current page ─────────────────────────────

$("analyze").addEventListener("click", async () => {
  renderMessage("&#128269;", "Analyserar sidan...");

  const tab = await getActiveTab();

  if (!tab?.id || !tab?.url) {
    renderMessage("&#10060;", "Ingen aktiv sida hittades.");
    return;
  }
  if (isBlockedUrl(tab.url)) {
    renderMessage("&#10060;", "Denna sida kan inte analyseras av webbläsaren.");
    return;
  }

  let pageText = "";
  try {
    pageText = await readPageText(tab.id);
  } catch {
    renderMessage("&#10060;", "Kunde inte läsa sidan. Ladda om och testa igen.");
    return;
  }

  if (!pageText) {
    renderMessage("&#10060;", "Ingen text hittades på sidan.");
    return;
  }

  try {
    const r = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pageText, url: tab.url }),
    });
    const data = await r.json();
    if (data.analysis) {
      renderMessage("&#128202;", escapeHtml(data.analysis));
    } else {
      renderMessage("&#10060;", "Server error: " + escapeHtml(data.error || "Okänt fel"));
    }
  } catch {
    renderMessage("&#10060;", "Kunde inte nå servern. Är backend igång?");
  }
});
