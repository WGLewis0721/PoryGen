const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const webFallbackInput = document.querySelector("#allow-web");
const status = document.querySelector("#status");
const results = document.querySelector("#results");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResults(data) {
  if (!data.results?.length) {
    let message = "No results found.";
    if (data.externalWebSearch === "disabled") {
      message = "No local match. Private mode stopped here so the query was not sent to a third party.";
    } else if (data.source === "web" && data.webConfigured === false) {
      message = "No local matches. Web fallback was allowed, but BRAVE_SEARCH_API_KEY is not configured.";
    }
    results.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
    return;
  }

  results.innerHTML = data.results.map((item, index) => {
    const local = item.source === "local";
    const meta = local
      ? `Local source · rank ${index + 1} · score ${item.score}`
      : `Web result · rank ${index + 1}`;

    return `
      <article class="result">
        <div class="meta">${escapeHtml(meta)}</div>
        <h2><a href="${escapeHtml(item.url)}" ${local ? "" : 'target="_blank" rel="noreferrer"'}>${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.snippet || "")}</p>
      </article>
    `;
  }).join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let q = queryInput.value.trim();
  if (!q) return;

  status.textContent = "Searching 10 local sources…";
  results.innerHTML = "";

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      cache: "no-store",
      body: JSON.stringify({
        query: q,
        allowExternalWebSearch: webFallbackInput?.checked === true
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");

    if (data.source === "local") {
      status.textContent = "Found local matches. Query stayed inside the lab server.";
    } else if (data.externalWebSearch === "disabled") {
      status.textContent = "No local match. Private mode prevented third-party search.";
    } else {
      status.textContent = "No local match. Public-demo web fallback was allowed.";
    }

    renderResults(data);
  } catch (error) {
    status.textContent = error.message || "Search failed.";
  } finally {
    queryInput.value = "";
    q = "";
  }
});
